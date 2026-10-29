"""Turns the extracted panel crops into web textures, catalog images and the generated catalog.

Inputs
  assets-src/textures/raw/<id>.png + <id>.json   rectified crops from make_texture.py
  assets-src/textures/upscaled/<id>.png           optional 2x upscale of the same crop
  assets-src/textures/catalog.json                curated product list (names, categories, specs)
  assets-src/gallery/gallery.json + raw crops      gallery, reel and section images

Commands
  python3 -I scripts/assets/build_textures.py pack    # writes upscale atlases to assets-src/textures/atlas/
  python3 -I scripts/assets/build_textures.py unpack  # splits upscaled atlases into upscaled/<id>.png
  python3 -I scripts/assets/build_textures.py build   # writes public/media/{panels,catalog,gallery} + TS data

Tiling rule: when a crop spans (almost) a whole sheet or tile, it is fitted to that module so every
repeat boundary falls on a real joint. Otherwise the crop is mirrored so the pattern continues
without a hard edge. The pattern is never stretched by more than 8%.
"""

import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets-src"
RAW = SRC / "textures" / "raw"
UPSCALED = SRC / "textures" / "upscaled"
ATLAS = SRC / "textures" / "atlas"
PUBLIC = ROOT / "public" / "media"
GUTTER = 24
ATLAS_W = 2048


def pot(n: float, lo: int = 256, hi: int = 2048) -> int:
    v = lo
    while v < n and v < hi:
        v *= 2
    return v


def load_crop(pid: str) -> np.ndarray:
    up = UPSCALED / f"{pid}.png"
    img = cv2.imread(str(up if up.exists() else RAW / f"{pid}.png"), cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f"missing crop for {pid}")
    return img


# ── pack / unpack ────────────────────────────────────────────────────────────────────────────

def pack() -> None:
    """Shelf-packs every raw crop (and gallery crop) into atlases for one upscale call each."""
    ATLAS.mkdir(parents=True, exist_ok=True)
    items = []
    for f in sorted(RAW.glob("*.png")):
        items.append(("tex", f.stem, f))
    for f in sorted((SRC / "gallery" / "raw").glob("*.png")):
        items.append(("gal", f.stem, f))
    imgs = [(k, n, cv2.imread(str(p))) for k, n, p in items]
    imgs.sort(key=lambda t: -t[2].shape[0])
    atlases, layout = [], []
    x = y = shelf = 0
    canvas_items: list = []
    max_h = 1500

    def flush():
        nonlocal canvas_items
        if not canvas_items:
            return
        h = max(yy + im.shape[0] for _, _, im, _, yy in canvas_items) + GUTTER
        canvas = np.full((h, ATLAS_W, 3), 128, np.uint8)
        idx = len(atlases)
        for kind, name, im, xx, yy in canvas_items:
            canvas[yy : yy + im.shape[0], xx : xx + im.shape[1]] = im
            layout.append({"atlas": idx, "kind": kind, "name": name, "x": xx, "y": yy, "w": im.shape[1], "h": im.shape[0]})
        cv2.imwrite(str(ATLAS / f"atlas-{idx}.png"), canvas)
        atlases.append({"file": f"atlas-{idx}.png", "w": ATLAS_W, "h": h})
        canvas_items = []

    for kind, name, im in imgs:
        h, w = im.shape[:2]
        if x + w + GUTTER > ATLAS_W:
            x, y, shelf = 0, y + shelf + GUTTER, 0
        if y + h + GUTTER > max_h:
            flush()
            x = y = shelf = 0
        canvas_items.append((kind, name, im, x + GUTTER, y + GUTTER))
        x += w + GUTTER
        shelf = max(shelf, h)
    flush()
    (ATLAS / "layout.json").write_text(json.dumps({"atlases": atlases, "items": layout}, indent=1))
    print(json.dumps(atlases))


def unpack() -> None:
    meta = json.loads((ATLAS / "layout.json").read_text())
    UPSCALED.mkdir(parents=True, exist_ok=True)
    (SRC / "gallery" / "upscaled").mkdir(parents=True, exist_ok=True)
    for i, a in enumerate(meta["atlases"]):
        up = cv2.imread(str(ATLAS / f"atlas-{i}-up.png"))
        if up is None:
            print(f"skip atlas {i}: no upscaled file")
            continue
        sx = up.shape[1] / a["w"]
        sy = up.shape[0] / a["h"]
        for it in meta["items"]:
            if it["atlas"] != i:
                continue
            x0, y0 = round(it["x"] * sx), round(it["y"] * sy)
            x1, y1 = round((it["x"] + it["w"]) * sx), round((it["y"] + it["h"]) * sy)
            crop = up[y0:y1, x0:x1]
            dest = UPSCALED if it["kind"] == "tex" else SRC / "gallery" / "upscaled"
            cv2.imwrite(str(dest / f"{it['name']}.png"), crop)
    print("unpacked")


# ── build ────────────────────────────────────────────────────────────────────────────────────

def fit_axis(img: np.ndarray, size_m: float, module_m: float, axis: int):
    """Returns (image, repeat_m) along one axis following the tiling rule."""
    if size_m >= module_m * 0.92:
        # Fit to exactly one module (≤8% scale) so the repeat boundary is a real joint.
        scale = module_m / size_m
        if axis == 1:
            img = cv2.resize(img, (max(1, round(img.shape[1] * scale)), img.shape[0]), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
        else:
            img = cv2.resize(img, (img.shape[1], max(1, round(img.shape[0] * scale))), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
        return img, module_m
    flipped = cv2.flip(img, 1 if axis == 1 else 0)
    return (np.hstack([img, flipped]) if axis == 1 else np.vstack([img, flipped])), size_m * 2


def make_texture(crop: np.ndarray, rec: dict) -> tuple[np.ndarray, float, float]:
    """Builds the repeating texture and returns it with its repeat size in metres.

    Tiling modes (rec["tiling"], or chosen automatically):
      module    each sheet/tile shows the real crop, scaled uniformly to cover the module; the
                texture repeats exactly on the joints and nothing is mirrored.
      bookmatch the crop and its mirror image side by side fill one sheet (a common way marble
                sheets are installed); used when the crop covers too little of the sheet width.
      repeat    true scale, fitted or mirrored along each axis; for uniform or periodic surfaces
                (slats, plain colours, granular stone) where mirroring is not noticeable.
    rec["scaleFactor"] records how much the print is enlarged versus reality (1.0 = true scale).
    """
    mw, mh = rec["moduleW"], rec["moduleH"]
    cw, ch = rec["widthM"], rec["heightM"]
    cover_scale = max(mw / cw, mh / ch)
    book_scale = max(mw / 2 / cw, mh / ch)
    mode = rec.get("tiling") or ("module" if cover_scale <= 1.7 else "bookmatch" if book_scale <= 1.9 else "repeat")
    rec["tiling"] = mode
    if mode == "module":
        rec["scaleFactor"] = round(max(cover_scale, 0.0), 2)
        img = module_cover(crop, mw / mh)
        rw, rh = mw, mh
    elif mode == "bookmatch":
        half = module_cover(crop, (mw / 2) / mh)
        img = np.hstack([half, cv2.flip(half, 1)])
        rec["scaleFactor"] = round(book_scale, 2)
        rw, rh = mw, mh
    else:
        img, rw = fit_axis(crop, cw, mw, axis=1)
        img, rh = fit_axis(img, ch, mh, axis=0)
        rec["scaleFactor"] = 1.0
    # Keep about 560 px per metre where the source allows it, within power-of-two limits.
    tw = pot(min(max(img.shape[1], 360 * rw), 560 * rw), 256, 2048)
    th = pot(min(max(img.shape[0], 360 * rh), 560 * rh), 256, 2048)
    tex = cv2.resize(img, (tw, th), interpolation=cv2.INTER_AREA if tw < img.shape[1] else cv2.INTER_CUBIC)
    return tex, rw, rh


def module_cover(crop: np.ndarray, aspect: float) -> np.ndarray:
    """Largest region of the crop with the module's width/height aspect (no stretching)."""
    h, w = crop.shape[:2]
    if w / h > aspect:
        cw = round(h * aspect)
        x0 = (w - cw) // 2
        return crop[:, x0 : x0 + cw]
    ch = round(w / aspect)
    y0 = int((h - ch) * 0.3)
    return crop[y0 : y0 + ch, :]


def render_sheet(tex: np.ndarray, rec: dict, repeat_w: float, repeat_h: float, px_per_m: float = 260) -> np.ndarray:
    """Renders one module (sheet or tile) at true scale from the repeating texture."""
    mw, mh = rec["moduleW"], rec["moduleH"]
    w, h = round(mw * px_per_m), round(mh * px_per_m)
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u = (xs / px_per_m) / repeat_w
    v = (ys / px_per_m) / repeat_h
    mapx = (u % 1.0) * tex.shape[1]
    mapy = (v % 1.0) * tex.shape[0]
    return cv2.remap(tex, mapx, mapy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)


def cover(img: np.ndarray, w: int, h: int, anchor_y: float = 0.35) -> np.ndarray:
    s = max(w / img.shape[1], h / img.shape[0])
    r = cv2.resize(img, (math.ceil(img.shape[1] * s), math.ceil(img.shape[0] * s)), interpolation=cv2.INTER_AREA)
    x0 = (r.shape[1] - w) // 2
    y0 = int((r.shape[0] - h) * anchor_y)
    return r[y0 : y0 + h, x0 : x0 + w]


def ts_value(v) -> str:
    return json.dumps(v, ensure_ascii=False, indent=2)


def build() -> None:
    cat = json.loads((SRC / "textures" / "catalog.json").read_text())
    (PUBLIC / "panels").mkdir(parents=True, exist_ok=True)
    (PUBLIC / "catalog").mkdir(parents=True, exist_ok=True)
    products = []
    for item in cat["products"]:
        pid = item["id"]
        rec = {**json.loads((RAW / f"{pid}.json").read_text()), **item}
        crop = load_crop(pid)
        tex, rw, rh = make_texture(crop, rec)
        cv2.imwrite(str(PUBLIC / "panels" / f"{pid}.webp"), tex, [cv2.IMWRITE_WEBP_QUALITY, 84])
        sheet = render_sheet(tex, rec, rw, rh)
        card = cover(sheet, 600, 750)
        thumb = cover(sheet, 180, 240)
        cv2.imwrite(str(PUBLIC / "catalog" / f"{pid}.webp"), card, [cv2.IMWRITE_WEBP_QUALITY, 82])
        cv2.imwrite(str(PUBLIC / "catalog" / f"{pid}-thumb.webp"), thumb, [cv2.IMWRITE_WEBP_QUALITY, 80])
        products.append(
            {
                "id": pid,
                "name": item["name"],
                "category": item["category"],
                "finish": item["finish"],
                **({"size": item["size"]} if item.get("size") else {}),
                **({"thickness": item["thickness"]} if item.get("thickness") else {}),
                "variants": item.get("variants", []),
                "image": f"media/catalog/{pid}.webp",
                "thumb": f"media/catalog/{pid}-thumb.webp",
                "alt": item["alt"],
                "surface": {
                    "texture": f"media/panels/{pid}.webp",
                    "widthM": round(rw, 4),
                    "heightM": round(rh, 4),
                    "moduleW": rec["moduleW"],
                    "moduleH": rec["moduleH"],
                    **({"stagger": rec["stagger"]} if rec.get("stagger") else {}),
                    "seam": item.get("seam", 0.6),
                    "gloss": rec.get("gloss", 0),
                    **({"exposure": item["exposure"]} if item.get("exposure") else {}),
                },
                "source": {"video": rec["video"], "frame": rec["frame"]},
                "_tiling": rec["tiling"],
                "_scale": rec["scaleFactor"],
            }
        )
        print(f"{pid:42s} tex {tex.shape[1]}x{tex.shape[0]}  repeat {rw:.2f}x{rh:.2f} m  {rec['tiling']} x{rec['scaleFactor']}")

    report = [{"id": p["id"], "tiling": p.pop("_tiling"), "scale": p.pop("_scale"), "source": p["source"]} for p in products]
    (SRC / "textures" / "build-report.json").write_text(json.dumps(report, indent=1) + "\n")
    head = "// Generated by scripts/assets/build_textures.py — do not edit by hand.\n"
    (ROOT / "src" / "content" / "catalog-data.ts").write_text(
        head + "import type { Product } from './products.ts';\n\nexport const catalogProducts: Product[] = " + ts_value(products) + ";\n"
    )
    cat_names = cat["categoryNames"]
    index = {p["id"]: {"name": p["name"], "category": cat_names[p["category"]]} for p in products}
    (ROOT / "server" / "inquiry" / "catalog-index.ts").write_text(
        head + "export const catalogIndex: Record<string, { name: string; category: string }> = " + ts_value(index) + ";\n"
    )
    build_gallery()
    print(f"{len(products)} products")


def build_gallery() -> None:
    gfile = SRC / "gallery" / "gallery.json"
    if not gfile.exists():
        return
    g = json.loads(gfile.read_text())
    out = PUBLIC / "gallery"
    out.mkdir(parents=True, exist_ok=True)
    sizes = {"tall": (720, 1080), "wide": (1280, 700), "sq": (900, 900), "reel": (360, 640), "install": (720, 900)}
    gallery, reels = [], []
    for it in g["items"]:
        name = it["name"]
        up = SRC / "gallery" / "upscaled" / f"{name}.png"
        img = cv2.imread(str(up if up.exists() else SRC / "gallery" / "raw" / f"{name}.png"))
        w, h = sizes[it["kind"]]
        img = cover(img, w, h, 0.5)
        cv2.imwrite(str(out / f"{name}.webp"), img, [cv2.IMWRITE_WEBP_QUALITY, 80])
        src = f"media/gallery/{name}.webp"
        if it["kind"] == "reel":
            reels.append({"href": it["href"], "src": src, "alt": it["alt"], "title": it["title"], "views": it["views"]})
        elif it["kind"] in ("tall", "wide", "sq"):
            gallery.append({"src": src, "alt": it["alt"], "caption": it["caption"], "layout": it["kind"], "width": w, "height": h})
    head = "// Generated by scripts/assets/build_textures.py — do not edit by hand.\n"
    (ROOT / "src" / "content" / "gallery-data.ts").write_text(
        head
        + "import type { GalleryItem, ReelItem } from './gallery.ts';\n\nexport const galleryItems: GalleryItem[] = "
        + ts_value(gallery)
        + ";\n\nexport const reelItems: ReelItem[] = "
        + ts_value(reels)
        + ";\n"
    )


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    {"pack": pack, "unpack": unpack, "build": build}[cmd]()
