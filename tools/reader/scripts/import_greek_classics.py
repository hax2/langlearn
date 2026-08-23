#!/usr/bin/env python3
"""Import the curated Greek classics shelf from stable Spanish sources."""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

from bs4 import BeautifulSoup


ODYSSEY_URL = "https://www.gutenberg.org/ebooks/58221.txt.utf-8"
CRITO_URL = "https://www.filosofia.org/cla/pla/azc01091.htm"
CAVE_URL = "https://www.filosofia.org/cla/pla/azf08051.htm"
EPICURUS_PAGE = "Carta de Epicuro a Meneceo"
USER_AGENT = "reader-library-import/1.0"


READINGS = [
    {
        "id": "greek-epicuro-carta-meneceo",
        "stem": "greek_epicuro_carta_meneceo",
        "title": "Carta a Meneceo",
        "author": "Epicuro",
        "difficulty": "B2",
        "difficultyNote": "Direct modern prose, with compact philosophical arguments and abstract vocabulary.",
        "genre": "Philosophical letter",
        "tags": ["Grecia", "filosofía", "felicidad", "placer", "muerte"],
        "description": "A concise argument for clear thinking, modest desires, friendship, and a life without fear.",
        "source": "https://es.wikisource.org/wiki/Carta_de_Epicuro_a_Meneceo",
    },
    {
        "id": "greek-platon-caverna",
        "stem": "greek_platon_alegoria_caverna",
        "title": "La alegoría de la caverna",
        "author": "Platón",
        "translator": "Patricio de Azcárate",
        "editionYear": 1872,
        "difficulty": "B2",
        "difficultyNote": "A short dialogue built around a vivid image, followed by abstract interpretation.",
        "genre": "Philosophical dialogue",
        "tags": ["Grecia", "filosofía", "verdad", "educación", "República"],
        "description": "Prisoners mistake shadows for reality until one of them turns toward the light.",
        "source": CAVE_URL,
    },
    {
        "id": "greek-platon-criton",
        "stem": "greek_platon_criton",
        "title": "Critón",
        "author": "Platón",
        "translator": "Patricio de Azcárate",
        "editionYear": 1871,
        "difficulty": "C1",
        "difficultyNote": "Sustained ethical argument in a nineteenth-century translation with historical spelling.",
        "genre": "Philosophical dialogue",
        "tags": ["Grecia", "filosofía", "Sócrates", "justicia", "ley"],
        "description": "On the eve of his execution, Socrates asks whether escaping prison would betray justice itself.",
        "source": CRITO_URL,
    },
    {
        "id": "greek-homero-odisea-canto-ix",
        "stem": "greek_homero_odisea_canto_ix",
        "title": "Odisea: el cíclope",
        "author": "Homero",
        "translator": "Luis Segalá y Estalella",
        "editionYear": 1910,
        "difficulty": "C1",
        "difficultyNote": "Epic narration with historical spelling, mythology, long sentences, and elevated vocabulary.",
        "genre": "Epic poetry",
        "tags": ["Grecia", "aventura", "Ulises", "Polifemo", "Odisea"],
        "description": "Odysseus enters the Cyclops' cave and survives through nerve, deception, and a dangerous boast.",
        "source": ODYSSEY_URL,
    },
    {
        "id": "greek-homero-odisea-canto-xii",
        "stem": "greek_homero_odisea_canto_xii",
        "title": "Odisea: sirenas, Escila y Caribdis",
        "author": "Homero",
        "translator": "Luis Segalá y Estalella",
        "editionYear": 1910,
        "difficulty": "C1",
        "difficultyNote": "Epic narration with dense mythological references and elevated early-twentieth-century prose.",
        "genre": "Epic poetry",
        "tags": ["Grecia", "aventura", "sirenas", "Escila", "Caribdis", "Odisea"],
        "description": "Odysseus sails past the Sirens and between two monsters before his crew makes one fatal choice.",
        "source": ODYSSEY_URL,
    },
]


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request) as response:
        return response.read()


def paragraphs_from_html(url: str) -> list[str]:
    soup = BeautifulSoup(fetch(url), "html.parser")
    return [clean_inline(node.get_text(" ", strip=True)) for node in soup.select("p") if node.get_text(" ", strip=True)]


def epicurus_text() -> str:
    query = urllib.parse.urlencode({
        "action": "parse", "page": EPICURUS_PAGE, "prop": "text",
        "format": "json", "formatversion": 2,
    })
    payload = json.loads(fetch(f"https://es.wikisource.org/w/api.php?{query}"))
    soup = BeautifulSoup(payload["parse"]["text"], "html.parser")
    for node in soup.select("style, script, table, figure, .mw-editsection, .noprint, sup.reference"):
        node.decompose()
    paragraphs = [clean_inline(node.get_text(" ", strip=True)) for node in soup.select("p")]
    paragraphs = [paragraph for paragraph in paragraphs if paragraph and not paragraph.startswith("Edición electrónica")]
    return "\n\n".join(paragraphs)


def cave_text() -> str:
    paragraphs = paragraphs_from_html(CAVE_URL)
    start = next(index for index, text in enumerate(paragraphs) if text.startswith("Ahora represéntate"))
    end = next((index for index, text in enumerate(paragraphs[start:], start) if text.startswith("Facsímil")), len(paragraphs))
    return "\n\n".join(paragraphs[start:end])


def crito_text() -> str:
    paragraphs = paragraphs_from_html(CRITO_URL)
    start = next(index for index, text in enumerate(paragraphs) if text == "Sócrates")
    closing = "Sócrates, nada tengo que decir."
    end = next(index for index, text in enumerate(paragraphs[start:], start) if text == closing)
    return "\n\n".join(paragraphs[start : end + 1])


def odyssey_canto(source: str, canto: str, next_canto: str) -> str:
    match = re.search(rf"(?m)^CANTO {canto}\s*$([\s\S]*?)(?=^CANTO {next_canto}\s*$)", source)
    if not match:
        raise RuntimeError(f"Could not locate Odyssey canto {canto}")
    raw = match.group(1).strip()
    blocks = []
    for block in re.split(r"\n\s*\n", raw):
        block = re.sub(r"\[Ilustración[^\]]*\]", "", block, flags=re.I)
        block = clean_inline(block.replace("\n", " ").replace("_", ""))
        block = re.sub(r"^\d+\s+", "", block)
        if block and not re.fullmatch(r"[A-ZÁÉÍÓÚÜÑ .—-]+", block):
            blocks.append(block)
    return "\n\n".join(blocks)


def clean_inline(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    odyssey = fetch(ODYSSEY_URL).decode("utf-8-sig").replace("\r\n", "\n")
    bodies = {
        "greek-epicuro-carta-meneceo": epicurus_text(),
        "greek-platon-caverna": cave_text(),
        "greek-platon-criton": crito_text(),
        "greek-homero-odisea-canto-ix": odyssey_canto(odyssey, "IX", "X"),
        "greek-homero-odisea-canto-xii": odyssey_canto(odyssey, "XII", "XIII"),
    }
    for reading in READINGS:
        body = bodies[reading["id"]]
        if len(body.split()) < 200:
            raise RuntimeError(f"Imported text is unexpectedly short: {reading['id']}")
        heading = f"{reading['title']}\n{reading['author']}"
        (root / "texts" / f"{reading['stem']}.txt").write_text(f"{heading}\n\n{body}\n", encoding="utf-8")

    library_path = root / "library.json"
    library = json.loads(library_path.read_text(encoding="utf-8"))
    ids = {reading["id"] for reading in READINGS}
    library = [entry for entry in library if entry.get("id") not in ids]
    for reading in READINGS:
        entry = {key: value for key, value in reading.items() if key != "stem"}
        entry.update({
            "collection": "greek-classics",
            "originalLanguage": "Ancient Greek",
            "rights": "Ancient Greek original and historical Spanish edition; source transcription terms apply; project-produced local narration",
            "text": f"texts/{reading['stem']}.txt",
            "cover": f"covers/{reading['stem']}.webp",
        })
        library.append(entry)
    library_path.write_text(json.dumps(library, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
