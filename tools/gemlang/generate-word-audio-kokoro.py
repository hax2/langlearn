#!/usr/bin/env python3
"""Generate Kokoro MP3 assets for clickable Spanish words."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULES_DIR = ROOT / "src" / "data" / "modules"
OUTPUT_DIR = ROOT / "public" / "word-audio" / "generated"
MANIFEST_PATH = ROOT / "public" / "word-audio" / "manifest.json"
DEFAULT_VOICE = "ef_dora"


def clean_word(word: str) -> str:
    return str(word).strip().strip('.,¿?¡!;:"“”‘’()[]{}')


def audio_id(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]


def collect_words() -> list[str]:
    words: dict[str, str] = {}

    for module_path in sorted(MODULES_DIR.glob("*.json")):
        module = json.loads(module_path.read_text(encoding="utf-8"))

        for sentence in module.get("sentences") or []:
            for word in (sentence.get("wordMeanings") or {}).keys():
                cleaned = clean_word(word)
                if cleaned:
                    words.setdefault(cleaned.lower(), cleaned)

        for word, entry in (module.get("vocabulary") or {}).items():
            cleaned = clean_word(entry.get("word") or word if isinstance(entry, dict) else word)
            if cleaned:
                words.setdefault(cleaned.lower(), cleaned)

        if module.get("specialPractice") == "ser-estar-rules":
            for rule in module.get("rules") or []:
                for example in rule.get("examples") or []:
                    text = " ".join(
                        str(part)
                        for part in (example.get("prompt"), example.get("correct"), example.get("continuation"))
                        if part
                    )
                    for word in text.split():
                        cleaned = clean_word(word)
                        if cleaned:
                            words.setdefault(cleaned.lower(), cleaned)
                for translation in rule.get("translations") or []:
                    for word in str(translation.get("spanish", "")).split():
                        cleaned = clean_word(word)
                        if cleaned:
                            words.setdefault(cleaned.lower(), cleaned)

    return sorted(words.values(), key=str.lower)


def synthesize_words(words: list[str], voice: str, overwrite: bool) -> dict[str, str]:
    try:
        import numpy as np
        import soundfile as sf
        from kokoro import KPipeline
    except ImportError as exc:
        raise SystemExit(
            "Missing Kokoro dependencies. Run: python3 -m pip install 'kokoro>=0.9.4' 'soundfile>=0.12.1' 'numpy>=1.26.0'"
        ) from exc

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    pipeline = KPipeline(lang_code="e")
    manifest: dict[str, str] = {}

    for index, word in enumerate(words, start=1):
        mp3_name = f"{audio_id(word.lower())}.mp3"
        mp3_path = OUTPUT_DIR / mp3_name
        manifest[word] = f"word-audio/generated/{mp3_name}"
        manifest[word.lower()] = f"word-audio/generated/{mp3_name}"

        if mp3_path.exists() and not overwrite:
            continue

        print(f"[{index}/{len(words)}] {voice}: {word}", flush=True)
        chunks = []
        for _, _, audio in pipeline(word, voice=voice):
            chunks.append(np.asarray(audio, dtype=np.float32))

        if not chunks:
            print("  skipped: no audio returned", file=sys.stderr)
            continue

        audio = np.concatenate(chunks)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            wav_path = Path(tmp.name)

        try:
            sf.write(wav_path, audio, 24000)
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    str(wav_path),
                    "-codec:a",
                    "libmp3lame",
                    "-b:a",
                    "64k",
                    str(mp3_path),
                ],
                check=True,
            )
        finally:
            wav_path.unlink(missing_ok=True)

    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", default=DEFAULT_VOICE, help="Kokoro Spanish voice.")
    parser.add_argument("--overwrite", action="store_true", help="Regenerate existing MP3s.")
    parser.add_argument("--limit", type=int, default=0, help="Generate only the first N words.")
    parser.add_argument("--dry-run", action="store_true", help="Only print the word count.")
    args = parser.parse_args()

    words = collect_words()
    if args.limit > 0:
        words = words[: args.limit]

    print(f"Collected {len(words)} unique clickable Spanish words.")
    if args.dry_run:
        return

    manifest = synthesize_words(words, args.voice, args.overwrite)
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {MANIFEST_PATH.relative_to(ROOT)} with {len(manifest)} entries.")


if __name__ == "__main__":
    main()
