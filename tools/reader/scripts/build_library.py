#!/usr/bin/env python3
"""Validate and enrich the hand-curated library manifest for GitHub Pages."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

DIFFICULTIES = {"A2", "B1", "B2", "C1"}
REQUIRED_FIELDS = {
    "id",
    "title",
    "author",
    "difficulty",
    "difficultyNote",
    "genre",
    "description",
    "source",
    "rights",
}
WORD_PATTERN = re.compile(r"[\wÀ-ÿ]+", re.UNICODE)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("-o", "--output", type=Path, default=None)
    parser.add_argument("--check", action="store_true", help="validate without writing")
    args = parser.parse_args()

    root = args.root.resolve()
    manifest = (args.output or root / "library.json").resolve()
    try:
        library = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        fail(f"Could not read {manifest}: {error}")
    if not isinstance(library, list):
        fail("library.json must contain a JSON array")

    errors: list[str] = []
    seen_ids: set[str] = set()
    enriched = []
    for index, original in enumerate(library):
        if not isinstance(original, dict):
            errors.append(f"Entry {index + 1} is not an object")
            continue
        item = dict(original)
        label = item.get("id") or f"entry {index + 1}"
        missing = sorted(field for field in REQUIRED_FIELDS if not item.get(field))
        if missing:
            errors.append(f"{label}: missing {', '.join(missing)}")
        if label in seen_ids:
            errors.append(f"{label}: duplicate id")
        seen_ids.add(label)
        if item.get("difficulty") not in DIFFICULTIES:
            errors.append(f"{label}: difficulty must be one of {sorted(DIFFICULTIES)}")
        if not item.get("audio") and not item.get("text"):
            errors.append(f"{label}: needs an audio or text file")
        if item.get("audio") and not item.get("transcript"):
            errors.append(f"{label}: narrated readings need a timed transcript")
        for field in ("audio", "transcript", "text", "sourceText", "cover", "englishTranslation"):
            if item.get(field) and not (root / item[field]).is_file():
                errors.append(f"{label}: {field} file does not exist: {item[field]}")
        if item.get("transcript") and (root / item["transcript"]).is_file():
            errors.extend(
                f"{label}: {error}"
                for error in validate_transcript(root / item["transcript"])
            )

        source_text = item.get("sourceText") or item.get("text")
        if source_text and (root / source_text).is_file():
            text = (root / source_text).read_text(encoding="utf-8")
            text = strip_catalog_header(text, item)
            item["wordCount"] = count_words(text)
        elif item.get("transcript") and (root / item["transcript"]).is_file():
            item["wordCount"] = transcript_word_count(root / item["transcript"])

        if item.get("audio") and (root / item["audio"]).is_file():
            item["minutes"] = max(1, round(audio_seconds(root / item["audio"]) / 60))
        elif item.get("wordCount"):
            item["minutes"] = max(1, round(item["wordCount"] / 180))
        enriched.append(item)

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)

    rendered = json.dumps(enriched, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if manifest.read_text(encoding="utf-8") != rendered:
            fail("library.json is valid but not enriched; run scripts/build_library.py")
        print(f"Validated {len(enriched)} curated readings")
    else:
        manifest.write_text(rendered, encoding="utf-8")
        print(f"Validated and wrote {len(enriched)} curated readings to {manifest}")


def count_words(text: str) -> int:
    return len(WORD_PATTERN.findall(text))


def strip_catalog_header(text: str, item: dict) -> str:
    lines = text.replace("\r", "").split("\n")
    if (
        len(lines) >= 3
        and lines[0].strip() == item.get("title")
        and lines[1].strip() == item.get("author")
        and not lines[2].strip()
    ):
        return "\n".join(lines[3:])
    return text


def transcript_word_count(path: Path) -> int:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return len(payload)
    if isinstance(payload.get("words"), list):
        return len(payload["words"])
    return sum(len(segment.get("words", [])) for segment in payload.get("segments", []))


def validate_transcript(path: Path) -> list[str]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        return [f"invalid transcript JSON: {error}"]
    if isinstance(payload, list):
        words = payload
    elif isinstance(payload.get("words"), list):
        words = payload["words"]
    else:
        words = [word for segment in payload.get("segments", []) for word in segment.get("words", [])]
    if not words:
        return ["transcript has no timed words"]
    previous_start = -1.0
    for index, word in enumerate(words):
        try:
            start = float(word["start"])
            end = float(word["end"])
        except (KeyError, TypeError, ValueError):
            return [f"transcript word {index + 1} has invalid timing"]
        if start < 0 or end < start or start < previous_start:
            return [f"transcript timing is not monotonic at word {index + 1}"]
        previous_start = start
    return []


def audio_seconds(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


if __name__ == "__main__":
    main()
