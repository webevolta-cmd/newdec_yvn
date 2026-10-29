"""Remove thin specular streaks (ceiling-light reflections) from a raw texture.

  python3 -I scripts/assets/remove_streaks.py <id> "x1,y1,x2,y2,width" [...]

Segments are in raw-texture pixels; the band around each segment is rebuilt from its surroundings
(OpenCV Telea inpainting) and given back the local grain so it does not read as a smooth smear.
The segments are recorded in the texture's JSON for reproducibility.
"""

import json
import sys
from pathlib import Path

import cv2
import numpy as np

RAW = Path(__file__).resolve().parents[2] / "assets-src" / "textures" / "raw"


def main(pid: str, segments: list[str]) -> None:
    png, meta_path = RAW / f"{pid}.png", RAW / f"{pid}.json"
    img = cv2.imread(str(png), cv2.IMREAD_COLOR)
    meta = json.loads(meta_path.read_text())
    band = np.zeros(img.shape[:2], np.uint8)
    segs = []
    for s in segments:
        x1, y1, x2, y2, w = (float(v) for v in s.split(","))
        cv2.line(band, (round(x1), round(y1)), (round(x2), round(y2)), 255, max(1, round(w)), cv2.LINE_AA)
        segs.append([x1, y1, x2, y2, w])
    mask = cv2.dilate(band, np.ones((3, 3), np.uint8))
    out = cv2.inpaint(img, mask, 7, cv2.INPAINT_TELEA).astype(np.float32)
    # Re-grain: borrow high-frequency detail from a shifted copy of the image (outside the band).
    detail = img.astype(np.float32) - cv2.GaussianBlur(img, (0, 0), 2).astype(np.float32)
    shift = max(6, int(max(s[4] for s in segs) * 1.6))
    donor = np.roll(detail, (shift, shift), axis=(0, 1))
    soft = cv2.GaussianBlur(mask, (0, 0), 1.5).astype(np.float32)[..., None] / 255
    out = np.clip(out + donor * soft, 0, 255).astype(np.uint8)
    cv2.imwrite(str(png), out)
    meta["streaks"] = segs
    meta_path.write_text(json.dumps(meta, indent=2) + "\n")
    print(pid, "inpainted", int((mask > 0).sum()), "px")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
