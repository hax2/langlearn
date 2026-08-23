#!/usr/bin/env python3
"""Merge transcript vocabulary into the shared glossary."""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path
from typing import Any

WORD_RE = re.compile(r"[\wÀ-ÖØ-öø-ÿ]+", re.UNICODE)


def main() -> None:
    parser = argparse.ArgumentParser(description="Update glossary/shared.json from transcripts.")
    parser.add_argument("transcripts", nargs="*", type=Path, help="Transcript JSON files to scan.")
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--glossary", type=Path, default=Path("glossary/shared.json"))
    parser.add_argument("--missing", type=Path, default=Path("glossary/missing.json"))
    args = parser.parse_args()

    root = args.root.resolve()
    transcripts = args.transcripts or sorted(root.glob("*.json"))
    transcripts = [
        path
        for path in transcripts
        if path.name not in {"library.json"} and not path.name.endswith(".glossary.json")
    ]

    glossary = read_json_object(args.glossary)
    vocabulary = sorted({word for path in transcripts for word in words_from_transcript(path)})

    added = 0
    for word in vocabulary:
        if word not in glossary:
            glossary[word] = ""
            added += 1

    write_json(args.glossary, dict(sorted(glossary.items())))
    missing = [word for word, meaning in sorted(glossary.items()) if not str(meaning).strip()]
    write_json(args.missing, missing)
    print(f"Scanned {len(transcripts)} transcripts.")
    print(f"Added {added} new glossary entries to {args.glossary}.")
    print(f"{len(missing)} entries still need meanings in {args.missing}.")


def read_json_object(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise SystemExit(f"{path} must be a JSON object.")
    return {normalize_word(key): str(value) for key, value in data.items() if normalize_word(key)}


def words_from_transcript(path: Path) -> set[str]:
    if path.name == "library.json":
        return set()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return set()

    raw_words: list[str] = []
    if isinstance(data, list):
        raw_words.extend(word_text(item) for item in data)
    elif isinstance(data, dict):
        if isinstance(data.get("words"), list):
            raw_words.extend(word_text(item) for item in data["words"])
        for segment in data.get("segments", []) if isinstance(data.get("segments"), list) else []:
            if isinstance(segment.get("words"), list):
                raw_words.extend(word_text(item) for item in segment["words"])
            elif segment.get("text"):
                raw_words.extend(WORD_RE.findall(str(segment["text"])))

    return {normalize_word(word) for word in raw_words if normalize_word(word)}


def word_text(item: Any) -> str:
    if isinstance(item, dict):
        return str(item.get("word") or item.get("text") or "")
    return str(item)


def normalize_word(value: str) -> str:
    normalized = unicodedata.normalize("NFC", value).casefold()
    return "".join(char for char in normalized if char.isalnum())


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
