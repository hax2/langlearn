# Spanish Listening Reader

Static GitHub Pages app for reading public-domain Spanish literature, with synced narration where a project-owned recording is available. Click a word to look up an English meaning, or choose a side-by-side/stacked English translation from the reader settings.

The catalog groups readings by editorial CEFR estimate (B1–C1) and supports accent-insensitive search, format filters, and sorting by level, title, author, or length. Catalog preferences and each recording's playback position are saved in the browser.

The difficulty labels are reading guidance, not formal CEFR certifications. Original spelling is preserved, so short historical verse can still be rated B1.

## Use locally

Open `index.html` in a browser, or serve the folder with any static server.

## Publish on GitHub Pages

Push these files to a GitHub repository, then enable Pages from the repository root in **Settings -> Pages**.

## Curating the library

`library.json` is the hand-curated source of truth. Every entry needs a stable ID, an editorial difficulty note, source and rights metadata, and either a text file or an audio file with a timed transcript. Run this after editing it:

```sh
python3 scripts/build_library.py
python3 scripts/build_library.py --check
```

The validator checks required metadata and referenced files, then derives word counts and reading/listening times. It intentionally does not auto-publish arbitrary media dropped into the repository.

For a narrated reading, include both fields:

```text
"audio": "my-audio.m4a",
"transcript": "my-audio.json"
```

Text-only entries use `"text": "texts/my-story.txt"`.

The catalog uses local cover artwork in `covers/`. Keep images at a 2:3 aspect
ratio; WebP is preferred for new artwork. If a cover is missing, the reader
shows a simple text fallback rather than a broken image.

Update the shared vocabulary file after adding transcripts:

```sh
python3 scripts/build_glossary.py
```

This scans transcript JSON files, merges new unique words into `glossary/shared.json`, and writes words that still need English meanings to `glossary/missing.json`. Fill in meanings in `glossary/shared.json`; the reader uses that file for instant word popups.

## Pretranslate the catalogue locally

With Ollama running and `translategemma:4b` installed, generate resumable English
translations for every reader paragraph:

```sh
ollama pull translategemma:4b
python3 -u scripts/translate_catalog_local.py
```

Completed files are saved under `translations/`, and `library.json` is updated
only after each selected book is complete. The reader serves these files in its
side-by-side and stacked bilingual views, falling back to live translation only
when a saved paragraph is missing or no longer matches its Spanish source.

Preview the work or translate one book with:

```sh
python3 scripts/translate_catalog_local.py --dry-run
python3 -u scripts/translate_catalog_local.py --track samaniego-leon-raton
```

## Anki export

Words you tap are saved in the browser. Use **Download Anki cards** in the reader to export a tab-separated file with these fields:

```text
Spanish word    English meaning    Context sentence    Reading title
```

## Transcribe with your NVIDIA GPU

Install the transcription environment:

```sh
./scripts/setup_transcriber.sh
```

Create a synced transcript from your normal terminal, where the NVIDIA driver is available:

```sh
./scripts/transcribe_gpu.sh "Vanguardia_revolucionaria_frente_a_política_sindical.m4a" --model medium --vtt
python scripts/build_library.py
```

The setup installs `faster-whisper` plus CUDA 12 cuBLAS/cuDNN wheels. Use `transcribe_gpu.sh` instead of calling `transcribe.py` directly because the wrapper exposes those CUDA libraries through `LD_LIBRARY_PATH`.

The script uses Spanish language mode and word timestamps. It defaults to CUDA with `float16`, which is the right path for an RTX GPU. If VRAM is tight, use:

```sh
./scripts/transcribe_gpu.sh audio.m4a --model small --compute-type int8_float16
```

Pass several audio files in one command to load Whisper only once. This is the
required final alignment step after local or Gemini TTS; source-duration timing
is only an assembly fallback and is not accurate enough for highlighting:

```sh
./scripts/transcribe_gpu.sh first.m4a second.m4a third.m4a --model medium
```

## Generate narration with Gemini TTS

Put `GEMINI_API_KEY` in the local `.env` file, then narrate one or more UTF-8
text files with the mature `Charon` voice:

```sh
python3 scripts/gemini_tts.py texts/el_monte_de_las_animas.txt
```

The script uses Gemini's asynchronous Batch API at half the standard API price.
It writes a compressed `.m4a` file and a source-text-based timed JSON transcript
to the repository root. API responses are resumably cached in the ignored
`.tts-cache/` directory. Pass `--standard` only when immediate synchronous
generation is worth the higher price. `.env` is ignored and must never be
committed.

For large collections, submit jobs without polling:

```sh
python3 scripts/gemini_tts.py texts/*.txt --max-chars 600 --submit-only
```

Run the same command later without `--submit-only` to collect completed jobs and
assemble the audio. Keep each submission wave below 100 uncached chunks, which
is the Batch API concurrent-job limit.

## Generate narration locally with Qwen3-TTS

On an NVIDIA machine, install the separate local narration environment without
disturbing the transcription environment:

```sh
./scripts/setup_local_tts.sh
```

Preview the work queue, then run it:

```sh
.tts-venv/bin/python scripts/local_tts.py plan
HF_HOME=.tts-cache/huggingface .tts-venv/bin/python scripts/local_tts.py run
```

The default is the official Qwen3-TTS 1.7B Base voice-cloning model in BF16.
It clones a short clean excerpt from the existing project narrator and processes
small resumable batches on the GPU. After synthesis, the command loads
faster-whisper once for the entire batch and creates real word timestamps. It
will not publish any catalog entries if that alignment step is missing or fails.
Completed chunks are content-hashed and
cached under `.tts-cache/local`, so an interrupted run resumes instead of
starting over. Use `status` to inspect progress without loading the model:

```sh
.tts-venv/bin/python scripts/local_tts.py status
```

To test or regenerate one catalog item, pass its stable ID:

```sh
HF_HOME=.tts-cache/huggingface .tts-venv/bin/python scripts/local_tts.py run \
  --only samaniego-leon-raton
```

If the 1.7B model does not fit a smaller GPU, add `--model-size 0.6B`.

The included public-domain Bécquer, Samaniego, and Martí texts can be downloaded from Wikisource with:

```sh
python3 scripts/download_classics.py
```

Existing files are preserved by default. Use `--refresh` to replace them with the current Wikisource transcriptions. Attribution links and the transcription license are recorded in `texts/SOURCES.md` and in each catalog entry.

If `nvidia-smi` cannot see the GPU, fix the NVIDIA driver or CUDA runtime first, or run with `--device cpu --compute-type int8`.

## Transcript formats

For accurate highlighting, upload a timed transcript next to the audio.

Supported JSON word format:

```json
[
  { "word": "Hola", "start": 0.12, "end": 0.42, "translation": "Hello" },
  { "word": "mundo", "start": 0.43, "end": 0.88, "translation": "world" }
]
```

Whisper-style JSON with `segments[].words[]` is also supported.

WebVTT and SRT are supported too. If a cue contains a full sentence, the app spreads that cue's time across the words in the sentence. For word-accurate highlighting, export word-level timings from your transcription tool.

When you only have plain text, paste it into the sidebar. The app will estimate timings across the audio duration, which is useful for reading but not exact.
