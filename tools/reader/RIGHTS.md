# Project media

## Texts

The added reading texts came from Spanish Wikisource. Per-work links are stored in `library.json` and listed in `texts/SOURCES.md`. Historical spelling is preserved unless a correction can be checked against the source edition.

## Audio

The library's recordings were made by the repository owner. New narration is generated locally from the included source texts and paired with timed transcripts by the project pipeline.

## Covers

Catalog entries use project cover artwork stored in `covers/`.

## Adding a work

Every entry should include a stable ID, author, source note, editorial difficulty assessment, and a local text or narration. `python3 scripts/build_library.py --check` enforces the required catalog fields and file references.
