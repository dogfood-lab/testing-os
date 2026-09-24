from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent


def main():
    img = Image.new("RGB", (4, 4))
    out = ROOT / "docs" / "assets" / "one" / "banner.png"
    img.save(out)


main()
