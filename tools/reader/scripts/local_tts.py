#!/usr/bin/env python3
"""Generate every text-only library narration locally with Qwen3-TTS."""

from __future__ import annotations

import argparse
import fcntl
import gc
import hashlib
import json
import os
import random
import re
import subprocess
import sys
import time
import wave
from pathlib import Path

MODEL_IDS = {
    "1.7B": "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
    "0.6B": "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
}
REFERENCE_AUDIO = "el_monte_de_las_animas.m4a"
REFERENCE_START = 7.06
REFERENCE_DURATION = 4.54
REFERENCE_TEXT = (
    "La noche de difuntos me despertó a no sé qué hora el doble de las campanas."
)
PIPELINE_VERSION = 3
SILENCE_SECONDS = 0.25


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("plan", "run", "status", "publish"), nargs="?", default="run")
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--model-size", choices=("1.7B", "0.6B"), default="1.7B")
    parser.add_argument("--max-chars", type=int, default=500)
    parser.add_argument("--bitrate", default="80k")
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--only", action="append", default=[], help="generate only this catalog id")
    parser.add_argument(
        "--alignment-model",
        default="medium",
        help="faster-whisper model used for the required final word alignment",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root = args.root.resolve()
    cache_root = root / ".tts-cache" / "local"
    cache_root.mkdir(parents=True, exist_ok=True)
    jobs = build_jobs(root, cache_root, args)
    if args.command == "plan":
        print_plan(jobs, args)
        return
    if args.command == "status":
        print_status(jobs)
        return
    if args.command == "publish":
        for job in jobs:
            if not job["audio_path"].is_file():
                raise RuntimeError(f"Missing completed narration: {job['audio_path'].name}")
            validate_aligned_transcript(job, args.alignment_model)
        publish_jobs(root, jobs)
        print("Validated existing narrations and updated library.json.")
        return
    if not jobs:
        print("No text-only catalog entries need narration.")
        return

    ensure_cuda_library_path()

    lock_path = cache_root / "worker.lock"
    with lock_path.open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("A local TTS worker is already running.")
        run_worker(root, cache_root, jobs, args)


def build_jobs(root: Path, cache_root: Path, args: argparse.Namespace) -> list[dict]:
    library = json.loads((root / "library.json").read_text(encoding="utf-8"))
    selected = set(args.only)
    jobs = []
    for entry in library:
        if not entry.get("text") or entry.get("audio"):
            continue
        if selected and entry["id"] not in selected:
            continue
        text_path = root / entry["text"]
        text = normalize_text(text_path.read_text(encoding="utf-8"))
        chunks = split_text(text, args.max_chars)
        signature = content_signature(text, root, args)
        cache_dir = cache_root / entry["id"] / signature
        jobs.append(
            {
                "entry": entry,
                "text": text,
                "text_path": text_path,
                "chunks": chunks,
                "signature": signature,
                "model_size": args.model_size,
                "cache_dir": cache_dir,
                "audio_path": root / f"{text_path.stem}.m4a",
                "transcript_path": root / f"{text_path.stem}.json",
            }
        )
    unknown = selected - {job["entry"]["id"] for job in jobs}
    if unknown:
        raise SystemExit(f"Unknown or already narrated ids: {', '.join(sorted(unknown))}")
    return jobs


def print_plan(jobs: list[dict], args: argparse.Namespace) -> None:
    print(f"Model: {MODEL_IDS[args.model_size]}")
    for job in jobs:
        cached = sum(valid_wav(chunk_path(job, index)) for index in range(len(job["chunks"])))
        print(
            f"{job['entry']['id']}: {len(job['chunks'])} chunks, "
            f"{cached} cached -> {job['audio_path'].name}"
        )
    print(f"Total: {len(jobs)} stories, {sum(len(job['chunks']) for job in jobs)} chunks")


def print_status(jobs: list[dict]) -> None:
    for job in jobs:
        total = len(job["chunks"])
        complete = sum(valid_wav(chunk_path(job, index)) for index in range(total))
        state = "published" if job["audio_path"].exists() and job["transcript_path"].exists() else f"{complete}/{total} chunks"
        print(f"{job['entry']['id']}: {state}")


def run_worker(root: Path, cache_root: Path, jobs: list[dict], args: argparse.Namespace) -> None:
    reference_path = cache_root / "narrator-reference.wav"
    ensure_reference(root, reference_path)
    model = load_model(args.model_size)
    clone_prompt = model.create_voice_clone_prompt(
        ref_audio=str(reference_path),
        ref_text=REFERENCE_TEXT,
        x_vector_only_mode=False,
    )
    print_plan(jobs, args)
    for job_index, job in enumerate(jobs, 1):
        job["cache_dir"].mkdir(parents=True, exist_ok=True)
        write_job_manifest(job, args)
        print(f"[{job_index}/{len(jobs)}] {job['entry']['title']}", flush=True)
        missing = [
            index for index in range(len(job["chunks"]))
            if not valid_wav(chunk_path(job, index))
        ]
        for start in range(0, len(missing), max(1, args.batch_size)):
            indexes = missing[start:start + max(1, args.batch_size)]
            generate_with_fallback(model, clone_prompt, job, indexes, args)
            label = str(indexes[0] + 1) if len(indexes) == 1 else f"{indexes[0] + 1}–{indexes[-1] + 1}"
            print(f"  chunks {label}/{len(job['chunks'])}", flush=True)
        assemble_story(job, args)
        print(f"  wrote {job['audio_path'].name}", flush=True)
    # The TTS model nearly fills an 8 GB card. Release it before loading Whisper
    # in the alignment subprocess, otherwise CUDA can fail despite both models
    # fitting comfortably when run one after the other.
    del clone_prompt
    del model
    gc.collect()
    try:
        import torch
        torch.cuda.empty_cache()
    except ImportError:
        pass
    align_jobs(root, jobs, args)
    publish_jobs(root, jobs)
    print("All narrations are Whisper-aligned and library.json has been updated.", flush=True)


def load_model(model_size: str):
    import torch
    from huggingface_hub import snapshot_download
    from qwen_tts import Qwen3TTSModel

    model_id = MODEL_IDS[model_size]
    print(f"Loading {model_id} on CUDA in bfloat16…", flush=True)
    try:
        model_source = snapshot_download(model_id, local_files_only=True)
    except Exception:
        model_source = model_id
    return Qwen3TTSModel.from_pretrained(
        model_source,
        device_map="cuda:0",
        dtype=torch.bfloat16,
        attn_implementation="sdpa",
    )


def ensure_cuda_library_path() -> None:
    """Re-exec once so PyTorch resolves this venv's CUDA libraries first."""
    marker = "READER_TTS_CUDA_PATH"
    if os.environ.get(marker) == "1":
        return
    version = f"python{sys.version_info.major}.{sys.version_info.minor}"
    nvidia_root = Path(sys.prefix) / "lib" / version / "site-packages" / "nvidia"
    library_dirs = sorted(path for path in nvidia_root.glob("*/lib") if path.is_dir())
    if not library_dirs:
        return
    environment = os.environ.copy()
    inherited = environment.get("LD_LIBRARY_PATH", "")
    environment["LD_LIBRARY_PATH"] = ":".join(
        [*(str(path) for path in library_dirs), *([inherited] if inherited else [])]
    )
    environment[marker] = "1"
    os.execve(sys.executable, [sys.executable, *sys.argv], environment)


def ensure_reference(root: Path, output: Path) -> None:
    if valid_wav(output):
        return
    source = root / REFERENCE_AUDIO
    temporary = output.with_suffix(".tmp.wav")
    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-ss", str(REFERENCE_START), "-t", str(REFERENCE_DURATION),
            "-i", str(source), "-ac", "1", "-ar", "24000", str(temporary),
        ],
        check=True,
    )
    os.replace(temporary, output)


def generate_batch(model, clone_prompt, job: dict, indexes: list[int], args: argparse.Namespace) -> None:
    import numpy as np
    import soundfile as sf
    import torch

    texts = [job["chunks"][index] for index in indexes]
    outputs = [chunk_path(job, index) for index in indexes]
    for output in outputs:
        output.parent.mkdir(parents=True, exist_ok=True)
    temporaries = [output.with_suffix(".tmp.wav") for output in outputs]
    last_error: Exception | None = None
    for attempt in range(1, args.retries + 1):
        try:
            seed_material = "|".join(f"{index}:{text}" for index, text in zip(indexes, texts))
            seed = int(hashlib.sha256(seed_material.encode()).hexdigest()[:8], 16) + attempt - 1
            random.seed(seed)
            np.random.seed(seed % (2**32 - 1))
            torch.manual_seed(seed)
            torch.cuda.manual_seed_all(seed)
            wavs, sample_rate = model.generate_voice_clone(
                text=texts,
                language="Spanish",
                voice_clone_prompt=clone_prompt,
                max_new_tokens=2048,
            )
            if len(wavs) != len(outputs):
                raise RuntimeError(f"model returned {len(wavs)} WAVs for a batch of {len(outputs)}")
            for wav, temporary in zip(wavs, temporaries):
                sf.write(temporary, wav, sample_rate, subtype="PCM_16")
                if not valid_wav(temporary):
                    raise RuntimeError("generated WAV was empty or invalid")
            for temporary, output in zip(temporaries, outputs):
                os.replace(temporary, output)
            return
        except torch.cuda.OutOfMemoryError as error:
            for temporary in temporaries:
                temporary.unlink(missing_ok=True)
            torch.cuda.empty_cache()
            if len(indexes) > 1:
                raise MemoryError("CUDA out of memory during batched synthesis") from error
            last_error = error
        except Exception as error:
            last_error = error
            for temporary in temporaries:
                temporary.unlink(missing_ok=True)
            if attempt < args.retries:
                print(f"  retrying chunks {indexes[0] + 1}–{indexes[-1] + 1}: {error}", file=sys.stderr, flush=True)
                time.sleep(2)
    raise RuntimeError(
        f"chunks {indexes[0] + 1}–{indexes[-1] + 1} failed after {args.retries} attempts: {last_error}"
    )


def generate_with_fallback(model, clone_prompt, job: dict, indexes: list[int], args: argparse.Namespace) -> None:
    try:
        generate_batch(model, clone_prompt, job, indexes, args)
    except MemoryError:
        if len(indexes) == 1:
            raise
        midpoint = len(indexes) // 2
        print(
            f"  batch of {len(indexes)} exceeded VRAM; retrying as smaller batches",
            file=sys.stderr,
            flush=True,
        )
        generate_with_fallback(model, clone_prompt, job, indexes[:midpoint], args)
        generate_with_fallback(model, clone_prompt, job, indexes[midpoint:], args)


def assemble_story(job: dict, args: argparse.Namespace) -> None:
    combined = job["cache_dir"] / "combined.wav"
    join_wavs(
        [(chunk, chunk_path(job, index)) for index, chunk in enumerate(job["chunks"])],
        combined,
    )
    temporary_audio = job["audio_path"].with_suffix(".tmp.m4a")
    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(combined),
            "-af", "loudnorm=I=-19:TP=-2:LRA=11", "-c:a", "aac", "-b:a", args.bitrate,
            str(temporary_audio),
        ],
        check=True,
    )
    os.replace(temporary_audio, job["audio_path"])


def join_wavs(chunks: list[tuple[str, Path]], output: Path) -> None:
    sample_rate = 24000
    with wave.open(str(output), "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(sample_rate)
        for index, (_, path) in enumerate(chunks):
            with wave.open(str(path), "rb") as source:
                if source.getnchannels() != 1 or source.getsampwidth() != 2 or source.getframerate() != sample_rate:
                    raise RuntimeError(f"Incompatible local TTS chunk: {path}")
                frames = source.readframes(source.getnframes())
            target.writeframes(frames)
            if index < len(chunks) - 1:
                target.writeframes(b"\0\0" * int(sample_rate * SILENCE_SECONDS))


def align_jobs(root: Path, jobs: list[dict], args: argparse.Namespace) -> None:
    """Run actual speech alignment once for the full batch, then verify every result."""
    wrapper = root / "scripts" / "transcribe_gpu.sh"
    if not wrapper.is_file() or not (root / ".venv").is_dir():
        raise RuntimeError(
            "Whisper alignment is required before publishing. "
            "Run ./scripts/setup_transcriber.sh, then resume this command."
        )
    print(f"Aligning {len(jobs)} narration(s) with faster-whisper {args.alignment_model}…", flush=True)
    subprocess.run(
        [str(wrapper), *(str(job["audio_path"]) for job in jobs), "--model", args.alignment_model],
        cwd=root,
        check=True,
    )
    for job in jobs:
        validate_aligned_transcript(job, args.alignment_model)


def validate_aligned_transcript(job: dict, model: str) -> None:
    path = job["transcript_path"]
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise RuntimeError(f"Whisper did not produce a valid transcript for {job['entry']['id']}: {error}") from error
    words = payload.get("words") if isinstance(payload, dict) else None
    if (
        not isinstance(words, list)
        or not words
        or payload.get("timingMethod") != "faster-whisper-word-timestamps"
        or payload.get("model") != model
        or payload.get("source") != job["audio_path"].name
    ):
        raise RuntimeError(f"Refusing to publish unaligned transcript: {path.name}")


def publish_jobs(root: Path, jobs: list[dict]) -> None:
    path = root / "library.json"
    library = json.loads(path.read_text(encoding="utf-8"))
    completed = {job["entry"]["id"]: job for job in jobs}
    for entry in library:
        job = completed.get(entry["id"])
        if not job:
            continue
        entry["sourceText"] = entry.pop("text")
        entry["audio"] = job["audio_path"].name
        entry["transcript"] = job["transcript_path"].name
        entry["audioGenerator"] = f"Qwen3-TTS {job['model_size']} local voice clone"
        entry["mediaVersion"] = job["signature"]
        if "project-produced local narration" not in entry.get("rights", ""):
            entry["rights"] = f"{entry.get('rights', '').rstrip('; ')}; project-produced local narration".lstrip("; ")
    temporary = path.with_suffix(".tmp.json")
    temporary.write_text(json.dumps(library, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)
    subprocess.run([sys.executable, str(root / "scripts" / "build_library.py")], cwd=root, check=True)


def write_job_manifest(job: dict, args: argparse.Namespace) -> None:
    manifest = {
        "id": job["entry"]["id"],
        "title": job["entry"]["title"],
        "model": MODEL_IDS[args.model_size],
        "signature": job["signature"],
        "chunks": job["chunks"],
    }
    path = job["cache_dir"] / "job.json"
    temporary = path.with_suffix(".tmp.json")
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def chunk_path(job: dict, index: int) -> Path:
    return job["cache_dir"] / f"{index + 1:04}.wav"


def valid_wav(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 1000:
        return False
    try:
        with wave.open(str(path), "rb") as source:
            return source.getnchannels() == 1 and source.getsampwidth() == 2 and source.getnframes() > 2400
    except (OSError, EOFError, wave.Error):
        return False


def split_text(text: str, max_chars: int) -> list[str]:
    paragraphs = [paragraph.strip() for paragraph in re.split(r"\n\s*\n", text) if paragraph.strip()]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        for piece in split_long_text(paragraph, max_chars):
            candidate = f"{current}\n\n{piece}".strip()
            if current and len(candidate) > max_chars:
                chunks.append(current)
                current = piece
            else:
                current = candidate
    if current:
        chunks.append(current)
    return chunks


def split_long_text(text: str, max_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    sentences = re.split(r"(?<=[.!?…])\s+", text)
    pieces: list[str] = []
    current = ""
    for sentence in sentences:
        if len(sentence) > max_chars:
            if current:
                pieces.append(current)
                current = ""
            pieces.extend(split_at_words(sentence, max_chars))
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


def split_at_words(text: str, max_chars: int) -> list[str]:
    pieces: list[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if current and len(candidate) > max_chars:
            pieces.append(current)
            current = word
        else:
            current = candidate
    if current:
        pieces.append(current)
    return pieces


def normalize_text(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", text.replace("\r\n", "\n")).strip()


def content_signature(text: str, root: Path, args: argparse.Namespace) -> str:
    reference_source = root / REFERENCE_AUDIO
    reference_hash = hashlib.sha256(reference_source.read_bytes()).hexdigest()
    payload = json.dumps(
        {
            "pipeline": PIPELINE_VERSION,
            "text": text,
            "model": MODEL_IDS[args.model_size],
            "alignmentModel": args.alignment_model,
            "max_chars": args.max_chars,
            "reference": reference_hash,
        },
        ensure_ascii=False,
        sort_keys=True,
    ).encode()
    return hashlib.sha256(payload).hexdigest()[:16]


if __name__ == "__main__":
    main()
