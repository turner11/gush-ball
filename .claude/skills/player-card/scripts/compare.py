# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow"]
# ///
"""Contact sheet: each source photo beside its finished card, so faces can be checked at a glance.

    uv run compare.py --out sheet.jpg src1.jpg card1.jpg [src2.jpg card2.jpg ...]

Pairs are positional: (source, card), (source, card), ... Five pairs per row.
"""
import argparse

from PIL import Image

CELL_W, CELL_H, PER_ROW = 260, 325, 5


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("images", nargs="+", help="source, card, source, card, ...")
    args = ap.parse_args()
    if len(args.images) % 2:
        raise SystemExit(f"Need (source, card) pairs, got {len(args.images)} paths")

    pairs = list(zip(args.images[::2], args.images[1::2]))
    rows = (len(pairs) + PER_ROW - 1) // PER_ROW
    sheet = Image.new("RGB", (CELL_W * 2 * min(len(pairs), PER_ROW), CELL_H * rows), "white")
    for i, pair in enumerate(pairs):
        x, y = (i % PER_ROW) * 2 * CELL_W, (i // PER_ROW) * CELL_H
        for j, path in enumerate(pair):
            im = Image.open(path).convert("RGB")
            im.thumbnail((CELL_W, CELL_H))
            sheet.paste(im, (x + j * CELL_W, y))
    sheet.save(args.out, quality=88)
    print(f"wrote {args.out} ({len(pairs)} pairs)")


if __name__ == "__main__":
    main()
