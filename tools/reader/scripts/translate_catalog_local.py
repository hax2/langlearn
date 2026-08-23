#!/usr/bin/env python3
"""Pretranslate the reader catalogue with a local Ollama model."""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from translate_catalog_google import atomic_write_json, build_job, fail, read_json

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
DEFAULT_MODEL = "translategemma:4b"
DEFAULT_BATCH_CHARACTERS = 30_000
SYSTEM_PROMPT = """You are a meticulous literary translator from Spanish to English.
Translate every supplied passage completely and faithfully into natural English.
Use neighboring passages as context for pronouns, names, idioms, and ambiguous words.
Preserve tone, meaning, dialogue, punctuation, and paragraph boundaries. Do not summarize,
explain, censor, add headings, or include the Spanish. Return exactly one English translation
for each input passage in the same order."""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--track", action="append", default=[], help="translate only this track ID (repeatable)")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--batch-characters", type=int, default=DEFAULT_BATCH_CHARACTERS)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    root = args.root.resolve()
    manifest_path = root / "library.json"
    library = read_json(manifest_path)
    if not isinstance(library, list):
        fail("library.json must contain a JSON array")
    requested = set(args.track)
    selected = [item for item in library if not requested or item.get("id") in requested]
    missing = requested - {item.get("id") for item in selected}
    if missing:
        fail(f"Unknown track ID(s): {', '.join(sorted(missing))}")
    if not selected:
        fail("No catalogue entries selected")
    if not 250 <= args.batch_characters <= 50_000:
        fail("--batch-characters must be between 250 and 50,000")

    jobs = []
    for track in selected:
        job = build_job(root, track)
        reset_job_for_model(job, args.model)
        job["title"] = track.get("title", job["id"])
        job["author"] = track.get("author", "")
        jobs.append(job)
    pending_characters = sum(job["pendingCharacters"] for job in jobs)
    print(
        f'{len(jobs)} tracks · {sum(len(job["blocks"]) for job in jobs):,} reader paragraphs · '
        f'{sum(job["characters"] for job in jobs):,} source characters ({pending_characters:,} pending)',
        flush=True,
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

    completed_paths: dict[str, str] = {}
    started = time.monotonic()
    translated_characters = 0
    for job in jobs:
        relative_path = f'translations/{job["id"]}.en.json'
        if job["complete"]:
            completed_paths[job["id"]] = relative_path
            print(f'✓ {job["id"]}: already translated', flush=True)
            continue
        sent = translate_job(job, args.model, args.batch_characters)
        translated_characters += sent
        completed_paths[job["id"]] = relative_path
        elapsed = time.monotonic() - started
        eta = elapsed * max(0, pending_characters - translated_characters) / max(1, translated_characters)
        print(
            f'✓ {job["id"]}: saved {len(job["blocks"]):,} paragraphs · '
            f'elapsed {duration(elapsed)} · ETA {duration(eta)}',
            flush=True,
        )

    changed = False
    for item in library:
        path = completed_paths.get(item.get("id"))
        if path and item.get("englishTranslation") != path:
            item["englishTranslation"] = path
            changed = True
    if changed:
        atomic_write_json(manifest_path, library)
        print("Updated library.json to use the saved translations", flush=True)
    print(f"Done in {duration(time.monotonic() - started)}", flush=True)


def translate_job(job: dict, model: str, batch_limit: int) -> int:
    translations = job["translations"]
    pending = [index for index, value in enumerate(translations) if not value]
    batches = make_batches(pending, job["blocks"], batch_limit)
    sent = 0
    for batch_number, batch in enumerate(batches, 1):
        sources = [job["blocks"][index] for index in batch]
        results, stats = translate_batch_resilient(sources, model, job["title"], job["author"])
        for index, translated in zip(batch, results):
            translations[index] = translated
        batch_characters = sum(map(len, sources))
        sent += batch_characters
        atomic_write_json(job["partialPath"], {
            "version": 1,
            "trackId": job["id"],
            "sourceHash": job["sourceHash"],
            "model": model,
            "translations": translations,
        })
        speed = stats.get("speed")
        speed_label = f" · {speed:.1f} tokens/s" if speed else ""
        if batch_number == 1 or batch_number % 10 == 0 or batch_number == len(batches):
            print(
                f'  {job["id"]}: batch {batch_number}/{len(batches)} · '
                f'{sum(value is not None for value in translations):,}/{len(translations):,} paragraphs{speed_label}',
                flush=True,
            )

    payload = {
        "version": 1,
        "trackId": job["id"],
        "sourceHash": job["sourceHash"],
        "provider": f"ollama/{model}",
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
        if current:
            batches.append(current)
            current = []
            size = 0
        current.append(index)
        size += block_size
    if current:
        batches.append(current)
    return batches


def translate_batch(sources: list[str], model: str, title: str, author: str) -> tuple[list[str], dict]:
    single = len(sources) == 1
    is_translate_gemma = model.split(":", 1)[0].lower() == "translategemma"
    if is_translate_gemma and single:
        prompt = (
            "You are a professional Spanish (es) to English (en) translator. Your goal is to accurately "
            "convey the meaning and nuances of the original Spanish text while adhering to English grammar, "
            "vocabulary, and cultural sensitivities.\nProduce only the English translation, without any "
            "additional explanations or commentary. Please translate the following Spanish text into English:"
            "\n\n\n" + sources[0]
        )
    else:
        prompt = (
            f"Work: {title}\nAuthor: {author}\n\n"
            + (
                "Translate this Spanish passage into English. Return only the complete English translation, "
                "with no quotation marks, label, note, or explanation:\n\n" + sources[0]
                if single
                else "Translate the following JSON array. Return an object with a `translations` array "
                "containing exactly the same number of strings:\n" + json.dumps(sources, ensure_ascii=False)
            )
        )
    schema = {
        "type": "object",
        "properties": {
            "translations": {
                "type": "array",
                "minItems": len(sources),
                "maxItems": len(sources),
                "items": {"type": "string"},
            }
        },
        "required": ["translations"],
    }
    request_body = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "keep_alive": "30m",
        "options": {
            "temperature": 0,
            "num_ctx": 8192,
            "num_predict": min(8192, max(2048, len(sources[0]))) if single else 4096,
        },
    }
    if not is_translate_gemma:
        request_body["system"] = SYSTEM_PROMPT
    if not single:
        request_body["format"] = schema
    body = json.dumps(request_body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        OLLAMA_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    last_error = "invalid response"
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=900) as response:
                payload = json.load(response)
            raw_response = payload.get("response", "").strip()
            if single:
                translations = [raw_response]
            else:
                parsed = json.loads(raw_response)
                translations = parsed.get("translations")
            if not isinstance(translations, list) or len(translations) != len(sources):
                raise ValueError(f"expected {len(sources)} translations")
            cleaned = [str(value).strip() for value in translations]
            if any(not value for value in cleaned):
                raise ValueError("received an empty translation")
            eval_count = int(payload.get("eval_count") or 0)
            eval_duration = int(payload.get("eval_duration") or 0)
            speed = eval_count / (eval_duration / 1_000_000_000) if eval_duration else 0
            return cleaned, {"speed": speed}
        except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError) as error:
            last_error = str(error)
            if attempt < 2:
                time.sleep(1 + attempt)
    raise RuntimeError(last_error)


def translate_batch_resilient(sources: list[str], model: str, title: str, author: str) -> tuple[list[str], dict]:
    try:
        return translate_batch(sources, model, title, author)
    except RuntimeError as error:
        if len(sources) == 1:
            fail(f"Ollama could not translate a paragraph after 3 attempts: {error}")
        midpoint = len(sources) // 2
        print(f"    Retrying a malformed {len(sources)}-paragraph response as smaller batches", flush=True)
        left, left_stats = translate_batch_resilient(sources[:midpoint], model, title, author)
        right, right_stats = translate_batch_resilient(sources[midpoint:], model, title, author)
        speeds = [value for value in (left_stats.get("speed"), right_stats.get("speed")) if value]
        return left + right, {"speed": sum(speeds) / len(speeds) if speeds else 0}


def duration(seconds: float) -> str:
    seconds = max(0, round(seconds))
    hours, remainder = divmod(seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}h {minutes:02d}m"
    if minutes:
        return f"{minutes}m {secs:02d}s"
    return f"{secs}s"


def reset_job_for_model(job: dict, model: str) -> None:
    provider = f"ollama/{model}"
    if job["complete"]:
        try:
            if read_json(job["outputPath"]).get("provider") == provider:
                return
        except (OSError, ValueError, AttributeError):
            pass
        job["complete"] = False
        job["translations"] = [None] * len(job["blocks"])
    else:
        try:
            partial = read_json(job["partialPath"])
            if partial.get("model") != model:
                job["translations"] = [None] * len(job["blocks"])
        except (OSError, ValueError, AttributeError):
            job["translations"] = [None] * len(job["blocks"])
    job["pendingCharacters"] = sum(
        len(source)
        for source, translated in zip(job["blocks"], job["translations"])
        if not translated
    )


if __name__ == "__main__":
    main()
