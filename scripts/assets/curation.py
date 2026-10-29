"""Curated catalog metadata: Armenian names, categories, finishes and only the specs NEW DEC stated.

Run after texture extraction:  python3 -I scripts/assets/curation.py [extraction-records.json ...]
(default: assets-src/textures/extraction-records.json, one record per inspected product with its
status, real size estimate and source moment). Writes assets-src/textures/catalog.json, which
build_textures.py turns into the site catalog.

Spec sources (RESEARCH.md): 7668272239770422548 (2026-07-30) section spec 2.90 x 1.22 m, 3 mm for the
art and natural marbles shown there, 1.20 m x 0.60 m for the stone panels; 7671633679050984722 general
statement 2.80 or 2.90 x 1.22 m, 3 or 8 mm; 7674283683913813266 green-gold sheet 2.8 x 1.22 m;
7689891374333807892 white-violet sheet 2.80 x 1.22 m, 8 mm; 7687641327487438100 white rock 2.80 x 1.20 m.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "assets-src" / "textures" / "raw"

CATEGORY_NAMES = {
    "marble": "Մարմարի տեսքով մեծաչափ թերթեր",
    "exotic": "Էկզոտիկ քարի և օնիքսի տեսքով թերթեր",
    "wood": "Փայտի և տրավերտինի տեսքով վահանակներ",
    "slat": "Ռեյկային և ակոսավոր վահանակներ",
    "stone": "Քարի ռելիեֆով վահանակներ",
    "plain": "Միագույն վահանակներ",
}

SECTION_2026_07 = {"size": "2,90 × 1,22 մ", "thickness": "3 մմ"}
GENERAL = {"size": "2,80 կամ 2,90 × 1,22 մ", "thickness": "3 կամ 8 մմ", "variants": ["3 մմ", "8 մմ"]}
STONE_TILE = {"size": "0,60 × 1,20 մ"}

# id: (name, category, finish, specs)
CURATION: dict[str, tuple[str, str, str, dict]] = {
    # Large marble-look sheets
    "green-gold-marble-sheet": ("Զմրուխտականաչ մարմար՝ ոսկեգույն երակներով", "marble", "Փայլուն", {"size": "2,80 × 1,22 մ"}),
    "navy-violet-gold-vein-marble-sheet": ("Մուգ կապույտ մարմար՝ ոսկեգույն երակներով", "marble", "Փայլուն", GENERAL),
    "black-marble-white-river-sheet": ("Սև մարմար՝ լայն սպիտակ երակով", "marble", "Փայլուն", GENERAL),
    "white-violet-breccia-marble-sheet": ("Սպիտակ մարմար՝ մանուշակագույն երակներով", "marble", "Փայլուն", {"size": "2,80 × 1,22 մ", "thickness": "8 մմ"}),
    "white-statuario-sheet": ("Ձյունաճերմակ մարմար՝ մոխրագույն երանգներով", "marble", "Փայլուն", {}),
    "black-aubergine-web-marble-sheet": ("Սև մարմար՝ սպիտակ ցանցաձև երակներով", "marble", "Փայլուն", {}),
    "golden-brown-marble-wall": ("Ոսկեշագանակագույն մարմար՝ նուրբ երակներով", "marble", "Փայլուն", {}),
    "plum-black-gold-art-marble": ("Սալորագույն-սև մարմար՝ ոսկեգույն եզրերով", "marble", "Փայլուն", SECTION_2026_07),
    "white-lavender-gold-art-marble": ("Սպիտակ-յասամանագույն մարմար՝ ոսկեգույն եզրագծերով", "marble", "Փայլուն", SECTION_2026_07),
    "cream-copper-plum-art-marble": ("Կրեմագույն մարմար՝ պղնձագույն երակներով", "marble", "Փայլուն", SECTION_2026_07),
    "black-gold-swirl-art-marble": ("Սև մարմար՝ ոսկեգույն հոսող նախշով", "marble", "Փայլուն", SECTION_2026_07),
    "white-yellow-gold-net-art-marble": ("Սպիտակ մարմար՝ վառ ոսկեգույն երակներով", "marble", "Փայլուն", SECTION_2026_07),
    "mauve-black-gold-art-marble": ("Մուգ յասամանագույն մարմար՝ ոսկեգույն երակներով", "marble", "Փայլուն", SECTION_2026_07),
    "light-grey-cloud-marble": ("Բաց մոխրագույն մարմար՝ ամպանման երակներով", "marble", "Կիսափայլ", SECTION_2026_07),
    "greige-taupe-vein-marble": ("Մոխրաբեժ մարմար՝ շերտավոր երակներով", "marble", "Փայլուն", SECTION_2026_07),
    "charcoal-white-vein-marble": ("Մուգ մոխրագույն մարմար՝ սպիտակ երակներով", "marble", "Փայլուն", SECTION_2026_07),
    "white-bold-black-vein-marble": ("Սպիտակ մարմար՝ սև երակներով", "marble", "Փայլուն", SECTION_2026_07),
    "white-soft-grey-vein-marble": ("Սպիտակ մարմար՝ նուրբ մոխրագույն երակներով", "marble", "Փայլուն", SECTION_2026_07),
    "warm-sand-stone-sheet": ("Ավազագույն քար՝ մեղմ երակներով", "marble", "Փայլուն", SECTION_2026_07),
    # Exotic stone and onyx looks
    "lavender-cobalt-quartzite-sheet": ("Յասամանագույն քվարցիտ՝ կոբալտե բյուրեղներով", "exotic", "Փայլուն", {}),
    "beige-petrified-wood-sheet": ("Բեժ քարացած փայտ՝ սև երակներով", "exotic", "Փայլուն", {}),
    "lilac-quartzite-burgundy-sheet": ("Յասամանագույն քվարցիտ՝ բորդո շերտերով", "exotic", "Փայլուն", {}),
    "turquoise-copper-stone-sheet": ("Փիրուզագույն քար՝ պղնձագույն բծերով", "exotic", "Փայլուն", {}),
    "violet-sodalite-sheet": ("Մանուշակագույն սոդալիտ", "exotic", "Փայլուն", {}),
    "brown-fossil-agate-sheet": ("Շագանակագույն բրածո քար", "exotic", "Փայլուն", {}),
    "red-petrified-wood-sheet": ("Կարմրաշագանակագույն քարացած փայտ", "exotic", "Փայլուն", {}),
    "cream-green-gold-onyx-sheet": ("Կրեմագույն օնիքս՝ կանաչ և ոսկեգույն երակներով", "exotic", "Փայլուն", {}),
    # Stone relief
    "white-rock-relief-large-sheet": ("Սպիտակ ժայռաքար, մեծ թերթ", "stone", "Ռելիեֆ", {"size": "2,80 × 1,20 մ"}),
    "white-rockface-stone-panel": ("Սպիտակ ժայռաքար", "stone", "Ռելիեֆ", STONE_TILE),
    "taupe-ribbed-stone-panel": ("Ակոսավոր մոխրաշագանակագույն քար", "stone", "Ռելիեֆ", STONE_TILE),
    "grey-slate-rockface-panel": ("Մոխրագույն թերթաքար", "stone", "Ռելիեֆ", STONE_TILE),
    "warm-grey-soft-rock-panel": ("Տաք մոխրագույն քար", "stone", "Ռելիեֆ", STONE_TILE),
    # Slat and fluted panels (MDF-based wooden slat panel per 7696163499633937684)
    "smoked-walnut-acoustic-slat": ("Ռեյկային՝ մուգ ընկուզենի", "slat", "Մատ", {}),
    "light-grey-acoustic-slat": ("Ռեյկային՝ բաց մոխրագույն", "slat", "Մատ", {}),
    "warm-walnut-acoustic-slat": ("Ռեյկային՝ տաք ընկուզենի", "slat", "Մատ", {}),
    "light-oak-acoustic-slat": ("Ռեյկային՝ բաց կաղնի", "slat", "Մատ", {}),
    "dark-espresso-acoustic-slat": ("Ռեյկային՝ մուգ սուրճագույն", "slat", "Մատ", {}),
    "taupe-slat-panel": ("Ռեյկային՝ մոխրաշագանակագույն", "slat", "Մատ", {}),
    "rust-teak-slat-panel": ("Ռեյկային՝ ժանգագույն թիք", "slat", "Կիսափայլ", {}),
    "white-wide-fluted-panel": ("Ակոսավոր՝ սպիտակ, լայն ակոսներով", "slat", "Կիսափայլ", {}),
    "graphite-glossy-fluted-panel": ("Ակոսավոր՝ գրաֆիտ", "slat", "Փայլուն", {}),
    "silver-grey-glossy-slat-panel": ("Ռեյկային՝ արծաթամոխրագույն", "slat", "Կիսափայլ", {}),
    "dark-brown-fluted-panel": ("Ակոսավոր՝ մուգ շագանակագույն", "slat", "Մատ", {}),
    # Wood-look and travertine sheets
    "honey-oak-wood-sheet": ("Մեղրագույն կաղնի", "wood", "Մատ", {}),
    "copper-walnut-wood-sheet": ("Պղնձագույն ընկուզենի", "wood", "Մատ", {}),
    "greige-oak-wood-sheet": ("Մոխրաբեժ կաղնի", "wood", "Մատ", {}),
    "grey-linear-grain-sheet": ("Մոխրագույն՝ գծային հյուսվածքով", "wood", "Մատ", {}),
    "golden-teak-wood-sheet": ("Ոսկեգույն թիք", "wood", "Կիսափայլ", {}),
    "natural-oak-wood-sheet": ("Բնական բաց կաղնի", "wood", "Մատ", {}),
    "light-travertine-look-sheet": ("Բաց կրեմագույն տրավերտին", "wood", "Մատ", {}),
    # Plain colours
    "light-grey-plain-sheet": ("Բաց մոխրագույն", "plain", "Մատ", {}),
    "mocha-taupe-plain-sheet": ("Մոկա", "plain", "Մատ", {}),
    "sand-camel-plain-sheet": ("Ավազագույն", "plain", "Մատ", {}),
    "dark-taupe-embossed-sheet": ("Մուգ մոխրաշագանակագույն՝ դաջված հյուսվածքով", "plain", "Մատ", {}),
}

# Seen in NEW DEC's videos but deliberately left out of the catalog and visualizer.
EXCLUDED = {
    "bronze-mirror-sheet": ("Բրոնզագույն հայելային վահանակ", "Mirror finish: its look is the reflection of the room, which a flat texture cannot show honestly."),
    "silver-metallic-sheet": ("Արծաթագույն մետաղական վահանակ", "Mirror/metallic finish: its look is the reflection of the room, which a flat texture cannot show honestly."),
    "fluted-panel-colour-range": ("Ակոսավոր վահանակներ՝ գունային տեսականի", "A colour range shown as a group, not individual products; individual colours are not identifiable."),
}

# Module (sheet or tile) used for joints in the visualizer. Sheets: 1.22 m wide; wood, plain and slat
# module widths are not stated by NEW DEC and use the standard sheet width (noted in CATALOG-COVERAGE.md).
MODULES = {
    "marble": {"moduleW": 1.22, "moduleH": 2.8, "seam": 0.6, "tiling": "module"},
    "exotic": {"moduleW": 1.22, "moduleH": 2.8, "seam": 0.6, "tiling": "module"},
    "wood": {"moduleW": 1.22, "moduleH": 2.8, "seam": 0.35, "tiling": "repeat", "grain": "vertical"},
    "plain": {"moduleW": 1.22, "moduleH": 2.8, "seam": 0.35, "tiling": "repeat", "evenLight": 0.07},
    "slat": {"moduleW": 0.6, "moduleH": 2.8, "seam": 0.0, "tiling": "repeat", "grain": "vertical"},
    "stone": {"moduleW": 0.6, "moduleH": 1.2, "seam": 0.25, "tiling": "module", "evenLight": 0.3},
}
# Per-product tiling where the category default does not suit the reference.
TILING_OVERRIDE: dict[str, str] = {}

# A reference that would have to be enlarged more than this to fill one sheet/tile is too partial to
# show the panel faithfully, and is listed as a gap instead.
MAX_ENLARGE = 5.0


GLOSS = {"Փայլուն": 0.55, "Կիսափայլ": 0.25, "Մատ": 0.06, "Ռելիեֆ": 0.0}

ALT_PREFIX = {
    "marble": "Մարմարի տեսքով թերթ",
    "exotic": "Քարի տեսքով թերթ",
    "wood": "Վահանակ",
    "slat": "Ռեյկային վահանակ",
    "stone": "Քարի ռելիեֆով վահանակ",
    "plain": "Միագույն վահանակ",
}


def source_of(r: dict) -> dict:
    """Normalises an extraction record's source to the TikTok video id and the moment used."""
    src = r.get("source") or {}
    video = re.search(r"\d{19}", str(src.get("video", ""))).group(0)
    frame = str(src.get("frame", ""))
    t = re.search(r"t\s*[=≈]\s*(\d+(?:\.\d+)?)\s*s", frame) or re.search(r"\bt(\d+(?:\.\d+)?)", frame)
    if t:
        time = f"{float(t.group(1)):.1f} s"
    else:
        n = re.match(r"\s*(\d{3})", frame)
        time = f"{int(n.group(1)) - 1}–{int(n.group(1))} s" if n else frame[:40]
    return {"video": video, "time": time}


def main(paths: list[str]) -> None:
    results = {}
    for p in paths:
        for item in json.loads(Path(p).read_text()):
            results[item["id"]] = item
    products, gaps = [], []
    for pid, (name, cat, finish, spec) in CURATION.items():
        r = results.get(pid)
        if not r or r.get("status") != "ok" or not (RAW / f"{pid}.png").exists():
            gaps.append({"id": pid, "name": name, "reason": (r or {}).get("gap_reason") or "no usable reference crop"})
            continue
        tiling = TILING_OVERRIDE.get(pid, MODULES[cat].get("tiling"))
        mw, mh = (1.2, 2.8) if pid == "white-rock-relief-large-sheet" else (MODULES[cat]["moduleW"], MODULES[cat]["moduleH"])
        enlarge = max(mw / r["widthM"], mh / r["heightM"])
        if tiling == "module" and enlarge > MAX_ENLARGE:
            gaps.append({
                "id": pid,
                "name": name,
                "reason": f"The usable view covers only about {r['widthM']:.2f} × {r['heightM']:.2f} m; filling a "
                f"{mw:.2f} × {mh:.2f} m module would enlarge the pattern about {enlarge:.0f}x.",
            })
            continue
        module = dict(MODULES[cat])
        if pid in TILING_OVERRIDE:
            module["tiling"] = TILING_OVERRIDE[pid]
        if pid == "white-rock-relief-large-sheet":
            module.update({"moduleW": 1.2, "moduleH": 2.8})
        item = {
            "id": pid,
            "name": name,
            "category": cat,
            "finish": finish,
            "alt": f"{ALT_PREFIX[cat]}՝ {name[0].lower() + name[1:]}, NEW DEC",
            "gloss": GLOSS[finish],
            "source": source_of(r),
            "scaleBasis": r.get("scale_basis", ""),
            **module,
            **{k: v for k, v in spec.items()},
        }
        if r.get("stagger"):
            item["stagger"] = r["stagger"] if cat == "stone" else 0
        products.append(item)
    for pid, r in results.items():
        if pid not in CURATION and pid not in EXCLUDED and r.get("status") == "gap":
            gaps.append({"id": pid, "name": r.get("name_hy", pid), "reason": r.get("gap_reason") or "no usable reference crop"})
    excluded = [{"id": k, "name": n, "reason": why} for k, (n, why) in EXCLUDED.items()]
    out = {"categoryNames": CATEGORY_NAMES, "products": products, "gaps": gaps, "excluded": excluded}
    (ROOT / "assets-src" / "textures" / "catalog.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    print(f"{len(products)} products, {len(gaps)} gaps")
    for g in gaps:
        print("  gap:", g["id"], "—", g["reason"][:120])


if __name__ == "__main__":
    main(sys.argv[1:] or [str(ROOT / "assets-src" / "textures" / "extraction-records.json")])
