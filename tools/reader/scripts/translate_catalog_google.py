#!/usr/bin/env python3
"""Pretranslate the reader catalogue with Google Cloud Translation Basic (v2)."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API_URL = "https://translation.googleapis.com/language/translate/v2"
DEFAULT_MAX_CHARACTERS = 500_000
DEFAULT_BATCH_CHARACTERS = 5_000
SENTENCE_END = re.compile(r'''[.!?…]["')\]]*\s*$''')
TOKEN_PATTERN = re.compile(r"\w+(?:['’]\w+)?|[^\w]+", re.UNICODE)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--env", type=Path, default=Path(".env"))
    parser.add_argument("--track", action="append", default=[], help="translate only this track ID (repeatable)")
    parser.add_argument("--dry-run", action="store_true", help="show the work without contacting Google")
    parser.add_argument("--check", action="store_true", help="validate saved translations without writing")
    parser.add_argument("--max-characters", type=int, default=DEFAULT_MAX_CHARACTERS)
    parser.add_argument("--batch-characters", type=int, default=DEFAULT_BATCH_CHARACTERS)
    args = parser.parse_args()

    root = args.root.resolve()
    manifest_path = root / "library.json"
    library = read_json(manifest_path)
    if not isinstance(library, list):
        fail("library.json must contain a JSON array")

    requested = set(args.track)
    selected = [item for item in library if not requested or item.get("id") in requested]
    missing_ids = requested - {item.get("id") for item in selected}
    if missing_ids:
        fail(f"Unknown track ID(s): {', '.join(sorted(missing_ids))}")
    if not selected:
        fail("No catalogue entries selected")

    jobs = [build_job(root, item) for item in selected]
    pending_characters = sum(job["pendingCharacters"] for job in jobs)
    total_characters = sum(job["characters"] for job in jobs)
    total_blocks = sum(len(job["blocks"]) for job in jobs)
    print(
        f"{len(jobs)} tracks · {total_blocks:,} reader paragraphs · "
        f"{total_characters:,} source characters ({pending_characters:,} pending)"
    )

    if args.check:
        invalid = [job["id"] for job in jobs if not job["complete"]]
        if invalid:
            fail(f"Missing or stale saved translations: {', '.join(invalid)}")
        print("All selected translations match their current Spanish source")
        return
    if args.dry_run:
        for job in jobs:
            state = "saved" if job["complete"] else f'{job["pendingCharacters"]:,} pending characters'
            print(f'- {job["id"]}: {len(job["blocks"]):,} paragraphs, {state}')
        return
    if pending_characters > args.max_characters:
        fail(
            f"This run would send {pending_characters:,} new characters, above the "
            f"{args.max_characters:,} safety cap. Split the run with --track or deliberately "
            "raise --max-characters."
        )
    if args.batch_characters < 1 or args.batch_characters > 5_000:
        fail("--batch-characters must be between 1 and 5,000")

    load_env((root / args.env).resolve() if not args.env.is_absolute() else args.env)
    api_key = (
        os.environ.get("GOOGLE_CLOUD_TRANSLATE_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or os.environ.get("GEMINI_API_KEY")
    )
    if not api_key:
        fail(
            "No Google API key found. Put GOOGLE_CLOUD_TRANSLATE_API_KEY in .env "
            "after enabling Cloud Translation API for its Google Cloud project."
        )

    completed_paths: dict[str, str] = {}
    sent = 0
    for job in jobs:
        relative_path = f'translations/{job["id"]}.en.json'
        if job["complete"]:
            completed_paths[job["id"]] = relative_path
            print(f'✓ {job["id"]}: already translated')
            continue
        sent += translate_job(root, job, api_key, args.batch_characters)
        completed_paths[job["id"]] = relative_path
        print(f'✓ {job["id"]}: saved {len(job["blocks"]):,} paragraphs')

    changed = False
    for item in library:
        path = completed_paths.get(item.get("id"))
        if path and item.get("englishTranslation") != path:
            item["englishTranslation"] = path
            changed = True
    if changed:
        atomic_write_json(manifest_path, library)
        print("Updated library.json to use the saved translations")
    print(f"Done · {sent:,} characters sent to Google in this run")


def build_job(root: Path, track: dict) -> dict:
    track_id = track.get("id")
    if not track_id:
        fail("Every catalogue entry needs an id")
    blocks = reader_blocks(root, track)
    if not blocks:
        fail(f"{track_id}: source contains no readable paragraphs")
    source_hash = hashlib.sha256("\n\0\n".join(blocks).encode("utf-8")).hexdigest()
    output_path = root / "translations" / f"{track_id}.en.json"
    partial_path = root / "translations" / f"{track_id}.en.partial.json"
    complete = valid_complete(output_path, track_id, source_hash, blocks)
    translations = [None] * len(blocks)
    if not complete:
        translations = valid_partial(partial_path, source_hash, len(blocks)) or translations
    pending_characters = sum(len(source) for source, translated in zip(blocks, translations) if not translated)
    if complete:
        pending_characters = 0
    return {
        "id": track_id,
        "blocks": blocks,
        "sourceHash": source_hash,
        "characters": sum(map(len, blocks)),
        "pendingCharacters": pending_characters,
        "outputPath": output_path,
        "partialPath": partial_path,
        "translations": translations,
        "complete": complete,
    }


def reader_blocks(root: Path, track: dict) -> list[str]:
    source_path = track.get("transcript") if track.get("audio") else (track.get("text") or track.get("transcript"))
    if not source_path:
        fail(f'{track.get("id", "entry")}: no reader source file')
    path = root / source_path
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as error:
        fail(f'{track.get("id", "entry")}: could not read {source_path}: {error}')
    if track.get("text"):
        raw = strip_catalog_header(raw, track)
    words = parse_reader_source(raw, path.name)
    blocks: list[str] = []
    current = ""
    sentence_count = 0
    for index, word in enumerate(words):
        separator = word.get("separator") or " "
        piece = f'{word["text"]}{separator}'
        current += piece
        if SENTENCE_END.search(piece):
            sentence_count += 1
        if sentence_count >= 4 and index < len(words) - 1:
            blocks.append(current.strip())
            current = ""
            sentence_count = 0
    if current.strip():
        blocks.append(current.strip())
    return blocks


def parse_reader_source(text: str, name: str) -> list[dict[str, str]]:
    trimmed = text.strip()
    lower = name.lower()
    if lower.endswith(".json") or trimmed.startswith(("{", "[")):
        payload = json.loads(trimmed)
        if isinstance(payload, list):
            source = payload
        elif isinstance(payload.get("words"), list):
            source = payload["words"]
        else:
            source = [word for segment in payload.get("segments", []) for word in segment.get("words", [])]
        return [
            {"text": str(item.get("word", item.get("text", ""))).strip(), "separator": ""}
            for item in source
            if str(item.get("word", item.get("text", ""))).strip()
        ]
    if lower.endswith((".vtt", ".srt")) or "-->" in trimmed:
        return tokenize_text(cue_text(trimmed))
    return tokenize_text(trimmed)


def tokenize_text(text: str) -> list[dict[str, str]]:
    words: list[dict[str, str]] = []
    for match in TOKEN_PATTERN.finditer(text):
        token = match.group(0)
        if token[0].isalnum() or token[0] == "_":
            words.append({"text": token, "separator": ""})
        elif words:
            words[-1]["separator"] += token
    return words


def cue_text(text: str) -> str:
    lines = []
    for block in text.replace("\r", "").split("\n\n"):
        block_lines = [line for line in block.splitlines() if line.strip() and line.strip() != "WEBVTT"]
        timing = next((index for index, line in enumerate(block_lines) if "-->" in line), None)
        if timing is not None:
            lines.append(" ".join(block_lines[timing + 1 :]))
    return " ".join(lines)


def translate_job(root: Path, job: dict, api_key: str, batch_limit: int) -> int:
    translations = job["translations"]
    pending = [index for index, value in enumerate(translations) if not value]
    sent = 0
    for batch in make_batches(pending, job["blocks"], batch_limit):
        sources = [job["blocks"][index] for index in batch]
        results = google_translate(sources, api_key)
        if len(results) != len(batch):
            fail(f'{job["id"]}: Google returned {len(results)} translations for {len(batch)} inputs')
        for index, translated in zip(batch, results):
            translations[index] = translated
        sent += sum(map(len, sources))
        atomic_write_json(job["partialPath"], {
            "version": 1,
            "trackId": job["id"],
            "sourceHash": job["sourceHash"],
            "translations": translations,
        })
        done = sum(value is not None for value in translations)
        print(f'  {job["id"]}: {done:,}/{len(translations):,} paragraphs · {sent:,} characters sent')

    payload = {
        "version": 1,
        "trackId": job["id"],
        "sourceHash": job["sourceHash"],
        "provider": "google-cloud-translation-nmt",
        "sourceLanguage": "es",
        "targetLanguage": "en",
        "translatedAt": datetime.now(timezone.utc).isoformat(),
        "characters": job["characters"],
        "blocks": [
            {"source": source, "translation": translated}
            for source, translated in zip(job["blocks"], translations)
        ],
    }
    atomic_write_json(job["outputPath"], payload)
    job["partialPath"].unlink(missing_ok=True)
    return sent


def make_batches(indices: list[int], blocks: list[str], limit: int) -> list[list[int]]:
    batches: list[list[int]] = []
    current: list[int] = []
    size = 0
    for index in indices:
        block_size = len(blocks[index])
        if block_size > limit:
            fail(f"Reader paragraph {index + 1} has {block_size:,} characters; batch limit is {limit:,}")
        if current and size + block_size > limit:
            batches.append(current)
            current = []
            size = 0
        current.append(index)
        size += block_size
    if current:
        batches.append(current)
    return batches


def google_translate(sources: list[str], api_key: str) -> list[str]:
    body = json.dumps({"q": sources, "source": "es", "target": "en", "format": "text"}).encode("utf-8")
    request = urllib.request.Request(
        f"{API_URL}?key={api_key}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                payload = json.load(response)
            return [html.unescape(item["translatedText"]).strip() for item in payload["data"]["translations"]]
        except urllib.error.HTTPError as error:
            detail = safe_http_error(error)
            if error.code not in {429, 500, 502, 503, 504} or attempt == 4:
                fail(f"Google Translation API returned HTTP {error.code}: {detail}")
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt == 4:
                fail(f"Could not reach Google Translation API: {error}")
        time.sleep(2**attempt)
    return []


def safe_http_error(error: urllib.error.HTTPError) -> str:
    try:
        payload = json.loads(error.read().decode("utf-8", errors="replace"))
        return str(payload.get("error", {}).get("message") or "request failed")
    except (ValueError, OSError):
        return "request failed"


def valid_complete(path: Path, track_id: str, source_hash: str, blocks: list[str]) -> bool:
    try:
        payload = read_json(path)
        saved = payload.get("blocks", [])
        return (
            payload.get("trackId") == track_id
            and payload.get("sourceHash") == source_hash
            and len(saved) == len(blocks)
            and all(item.get("source") == source and item.get("translation") for item, source in zip(saved, blocks))
        )
    except (OSError, ValueError, AttributeError):
        return False


def valid_partial(path: Path, source_hash: str, count: int) -> list[str | None] | None:
    try:
        payload = read_json(path)
        values = payload.get("translations")
        if payload.get("sourceHash") == source_hash and isinstance(values, list) and len(values) == count:
            return [value if isinstance(value, str) and value.strip() else None for value in values]
    except (OSError, ValueError, AttributeError):
        pass
    return None


def strip_catalog_header(text: str, track: dict) -> str:
    lines = text.replace("\r", "").split("\n")
    if (
        len(lines) >= 3
        and lines[0].strip() == track.get("title")
        and lines[1].strip() == track.get("author")
        and not lines[2].strip()
    ):
        return "\n".join(lines[3:])
    return text


def load_env(path: Path) -> None:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def atomic_write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def read_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


if __name__ == "__main__":
    main()
