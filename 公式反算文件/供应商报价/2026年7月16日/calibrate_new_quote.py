"""
2026-07-16 供应商报价反算脚本
==============================
从 BẢNG BÁO GIÁ CƯỚC XE RÀO. SÀN HÀNG NHẬP 2026.xlsx 提取报价，
结合历史全部样本做 full_truck 校准，输出优化后的 base_rate 建议。
"""

import sys
import os
import math
import json
import numpy as np
from pathlib import Path
from collections import defaultdict

# 添加 backend 到 path
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "backend"))

from app.services.calibration import (
    ResolvedSample, fit_rates, CalibrationResult,
    DEFAULT_LOADING_RATE_VND_PER_TON, DEFAULT_INSURANCE_RATE,
)
from app.services import 费用计算公式 as 公式
from app.services.presets import CARGO_TYPE_RATES
from app.services.vehicle_registry import get_model, VEHICLE_MODELS


# ═══════════════════════════════════════════════════════
# 1. 手动坐标库（所有目的地，基于地理常识 + geocode_cache）
# ═══════════════════════════════════════════════════════
DEST_COORDS = {
    # From geocode_cache
    "Cửa khẩu Hữu Nghị, Lạng Sơn, Việt Nam": (21.9711036, 106.7108794),
    "Bắc Giang, Việt Nam": (21.3740092, 106.4663176),
    "Sông Khoai, Quảng Ninh, Việt Nam": (20.986164, 106.82024),
    "Vĩnh Phúc, Việt Nam": (21.3080002, 105.5926359),
    # New destinations (manually looked up)
    "Bắc Ninh (kv tt) KCN,TP": (21.183, 106.055),
    "Thuận Thành, Bình Than Bắc Ninh": (21.045, 106.073),
    "Bắc Giang (Quang Châu, Vân Trung, Đình Trám, Song Khê)": (21.273, 106.195),
    "Bắc Giang (Hiệp Hoà, Lục Nam)": (21.355, 105.978),
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

# 起点：友谊关口岸
ORIGIN_COORDS = (21.9711036, 106.7108794)


def haversine_km(lat1, lng1, lat2, lng2):
    """球面距离（km）"""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def estimate_drive_km(straight_km):
    """直线距离 → 估计行车距离（越南公路约 1.25-1.45x）"""
    return straight_km * 1.35


def estimate_duration_h(drive_km):
    """估计行车时间（越南货车均速 ~50 km/h）"""
    return drive_km / 50.0


# ═══════════════════════════════════════════════════════
# 2. 新报价数据提取（从 Excel 读取内容）
# ═══════════════════════════════════════════════════════
# 手动录入（已从 read_file 获取）
NEW_QUOTES = [
    # (stt, destination, price_san_rao, price_fooc)
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
    (14, "Hải Phòng (Tràng Duê, Thuỷ Nguyên, An Dương)", 10500000, 17500000),  # 修正:原1,050,000→10,500,000
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

# 供应商附加费说明
LOADING_NOTES = {
    "san_rao": {
        "ca1": 1000000, "ca2": 1000000, "ca3": 1500000, "ca4_plus": 2000000
    },
    "fooc": {
        "ca1": 1500000, "ca2": 2000000, "ca3": 2500000, "ca4_plus": 3000000,
        "oversized": 3000000,  # 超限/超重 每ca
    }
}

BORDER_SURCHARGE = {
    "tan_thanh_chi_ma_san_rao": 500000,
    "tan_thanh_chi_ma_fooc": 500000,
    "chi_ma_fooc": 1000000,  # Fooc đi Chi Ma cộng thêm 1,000k
}


# ═══════════════════════════════════════════════════════
# 3. 构建 ResolvedSample（使用估计距离）
# ═══════════════════════════════════════════════════════

def build_sample(vehicle_model_id, dest_name, actual_cost_vnd, weight_kg, cargo_type="normal"):
    """构建一个 ResolvedSample"""
    model = get_model(vehicle_model_id)
    if model is None:
        raise ValueError(f"Unknown model: {vehicle_model_id}")

    coords = DEST_COORDS.get(dest_name)
    if coords is None:
        raise ValueError(f"Unknown destination: {dest_name}")

    straight_km = haversine_km(*ORIGIN_COORDS, *coords)
    drive_km = estimate_drive_km(straight_km)
    duration_h = estimate_duration_h(drive_km)

    return ResolvedSample(
        loading_mode="full_truck",
        vehicle_model_id=vehicle_model_id,
        weight_kg=weight_kg,
        actual_cost_vnd=actual_cost_vnd,
        distance_m=drive_km * 1000,
        duration_s=duration_h * 3600,
        volume_m3=None,
        capacity_ratio=1.0,
        cargo_type=cargo_type,
        empty_return=False,
        need_loading=False,
        notes=f"New quote 2026-07-16: {dest_name}",
    )


def build_all_new_samples():
    """从新报价构建全部样本"""
    samples_san_rao = []
    samples_fooc = []

    for stt, dest, price_sr, price_fooc in NEW_QUOTES:
        # Sàn/Rào → 映射到 flatbed_12m5（中型平板，22吨），假设满载22吨
        try:
            s = build_sample("flatbed_12m5", dest, price_sr, 22000)
            samples_san_rao.append(s)
        except Exception as e:
            print(f"  ⚠ Sàn/Rào sample {stt} ({dest}): {e}")

        # Fooc → 映射到 container_40ft（40尺柜，28吨），假设满载28吨
        try:
            s = build_sample("container_40ft", dest, price_fooc, 28000, cargo_type="normal")
            samples_fooc.append(s)
        except Exception as e:
            print(f"  ⚠ Fooc sample {stt} ({dest}): {e}")

    return samples_san_rao, samples_fooc


# ═══════════════════════════════════════════════════════
# 4. 加载历史样本（从 JSON 文件）
# ═══════════════════════════════════════════════════════

def load_historical_samples(json_path, vehicle_map=None):
    """加载历史 JSON 样本，转为 ResolvedSample（使用 source_distance 或估计距离）"""
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)

    samples = []
    for item in data:
        vid = item["vehicle_model_id"]
        if vehicle_map and vid in vehicle_map:
            vid = vehicle_map[vid]

        model = get_model(vid)
        if model is None:
            continue

        # 尝试从 item 获取坐标
        origin = item.get("origin", {})
        dest = item.get("destination", {})

        if origin.get("lat") and dest.get("lat"):
            straight = haversine_km(origin["lat"], origin["lng"], dest["lat"], dest["lng"])
            drive_km = estimate_drive_km(straight)
            duration = drive_km / 50.0
        elif "source_distance_km" in item:
            drive_km = item["source_distance_km"]
            duration = item.get("source_duration_h", drive_km / 50.0)
        else:
            # 用地址估计
            dest_addr = item.get("dest_address", "")
            coords = DEST_COORDS.get(dest_addr)
            if coords:
                origin_coords = ORIGIN_COORDS
                straight = haversine_km(*origin_coords, *coords)
                drive_km = estimate_drive_km(straight)
                duration = drive_km / 50.0
            else:
                continue

        samples.append(ResolvedSample(
            loading_mode=item.get("loading_mode", "full_truck"),
            vehicle_model_id=vid,
            weight_kg=item.get("weight_kg", model.max_load_ton * 1000),
            actual_cost_vnd=item["actual_cost_vnd"],
            distance_m=drive_km * 1000,
            duration_s=duration * 3600,
            cargo_type=item.get("cargo_type", "normal"),
            notes=item.get("notes", ""),
        ))

    return samples


# ═══════════════════════════════════════════════════════
# 5. 主校准流程
# ═══════════════════════════════════════════════════════

def print_calibration_report(result: CalibrationResult, label: str):
    """格式化输出校准报告"""
    print(f"\n{'='*70}")
    print(f"  {label}")
    print(f"{'='*70}")
    print(f"  模式: {result.mode} | 样本数: {result.sample_count}")
    print(f"  RMSE: {result.rmse_vnd:,.0f} ₫")
    print(f"  油价: {result.fuel_price_vnd:,.0f} ₫/L  |  时薪: {result.wage_hourly_vnd:,.0f} ₫/h")

    print(f"\n  📊 车型基础费率 (base_rate_vnd_per_km):")
    for vid, rate in sorted(result.base_rate_vnd_per_km.items()):
        model = get_model(vid)
        name = model.display_name if model else vid
        current = model.base_rate_vnd_per_km if model else "?"
        n = result.samples_per_vehicle.get(vid, 0)
        change = ""
        if isinstance(current, (int, float)):
            pct = (rate - current) / current * 100
            change = f"  (当前{current:,.0f}, 变化{pct:+.1f}%)"
        print(f"    {vid:30s} {rate:>10,.0f} ₫/km  [{name}]{change}  ← {n}样本")

    if result.warnings:
        print(f"\n  ⚠ 警告:")
        for w in result.warnings:
            print(f"    • {w}")

    print(f"\n  预测误差分布:")
    errors = sorted([abs(p.error_pct) for p in result.predictions])
    if errors:
        p50 = np.percentile(errors, 50)
        p80 = np.percentile(errors, 80)
        p95 = np.percentile(errors, 95)
        max_err = max(errors)
        within_10 = sum(1 for e in errors if e <= 10) / len(errors) * 100
        within_20 = sum(1 for e in errors if e <= 20) / len(errors) * 100
        print(f"    P50={p50:.1f}%  P80={p80:.1f}%  P95={p95:.1f}%  Max={max_err:.1f}%")
        print(f"    ≤10%: {within_10:.0f}%  ≤20%: {within_20:.0f}%")

    # 打印误差最大的5个
    print(f"\n  🔴 误差最大的 5 个样本:")
    worst = sorted(result.predictions, key=lambda p: abs(p.error_pct), reverse=True)[:5]
    for p in worst:
        print(f"    {p.notes[:60]:60s} 实际{p.actual_cost_vnd:>12,.0f}  预测{p.predicted_cost_vnd:>12,.0f}  误差{p.error_pct:>+6.1f}%")


def run_all_calibrations():
    """运行所有校准场景"""
    print("=" * 70)
    print("  OSRM++ 供应商报价反算器 — 2026-07-16")
    print("=" * 70)
    print(f"  油价: 21,170 ₫/L (Petrolimex DO 0,05S-II Vùng 1, 2026-07)")
    print()

    # 构建新报价样本
    print("📦 构建新报价样本...")
    samples_san_rao, samples_fooc = build_all_new_samples()
    print(f"   Sàn/Rào: {len(samples_san_rao)} 样本")
    print(f"   Fooc:    {len(samples_fooc)} 样本")

    # 加载历史样本
    print("\n📂 加载历史样本...")
    base_dir = Path(__file__).resolve().parents[1]  # 供应商报价/

    historical_all = []
    for fname in ["samples_all.json", "samples_HuuNghi_border.json", "samples_heavy_only.json", "samples_DuyAnh_Fushida.json"]:
        fpath = base_dir / fname
        if fpath.exists():
            hist = load_historical_samples(str(fpath))
            historical_all.extend(hist)
            print(f"   {fname}: {len(hist)} 样本")
        else:
            print(f"   {fname}: 文件不存在，跳过")

    # 去重（同一路线+同一车型+同一价格去重）
    seen = set()
    historical_deduped = []
    for s in historical_all:
        key = (s.vehicle_model_id, round(s.distance_m / 1000), s.actual_cost_vnd)
        if key not in seen:
            seen.add(key)
            historical_deduped.append(s)
    print(f"   去重后: {len(historical_deduped)} 样本（移除{len(historical_all) - len(historical_deduped)}条重复）")

    # ═══════════════════════════════════════════════════
    # 场景 A: 仅新报价 → fit
    # ═══════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("  场景 A: 仅新报价（Sàn/Rào + Fooc 合并校准）")
    print("=" * 70)
    all_new = samples_san_rao + samples_fooc
    # 统计
    for s in all_new:
        print(f"  {s.vehicle_model_id:25s} {s.distance_m/1000:6.0f}km  {s.actual_cost_vnd:>12,}₫  ({s.notes[:40]})")
    try:
        result_a = fit_rates(all_new)
        print_calibration_report(result_a, "场景A: 仅新报价")
    except Exception as e:
        print(f"  ❌ 场景A失败: {e}")

    # ═══════════════════════════════════════════════════
    # 场景 B: 全部历史 + 新报价
    # ═══════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("  场景 B: 全部历史 + 新报价（固定油价=21,170）")
    print("=" * 70)
    all_samples_b = historical_deduped + all_new
    try:
        result_b = fit_rates(all_samples_b, fixed_fuel_price_vnd=21170)
        print_calibration_report(result_b, "场景B: 全部历史+新报价 (fixed fuel)")
    except Exception as e:
        print(f"  ❌ 场景B失败: {e}")

    # ═══════════════════════════════════════════════════
    # 场景 C: 仅 Hữu Nghị 边境样本 + 新报价
    # ═══════════════════════════════════════════════════
    fpath = base_dir / "samples_HuuNghi_border.json"
    if fpath.exists():
        print("\n" + "=" * 70)
        print("  场景 C: 仅 Hữu Nghị 边境历史 + 新报价（固定油价=21,170）")
        print("=" * 70)
        huu_nghi_hist = load_historical_samples(str(fpath))
        all_c = huu_nghi_hist + all_new
        try:
            result_c = fit_rates(all_c, fixed_fuel_price_vnd=21170)
            print_calibration_report(result_c, "场景C: HữuNghị+新报价 (fixed fuel)")
        except Exception as e:
            print(f"  ❌ 场景C失败: {e}")

    # ═══════════════════════════════════════════════════
    # 场景 D: 按车型分组独立校准
    # ═══════════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("  场景 D: 按车型分组独立校准（新报价，固定油价=21,170）")
    print("=" * 70)

    for group_label, group_samples in [("Sàn/Rào → flatbed_12m5", samples_san_rao),
                                        ("Fooc → container_40ft", samples_fooc)]:
        if not group_samples:
            continue
        try:
            result_d = fit_rates(group_samples, fixed_fuel_price_vnd=21170)
            print_calibration_report(result_d, f"场景D: {group_label}")
        except Exception as e:
            print(f"  ❌ {group_label}: {e}")

    # ═══════════════════════════════════════════════════
    # 5. 输出推荐值
    # ═══════════════════════════════════════════════════
    if 'result_b' in dir():
        print("\n" + "=" * 70)
        print("  📋 优化建议（基于场景B：全部历史+新报价）")
        print("=" * 70)
        print(f"\n  当前车型 CSV 建议更新:")
        for vid, rate in sorted(result_b.base_rate_vnd_per_km.items()):
            model = get_model(vid)
            current = model.base_rate_vnd_per_km if model else 0
            n = result_b.samples_per_vehicle.get(vid, 0)
            if n >= 2:  # 至少2个样本才建议
                pct = (rate - current) / current * 100 if current else 0
                confidence = "高" if n >= 5 else "中" if n >= 3 else "低"
                print(f"    {vid}: {current:,.0f} → {rate:,.0f}  ({pct:+.1f}%)  [{n}样本, 置信度:{confidence}]")


if __name__ == "__main__":
    run_all_calibrations()
