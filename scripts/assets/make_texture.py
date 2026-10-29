"""Extracts a flat, true-proportion texture of one NEW DEC panel from a showroom video frame.

The panel surface is selected with four corners (top-left, top-right, bottom-right, bottom-left,
in frame pixels) and rectified to its real width x height in metres, so the pattern is never
stretched. Showroom lighting fall-off is evened out with a low-frequency correction that keeps
the actual print; thin specular streaks from the ceiling LEDs can be inpainted with --deglare.

Usage:
  python3 -I scripts/assets/make_texture.py --id green-gold-marble \
      --frame path/to/frame.jpg --corners "390,20 570,24 568,680 392,676" \
      --width-m 0.62 --height-m 2.2 [--flatten 0.8] [--deglare 0.0-1.0]

Writes assets-src/textures/raw/<id>.png and <id>.json (source + geometry) and prints the output size.
"""

import argparse
import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "assets-src" / "textures" / "raw"


def parse_corners(text: str) -> np.ndarray:
    pts = [tuple(float(v) for v in p.split(",")) for p in text.split()]
    if len(pts) != 4:
        raise SystemExit("--corners needs four x,y pairs: TL TR BR BL")
    return np.array(pts, dtype=np.float32)


def rectify(img: np.ndarray, quad: np.ndarray, width_m: float, height_m: float) -> np.ndarray:
    # Keep roughly the native pixel density of the source region.
    top = np.linalg.norm(quad[1] - quad[0])
    bottom = np.linalg.norm(quad[2] - quad[3])
    left = np.linalg.norm(quad[3] - quad[0])
    right = np.linalg.norm(quad[2] - quad[1])
    ppm = max((top + bottom) / 2 / width_m, (left + right) / 2 / height_m)
    w = max(16, round(width_m * ppm))
    h = max(16, round(height_m * ppm))
    dst = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype=np.float32)
    m = cv2.getPerspectiveTransform(quad, dst)
    return cv2.warpPerspective(img, m, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)


def flatten_light(img: np.ndarray, strength: float) -> np.ndarray:
    """Divides out the large-scale brightness gradient while preserving the average tone."""
    if strength <= 0:
        return img
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    L = lab[..., 0]
    sigma = max(img.shape[:2]) / 5.0
    low = cv2.GaussianBlur(L, (0, 0), sigma)
    mean = float(L.mean())
    corrected = L / np.maximum(low, 1.0) * mean
    lab[..., 0] = np.clip(L * (1 - strength) + corrected * strength, 0, 255)
    return cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR)


def deglare(img: np.ndarray, amount: float) -> np.ndarray:
    """Inpaints thin, very bright, desaturated streaks (reflections of the ceiling LED lines)."""
    if amount <= 0:
        return img
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
    v, s = hsv[..., 2], hsv[..., 1]
    local = cv2.GaussianBlur(v, (0, 0), 6)
    thr = 28 + (1 - amount) * 40
    mask = ((v - local > thr) & (s < 70)).astype(np.uint8) * 255
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=1)
    if mask.mean() < 0.01:
        return img
    return cv2.inpaint(img, mask, 4, cv2.INPAINT_TELEA)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True)
    ap.add_argument("--frame", required=True)
    ap.add_argument("--corners", required=True)
    ap.add_argument("--width-m", type=float, required=True)
    ap.add_argument("--height-m", type=float, required=True)
    ap.add_argument("--flatten", type=float, default=0.75)
    ap.add_argument("--deglare", type=float, default=0.0)
    ap.add_argument("--note", default="")
    args = ap.parse_args()

    img = cv2.imread(args.frame, cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f"cannot read {args.frame}")
    quad = parse_corners(args.corners)
    out = rectify(img, quad, args.width_m, args.height_m)
    out = deglare(out, args.deglare)
    out = flatten_light(out, args.flatten)

    RAW.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(RAW / f"{args.id}.png"), out)
    record = {
        "id": args.id,
        "frame": str(Path(args.frame).name),
        "video": Path(args.frame).parent.name,
        "corners": quad.round(1).tolist(),
        "widthM": args.width_m,
        "heightM": args.height_m,
        "flatten": args.flatten,
        "deglare": args.deglare,
        "pixels": [int(out.shape[1]), int(out.shape[0])],
        "note": args.note,
    }
    (RAW / f"{args.id}.json").write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(record, ensure_ascii=False))


if __name__ == "__main__":
    main()
