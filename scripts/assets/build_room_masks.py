"""Builds the visualizer room layers from the master interior render.

Outputs (in public/media/visualizer/):
  room-<w>.webp   the untouched interior at web sizes
  wall-<w>.png    R = wall visibility alpha (255 = paintable wall, 0 = occluder or not wall)
                  G = wall illumination relative to the median wall level (value / 128 = factor)
and src/content/room.json with the wall geometry (image-space corners and physical size in metres).

How the mask is made:
  1. The feature wall rectangle is measured from the ceiling, floor and corner lines.
  2. Pixels are trusted as paint when their chroma matches a smooth model of the wall chroma.
     Paint stays neutral in shadow, so cast shadows and the darker window side remain wall.
  3. Final alpha compares each pixel with local models of chroma and lightness, which keeps
     furniture, lamp and leaf edges tight and anti-aliased (no halo).
  4. Enclosed gaps inside furniture are closed; faint isolated specks are returned to the wall.

Usage: python3 -I scripts/assets/build_room_masks.py [assets-src/visualizer/room-master.jpg]
"""

import json
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "media" / "visualizer"

# Wall rectangle in master pixels (5504 x 3072 render).
WALL = {"left": 889, "right": 4821, "top": 412, "bottom": 2486}
# Coffee-table top: in front of the sofa but inside the wall rectangle (centre, half-axes; master px).
EXCLUDE_ELLIPSES = [((2022, 2416), (500, 72))]
WALL_HEIGHT_M = 2.8  # floor to ceiling; NEW DEC marble sheets are 2.80 m long
WIDTHS = (2560, 1600)
SCALE = 0.5  # processing scale; still above the largest web size


def nconv(values: np.ndarray, weight: np.ndarray, sigma: float) -> np.ndarray:
    """Normalized convolution: blur only trusted pixels and divide by the blurred weights."""
    num = cv2.GaussianBlur(values * weight, (0, 0), sigma)
    den = cv2.GaussianBlur(weight, (0, 0), sigma)
    return num / np.maximum(den, 1e-4)


def build_alpha(img: np.ndarray, rect: np.ndarray):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    gx = cv2.Scharr(L, cv2.CV_32F, 1, 0)
    gy = cv2.Scharr(L, cv2.CV_32F, 0, 1)
    grad = np.sqrt(gx * gx + gy * gy) / 32.0

    trust = rect * (np.abs(A - 131) < 2.5) * (np.abs(B - 132) < 3.5) * (L > 55) * (grad < 1.8)
    for sigma in (40, 16, 8):
        mA, mB = nconv(A, trust, sigma), nconv(B, trust, sigma)
        dC = np.sqrt((A - mA) ** 2 + (B - mB) ** 2)
        trust = rect * (dC < 2.2) * (grad < 1.8) * (L > 55)
        trust = cv2.erode(trust, np.ones((3, 3), np.uint8))

    mA, mB, mL = nconv(A, trust, 6), nconv(B, trust, 6), nconv(L, trust, 6)
    dC = np.sqrt((A - mA) ** 2 + (B - mB) ** 2)
    rel = (L - mL) / np.maximum(mL, 1)
    score = np.maximum.reduce([(dC - 1.8) / 2.0, (np.abs(rel) - 0.08) / 0.10, (55 - L) / 20])
    alpha = (1 - np.clip(score, 0, 1)) * rect

    h, w = alpha.shape
    # Enclosed paint-coloured gaps inside furniture are not wall.
    free = ((alpha >= 0.5) & (rect > 0)).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(free, 4)
    if n > 1:
        main_wall = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        small = stats[labels, cv2.CC_STAT_AREA] < 4000
        alpha[(free > 0) & (labels != main_wall) & small] = 0

    # Faint isolated specks (paint texture, compression) go back to the wall.
    strength = np.maximum(dC / 2.5, np.abs(rel) / 0.12)
    occ = ((alpha < 0.98) & (rect > 0)).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(occ, 8)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < 60:
            m = labels == i
            if strength[m].max() < 1.0:
                alpha[m] = 1.0
    return alpha, trust, L


def main(master_path: str) -> None:
    master = cv2.imread(master_path, cv2.IMREAD_COLOR)
    if master is None:
        raise SystemExit(f"cannot read {master_path}")
    img = cv2.resize(master, None, fx=SCALE, fy=SCALE, interpolation=cv2.INTER_AREA)
    h, w = img.shape[:2]
    wall = {k: round(v * SCALE) for k, v in WALL.items()}

    rect = np.zeros((h, w), np.float32)
    rect[wall["top"] : wall["bottom"], wall["left"] : wall["right"]] = 1.0
    excl = np.zeros((h, w), np.uint8)
    for (cx, cy), (ax, ay) in EXCLUDE_ELLIPSES:
        cv2.ellipse(excl, (round(cx * SCALE), round(cy * SCALE)), (round(ax * SCALE), round(ay * SCALE)), 0, 0, 360, 1, -1)
    rect *= 1 - excl

    alpha, trust, L = build_alpha(img, rect)

    # Illumination factor: observed wall lightness / median wall lightness, inpainted under occluders.
    lum = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)[..., 2].astype(np.float32)
    wall_px = (alpha > 0.97) & (trust > 0)
    ref = float(np.median(lum[wall_px]))
    near = nconv(lum, wall_px.astype(np.float32), 4)
    far = nconv(lum, wall_px.astype(np.float32), 40)
    illum = np.where(alpha > 0.97, lum, np.where(np.isfinite(near) & (near > 1), near, far))
    # Remove paint grain so panels inherit light and soft shadows, not the plaster texture.
    illum = cv2.GaussianBlur(illum, (0, 0), 2.5)
    green = np.clip(illum / ref * 128.0, 0, 255)

    OUT.mkdir(parents=True, exist_ok=True)
    for width in WIDTHS:
        height = round(master.shape[0] * width / master.shape[1])
        room = cv2.resize(master, (width, height), interpolation=cv2.INTER_AREA)
        cv2.imwrite(str(OUT / f"room-{width}.webp"), room, [cv2.IMWRITE_WEBP_QUALITY, 88])
        a_small = cv2.resize(alpha, (width, height), interpolation=cv2.INTER_AREA)
        g_small = cv2.resize(green, (width, height), interpolation=cv2.INTER_AREA)
        packed = np.dstack([np.zeros_like(a_small), g_small, a_small * 255.0])  # stored as BGR
        cv2.imwrite(str(OUT / f"wall-{width}.png"), np.clip(packed + 0.5, 0, 255).astype(np.uint8), [cv2.IMWRITE_PNG_COMPRESSION, 9])

    mh, mw = master.shape[:2]
    width_m = WALL_HEIGHT_M * (WALL["right"] - WALL["left"]) / (WALL["bottom"] - WALL["top"])
    meta = {
        "image": {"width": mw, "height": mh},
        "wall": {
            "widthM": round(width_m, 3),
            "heightM": WALL_HEIGHT_M,
            # image-space corners as fractions: top-left, top-right, bottom-right, bottom-left
            "corners": [
                [round(WALL["left"] / mw, 6), round(WALL["top"] / mh, 6)],
                [round(WALL["right"] / mw, 6), round(WALL["top"] / mh, 6)],
                [round(WALL["right"] / mw, 6), round(WALL["bottom"] / mh, 6)],
                [round(WALL["left"] / mw, 6), round(WALL["bottom"] / mh, 6)],
            ],
        },
        "wallLevel": round(ref / 255.0, 4),
        "sizes": list(WIDTHS),
    }
    (ROOT / "src" / "content" / "room.json").write_text(json.dumps(meta, indent=2) + "\n")

    debug = img.astype(np.float32)
    debug[..., 2] = debug[..., 2] * (1 - alpha * 0.7) + 255 * alpha * 0.7
    debug[..., 1] = debug[..., 1] * (1 - alpha * 0.5)
    cv2.imwrite(str(Path(master_path).with_name("room-mask-debug.jpg")), debug.astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 85])
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "assets-src" / "visualizer" / "room-master.jpg"))
