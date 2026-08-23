#!/usr/bin/env python3
"""Generate Spanish MP3 assets for GemLang with Google Cloud Text-to-Speech.

The app reads public/audio/manifest.json as an exact text -> MP3 path map.
Each manifest entry can point to one MP3 path or a list of MP3 paths. When a
list is present, LessonPlayer randomly chooses one voice for playback.
"""

from __future__ import annotations

import argparse
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import os
import shutil
import threading
import time
from pathlib import Path
from urllib import error, parse, request


ROOT = Path(__file__).resolve().parents[1]
MODULES_DIR = ROOT / "src" / "data" / "modules"
OUTPUT_DIR = ROOT / "public" / "audio" / "generated"
MANIFEST_PATH = ROOT / "public" / "audio" / "manifest.json"
ARCHIVE_DIR = ROOT / "audio-archive" / "generated"
TOKEN_PATH = ROOT / ".google-tts-token.json"
DEFAULT_VOICES = ("es-ES-Chirp3-HD-Aoede", "es-ES-Chirp3-HD-Umbriel")
API_KEY_ENV = "GOOGLE_TTS_API_KEY"
GOOGLE_TTS_SCOPE = "https://www.googleapis.com/auth/cloud-platform"


def load_dotenv() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def normalize_text(text: str) -> str:
    return " ".join(str(text).split())


def audio_id(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]


def voice_slug(voice: str) -> str:
    return "".join(char if char.isalnum() or char in ("-", "_") else "-" for char in voice)


def mp3_filename(text: str, voice: str) -> str:
    return f"{audio_id(text)}.{voice_slug(voice)}.mp3"


def collect_texts() -> list[str]:
    texts: dict[str, None] = {}

    for module_path in sorted(MODULES_DIR.glob("*.json")):
        module = json.loads(module_path.read_text(encoding="utf-8"))

        for sentence in module.get("sentences") or []:
            spanish = normalize_text(sentence.get("spanish", ""))
            if spanish:
                texts[spanish] = None

        if module.get("specialPractice") == "ser-estar-rules":
            for rule in module.get("rules") or []:
                for example in rule.get("examples") or []:
                    prompt = normalize_text(example.get("prompt", ""))
                    answer = normalize_text(
                        f"{example.get('correct', '')} {example.get('continuation', '')}"
                    )
                    if prompt:
                        texts[prompt] = None
                    if answer:
                        texts[answer] = None
                for translation in rule.get("translations") or []:
                    spanish = normalize_text(translation.get("spanish", ""))
                    if spanish:
                        texts[spanish] = None

    return sorted(texts)


def synthesize_with_api_key(text: str, voice: str, api_key: str) -> bytes:
    url = "https://texttospeech.googleapis.com/v1/text:synthesize?" + parse.urlencode(
        {"key": api_key}
    )
    payload = json.dumps(
        {
            "input": {"text": text},
            "voice": {
                "languageCode": "es-ES",
                "name": voice,
            },
            "audioConfig": {"audioEncoding": "MP3"},
        }
    ).encode("utf-8")
    req = request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=60) as response:
            data = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Google TTS request failed for {voice}: {details}") from exc

    return base64.b64decode(data["audioContent"])


def load_user_credentials(client_secret_path: Path):
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError as exc:
        raise SystemExit(
            "Missing OAuth dependencies. Run: python3 -m pip install -r requirements-audio.txt"
        ) from exc

    credentials = None
    if TOKEN_PATH.exists():
        credentials = Credentials.from_authorized_user_file(str(TOKEN_PATH), [GOOGLE_TTS_SCOPE])

    if credentials and credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())

    if not credentials or not credentials.valid:
        flow = InstalledAppFlow.from_client_secrets_file(
            str(client_secret_path),
            scopes=[GOOGLE_TTS_SCOPE],
        )
        credentials = flow.run_local_server(port=0)
        TOKEN_PATH.write_text(credentials.to_json(), encoding="utf-8")

    return credentials


def synthesize_with_google(
    texts: list[str],
    voices: list[str],
    overwrite: bool,
    client_secret_path: Path | None,
    workers: int,
    retries: int,
    retry_delay: float,
) -> dict[str, str | list[str]]:
    api_key = os.environ.get(API_KEY_ENV)
    texttospeech = None
    client = None
    audio_config = None
    client_lock = threading.Lock()

    if client_secret_path:
        api_key = None
        try:
            from google.cloud import texttospeech
        except ImportError as exc:
            raise SystemExit(
                "Missing audio dependencies. Run: python3 -m pip install -r requirements-audio.txt"
            ) from exc
        print(f"Using OAuth client secret: {client_secret_path.relative_to(ROOT)}")
        credentials = load_user_credentials(client_secret_path)
        client = texttospeech.TextToSpeechClient(credentials=credentials)
        audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)
    elif api_key:
        print(f"Using API key from ${API_KEY_ENV}.")
    else:
        try:
            from google.cloud import texttospeech
        except ImportError as exc:
            raise SystemExit(
                "Missing audio dependencies. Run: python3 -m pip install -r requirements-audio.txt"
            ) from exc
        print("Using Google application-default credentials.")
        client = texttospeech.TextToSpeechClient()
        audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, str | list[str]] = {}
    jobs = []

    for index, text in enumerate(texts, start=1):
        entries = [f"audio/generated/{mp3_filename(text, voice)}" for voice in voices]
        manifest[text] = entries[0] if len(entries) == 1 else entries

        for voice, entry in zip(voices, entries):
            mp3_path = ROOT / "public" / entry
            if mp3_path.exists() and not overwrite:
                continue
            jobs.append((index, text, voice, mp3_path))

    total_jobs = len(jobs)
    if not total_jobs:
        return manifest

    workers = max(1, workers)
    print(f"Generating {total_jobs} missing MP3s with {workers} worker(s).")

    def is_retryable_error(exc: Exception) -> bool:
        name = exc.__class__.__name__
        message = str(exc)
        return (
            name in {"ResourceExhausted", "TooManyRequests"}
            or "RESOURCE_EXHAUSTED" in message
            or "Resource has been exhausted" in message
            or "429" in message
        )

    def synthesize_job(job: tuple[int, str, str, Path]) -> tuple[int, str, str, Path]:
        index, text, voice, mp3_path = job
        for attempt in range(retries + 1):
            try:
                if api_key:
                    audio_content = synthesize_with_api_key(text, voice, api_key)
                else:
                    with client_lock:
                        response = client.synthesize_speech(
                            input=texttospeech.SynthesisInput(text=text),
                            voice=texttospeech.VoiceSelectionParams(
                                language_code="es-ES",
                                name=voice,
                            ),
                            audio_config=audio_config,
                        )
                    audio_content = response.audio_content
                break
            except Exception as exc:
                if attempt >= retries or not is_retryable_error(exc):
                    raise
                delay = retry_delay * (attempt + 1)
                print(
                    f"Quota/rate limit for {voice}; retrying in {delay:.0f}s "
                    f"({attempt + 1}/{retries}).",
                    flush=True,
                )
                time.sleep(delay)
        mp3_path.write_bytes(audio_content)
        return index, text, voice, mp3_path

    completed = 0
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(synthesize_job, job): job for job in jobs}
        for future in as_completed(futures):
            completed += 1
            index, text, voice, _ = future.result()
            print(f"[{completed}/{total_jobs}] source {index}/{len(texts)} {voice}: {text}", flush=True)

    return manifest


def archive_unused_audio(manifest: dict[str, str | list[str]], archive_dir: Path) -> None:
    keep = set()
    for entry in manifest.values():
        paths = entry if isinstance(entry, list) else [entry]
        keep.update((ROOT / "public" / path).resolve() for path in paths)

    for mp3_path in OUTPUT_DIR.glob("*.mp3"):
        if mp3_path.resolve() not in keep:
            archive_dir.mkdir(parents=True, exist_ok=True)
            target_path = archive_dir / mp3_path.name
            if target_path.exists():
                target_path = archive_dir / f"{mp3_path.stem}.{audio_id(mp3_path.name)}{mp3_path.suffix}"
            shutil.move(str(mp3_path), target_path)


def main() -> None:
    load_dotenv()

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--voices",
        default=",".join(DEFAULT_VOICES),
        help="Comma-separated Google Cloud TTS voices to generate.",
    )
    parser.add_argument("--overwrite", action="store_true", help="Regenerate existing MP3s.")
    parser.add_argument("--limit", type=int, default=0, help="Generate only the first N texts.")
    parser.add_argument("--workers", type=int, default=4, help="Concurrent synthesis requests.")
    parser.add_argument("--retries", type=int, default=12, help="Retries for quota/rate-limit errors.")
    parser.add_argument("--retry-delay", type=float, default=20, help="Base seconds between quota/rate-limit retries.")
    parser.add_argument("--dry-run", action="store_true", help="Only print the text count.")
    parser.add_argument(
        "--client-secret",
        default="",
        help="OAuth client secret JSON. Defaults to client_secret*.json in the repo root.",
    )
    parser.add_argument(
        "--archive-unused",
        action="store_true",
        help="Move generated MP3s that are not referenced by the new manifest out of public/audio.",
    )
    parser.add_argument(
        "--archive-dir",
        default=str(ARCHIVE_DIR.relative_to(ROOT)),
        help="Directory for archived generated MP3s, relative to the repo root unless absolute.",
    )
    args = parser.parse_args()

    voices = [voice.strip() for voice in args.voices.split(",") if voice.strip()]
    if not voices:
        raise SystemExit("No voices provided.")

    texts = collect_texts()
    if args.limit > 0:
        if args.archive_unused:
            raise SystemExit("--archive-unused cannot be used with --limit.")
        texts = texts[: args.limit]

    print(f"Collected {len(texts)} unique Spanish audio texts.")
    print(f"Using voices: {', '.join(voices)}")
    if args.dry_run:
        return

    client_secret_path = Path(args.client_secret) if args.client_secret else None
    if client_secret_path and not client_secret_path.is_absolute():
        client_secret_path = ROOT / client_secret_path
    if not client_secret_path:
        client_secrets = sorted(ROOT.glob("client_secret*.json"))
        client_secret_path = client_secrets[0] if client_secrets else None

    manifest = synthesize_with_google(
        texts,
        voices,
        args.overwrite,
        client_secret_path,
        args.workers,
        args.retries,
        args.retry_delay,
    )
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    if args.archive_unused:
        archive_dir = Path(args.archive_dir)
        if not archive_dir.is_absolute():
            archive_dir = ROOT / archive_dir
        archive_unused_audio(manifest, archive_dir)
    print(f"Wrote {MANIFEST_PATH.relative_to(ROOT)} with {len(manifest)} entries.")


if __name__ == "__main__":
    main()
