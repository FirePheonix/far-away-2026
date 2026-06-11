"""
Run this once before building to generate platform icons:
    python generate_icons.py

Produces:
    assets/icon.ico   (Windows)
    assets/icon.icns  (macOS – requires macOS or Pillow plugin)
    assets/icon.png   (source)
"""

from PIL import Image, ImageDraw
import os

ACCENT = "#1BB9CE"
BG     = "#0E0F0F"


def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d   = ImageDraw.Draw(img)
    s   = size

    # Dark rounded background
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BG)

    # Mic body
    pad = s * 0.22
    d.rounded_rectangle(
        [pad, s * 0.08, s - pad, s * 0.58],
        radius=int(s * 0.18),
        fill=ACCENT,
    )

    # Stand arc
    d.arc(
        [s * 0.14, s * 0.38, s * 0.86, s * 0.74],
        start=0, end=180,
        fill=ACCENT,
        width=max(2, int(s * 0.07)),
    )

    # Stem
    cx = s // 2
    stem_w = max(2, int(s * 0.07))
    d.rectangle([cx - stem_w, s * 0.72, cx + stem_w, s * 0.86], fill=ACCENT)
    base_h = max(2, int(s * 0.07))
    d.rectangle([s * 0.28, s * 0.86, s * 0.72, s * 0.86 + base_h], fill=ACCENT)

    return img


def main():
    os.makedirs("assets", exist_ok=True)

    # PNG source
    src = draw_icon(512)
    src.save("assets/icon.png")
    print("OK assets/icon.png")

    # ICO (Windows) – multiple sizes
    sizes = [16, 32, 48, 64, 128, 256]
    imgs  = [draw_icon(s) for s in sizes]
    imgs[0].save(
        "assets/icon.ico",
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=imgs[1:],
    )
    print("OK assets/icon.ico")

    # ICNS (macOS) – Pillow doesn't write icns natively on non-Mac.
    # On macOS, run:  iconutil -c icns assets/icon.iconset
    # Fallback: just copy the PNG and rename
    try:
        src.save("assets/icon.icns")
        print("OK assets/icon.icns")
    except Exception:
        import shutil
        shutil.copy("assets/icon.png", "assets/icon.icns")
        print("WARN assets/icon.icns (PNG copy – rebuild on macOS for proper .icns)")

    print("\nAll icons generated in assets/")


if __name__ == "__main__":
    main()
