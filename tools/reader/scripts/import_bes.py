#!/usr/bin/env python3
"""Import the project's curated Biblia en Español Sencillo readings."""

from __future__ import annotations

import io
import json
import urllib.request
import zipfile
from pathlib import Path


ARCHIVE_URL = "https://ebible.org/Scriptures/spabes_readaloud.zip"
ATTRIBUTION = "La Biblia en Español Sencillo © 2018, 2019 AudioBiblia.org / Irma Flores, CC BY 4.0"
SOURCE_URL = "https://ebible.org/Scriptures/details.php?id=spabes"

READINGS = [
    {
        "id": "bes-salmos-escogidos",
        "stem": "bes_salmos_escogidos",
        "title": "Salmos escogidos",
        "files": [("020_PSA", chapter) for chapter in (1, 23, 27, 46, 91, 103, 121, 139)],
        "difficulty": "B1",
        "genre": "Biblical poetry",
        "tags": ["Biblia", "salmos", "oración", "consuelo"],
        "description": "Eight beloved psalms about trust, courage, gratitude, and peace.",
    },
    {
        "id": "bes-proverbios-escogidos",
        "stem": "bes_proverbios_escogidos",
        "title": "Proverbios escogidos",
        "files": [("021_PRO", chapter) for chapter in (1, 3, 8, 15, 16, 31)],
        "difficulty": "B1",
        "genre": "Wisdom literature",
        "tags": ["Biblia", "sabiduría", "consejos", "vida diaria"],
        "description": "Practical wisdom about decisions, speech, work, relationships, and character.",
    },
    {
        "id": "bes-eclesiastes",
        "stem": "bes_eclesiastes",
        "title": "Eclesiastés",
        "files": [("022_ECC", chapter) for chapter in range(1, 13)],
        "difficulty": "B2",
        "genre": "Wisdom literature",
        "tags": ["Biblia", "sabiduría", "tiempo", "sentido de la vida"],
        "description": "A candid meditation on time, work, pleasure, loss, and what makes life meaningful.",
    },
    {
        "id": "bes-rut",
        "stem": "bes_rut",
        "title": "Rut",
        "files": [("009_RUT", chapter) for chapter in range(1, 5)],
        "difficulty": "B1",
        "genre": "Biblical narrative",
        "tags": ["Biblia", "familia", "lealtad", "esperanza"],
        "description": "A warm, compact story of loyalty, migration, generosity, and a new beginning.",
    },
    {
        "id": "bes-jonas",
        "stem": "bes_jonas",
        "title": "Jonás",
        "files": [("033_JON", chapter) for chapter in range(1, 5)],
        "difficulty": "B1",
        "genre": "Biblical narrative",
        "tags": ["Biblia", "viaje", "misericordia", "mar"],
        "description": "A reluctant messenger, a violent storm, a great fish, and an unexpected lesson in mercy.",
    },
    {
        "id": "bes-sermon-del-monte",
        "stem": "bes_sermon_del_monte",
        "title": "El Sermón del Monte",
        "files": [("070_MAT", chapter) for chapter in range(5, 8)],
        "difficulty": "B1",
        "genre": "Gospel teaching",
        "tags": ["Biblia", "Jesús", "enseñanza", "Mateo"],
        "description": "Jesus' best-known teaching on character, prayer, relationships, worry, and wise living.",
    },
]


def chapter_text(archive: zipfile.ZipFile, code: str, chapter: int) -> str:
    width = 3 if code.endswith("PSA") else 2
    name = f"spabes_{code}_{chapter:0{width}}_read.txt"
    lines = archive.read(name).decode("utf-8-sig").splitlines()
    body = "\n".join(line.strip() for line in lines[2:] if line.strip())
    return f"Capítulo {chapter}\n\n{body}"


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    request = urllib.request.Request(ARCHIVE_URL, headers={"User-Agent": "reader-library-import/1.0"})
    with urllib.request.urlopen(request) as response:
        archive_bytes = response.read()
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        for reading in READINGS:
            chapters = [chapter_text(archive, code, chapter) for code, chapter in reading["files"]]
            text = f"{reading['title']}\n\n" + "\n\n".join(chapters) + "\n"
            (root / "texts" / f"{reading['stem']}.txt").write_text(text, encoding="utf-8")

    library_path = root / "library.json"
    library = json.loads(library_path.read_text(encoding="utf-8"))
    imported_ids = {reading["id"] for reading in READINGS}
    library = [entry for entry in library if entry.get("id") not in imported_ids]
    for reading in READINGS:
        library.append({
            "id": reading["id"],
            "title": reading["title"],
            "author": "La Biblia en Español Sencillo",
            "year": 2019,
            "difficulty": reading["difficulty"],
            "difficultyNote": "Modern, intentionally simple Latin-American Spanish; some biblical imagery remains.",
            "genre": reading["genre"],
            "tags": reading["tags"],
            "description": reading["description"],
            "collection": "bible",
            "translation": "La Biblia en Español Sencillo",
            "source": SOURCE_URL,
            "rights": f"{ATTRIBUTION}; chapter headings normalized and verse numbers omitted; project-produced local narration",
            "text": f"texts/{reading['stem']}.txt",
            "cover": f"covers/{reading['stem']}.webp",
        })
    library_path.write_text(json.dumps(library, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
