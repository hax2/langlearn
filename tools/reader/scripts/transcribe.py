#!/usr/bin/env python3
"""Transcribe Spanish audio to word-timed JSON for the static reader."""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create word-level Spanish transcript JSON using faster-whisper."
    )
    parser.add_argument("audio", type=Path, nargs="+", help="Audio file(s) to transcribe")
    parser.add_argument("-o", "--output", type=Path, help="Output JSON path")
    parser.add_argument("--model", default="medium", help="Whisper model size or path")
    parser.add_argument("--device", default="cuda", choices=["cuda", "cpu", "auto"])
    parser.add_argument(
        "--compute-type",
        default="float16",
        help="Use float16 on NVIDIA GPUs; use int8_float16 or int8 if VRAM is tight.",
    )
    parser.add_argument("--beam-size", type=int, default=5)
    parser.add_argument("--no-vad", action="store_true", help="Disable voice activity filtering")
    parser.add_argument("--vtt", action="store_true", help="Also write a WebVTT file")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    missing = [audio for audio in args.audio if not audio.exists()]
    if missing:
        raise SystemExit(f"Audio file not found: {missing[0]}")
    if args.output and len(args.audio) != 1:
        raise SystemExit("--output can only be used with one audio file")

    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise SystemExit(
            "Missing faster-whisper. Run: ./scripts/setup_transcriber.sh"
        ) from exc

    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    for audio in args.audio:
        transcribe_audio(model, audio, args)


def transcribe_audio(model, audio: Path, args: argparse.Namespace) -> None:
    output = args.output or audio.with_suffix(".json")
    segments, info = model.transcribe(
        str(audio),
        language="es",
        beam_size=args.beam_size,
        vad_filter=not args.no_vad,
        word_timestamps=True,
    )

    words: list[dict[str, float | str]] = []
    vtt_cues: list[tuple[float, float, str]] = []

    try:
        for segment in segments:
            segment_text = clean_text(segment.text)
            if segment_text:
                vtt_cues.append((segment.start, segment.end, segment_text))
            for word in segment.words or []:
                text = clean_word(word.word)
                if not text:
                    continue
                words.append(
                    {
                        "word": text,
                        "start": round(float(word.start), 3),
                        "end": round(float(word.end), 3),
                    }
                )
    except RuntimeError as exc:
        message = str(exc)
        if "libcublas.so.12" in message or "libcudnn" in message:
            raise SystemExit(
                "CUDA runtime libraries were not found. Run ./scripts/setup_transcriber.sh, "
                "then launch transcription with ./scripts/transcribe_gpu.sh instead of "
                "calling scripts/transcribe.py directly."
            ) from exc
        raise

    payload = {
        "source": audio.name,
        "title": existing_title(output),
        "language": info.language,
        "language_probability": round(float(info.language_probability), 4),
        "model": args.model,
        "timingMethod": "faster-whisper-word-timestamps",
        "words": words,
    }
    temporary = output.with_suffix(".tmp.json")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, output)
    print(f"Wrote {len(words)} words to {output}")

    if args.vtt:
        vtt_path = output.with_suffix(".vtt")
        vtt_path.write_text(render_vtt(vtt_cues), encoding="utf-8")
        print(f"Wrote cues to {vtt_path}")


def clean_word(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def existing_title(path: Path) -> str:
    if not path.exists():
        return ""
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return ""
    title = payload.get("title", "") if isinstance(payload, dict) else ""
    return title.strip() if isinstance(title, str) else ""


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def render_vtt(cues: list[tuple[float, float, str]]) -> str:
    lines = ["WEBVTT", ""]
    for index, (start, end, text) in enumerate(cues, 1):
        lines.extend([str(index), f"{stamp(start)} --> {stamp(end)}", text, ""])
    return "\n".join(lines)


def stamp(seconds: float) -> str:
    millis = int(round(seconds * 1000))
    hours, rem = divmod(millis, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, ms = divmod(rem, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02}.{ms:03}"


if __name__ == "__main__":
    main()
