#!/usr/bin/env python3
"""Create narrated audio and an approximately timed transcript with Gemini TTS."""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
import hashlib
import io
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request
import wave
from pathlib import Path

DEFAULT_MODEL = "gemini-3.1-flash-tts-preview"
DEFAULT_VOICE = "Charon"
DEFAULT_INSTRUCTION = (
    "Read the following Spanish literary text aloud in a mature male voice. "
    "Use a natural, measured Castilian Spanish narration, clear diction, and "
    "subtle dramatic expression. Do not add, omit, explain, or translate any text."
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("text", type=Path, nargs="+", help="UTF-8 text file(s)")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--voice", default=DEFAULT_VOICE)
    parser.add_argument("--max-chars", type=int, default=1_800)
    parser.add_argument("--bitrate", default="64k")
    parser.add_argument("--env", type=Path, default=Path(".env"))
    parser.add_argument(
        "--standard",
        action="store_true",
        help="Use synchronous standard-price requests instead of the default Batch API",
    )
    parser.add_argument(
        "--submit-only",
        action="store_true",
        help="Submit/resume batch jobs and exit without polling or assembling audio",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    load_env(args.env)
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit(f"GEMINI_API_KEY was not found in {args.env}")

    if args.standard:
        for text_path in args.text:
            narrate(text_path, args, api_key)
    else:
        narrate_batch(args.text, args, api_key)


def narrate_batch(
    text_paths: list[Path], args: argparse.Namespace, api_key: str
) -> None:
    stories: list[dict] = []
    pending: list[dict] = []
    root = Path.cwd()

    for text_path in text_paths:
        if not text_path.exists():
            raise SystemExit(f"Text file not found: {text_path}")
        text = normalize_text(text_path.read_text(encoding="utf-8"))
        chunks = split_text(text, args.max_chars)
        stem = text_path.stem
        signature = cache_signature(text, args)
        cache_dir = root / ".tts-cache" / f"{stem}-{signature}"
        cache_dir.mkdir(parents=True, exist_ok=True)
        story = {
            "text_path": text_path,
            "stem": stem,
            "chunks": chunks,
            "cache_dir": cache_dir,
        }
        stories.append(story)
        print(f"{text_path}: {len(chunks)} chunks", flush=True)
        for index, chunk in enumerate(chunks, 1):
            wav_path = cache_dir / f"{index:03}.wav"
            if not wav_path.exists():
                pending.append(
                    {
                        "key": f"{stem}-{signature}:{index:03}",
                        "chunk": chunk,
                        "wav_path": wav_path,
                    }
                )

    if pending:
        print(
            f"Submitting {len(pending)} missing chunks as individual Gemini Batch jobs...",
            flush=True,
        )
        responses = run_individual_batch_jobs(
            pending, args, api_key, submit_only=args.submit_only
        )
        if args.submit_only:
            print(
                "Submission complete. Run the same command without --submit-only "
                "later to collect and assemble results.",
                flush=True,
            )
            return
        for item in pending:
            response = responses[item["key"]]
            write_response_or_split(item, response, args, api_key)
            print(f"  Saved {item['key']}", flush=True)
    else:
        print("All audio chunks were already cached.", flush=True)

    for story in stories:
        chunk_info = [
            (chunk, story["cache_dir"] / f"{index:03}.wav", 0.0)
            for index, chunk in enumerate(story["chunks"], 1)
        ]
        chunk_info = [
            (chunk, path, wav_duration(path)) for chunk, path, _ in chunk_info
        ]
        finish_narration(story["stem"], chunk_info, story["cache_dir"], args)


def run_batch_job(
    pending: list[dict], args: argparse.Namespace, api_key: str
) -> dict[str, dict]:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{args.model}:batchGenerateContent"
    )
    requests = []
    for item in pending:
        requests.append(
            {
                "request": {
                    "contents": [
                        {
                            "parts": [
                                {
                                    "text": (
                                        f"{DEFAULT_INSTRUCTION}\n\n{item['chunk']}"
                                    )
                                }
                            ]
                        }
                    ],
                    "generation_config": {
                        "responseModalities": ["AUDIO"],
                        "speechConfig": {
                            "voiceConfig": {
                                "prebuiltVoiceConfig": {
                                    "voiceName": args.voice
                                }
                            }
                        },
                    },
                },
                "metadata": {"key": item["key"]},
            }
        )
    payload = {
        "batch": {
            "display_name": "Spanish Listening Reader narrations",
            "input_config": {"requests": {"requests": requests}},
        }
    }
    if len(pending) == 1:
        safe_key = re.sub(r"[^A-Za-z0-9_.-]", "_", pending[0]["key"])
        state_path = Path.cwd() / ".tts-cache" / "batch_jobs" / f"{safe_key}.json"
    else:
        state_path = Path.cwd() / ".tts-cache" / "batch_job.json"
    signature = {
        "model": args.model,
        "voice": args.voice,
        "keys": [item["key"] for item in pending],
    }
    saved_state = {}
    if state_path.exists():
        saved_state = json.loads(state_path.read_text(encoding="utf-8"))
    if saved_state.get("signature") == signature and saved_state.get("name"):
        job_name = saved_state["name"]
        print(f"Resuming {job_name}.", flush=True)
    else:
        created = request_json(url, api_key, payload)
        job_name = created["name"]
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(
            json.dumps({"name": job_name, "signature": signature}, indent=2) + "\n",
            encoding="utf-8",
        )
        print(
            f"Created {job_name}. Batch jobs normally finish sooner, but may take up to 24 hours.",
            flush=True,
        )

    status_url = f"https://generativelanguage.googleapis.com/v1beta/{job_name}"
    last_state = ""
    while True:
        status = request_json(status_url, api_key)
        state = status.get("metadata", {}).get("state", "UNKNOWN")
        if state != last_state:
            print(f"Batch state: {state}", flush=True)
            last_state = state
        if status.get("done") or state in {
            "BATCH_STATE_SUCCEEDED",
            "BATCH_STATE_FAILED",
            "BATCH_STATE_CANCELLED",
            "BATCH_STATE_EXPIRED",
        }:
            break
        time.sleep(30)

    if state != "BATCH_STATE_SUCCEEDED":
        raise RuntimeError(
            f"Batch job ended as {state}: {json.dumps(status.get('error', {}))}"
        )
    inlined = status.get("response", {}).get("inlinedResponses", [])
    if isinstance(inlined, dict):
        inlined = inlined.get("inlinedResponses", [])
    responses: dict[str, dict] = {}
    for item in inlined:
        key = item.get("metadata", {}).get("key")
        if item.get("error"):
            raise RuntimeError(f"Batch request {key} failed: {item['error']}")
        if key and item.get("response"):
            responses[key] = item["response"]
    missing = [item["key"] for item in pending if item["key"] not in responses]
    if missing:
        raise RuntimeError(f"Batch response omitted requests: {', '.join(missing)}")
    return responses


def run_individual_batch_jobs(
    pending: list[dict],
    args: argparse.Namespace,
    api_key: str,
    *,
    submit_only: bool = False,
) -> dict[str, dict]:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{args.model}:batchGenerateContent"
    )
    jobs: dict[str, tuple[str, Path]] = {}
    to_create: list[tuple[str, Path, dict, dict]] = []
    jobs_dir = Path.cwd() / ".tts-cache" / "batch_jobs"
    jobs_dir.mkdir(parents=True, exist_ok=True)

    for item in pending:
        key = item["key"]
        safe_key = re.sub(r"[^A-Za-z0-9_.-]", "_", key)
        state_path = jobs_dir / f"{safe_key}.json"
        signature = {"model": args.model, "voice": args.voice, "key": key}
        saved_state = {}
        if state_path.exists():
            saved_state = json.loads(state_path.read_text(encoding="utf-8"))
        if saved_state.get("signature") == signature and saved_state.get("name"):
            job_name = saved_state["name"]
            jobs[key] = (job_name, state_path)
        else:
            payload = {
                "batch": {
                    "display_name": f"Spanish Reader {key}",
                    "input_config": {
                        "requests": {
                            "requests": [
                                {
                                    "request": {
                                        "contents": [
                                            {
                                                "parts": [
                                                    {
                                                        "text": (
                                                            f"{DEFAULT_INSTRUCTION}\n\n"
                                                            f"{item['chunk']}"
                                                        )
                                                    }
                                                ]
                                            }
                                        ],
                                        "generation_config": {
                                            "responseModalities": ["AUDIO"],
                                            "speechConfig": {
                                                "voiceConfig": {
                                                    "prebuiltVoiceConfig": {
                                                        "voiceName": args.voice
                                                    }
                                                }
                                            },
                                        },
                                    },
                                    "metadata": {"key": key},
                                }
                            ]
                        }
                    },
                }
            }
            to_create.append((key, state_path, signature, payload))

    def create_job(entry: tuple[str, Path, dict, dict]) -> tuple[str, str, Path]:
        key, state_path, signature, payload = entry
        job_name = request_json(url, api_key, payload)["name"]
        state_path.write_text(
            json.dumps({"name": job_name, "signature": signature}, indent=2)
            + "\n",
            encoding="utf-8",
        )
        return key, job_name, state_path

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        futures = [executor.submit(create_job, entry) for entry in to_create]
        for future in concurrent.futures.as_completed(futures):
            key, job_name, state_path = future.result()
            jobs[key] = (job_name, state_path)

    print(f"Created or resumed {len(jobs)} individual batch jobs.", flush=True)
    if submit_only:
        return {}
    responses: dict[str, dict] = {}
    while jobs:
        completed: list[str] = []
        for key, (job_name, _) in jobs.items():
            status_url = (
                f"https://generativelanguage.googleapis.com/v1beta/{job_name}"
            )
            status = request_json(status_url, api_key)
            state = status.get("metadata", {}).get("state", "UNKNOWN")
            if not status.get("done") and state not in {
                "BATCH_STATE_SUCCEEDED",
                "BATCH_STATE_FAILED",
                "BATCH_STATE_CANCELLED",
                "BATCH_STATE_EXPIRED",
            }:
                continue
            if state != "BATCH_STATE_SUCCEEDED":
                raise RuntimeError(
                    f"Batch job {key} ended as {state}: "
                    f"{json.dumps(status.get('error', {}))}"
                )
            inlined = status.get("response", {}).get("inlinedResponses", [])
            if isinstance(inlined, dict):
                inlined = inlined.get("inlinedResponses", [])
            if not inlined or not inlined[0].get("response"):
                raise RuntimeError(f"Batch job {key} returned no response")
            responses[key] = inlined[0]["response"]
            completed.append(key)
        for key in completed:
            del jobs[key]
        print(
            f"Batch progress: {len(responses)}/{len(pending)} complete.",
            flush=True,
        )
        if jobs:
            time.sleep(30)
    return responses


def write_response_or_split(
    item: dict,
    response: dict,
    args: argparse.Namespace,
    api_key: str,
    depth: int = 0,
) -> None:
    try:
        pcm, rate = audio_from_response(response)
    except RuntimeError:
        if depth >= 4:
            raise
        smaller_limit = max(400, len(item["chunk"]) // 2)
        pieces = split_text(item["chunk"], smaller_limit)
        if len(pieces) < 2:
            midpoint = len(item["chunk"]) // 2
            pieces = [
                item["chunk"][:midpoint].strip(),
                item["chunk"][midpoint:].strip(),
            ]
        print(
            f"  Subdividing {item['key']} into {len(pieces)} shorter batches.",
            flush=True,
        )
        subitems: list[dict] = []
        for index, piece in enumerate(pieces, 1):
            subitems.append(
                {
                    "key": f"{item['key']}.part{index:02}",
                    "chunk": piece,
                    "wav_path": item["wav_path"].with_name(
                        f"{item['wav_path'].stem}.part{index:02}.wav"
                    ),
                }
            )
        missing = [subitem for subitem in subitems if not subitem["wav_path"].exists()]
        if missing:
            responses = run_individual_batch_jobs(missing, args, api_key)
            for subitem in missing:
                write_response_or_split(
                    subitem,
                    responses[subitem["key"]],
                    args,
                    api_key,
                    depth + 1,
                )
        chunk_info = [
            (
                subitem["chunk"],
                subitem["wav_path"],
                wav_duration(subitem["wav_path"]),
            )
            for subitem in subitems
        ]
        join_wavs(chunk_info, item["wav_path"])
        return
    write_wav(item["wav_path"], pcm, rate)


def request_json(
    url: str, api_key: str, payload: dict | None = None
) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST" if payload is not None else "GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(
            f"Gemini Batch API failed with HTTP {exc.code}: {detail}"
        ) from exc


def audio_from_response(response: dict) -> tuple[bytes, int]:
    parts = response.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    part = next((item for item in parts if "inlineData" in item), None)
    if part is None:
        finish_reason = response.get("candidates", [{}])[0].get(
            "finishReason", "UNKNOWN"
        )
        raise RuntimeError(
            f"Gemini returned no audio payload (finish reason: {finish_reason})"
        )
    inline = part["inlineData"]
    audio = base64.b64decode(inline["data"])
    mime = inline.get("mimeType", "")
    rate_match = re.search(r"rate=(\d+)", mime)
    rate = int(rate_match.group(1)) if rate_match else 24_000
    return decode_audio(audio, rate)


def narrate(text_path: Path, args: argparse.Namespace, api_key: str) -> None:
    if not text_path.exists():
        raise SystemExit(f"Text file not found: {text_path}")

    text = normalize_text(text_path.read_text(encoding="utf-8"))
    chunks = split_text(text, args.max_chars)
    stem = text_path.stem
    root = Path.cwd()
    cache_dir = root / ".tts-cache" / f"{stem}-{cache_signature(text, args)}"
    cache_dir.mkdir(parents=True, exist_ok=True)
    chunk_info: list[tuple[str, Path, float]] = []

    print(f"{text_path}: {len(chunks)} chunks")
    for index, chunk in enumerate(chunks, 1):
        wav_path = cache_dir / f"{index:03}.wav"
        if not wav_path.exists():
            print(f"  Generating chunk {index}/{len(chunks)}...")
            pcm, rate = generate_audio(
                api_key=api_key,
                model=args.model,
                voice=args.voice,
                text=f"{DEFAULT_INSTRUCTION}\n\n{chunk}",
            )
            write_wav(wav_path, pcm, rate)
        duration = wav_duration(wav_path)
        chunk_info.append((chunk, wav_path, duration))

    finish_narration(stem, chunk_info, cache_dir, args)


def finish_narration(
    stem: str,
    chunk_info: list[tuple[str, Path, float]],
    cache_dir: Path,
    args: argparse.Namespace,
) -> None:
    root = Path.cwd()
    combined_wav = cache_dir / f"{stem}.wav"
    offsets = join_wavs(chunk_info, combined_wav)
    audio_path = root / f"{stem}.m4a"
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(combined_wav),
            "-c:a",
            "aac",
            "-b:a",
            args.bitrate,
            str(audio_path),
        ],
        check=True,
    )
    transcript_path = audio_path.with_suffix(".json")
    write_transcript(transcript_path, audio_path.name, chunk_info, offsets)
    print(f"Wrote {audio_path} and {transcript_path}", flush=True)


def generate_audio(
    *, api_key: str, model: str, voice: str, text: str
) -> tuple[bytes, int]:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent"
    )
    payload = json.dumps(
        {
            "contents": [{"parts": [{"text": text}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {"voiceName": voice}
                    }
                },
            },
        }
    ).encode()

    for attempt in range(1, 7):
        request = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": api_key,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                result = json.load(response)
            part = next(
                item
                for item in result["candidates"][0]["content"]["parts"]
                if "inlineData" in item
            )
            inline = part["inlineData"]
            audio = base64.b64decode(inline["data"])
            mime = inline.get("mimeType", "")
            rate_match = re.search(r"rate=(\d+)", mime)
            rate = int(rate_match.group(1)) if rate_match else 24_000
            return decode_audio(audio, rate)
        except (urllib.error.URLError, KeyError, StopIteration, ValueError) as exc:
            retryable = not isinstance(exc, urllib.error.HTTPError) or exc.code in {
                429,
                500,
                502,
                503,
                504,
            }
            if attempt == 6 or not retryable:
                if isinstance(exc, urllib.error.HTTPError):
                    detail = exc.read().decode("utf-8", "replace")
                    raise RuntimeError(
                        f"Gemini TTS failed with HTTP {exc.code}: {detail}"
                    ) from exc
                raise RuntimeError(f"Gemini TTS failed: {exc}") from exc
            delay = min(60, 2 ** attempt)
            print(f"  Temporary API error; retrying in {delay}s...")
            time.sleep(delay)
    raise AssertionError("unreachable")


def decode_audio(audio: bytes, default_rate: int) -> tuple[bytes, int]:
    if not audio.startswith(b"RIFF"):
        return audio, default_rate

    with wave.open(io.BytesIO(audio), "rb") as source:
        if source.getnchannels() != 1 or source.getsampwidth() != 2:
            raise RuntimeError("Gemini returned an unsupported WAV format")
        return source.readframes(source.getnframes()), source.getframerate()


def cache_signature(text: str, args: argparse.Namespace) -> str:
    payload = json.dumps(
        {
            "text": text,
            "model": args.model,
            "voice": args.voice,
            "instruction": DEFAULT_INSTRUCTION,
            "max_chars": args.max_chars,
        },
        ensure_ascii=False,
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:16]


def split_text(text: str, max_chars: int) -> list[str]:
    paragraphs = [item.strip() for item in re.split(r"\n\s*\n", text) if item.strip()]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        pieces = split_long_paragraph(paragraph, max_chars)
        for piece in pieces:
            candidate = f"{current}\n\n{piece}".strip()
            if current and len(candidate) > max_chars:
                chunks.append(current)
                current = piece
            else:
                current = candidate
    if current:
        chunks.append(current)
    return chunks


def split_long_paragraph(paragraph: str, max_chars: int) -> list[str]:
    if len(paragraph) <= max_chars:
        return [paragraph]
    sentences = re.split(r"(?<=[.!?…])\s+", paragraph)
    pieces: list[str] = []
    current = ""
    for sentence in sentences:
        if len(sentence) > max_chars:
            if current:
                pieces.append(current)
                current = ""
            pieces.extend(
                sentence[index : index + max_chars]
                for index in range(0, len(sentence), max_chars)
            )
            continue
        candidate = f"{current} {sentence}".strip()
        if current and len(candidate) > max_chars:
            pieces.append(current)
            current = sentence
        else:
            current = candidate
    if current:
        pieces.append(current)
    return pieces


def join_wavs(
    chunks: list[tuple[str, Path, float]], output: Path
) -> list[float]:
    offsets: list[float] = []
    cursor = 0.0
    sample_rate = 24_000
    silence_seconds = 0.25
    with wave.open(str(output), "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(sample_rate)
        for index, (_, path, duration) in enumerate(chunks):
            with wave.open(str(path), "rb") as source:
                if (
                    source.getnchannels() != 1
                    or source.getsampwidth() != 2
                    or source.getframerate() != sample_rate
                ):
                    raise RuntimeError(f"Incompatible chunk format: {path}")
                offsets.append(cursor)
                target.writeframes(source.readframes(source.getnframes()))
            cursor += duration
            if index < len(chunks) - 1:
                target.writeframes(b"\0\0" * int(sample_rate * silence_seconds))
                cursor += silence_seconds
    return offsets


def write_transcript(
    path: Path,
    audio_name: str,
    chunks: list[tuple[str, Path, float]],
    offsets: list[float],
) -> None:
    words: list[dict[str, str | float]] = []
    for (text, _, duration), offset in zip(chunks, offsets):
        tokens = re.findall(r"\S+", text)
        weights = [token_weight(token) for token in tokens]
        total = sum(weights) or 1
        cursor = offset
        for token, weight in zip(tokens, weights):
            token_duration = duration * weight / total
            words.append(
                {
                    "word": token,
                    "start": round(cursor, 3),
                    "end": round(cursor + token_duration, 3),
                }
            )
            cursor += token_duration
    payload = {
        "source": audio_name,
        "title": chunks[0][0].splitlines()[0].strip(),
        "language": "es",
        "generator": "Gemini TTS with source-text timing",
        "words": words,
    }
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def token_weight(token: str) -> float:
    letters = len(re.sub(r"[^\wáéíóúüñÁÉÍÓÚÜÑ]", "", token))
    pause = 0.0
    if token.endswith((".", "!", "?", "…")):
        pause = 3.0
    elif token.endswith((",", ";", ":")):
        pause = 1.5
    return max(1.0, letters * 0.75 + pause)


def write_wav(path: Path, pcm: bytes, rate: int) -> None:
    with wave.open(str(path), "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(rate)
        target.writeframes(pcm)


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as source:
        return source.getnframes() / source.getframerate()


def normalize_text(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", text.replace("\r\n", "\n")).strip()


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


if __name__ == "__main__":
    main()
