#!/usr/bin/env python3
"""Gera data/catalog.json a partir do CSV exportado e dos ícones locais.

Não completa região, fonte nem local de fabricação: isso não está no arquivo.
"""

from __future__ import annotations

import csv
import json
import re
import struct
import zlib
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "gaucho-recipes.csv"
ICONS = ROOT / "icons"
OUT = ROOT / "data" / "catalog.json"

PREFIXES = (
    "SPR_Icon_Ingredient_",
    "SPR_Icon_ingredient_",
    "SPR_Icon_Tool_",
    "SPR_Icon_Character_",
    "SPR_Icon_Animals_",
    "SPR_Icon_Animal_",
    "SPR_Icon_Placeable_",
    "SPR_Icon_",
    "SPR_",
)

# Variações óbvias de grafia/plural no próprio nome do arquivo.
TOKEN_SYNONYMS = {
    "leafs": "leaf",
    "leaves": "leaf",
    "nails": "nail",
    "gears": "gear",
    "bricks": "brick",
}
STOP_TOKENS = {"of"}

FOLDER_CATEGORY = {
    "Ingredients": "ingrediente",
    "Tools": "ferramenta",
    "Animals": "animal",
    "General": "geral",
    "Characters": "personagem",
    "Missions": "missão",
}

# Ícones indicados explicitamente. Não vieram de uma coincidência de nome.
ASSIGNED = {
    "Corral HUB": "Ingredients/SPR_Icon_Blueprint.png",
    "Mythical Machete": "Tools/SPR_Icon_Tool_Mystic_Machete.png",
    "Chicken": "Animals/SPR_Icon_Animals_Chicken_Female.png",
    "Sticks": "Ingredients/SPR_Icon_Ingredient_WoodSticks.png",
    "Mythical Axe": "Tools/SPR_Icon_Tool_Mystic_Axe.png",
    "Stone Hammer": "Tools/SPR_Icon_Tool_Stone_Axe.png",
    "Medicinal Herb Orange Calendula": "Ingredients/SPR_Icon_Ingredient_Medicinal_Herb_A.png",
    "Medicinal Herb Red Echinacea": "Ingredients/SPR_Icon_Ingredient_Medicinal_Herb_B.png",
    "Medicinal Herb White Chamomile": "Ingredients/SPR_Icon_Ingredient_Medicinal_Herb_C.png",
    "Boat Upgrade 2": "Missions/SPR_Icon_Boat_LVL2.png",
    "Boat Upgrade 3": "Missions/SPR_Icon_Boat_LVL3.png",
    "Boat Upgrade 4": "Missions/SPR_Icon_Boat_LVL4.png",
    "Sheep": "Animals/SPR_Icon_Animals_Sheep_Female.png",
    "Stone": "Ingredients/SPR_Icon_Ingredient_BigStone.png",
    "Mythical Pickaxe": "Tools/SPR_Icon_Tool_Mystic_Pickaxe.png",
    "Grain Salt": "Ingredients/SPR_Icon_Ingredient_CoarseSalt.png",
    "Cow": "Animals/SPR_Icon_Animals_Cattle_Infant.png",
}

# Sugestões apenas para o editor. Não viram o ícone do item.
HINTS = {
    "Grain Salt": [
        (
            "Ingredients/SPR_Icon_Ingredient_CoarseSalt.png",
            "O arquivo se chama CoarseSalt e a receita diz Grain Salt. Não associado.",
        )
    ],
    "Mythical Axe": [
        (
            "Tools/SPR_Icon_Tool_Mystic_Axe.png",
            "O arquivo se chama Mystic Axe e a receita diz Mythical Axe. Não associado.",
        )
    ],
    "Mythical Pickaxe": [
        (
            "Tools/SPR_Icon_Tool_Mystic_Pickaxe.png",
            "O arquivo se chama Mystic Pickaxe e a receita diz Mythical Pickaxe. Não associado.",
        )
    ],
    "Mythical Machete": [
        (
            "Tools/SPR_Icon_Tool_Mystic_Machete.png",
            "O arquivo se chama Mystic Machete e a receita diz Mythical Machete. Não associado.",
        )
    ],
    "Cow": [
        (
            "Animals/SPR_Icon_Animals_Animals_Cattle.png",
            "O arquivo se chama Cattle e a receita diz Cow. Não associado.",
        ),
        (
            "Animals/SPR_Icon_Animals_Cattle_Infant.png",
            "Há também um ícone de Cattle Infant. Não associado.",
        ),
    ],
    "Sheep": [
        (
            "Animals/SPR_Icon_Animals_Sheep_Female.png",
            "Há ícones separados de ovelha. Nenhum se chama apenas Sheep.",
        ),
        (
            "Animals/SPR_Icon_Animals_Sheep_Male.png",
            "Há ícones separados de ovelha. Nenhum se chama apenas Sheep.",
        ),
        (
            "Animals/SPR_Icon_Animals_Sheep_Infant.png",
            "Há ícones separados de ovelha. Nenhum se chama apenas Sheep.",
        ),
    ],
    "Chicken": [
        (
            "Animals/SPR_Icon_Animals_Chicken_Female.png",
            "Há ícones separados de galinha. Nenhum se chama apenas Chicken.",
        ),
        (
            "Animals/SPR_Icon_Animals_Chicken_Male.png",
            "Há ícones separados de galinha. Nenhum se chama apenas Chicken.",
        ),
        (
            "Animals/SPR_Icon_Animals_Chicken_Infant.png",
            "Há ícones separados de galinha. Nenhum se chama apenas Chicken.",
        ),
    ],
    "Sticks": [
        (
            "Ingredients/SPR_Icon_Ingredient_WoodSticks.png",
            "O arquivo se chama WoodSticks e a receita diz Sticks. Não associado.",
        )
    ],
    "Stone Hammer": [
        (
            "Ingredients/SPR_Icon_Ingredient_Hammer_Head.png",
            "O arquivo se chama Hammer Head e a receita diz Stone Hammer. Não associado.",
        )
    ],
    "Boat Upgrade 2": [
        (
            "Missions/SPR_Icon_Boat_LVL2.png",
            "O arquivo se chama Boat LVL2 e a receita diz Boat Upgrade 2. Não associado.",
        ),
        (
            "Missions/SPR_Icon_Boat_Upgrade.png",
            "Há um ícone Boat Upgrade sem número. Não associado.",
        ),
    ],
    "Boat Upgrade 3": [
        (
            "Missions/SPR_Icon_Boat_LVL3.png",
            "O arquivo se chama Boat LVL3 e a receita diz Boat Upgrade 3. Não associado.",
        ),
        (
            "Missions/SPR_Icon_Boat_Upgrade.png",
            "Há um ícone Boat Upgrade sem número. Não associado.",
        ),
    ],
    "Boat Upgrade 4": [
        (
            "Missions/SPR_Icon_Boat_LVL4.png",
            "O arquivo se chama Boat LVL4 e a receita diz Boat Upgrade 4. Não associado.",
        ),
        (
            "Missions/SPR_Icon_Boat_Upgrade.png",
            "Há um ícone Boat Upgrade sem número. Não associado.",
        ),
    ],
    "Corral HUB": [
        (
            "Missions/SPR_Icon_Placeable_CattleBarn.png",
            "A receita produz Corral HUB. O ícone Cattle Barn não tem o mesmo nome. Não associado.",
        )
    ],
    "Medicinal Herb Red Echinacea": [
        (
            "Ingredients/SPR_Icon_Ingredient_Medicinal_Herb_A.png",
            "Os ícones de erva se chamam Medicinal Herb A, B e C. Não dá para saber qual é qual.",
        ),
        (
            "Ingredients/SPR_Icon_Ingredient_Medicinal_Herb_B.png",
            "Os ícones de erva se chamam Medicinal Herb A, B e C. Não dá para saber qual é qual.",
        ),
        (
            "Ingredients/SPR_Icon_Ingredient_Medicinal_Herb_C.png",
            "Os ícones de erva se chamam Medicinal Herb A, B e C. Não dá para saber qual é qual.",
        ),
    ],
    "Medicinal Herb White Chamomile": [
        (
            "Ingredients/SPR_Icon_Ingredient_Medicinal_Herb_A.png",
            "Os ícones de erva se chamam Medicinal Herb A, B e C. Não dá para saber qual é qual.",
        ),
        (
            "Ingredients/SPR_Icon_Ingredient_Medicinal_Herb_B.png",
            "Os ícones de erva se chamam Medicinal Herb A, B e C. Não dá para saber qual é qual.",
        ),
        (
            "Ingredients/SPR_Icon_Ingredient_Medicinal_Herb_C.png",
            "Os ícones de erva se chamam Medicinal Herb A, B e C. Não dá para saber qual é qual.",
        ),
    ],
    "Medicinal Herb Orange Calendula": [
        (
            "Ingredients/SPR_Icon_Ingredient_Medicinal_Herb_A.png",
            "Os ícones de erva se chamam Medicinal Herb A, B e C. Não dá para saber qual é qual.",
        ),
        (
            "Ingredients/SPR_Icon_Ingredient_Medicinal_Herb_B.png",
            "Os ícones de erva se chamam Medicinal Herb A, B e C. Não dá para saber qual é qual.",
        ),
        (
            "Ingredients/SPR_Icon_Ingredient_Medicinal_Herb_C.png",
            "Os ícones de erva se chamam Medicinal Herb A, B e C. Não dá para saber qual é qual.",
        ),
    ],
}


def slug(value: str) -> str:
    text = value.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def spaced_name(stem: str) -> str:
    text = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", stem)
    text = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", text)
    return text.replace("_", " ").replace("-", " ").strip()


def tokens(value: str, is_file: bool = False) -> tuple[str, ...]:
    text = value
    if is_file:
        stem = Path(value).stem
        for prefix in PREFIXES:
            if stem.startswith(prefix):
                stem = stem[len(prefix) :]
                break
        text = stem
    text = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    text = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", text)
    parts = re.findall(r"[A-Za-z0-9]+", text.lower())
    cleaned = []
    for part in parts:
        if part in STOP_TOKENS:
            continue
        cleaned.append(TOKEN_SYNONYMS.get(part, part))
    return tuple(sorted(cleaned))


def parse_bool(value: str) -> bool:
    return str(value).strip().lower() == "true"


def png_chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path: Path, size: int) -> None:
    raw = bytearray()
    cx = cy = size / 2
    radius = size * 0.36
    for y in range(size):
        raw.append(0)
        for x in range(size):
            r, g, b = (29, 59, 46)
            inside = (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
            if inside:
                r, g, b = (243, 236, 223)
                if y > size * 0.58:
                    r, g, b = (47, 83, 66)
                if abs(y - size * 0.58) <= max(1, size * 0.012):
                    r, g, b = (181, 82, 58)
            raw.extend((r, g, b, 255))
    payload = b"\x89PNG\r\n\x1a\n"
    payload += png_chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    payload += png_chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    payload += png_chunk(b"IEND", b"")
    path.write_bytes(payload)


def load_rows() -> list[dict[str, str]]:
    with CSV_PATH.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def build() -> dict:
    rows = load_rows()
    icon_files = sorted(path.relative_to(ICONS).as_posix() for path in ICONS.rglob("*.png"))
    by_tokens: dict[tuple[str, ...], list[str]] = defaultdict(list)
    for relative in icon_files:
        by_tokens[tokens(relative, True)].append(relative)

    names: list[str] = []
    for row in rows:
        for key in ("produto_final", "ingrediente"):
            if row[key] not in names:
                names.append(row[key])

    items = []
    used_icons = set()
    for name in names:
        key = tokens(name)
        matches = by_tokens.get(key, [])
        if len(matches) > 1:
            raise SystemExit(f"Ícone ambíguo para {name}: {matches}")
        assigned = ASSIGNED.get(name)
        if assigned:
            if not (ICONS / assigned).exists():
                raise SystemExit(f"Ícone indicado inexistente: {assigned}")
            icon = assigned
            icon_match = "confirmada"
        else:
            icon = matches[0] if len(matches) == 1 else None
            icon_match = "segura" if icon else "nenhuma"
        if icon:
            if icon in used_icons:
                raise SystemExit(f"Ícone repetido: {icon}")
            used_icons.add(icon)
            folder = icon.split("/")[0]
            category = FOLDER_CATEGORY.get(folder, "não informado")
        else:
            category = "não informado"
        hints = []
        for relative, reason in HINTS.get(name, []):
            if not (ICONS / relative).exists():
                raise SystemExit(f"Sugestão inexistente: {relative}")
            hints.append(
                {
                    "icon": f"icons/{relative}",
                    "file": Path(relative).name,
                    "reason": reason,
                }
            )
        items.append(
            {
                "id": slug(name),
                "name": name,
                "category": category,
                "icon": f"icons/{icon}" if icon else None,
                "iconMatch": icon_match,
                "iconFile": Path(icon).name if icon else None,
                "hints": hints,
            }
        )

    ids = [item["id"] for item in items]
    if len(ids) != len(set(ids)):
        raise SystemExit("Há ids de item repetidos")
    id_by_name = {item["name"]: item["id"] for item in items}

    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        grouped[row["arquivo_receita"]].append(row)

    recipes = []
    for source_file, group in grouped.items():
        outputs = {(row["produto_final"], row["quantidade_produzida"]) for row in group}
        if len(outputs) != 1:
            raise SystemExit(f"Receita com produtos divergentes: {source_file}")
        product, output_qty = next(iter(outputs))
        ingredients = []
        for row in group:
            ingredients.append(
                {
                    "itemId": id_by_name[row["ingrediente"]],
                    "qty": int(row["quantidade_necessaria"]),
                    "consumed": not parse_bool(row["nao_consumir"]),
                }
            )
        recipes.append(
            {
                "id": slug(Path(source_file).stem),
                "name": group[0]["receita"],
                "sourceFile": source_file,
                "outputId": id_by_name[product],
                "outputQty": int(output_qty),
                "ingredients": ingredients,
            }
        )

    recipe_ids = [recipe["id"] for recipe in recipes]
    if len(recipe_ids) != len(set(recipe_ids)):
        raise SystemExit("Há ids de receita repetidos")

    people = []
    for relative in icon_files:
        if not relative.startswith("Characters/"):
            continue
        stem = Path(relative).stem
        short = stem
        for prefix in PREFIXES:
            if short.startswith(prefix):
                short = short[len(prefix) :]
                break
        name = spaced_name(short)
        people.append(
            {
                "id": slug(name),
                "name": name,
                "fileName": stem,
                "icon": f"icons/{relative}",
                "nameOrigin": "Nome lido do arquivo do ícone, com espaços onde havia camelCase.",
            }
        )
    people.sort(key=lambda person: person["name"].lower())
    if len({person["id"] for person in people}) != len(people):
        raise SystemExit("Há ids de personagem repetidos")

    library = []
    for relative in icon_files:
        folder = relative.split("/")[0]
        stem = Path(relative).stem
        short = stem
        for prefix in PREFIXES:
            if short.startswith(prefix):
                short = short[len(prefix) :]
                break
        library.append(
            {
                "path": f"icons/{relative}",
                "folder": folder,
                "file": Path(relative).name,
                "label": spaced_name(short) or stem,
            }
        )

    matched = sum(1 for item in items if item["icon"])
    catalog = {
        "meta": {
            "game": "Gaucho Origins",
            "sourceCsv": "data/gaucho-recipes.csv",
            "recipeRows": len(rows),
            "recipeCount": len(recipes),
            "itemCount": len(items),
            "matchedIcons": matched,
            "unmatchedIcons": len(items) - matched,
            "peopleCount": len(people),
            "iconCount": len(library),
            "notes": [
                "Produtos, quantidades e ingredientes vêm somente de gaucho-recipes.csv.",
                "Neste arquivo, nao_consumir é False em todas as linhas: todo ingrediente listado é consumido.",
                "Região, com quem conseguir e local de fabricação não estão no arquivo e ficam vazios.",
                "O ícone só é associado quando os nomes, depois de separar camelCase e normalizar plural ou grafia óbvia, ficam iguais e únicos.",
                "A palavra of é ignorada na comparação. leafs e leaves viram leaf; nails, gears e bricks viram nail, gear e brick.",
                "Nomes de personagens vêm do arquivo do ícone, não de um texto do jogo.",
            ],
        },
        "items": items,
        "recipes": recipes,
        "people": people,
        "icons": library,
    }
    return catalog


def main() -> None:
    catalog = build()
    OUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    assets = ROOT / "assets"
    assets.mkdir(exist_ok=True)
    write_png(assets / "icon-192.png", 192)
    write_png(assets / "icon-512.png", 512)
    meta = catalog["meta"]
    print(
        f"itens={meta['itemCount']} receitas={meta['recipeCount']} "
        f"icones_seguros={meta['matchedIcons']} sem_icone={meta['unmatchedIcons']} "
        f"personagens={meta['peopleCount']}"
    )


if __name__ == "__main__":
    main()
