#!/usr/bin/env python3
"""convert-assets.py — 원본 PNG(game-assets-src, gitignore) → 런타임 WebP(assets/, 커밋)
- 스프라이트: 알파 bbox 트림(+8px 여유) → 최대 256px 축소 → WebP q90
- 배경(bg-*): 트림 없이 1536px 유지 → WebP q82
- assets/manifest.json 생성 (key = 파일명에서 -를 _로: tower-plus → tower_plus)
- 원본 PNG는 배포 번들 제외 (field-learning: dist 10배 부풀림 방지)
사용: python3 tools/convert-assets.py
"""
import json
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "game-assets-src")
OUT = os.path.join(ROOT, "assets")
os.makedirs(OUT, exist_ok=True)

manifest = []
for name in sorted(os.listdir(SRC)):
    if not name.endswith(".png"):
        continue
    stem = name[:-4]
    src_path = os.path.join(SRC, name)
    out_name = stem + ".webp"
    out_path = os.path.join(OUT, out_name)
    im = Image.open(src_path).convert("RGBA")

    if stem.startswith("bg-"):
        im.save(out_path, "WEBP", quality=82, method=6)
    else:
        bbox = im.split()[3].getbbox()
        if bbox:
            pad = 8
            bbox = (
                max(0, bbox[0] - pad),
                max(0, bbox[1] - pad),
                min(im.width, bbox[2] + pad),
                min(im.height, bbox[3] + pad),
            )
            im = im.crop(bbox)
        if max(im.size) > 256:
            r = 256 / max(im.size)
            im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
        im.save(out_path, "WEBP", quality=90, method=6)

    key = stem.replace("-", "_")
    manifest.append({"key": key, "file": out_name})
    print(f"  {name} → {out_name} ({os.path.getsize(out_path)//1024}KB)")

with open(os.path.join(OUT, "manifest.json"), "w") as f:
    json.dump({"files": manifest}, f, ensure_ascii=False, indent=1)

total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print(f"\n✅ {len(manifest)}개 변환, assets/ 총 {total//1024}KB (예산 4MB 이내 확인: {'OK' if total < 4*1024*1024 else '초과!'})")
