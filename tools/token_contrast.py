#!/usr/bin/env python3
"""Check WCAG contrast for the text/background pairs declared in specs/30-experience/tokens.json.

Usage: python3 tools/token_contrast.py   (exit 1 if any pair fails, in any theme)
"""
import json
import sys
from pathlib import Path

TOKENS = Path(__file__).resolve().parent.parent / "specs" / "30-experience" / "tokens.json"


def luminance(hex_color: str) -> float:
    h = hex_color.lstrip("#")[:6]
    def chan(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (chan(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a: str, b: str) -> float:
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def main() -> int:
    tokens = json.loads(TOKENS.read_text())
    pairs = []
    for spec in tokens["contrast"]["pairs"]["$value"].split(","):
        names, minimum = spec.strip().rsplit(" ", 1)
        fg, bg = names.split("/")
        pairs.append((fg, bg, float(minimum)))
    failures = 0
    for theme, colors in tokens["color"].items():
        if theme.startswith("$"):
            continue
        for fg, bg, minimum in pairs:
            r = ratio(colors[fg]["$value"], colors[bg]["$value"])
            ok = r >= minimum
            failures += not ok
            print(f"{theme:6} {fg:>12} on {bg:<10} {r:5.2f}  (min {minimum:g})  {'ok' if ok else 'FAIL'}")
    print(f"\n{failures} failing pair(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
