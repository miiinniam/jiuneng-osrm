"""为端点标签找不压线的位置：折线-矩形相交检测 + 候选方案搜索。"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
src = (ROOT / "src/lib/route/trunkRoute.ts").read_text(encoding="utf-8")
path_d = re.search(r'path: "(.*?)",\n', src, re.S).group(1)
P = [(float(a), float(b)) for a, b in re.findall(r"([0-9.]+),([0-9.]+)", path_d)]
W, H = 1160, 168
START = (7.0, 116.6)
END = (1153.4, 139.4)

LBL_H = 34  # 两行标签高度（viewBox 单位）
WIDTHS = {
    "zh": ("凭祥 · 友谊关", 80),
    "vi": ("Bằng Tường · Hữu Nghị", 118),
    "en": ("Pingxiang · Friendship Pass", 161),
}
MAXW = max(w for _, w in WIDTHS.values())


def seg_rect_hit(x1, y1, x2, y2, rx0, ry0, rx1, ry1):
    if max(x1, x2) < rx0 or min(x1, x2) > rx1 or max(y1, y2) < ry0 or min(y1, y2) > ry1:
        return False
    for x, y in ((x1, y1), (x2, y2)):
        if rx0 <= x <= rx1 and ry0 <= y <= ry1:
            return True

    def cross(ax, ay, bx, by, cx, cy):
        return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)

    def seg_int(a, b, c, d):
        d1, d2 = cross(*c, *d, *a), cross(*c, *d, *b)
        d3, d4 = cross(*a, *b, *c), cross(*a, *b, *d)
        return ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0))

    edges = [((rx0, ry0), (rx1, ry0)), ((rx1, ry0), (rx1, ry1)),
             ((rx1, ry1), (rx0, ry1)), ((rx0, ry1), (rx0, ry0))]
    return any(seg_int((x1, y1), (x2, y2), e[0], e[1]) for e in edges)


def hits(rx0, ry0, rx1, ry1):
    return sum(1 for i in range(len(P) - 1)
               if seg_rect_hit(*P[i], *P[i + 1], rx0, ry0, rx1, ry1))


def report(name, x0, y0, w):
    x1 = x0 + w
    y1 = y0 + LBL_H
    n = hits(x0, y0, x1, y1)
    flag = "OK 无压线" if n == 0 else f"X 压线({n})"
    print(f"  {name:26} x{x0:6.0f}-{x1:6.0f} y{y0:5.0f}-{y1:5.0f}  {flag}")
    return n == 0


print(f"最宽标签 = 英文 {MAXW} 单位（{WIDTHS['en'][0]}）")
print(f"标签高 = {LBL_H} 单位\n")

print("=== 路线在各 x 区间的 y 占用 ===")
for a in range(0, 1160, 100):
    ys = [y for x, y in P if a <= x <= a + 100]
    print(f"  x {a:4d}-{a+100:4d}   y {min(ys):6.1f} ~ {max(ys):6.1f}")

print("\n=== A. 标签垂直居中于端点，左右边缘 ===")
report("起点 居中左对齐", 0, START[1] - LBL_H / 2, MAXW)
report("终点 居中右对齐", W - MAXW, END[1] - LBL_H / 2, MAXW)

print("\n=== B. 标签放路线下方（锚定端点，向下偏移）===")
for off in (8, 14, 20):
    report(f"起点 下方 +{off}", 0, START[1] + off, MAXW)
    report(f"终点 下方 +{off}", W - MAXW, END[1] + off, MAXW)

print("\n=== C. 标签放路线上方（锚定端点，向上偏移）===")
for off in (8, 14, 20):
    report(f"起点 上方 -{off}", 0, START[1] - off - LBL_H, MAXW)
    report(f"终点 上方 -{off}", W - MAXW, END[1] - off - LBL_H, MAXW)

print("\n=== D. 右端收窄：仅按中文宽度（80）右对齐 ===")
for off in (8, 14):
    report(f"终点 下方 +{off} 窄", W - 80, END[1] + off, 80)

print("\n=== E. 仅看右端 x1080-1160 的路线 ===")
for a in range(1060, 1160, 20):
    ys = [y for x, y in P if a <= x <= a + 20]
    if ys:
        print(f"  x {a}-{a+20}  y {min(ys):6.1f} ~ {max(ys):6.1f}")

print("\n=== F. 自动搜索右端可用位置（右对齐，宽度=英文最大）===")
found = []
for y0 in range(0, H - LBL_H + 1, 2):
    if hits(W - MAXW, y0, W, y0 + LBL_H) == 0:
        found.append(y0)
if found:
    # 合并连续区间
    runs, s = [], found[0]
    for a, b in zip(found, found[1:]):
        if b - a > 2:
            runs.append((s, a)); s = b
    runs.append((s, found[-1]))
    print(f"  可用 y 区间: {runs}")
    print(f"  端点 y={END[1]:.0f}，最近可用区间末端 {runs[-1][1]}")
else:
    print("  X 全宽（英文宽度）在右端无可用位置")

print("\n=== G. 自动搜索左端可用位置 ===")
found = []
for y0 in range(0, H - LBL_H + 1, 2):
    if hits(0, y0, MAXW, y0 + LBL_H) == 0:
        found.append(y0)
if found:
    runs, s = [], found[0]
    for a, b in zip(found, found[1:]):
        if b - a > 2:
            runs.append((s, a)); s = b
    runs.append((s, found[-1]))
    print(f"  可用 y 区间: {runs}")
    print(f"  端点 y={START[1]:.0f}")
