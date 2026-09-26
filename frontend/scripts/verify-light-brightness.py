#!/usr/bin/env python3
"""明亮化亮度带断言（v0.7 回归用）

读 verify-light-theme.mjs 产出的整页截图，按 200px 横向带算平均亮度，
任何一带 <120/255 即判回归（这是本项目已定的判据：深色满幅色块一定会砸穿它）。

用法：
    cd frontend
    node scripts/verify-light-theme.mjs        # 先出截图（写到 hermes scratch 目录）
    python scripts/verify-light-brightness.py  # 再断言

退出码：0 = 通过；1 = 有暗带（会打印 y 位置与亮度）。
若暗带确为照片内容而非样式（例如夜间运输照），用 --allow 明确豁免并说明理由。
"""
import sys
import glob
import os

try:
    from PIL import Image, ImageStat
except ImportError:
    print("需要 Pillow：python -m pip install pillow")
    sys.exit(2)

SHOT_DIR = os.environ.get(
    "LIGHT_SHOT_DIR",
    "C:/Users/fayypp/AppData/Local/hermes/cache/scratch/osrm-light",
)
THRESHOLD = 120
BAND = 200


def mean_lum(img):
    s = ImageStat.Stat(img.convert("RGB")).mean
    return 0.299 * s[0] + 0.587 * s[1] + 0.114 * s[2]


def main():
    allow = []
    if "--allow" in sys.argv:
        i = sys.argv.index("--allow")
        allow = [a.strip() for a in sys.argv[i + 1:]]

    shots = sorted(glob.glob(os.path.join(SHOT_DIR, "*.png")))
    if not shots:
        print(f"❌ 没找到截图：{SHOT_DIR}（先跑 node scripts/verify-light-theme.mjs）")
        return 1

    failed = 0
    for path in shots:
        name = os.path.basename(path)
        if name.startswith("preview-"):
            continue
        im = Image.open(path)
        w, h = im.size
        bands = [(y, round(mean_lum(im.crop((0, y, w, min(y + BAND, h)))), 1))
                 for y in range(0, h - 40, BAND)]
        dark = [b for b in bands if b[1] < THRESHOLD]
        lo = min(b[1] for b in bands)
        avg = sum(b[1] for b in bands) / len(bands)
        status = "✅" if not dark else "❌"
        print(f"{status} {name} {w}x{h}: {len(bands)} 带, 最低 {lo}, 平均 {avg:.1f}")
        for y, val in dark:
            if any(a in name for a in allow):
                print(f"   （已豁免）y={y} 亮度 {val}")
            else:
                print(f"   ❌ 暗带 y={y} 亮度 {val} < {THRESHOLD}")
                failed += 1

    if failed:
        print(f"\n❌ 亮度带断言失败 {failed} 处 —— 深色区块回归")
        return 1
    print("\n✅ 亮度带断言通过（无 <120 的带）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
