"""Turns the extracted panel crops into web textures, catalog images and the generated catalog.

Inputs
  assets-src/textures/raw/<id>.png + <id>.json   rectified crops from make_texture.py
  assets-src/textures/upscaled/<id>.webp          optional 4x upscale of the same crop
  assets-src/textures/catalog.json                curated product list (names, categories, specs)
  assets-src/gallery/gallery.json + raw crops      gallery, reel and section images

Commands
  python3 -I scripts/assets/build_textures.py pack    # writes upscale atlases to assets-src/textures/atlas/
                                                      # (upscale each atlas-N.png to 4K, save as atlas-N-up.png)
  python3 -I scripts/assets/build_textures.py unpack  # splits upscaled atlases into upscaled/<id>.webp
  python3 -I scripts/assets/build_textures.py build   # writes public/media/{panels,catalog,gallery} + TS data

Tiling rule: sheets and tiles with a distinctive pattern (marble, stone, relief) show the photographed
pattern scaled uniformly to fill each module, so every repeat boundary is a real joint. Uniform or
periodic surfaces (wood grain, slats, plain colours) keep true scale and continue by mirroring.
The pattern is never stretched non-uniformly by more than 8%.
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
ATLAS_W = 1024
ATLAS_MAX_H = 1024


def pot(n: float, lo: int = 256, hi: int = 2048) -> int:
    v = lo
    while v < n and v < hi:
        v *= 2
    return v


def load_crop(pid: str) -> np.ndarray:
    up = UPSCALED / f"{pid}.webp"
    img = cv2.imread(str(up if up.exists() else RAW / f"{pid}.png"), cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f"missing crop for {pid}")
    return img


# ── pack / unpack ────────────────────────────────────────────────────────────────────────────

def pack(only: list[str] | None = None) -> None:
    """Shelf-packs the crops that have no upscaled version yet into 1024 px atlases, so a 4K upscale
    of one atlas enlarges every crop on it about 4x. Run again after adding crops: new atlases are
    appended to layout.json and earlier ones are kept. Optional names limit which crops are packed."""
    ATLAS.mkdir(parents=True, exist_ok=True)
    layout_file = ATLAS / "layout.json"
    meta = json.loads(layout_file.read_text()) if layout_file.exists() else {"atlases": [], "items": []}
    items = []
    for f in sorted(RAW.glob("*.png")):
        if not (UPSCALED / f"{f.stem}.webp").exists():
            items.append(("tex", f.stem, f))
    for f in sorted((SRC / "gallery" / "raw").glob("*.png")):
        if not (SRC / "gallery" / "upscaled" / f"{f.stem}.webp").exists():
            items.append(("gal", f.stem, f))
    if only:
        items = [it for it in items if it[1] in only]
    imgs = [(k, n, cv2.imread(str(p))) for k, n, p in items]
    imgs.sort(key=lambda t: -t[2].shape[0])
    first_new = len(meta["atlases"])
    x = y = shelf = 0
    canvas_items: list = []

    def flush():
        nonlocal canvas_items
        if not canvas_items:
            return
        h = max(yy + im.shape[0] for _, _, im, _, yy in canvas_items) + GUTTER
        canvas = np.full((h, ATLAS_W, 3), 128, np.uint8)
        idx = len(meta["atlases"])
        meta["items"] = [it for it in meta["items"] if it["name"] not in {n for _, n, _, _, _ in canvas_items}]
        for kind, name, im, xx, yy in canvas_items:
            canvas[yy : yy + im.shape[0], xx : xx + im.shape[1]] = im
            meta["items"].append({"atlas": idx, "kind": kind, "name": name, "x": xx, "y": yy, "w": im.shape[1], "h": im.shape[0]})
        cv2.imwrite(str(ATLAS / f"atlas-{idx}.png"), canvas)
        meta["atlases"].append({"file": f"atlas-{idx}.png", "w": ATLAS_W, "h": h})
        canvas_items = []

    for kind, name, im in imgs:
        h, w = im.shape[:2]
        if w + 2 * GUTTER > ATLAS_W or h + 2 * GUTTER > ATLAS_MAX_H:
            s = min((ATLAS_W - 2 * GUTTER) / w, (ATLAS_MAX_H - 2 * GUTTER) / h)
            im = cv2.resize(im, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
            h, w = im.shape[:2]
        if x + w + GUTTER > ATLAS_W:
            x, y, shelf = 0, y + shelf + GUTTER, 0
        if y + h + GUTTER > ATLAS_MAX_H:
            flush()
            x = y = shelf = 0
        canvas_items.append((kind, name, im, x + GUTTER, y + GUTTER))
        x += w + GUTTER
        shelf = max(shelf, h)
    flush()
    layout_file.write_text(json.dumps(meta, indent=1))
    print(json.dumps(meta["atlases"][first_new:]))


def unpack() -> None:
    meta = json.loads((ATLAS / "layout.json").read_text())
    UPSCALED.mkdir(parents=True, exist_ok=True)
    (SRC / "gallery" / "upscaled").mkdir(parents=True, exist_ok=True)
    for i, a in enumerate(meta["atlases"]):
        up = cv2.imread(str(ATLAS / a["file"].replace(".png", "-up.png")))
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
            cv2.imwrite(str(dest / f"{it['name']}.webp"), crop, [cv2.IMWRITE_WEBP_QUALITY, 95])
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
      module  each sheet/tile shows the photographed pattern, scaled uniformly to cover the whole
              module; the texture repeats exactly on the real joints and nothing is mirrored, like
              identical printed sheets. Used for marble, stone and relief panels.
      repeat  true scale across the surface, fitted or mirrored; for uniform or periodic surfaces
              (slats, wood grain, plain colours). With rec["grain"] == "vertical" (wood, slats,
              travertine) the crop is fitted to the module height along the grain instead of being
              mirrored, which keeps the spacing across the grain (the scale the eye reads) true.
    rec["scaleFactor"] records how much the pattern is enlarged versus the photographed fragment
    (1.0 = true scale); CATALOG-COVERAGE.md lists it per product.
    """
    mw, mh = rec["moduleW"], rec["moduleH"]
    cw, ch = rec["widthM"], rec["heightM"]
    cover_scale = max(mw / cw, mh / ch)
    mode = rec.get("tiling") or ("module" if cover_scale <= 1.7 else "repeat")
    rec["tiling"] = mode
    if mode == "module":
        rec["scaleFactor"] = round(max(cover_scale, 1.0), 2)
        if cover_scale > 4:
            print(f"warning: {rec['id']} pattern enlarged x{cover_scale:.1f}; consider tiling 'repeat' or a larger reference")
        img = module_cover(crop, mw / mh)
        rw, rh = mw, mh
    else:
        img = even_light(crop, rec.get("evenLight", 0.22))
        img, rw = fit_axis(img, cw, mw, axis=1)
        if rec.get("grain") == "vertical" and ch < mh * 0.92:
            img = cv2.resize(img, (img.shape[1], round(img.shape[0] * mh / ch)), interpolation=cv2.INTER_CUBIC)
            rh = mh
        else:
            img, rh = fit_axis(img, ch, mh, axis=0)
        rec["scaleFactor"] = 1.0
    # Keep about 560 px per metre where the source allows it, within power-of-two limits.
    tw = pot(min(max(img.shape[1], 360 * rw), 560 * rw), 256, 2048)
    th = pot(min(max(img.shape[0], 360 * rh), 560 * rh), 256, 2048)
    tex = cv2.resize(img, (tw, th), interpolation=cv2.INTER_AREA if tw < img.shape[1] else cv2.INTER_CUBIC)
    return tex, rw, rh


def even_light(img: np.ndarray, frac: float = 0.22) -> np.ndarray:
    """Removes the photo's lighting gradient (and, with a small frac, compression blotches on plain
    colours) so a mirrored repeat shows no bright or dark bands."""
    f = img.astype(np.float32) + 1
    lum = f.mean(axis=2)
    sigma = max(3.0, min(img.shape[:2]) * frac)
    low = cv2.GaussianBlur(lum, (0, 0), sigma)
    ratio = np.clip(lum.mean() / low, 0.6, 1.6)[..., None]
    return np.clip(f * ratio - 1, 0, 255).astype(np.uint8)


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
                "source": item["source"],
                "_tiling": rec["tiling"],
                "_scale": rec["scaleFactor"],
            }
        )
        print(f"{pid:42s} tex {tex.shape[1]}x{tex.shape[0]}  repeat {rw:.2f}x{rh:.2f} m  {rec['tiling']} x{rec['scaleFactor']}")

    keep = {p["id"] for p in products}
    for stale in [*(PUBLIC / "panels").glob("*.webp"), *(PUBLIC / "catalog").glob("*.webp")]:
        if stale.stem.removesuffix("-thumb") not in keep:
            stale.unlink()
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
        up = SRC / "gallery" / "upscaled" / f"{name}.webp"
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
    if cmd == "pack":
        pack(sys.argv[2:] or None)
    else:
        {"unpack": unpack, "build": build}[cmd]()
