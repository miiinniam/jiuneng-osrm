"""
第二层分析：深入分析新报价的价格结构
- 验证距离-价格关系
- 检测海防/广宁港口溢价
- 分离高栏车 vs 平板/集装箱的不同定价模式
"""

import sys
import math
import json
import numpy as np
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "backend"))
from app.services.calibration import ResolvedSample, fit_rates

# reuse coords + haversine from first script
DEST_COORDS = {
    "Cửa khẩu Hữu Nghị, Lạng Sơn, Việt Nam": (21.9711036, 106.7108794),
    "Bắc Ninh (kv tt) KCN,TP": (21.183, 106.055),
    "Thuận Thành, Bình Than Bắc Ninh": (21.045, 106.073),
    "Bắc Giang (Quang Châu, Vân Trung, Đình Trám, Song Khê)": (21.273, 106.195),
    "Bắc Giang (Hiệp Hoà, Lục Nam)": (21.355, 105.978),
    "Sông Khoai, Quảng Ninh, Việt Nam": (20.986164, 106.82024),
    "TP Thái Nguyên": (21.594, 105.848),
    "Thái Nguyên (KCN samsung)": (21.413, 105.921),
    "Hải Dương, KCN Đại An, Phúc Điền": (20.937, 106.333),
    "Hà Nội (trung tâm)": (21.028, 105.854),
    "Hà Nội 2": (21.028, 105.854),
    "Thạch Thất": (21.038, 105.555),
    "Hưng Yên": (20.646, 106.051),
    "Hưng Yên (Phố Nối)": (20.950, 106.061),
    "Hải Phòng (Tràng Duê, Thuỷ Nguyên, An Dương)": (20.865, 106.682),
    "Hải Phòng VinFast. Hải An, TP Hải Phòng": (20.842, 106.752),
    "Vĩnh Phúc Bình Xuyên": (21.308, 105.593),
    "Vĩnh Phúc Thổ Tang, Lập Thạch": (21.338, 105.508),
    "TP Thanh Hóa": (19.807, 105.776),
    "Hoàng Mai, Nghệ An": (19.261, 105.714),
    "TP Nghệ An, visip Nghệ An": (18.679, 105.674),
    "TP Thái Bình": (20.446, 106.342),
    "TP Hòa Bình": (20.817, 105.338),
    "TP Nam Định": (20.434, 106.177),
    "TP Phú Thọ": (21.323, 105.222),
    "Cẩm Khê, Phú Thọ": (21.406, 105.101),
    "Hà Nam KCN Đồng văn": (20.679, 105.919),
    "Kim Bảng, Phủ lý Hà Nam": (20.543, 105.914),
}

ORIGIN_COORDS = (21.9711036, 106.7108794)

NEW_QUOTES = [
    (1, "Bắc Ninh (kv tt) KCN,TP", 6300000, 10500000),
    (2, "Thuận Thành, Bình Than Bắc Ninh", 7000000, 10500000),
    (3, "Bắc Giang (Quang Châu, Vân Trung, Đình Trám, Song Khê)", 5800000, 9500000),
    (4, "Bắc Giang (Hiệp Hoà, Lục Nam)", 6300000, 10500000),
    (5, "Sông Khoai, Quảng Ninh, Việt Nam", 9500000, 16000000),
    (6, "TP Thái Nguyên", 8000000, 13500000),
    (7, "Thái Nguyên (KCN samsung)", 7500000, 12500000),
    (8, "Hải Dương, KCN Đại An, Phúc Điền", 8500000, 13500000),
    (9, "Hà Nội (trung tâm)", 7500000, 12500000),
    (10, "Hà Nội 2", 8000000, 13000000),
    (11, "Thạch Thất", 8500000, 14000000),
    (12, "Hưng Yên", 9000000, 14000000),
    (13, "Hưng Yên (Phố Nối)", 8500000, 13500000),
    (14, "Hải Phòng (Tràng Duê, Thuỷ Nguyên, An Dương)", 10500000, 17500000),
    (15, "Hải Phòng VinFast. Hải An, TP Hải Phòng", 11000000, 18500000),
    (16, "Vĩnh Phúc Bình Xuyên", 8000000, 13000000),
    (17, "Vĩnh Phúc Thổ Tang, Lập Thạch", 8500000, 14000000),
    (18, "TP Thanh Hóa", 12500000, 20000000),
    (19, "Hoàng Mai, Nghệ An", 14500000, 24000000),
    (20, "TP Nghệ An, visip Nghệ An", 16500000, 26000000),
    (21, "TP Thái Bình", 11000000, 19000000),
    (22, "TP Hòa Bình", 11000000, 18000000),
    (23, "TP Nam Định", 10500000, 16000000),
    (24, "TP Phú Thọ", 10500000, 16000000),
    (25, "Cẩm Khê, Phú Thọ", 11000000, 17000000),
    (26, "Hà Nam KCN Đồng văn", 9500000, 14000000),
    (27, "Kim Bảng, Phủ lý Hà Nam", 10000000, 15000000),
]

def haversine_km(lat1, lng1, lat2, lng2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return R * 2 * math.asin(math.sqrt(a))

def estimate_drive_km(straight_km):
    return straight_km * 1.35


print("=" * 80)
print("  新报价深度分析：价格 vs 距离 关系")
print("=" * 80)

# PORT flagged destinations (海防 + 广宁 = 港口城市，有港口溢价)
PORT_DESTS = {"Sông Khoai, Quảng Ninh, Việt Nam", 
              "Hải Phòng (Tràng Duê, Thuỷ Nguyên, An Dương)",
              "Hải Phòng VinFast. Hải An, TP Hải Phòng"}

print("\n📊  Sàn/Rào 价格-距离分析")
print(f"{'目的地':<50s} {'直线km':>7s} {'行车km':>7s} {'价格₫':>12s} {'₫/km':>8s} {'标志':<6s}")
print("-" * 95)

sr_data = []
for stt, dest, price_sr, price_fooc in NEW_QUOTES:
    coords = DEST_COORDS.get(dest)
    straight = haversine_km(*ORIGIN_COORDS, *coords) if coords else 0
    drive = estimate_drive_km(straight)
    per_km = price_sr / drive if drive else 0
    flag = "港口" if dest in PORT_DESTS else ""
    print(f"{dest:<50s} {straight:7.0f} {drive:7.0f} {price_sr:>12,} {per_km:>8,.0f} {flag:<6s}")
    sr_data.append((straight, drive, price_sr, flag))

# 按港口/非港口分组统计
port_ppk = [d[2]/d[1] for d in sr_data if d[3]]
normal_ppk = [d[2]/d[1] for d in sr_data if not d[3]]

print(f"\n  港口目的地平均 ₫/km: {np.mean(port_ppk):,.0f}  (n={len(port_ppk)})")
print(f"  非港口平均 ₫/km:       {np.mean(normal_ppk):,.0f}  (n={len(normal_ppk)})")
print(f"  港口溢价:              {np.mean(port_ppk)/np.mean(normal_ppk) - 1:+.1%}")

# 分段分析（按距离分段）
print(f"\n📊  按距离分段 ₫/km（Sàn/Rào）:")
bins = [(0, 150), (150, 200), (200, 300), (300, 600)]
for lo, hi in bins:
    seg = [d[2]/d[1] for d in sr_data if lo <= d[1] < hi]
    if seg:
        print(f"  {lo}-{hi}km: 平均 {np.mean(seg):,.0f} ₫/km  (n={len(seg)})")

# 线性回归：price = a * km + b （即固定费 + 每公里费率）
print(f"\n📐  线性回归 price = a·km + b（Sàn/Rào，排除港口）:")
normal_sr = [(d[1], d[2]) for d in sr_data if not d[3]]
x = np.array([d[0] for d in normal_sr])
y = np.array([d[1] for d in normal_sr])
A = np.vstack([x, np.ones(len(x))]).T
a, b = np.linalg.lstsq(A, y, rcond=None)[0]
print(f"  每公里费率 a = {a:,.0f} ₫/km")
print(f"  固定费 b =     {b:,.0f} ₫")
predictions = a * x + b
errors = (y - predictions) / y * 100
print(f"  误差: Mean={np.mean(np.abs(errors)):.1f}%  Max={np.max(np.abs(errors)):.1f}%")
print(f"  公式: price = {a:,.0f} × km + {b:,.0f}")

# 含港口的线性回归
print(f"\n📐  线性回归 price = a·km + b（Sàn/Rào，含全部，加港口虚拟变量）:")
x_all = np.array([d[1] for d in sr_data])
y_all = np.array([d[2] for d in sr_data])
port_flag = np.array([1.0 if d[3] else 0.0 for d in sr_data])
A_all = np.vstack([x_all, port_flag, np.ones(len(x_all))]).T
coeffs = np.linalg.lstsq(A_all, y_all, rcond=None)[0]
a_all, port_prem, b_all = coeffs
print(f"  每公里费率 a =    {a_all:,.0f} ₫/km")
print(f"  港口附加 port =   {port_prem:,.0f} ₫")
print(f"  固定费 b =        {b_all:,.0f} ₫")
pred_all = a_all * x_all + port_prem * port_flag + b_all
err_all = (y_all - pred_all) / y_all * 100
print(f"  误差: Mean={np.mean(np.abs(err_all)):.1f}%  Max={np.max(np.abs(err_all)):.1f}%")
print(f"  港口溢价相当于:    {port_prem / b_all * 100:.0f}% 固定费加成")

# ═════════════════════════════════════════════════
# Fooc 分析
print(f"\n\n📊  Fooc 价格-距离分析")
print(f"{'目的地':<50s} {'行车km':>7s} {'价格₫':>12s} {'₫/km':>8s} {'标志':<6s}")
print("-" * 90)

fooc_data = []
for stt, dest, price_sr, price_fooc in NEW_QUOTES:
    coords = DEST_COORDS.get(dest)
    straight = haversine_km(*ORIGIN_COORDS, *coords) if coords else 0
    drive = estimate_drive_km(straight)
    per_km = price_fooc / drive if drive else 0
    flag = "港口" if dest in PORT_DESTS else ""
    print(f"{dest:<50s} {drive:7.0f} {price_fooc:>12,} {per_km:>8,.0f} {flag:<6s}")
    fooc_data.append((straight, drive, price_fooc, flag))

port_ppk_f = [d[2]/d[1] for d in fooc_data if d[3]]
normal_ppk_f = [d[2]/d[1] for d in fooc_data if not d[3]]

print(f"\n  港口平均 ₫/km: {np.mean(port_ppk_f):,.0f}  (n={len(port_ppk_f)})")
print(f"  非港口平均 ₫/km: {np.mean(normal_ppk_f):,.0f}  (n={len(normal_ppk_f)})")
print(f"  港口溢价:        {np.mean(port_ppk_f)/np.mean(normal_ppk_f) - 1:+.1%}")

# Fooc 线性回归（含港口虚拟变量）
x_f = np.array([d[1] for d in fooc_data])
y_f = np.array([d[2] for d in fooc_data])
port_f = np.array([1.0 if d[3] else 0.0 for d in fooc_data])
A_f = np.vstack([x_f, port_f, np.ones(len(x_f))]).T
coeffs_f = np.linalg.lstsq(A_f, y_f, rcond=None)[0]
a_f, port_fee, b_f = coeffs_f
pred_f = a_f * x_f + port_fee * port_f + b_f
err_f = (y_f - pred_f) / y_f * 100
print(f"\n📐  线性回归（含港口虚拟变量）:")
print(f"  每公里费率 a =    {a_f:,.0f} ₫/km")
print(f"  港口附加 port =   {port_fee:,.0f} ₫")
print(f"  固定费 b =        {b_f:,.0f} ₫")
print(f"  误差: Mean={np.mean(np.abs(err_f)):.1f}%  Max={np.max(np.abs(err_f)):.1f}%")
print(f"  公式: price = {a_f:,.0f} × km + {port_fee:,.0f} × is_port + {b_f:,.0f}")

# ═════════════════════════════════════════════════
# Fooc / SànRào 价格比分析
print(f"\n\n📊  Fooc / SànRào 价格比率分析")
ratios = [f[2] / s[2] for f, s in zip(fooc_data, sr_data)]
print(f"  平均比率: {np.mean(ratios):.3f}")
print(f"  范围: {min(ratios):.3f} ~ {max(ratios):.3f}")
print(f"  标准差: {np.std(ratios):.3f}")
print(f"  结论: Fooc 价格约为 Sàn/Rào 的 {np.mean(ratios):.1%}")

# ═════════════════════════════════════════════════
# 校准建议：用回归出的公式作为 base_rate
print(f"\n\n{'='*80}")
print(f"  📋 公式优化建议")
print(f"{'='*80}")

print(f"""
  分析结论:
  ─────────
  1. Sàn/Rào（平板/栏栅车）和 Fooc（大柜车）都是"距离×单价 + 固定费"结构，
     不是纯距离定价。纯距离拟合 RMSE ~2.2-3.6M ₫ 偏高。

  2. 回归发现的更优公式结构:

     Sàn/Rào:
       price = {a_all:,.0f} × km + {port_prem:,.0f} × is_port + {b_all:,.0f}
       (误差 Mean={np.mean(np.abs(err_all)):.1f}%, Max={np.max(np.abs(err_all)):.1f}%)

     Fooc:
       price = {a_f:,.0f} × km + {port_fee:,.0f} × is_port + {b_f:,.0f}
       (误差 Mean={np.mean(np.abs(err_f)):.1f}%, Max={np.max(np.abs(err_f)):.1f}%)

  3. 海防/广宁港口有 ~{port_prem/b_all*100:.0f}% 的固定费溢价（港口装卸费、拥堵、特种货等）

  4. Fooc:Sàn/Rào 价格比 ≈ {np.mean(ratios):.2f}x

  5. 建议的 CSV base_rate 更新（贴合新报价的"距离模型"）:
     - flatbed_12m5（映射 Sàn/Rào 中型平板）: base_rate = {a_all:,.0f} ₫/km, fixed_surcharge = {b_all:,.0f} ₫
     - container_40ft（映射 Fooc）: base_rate = {a_f:,.0f} ₫/km, fixed_surcharge = {b_f:,.0f} ₫

  6. 高栏车（high_side_*）和厢货车（small_box_*）是另一种定价模式
     （高固定调度费 + 低每公里费率），不应与新报价的 flatbed/container 混合校准。

  7. Port surcharge（港口附加费）应作为一个独立的 Flag 加入报价系统，
     不是硬编码进 base_rate——因为并非所有路线都经过港口。
""")
