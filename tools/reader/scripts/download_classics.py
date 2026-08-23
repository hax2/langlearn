#!/usr/bin/env python3
"""Download the public-domain classics used by the reader."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API_URL = "https://es.wikisource.org/w/api.php"
STORIES = (
    {
        "page": "El monte de las ánimas",
        "title": "El monte de las ánimas",
        "author": "Gustavo Adolfo Bécquer",
        "filename": "el_monte_de_las_animas.txt",
        "opening": ("a noche de difuntos", "La noche de difuntos"),
    },
    {
        "page": "El rayo de luna",
        "title": "El rayo de luna",
        "author": "Gustavo Adolfo Bécquer",
        "filename": "el_rayo_de_luna.txt",
        "opening": ("o no sé si esto", "Yo no sé si esto"),
    },
    {
        "page": "La ajorca de oro",
        "title": "La ajorca de oro",
        "author": "Gustavo Adolfo Bécquer",
        "filename": "la_ajorca_de_oro.txt",
        "opening": ("lla era hermosa", "Ella era hermosa"),
    },
    {
        "page": "Los ojos verdes",
        "title": "Los ojos verdes",
        "author": "Gustavo Adolfo Bécquer",
        "filename": "los_ojos_verdes.txt",
        "opening": ("ace mucho tiempo", "Hace mucho tiempo"),
    },
    {
        "page": "El miserere (Bécquer)",
        "title": "El miserere",
        "author": "Gustavo Adolfo Bécquer",
        "filename": "el_miserere.txt",
        "opening": ("ace algunos meses", "Hace algunos meses"),
    },
    {
        "page": "Maese Pérez el organista",
        "title": "Maese Pérez el organista",
        "author": "Gustavo Adolfo Bécquer",
        "filename": "maese_perez_el_organista.txt",
        "opening": ("n Sevilla", "En Sevilla"),
    },
    {
        "page": "El león y el ratón (Samaniego)",
        "title": "El león y el ratón",
        "author": "Félix María Samaniego",
        "filename": "el_leon_y_el_raton.txt",
        "opening": ("staba un ratoncillo", "Estaba un ratoncillo"),
    },
    {
        "page": "El cuervo y el zorro",
        "title": "El cuervo y el zorro",
        "author": "Félix María Samaniego",
        "filename": "el_cuervo_y_el_zorro.txt",
        "opening": ("n la rama de un árbol", "En la rama de un árbol"),
    },
    {
        "page": "La cigarra y la hormiga (Samaniego)",
        "title": "La cigarra y la hormiga",
        "author": "Félix María Samaniego",
        "filename": "la_cigarra_y_la_hormiga.txt",
        "opening": ("antando la Cigarra", "Cantando la Cigarra"),
    },
    {
        "page": "Bebé y el señor don Pomposo",
        "title": "Bebé y el señor don Pomposo",
        "author": "José Martí",
        "filename": "bebe_y_el_senor_don_pomposo.txt",
        "opening": ("ebé es un niño magnífico", "Bebé es un niño magnífico"),
    },
    {
        "page": "Nené traviesa",
        "title": "Nené traviesa",
        "author": "José Martí",
        "filename": "nene_traviesa.txt",
        "opening": ("Quién sabe si hay una niña", "¡Quién sabe si hay una niña"),
    },
    {
        "page": "La muñeca negra",
        "title": "La muñeca negra",
        "author": "José Martí",
        "filename": "la_muneca_negra.txt",
        "opening": ("e puntillas, de puntillas", "De puntillas, de puntillas"),
    },
)

VERIFIED_CORRECTIONS = {
    "maese_perez_el_organista.txt": {
        "ha¬ bía": "había",
        "arcánge¬ les": "arcángeles",
        "al¬ borozo": "alborozo",
    },
    "los_ojos_verdes.txt": {
        "se haban á su cuello": "se anudaban á su cuello",
    },
    "la_ajorca_de_oro.txt": {
        "estatuas délos sepulcros": "estatuas de los sepulcros",
    },
    "el_miserere.txt": {
        "concepit me matev mea": "concepit me mater mea",
    },
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="re-download files that already exist")
    args = parser.parse_args()
    output_dir = Path(__file__).resolve().parents[1] / "texts"
    output_dir.mkdir(exist_ok=True)

    sources = ["# Text sources", ""]
    for story in STORIES:
        path = output_dir / story["filename"]
        if args.refresh or not path.exists():
            html = fetch_rendered_page(story["page"])
            text = extract_story(html, story["title"], story["opening"])
            for old, new in VERIFIED_CORRECTIONS.get(story["filename"], {}).items():
                text = text.replace(old, new)
            path.write_text(
                f"{story['title']}\n{story['author']}\n\n{text}\n",
                encoding="utf-8",
            )
            action = "Wrote"
        else:
            action = "Kept"
        source_url = "https://es.wikisource.org/wiki/" + urllib.parse.quote(
            story["page"].replace(" ", "_")
        )
        sources.append(f"- [{story['title']}]({source_url})")
        print(f"{action} {path.relative_to(output_dir.parent)}")

    sources.extend(
        [
            "",
            "The works are in the public domain. Their Wikisource transcriptions are available",
            "under the Creative Commons Attribution-ShareAlike 4.0 license.",
            "The Wikisource transcriptions preserve the historical spelling of their editions.",
            "",
        ]
    )
    (output_dir / "SOURCES.md").write_text("\n".join(sources), encoding="utf-8")


def fetch_rendered_page(page: str) -> str:
    query = urllib.parse.urlencode(
        {
            "action": "parse",
            "page": page,
            "prop": "text",
            "format": "json",
        }
    )
    request = urllib.request.Request(
        f"{API_URL}?{query}",
        headers={"User-Agent": "SpanishListeningReader/1.0"},
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                payload = json.load(response)
            break
        except urllib.error.HTTPError as error:
            if error.code != 429:
                raise
            if attempt == 3:
                page_path = urllib.parse.quote(page.replace(" ", "_"))
                fallback = urllib.request.Request(
                    f"https://es.wikisource.org/wiki/{page_path}?action=render",
                    headers={"User-Agent": "SpanishListeningReader/1.0"},
                )
                with urllib.request.urlopen(fallback, timeout=60) as response:
                    return response.read().decode("utf-8")
            time.sleep(min(8, 2 ** attempt))
    return payload["parse"]["text"]["*"]


def extract_story(
    html: str, title: str, opening_correction: tuple[str, str]
) -> str:
    converted = subprocess.run(
        [
            "html2text",
            "--ignore-links",
            "--ignore-images",
            "--unicode-snob",
            "--body-width=0",
        ],
        input=html,
        text=True,
        capture_output=True,
        check=True,
    ).stdout

    lines = [clean_markdown(line) for line in converted.splitlines()]
    heading = title.upper()
    starts = [
        index
        for index, line in enumerate(lines)
        if line == heading or line.startswith(f"{heading}.") or line.startswith(f"{heading}—")
    ]
    if starts:
        body_lines = lines[starts[-1] + 1 :]
        while body_lines and (not body_lines[0] or body_lines[0] == "* * *"):
            body_lines.pop(0)
    else:
        old, new = opening_correction
        opening = next(
            (
                index
                for index, line in enumerate(lines)
                if line.lower().startswith((old.lower(), new.lower()))
            ),
            None,
        )
        if opening is None:
            raise RuntimeError(f"Could not find the story opening for {title}")
        body_lines = lines[opening:]

    text = "\n".join(body_lines).strip()
    old, new = opening_correction
    text = re.sub(
        rf"^{re.escape(old)}",
        new,
        text,
        count=1,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def clean_markdown(line: str) -> str:
    line = line.rstrip().replace("**", "").replace("_", "")
    line = line.strip()
    if re.fullmatch(r"\.{10,}\s*\|?", line) or re.fullmatch(r"-+\|-+", line):
        return ""
    return line


if __name__ == "__main__":
    main()
