"""CSV 载荷能力补全脚本 v2：
1. 修复 notes 列裸逗号导致的解析错位（丢弃 None 键，写回时自动加引号）
2. 新增列 max_cargo_height_m（货物最大堆高）与 loading_efficiency（装载效率）
3. 统一厢式车容积口径：volume_capacity_m3 = length × width × 内部可用高度
4. 平板车补堆高（普通 3.0m / 低平板 3.2m，受道路限高 4.2m - 车架高度约束）
5. 冷柜 height_m 改为内部可用高度，使 L×W×H 与容积一致
"""
import csv
from pathlib import Path

CSV_PATH = Path(r"D:\01_业务\玖能\OSRM\OSRM++\车辆型号库\车辆型号库.csv")
BAK_PATH = CSV_PATH.with_suffix(".csv.bak")

# 装载效率系数（按大类）
EFFICIENCY = {
    "small_box": 0.90,   # 厢式小卡，规则货箱
    "flatbed":   0.85,   # 平板车，绑扎间隙大
    "high_side": 0.90,   # 高栏车
    "container": 0.90,   # 集装箱
    "cold_chain": 0.85,  # 冷柜，制冷风道占空间
}

# 最大堆高（米）：道路限高4.2m - 车架高度
MAX_CARGO_HEIGHT = {
    "flatbed": 3.0,      # 普通平板货台 ~1.2m
    "flatbed_low": 3.2,  # 低平板货台 ~0.9m（但通常运超限设备，保守取 3.2）
}

def main():
    if not BAK_PATH.exists():
        BAK_PATH.write_bytes(CSV_PATH.read_bytes())
        print(f"备份: {BAK_PATH.name}")

    with CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames)
        rows = []
        for row in reader:
            # 丢弃因 notes 裸逗号产生的多余列
            if None in row:
                print(f"  [清理] {row.get('model_id','?')}: 丢弃多余列 {row[None]}")
                del row[None]
            rows.append(row)

    # 追加新列（若不存在）
    for col in ("max_cargo_height_m", "loading_efficiency"):
        if col not in fieldnames:
            fieldnames.append(col)

    changes = []
    for row in rows:
        cat = row["category"]
        L = float(row["length_m"]) if row["length_m"] else None
        W = float(row["width_m"]) if row["width_m"] else None
        H = float(row["height_m"]) if row["height_m"] else None
        V = float(row["volume_capacity_m3"]) if row["volume_capacity_m3"] else None

        # 1) 装载效率
        eff = EFFICIENCY.get(cat, 0.90)
        if not row.get("loading_efficiency", "").strip():
            row["loading_efficiency"] = f"{eff:.2f}"
            changes.append(f"{row['model_id']}: loading_efficiency={eff}")

        # 2) 最大堆高
        if not row.get("max_cargo_height_m", "").strip():
            if cat in MAX_CARGO_HEIGHT:
                h = MAX_CARGO_HEIGHT[cat]
                row["max_cargo_height_m"] = f"{h}"
                changes.append(f"{row['model_id']}: max_cargo_height={h}m ({cat})")
            elif H:
                row["max_cargo_height_m"] = f"{H}"
                # 厢式车：确保容积 = L×W×H（若 L/W/H 都在）
                if L and W:
                    vol_calc = round(L * W * H, 1)
                    if V is None:
                        row["volume_capacity_m3"] = f"{vol_calc}"
                        changes.append(f"{row['model_id']}: 补容积 {vol_calc}m³")
                    elif abs(vol_calc - V) / V > 0.05:
                        old = row["volume_capacity_m3"]
                        row["volume_capacity_m3"] = f"{vol_calc}"
                        changes.append(
                            f"{row['model_id']}: 容积口径统一 {old}→{vol_calc} (L×W×H={L}×{W}×{H})"
                        )

        # 3) 冷柜特殊处理：height_m 是外部含制冷机组，改为内部可用高度
        if cat == "cold_chain" and L and W and V:
            inner_h = round(V / (L * W), 2)
            old_h = row["height_m"]
            row["height_m"] = f"{inner_h}"
            if abs(float(old_h) - inner_h) > 0.05:
                changes.append(
                    f"{row['model_id']}: 冷柜内高 {old_h}→{inner_h}m (L×W×内高={round(L*W*inner_h,1)}={V})"
                )

    # 写回（csv 模块自动为含逗号的字段加引号）
    with CSV_PATH.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n完成: {len(changes)} 处变更")
    for c in changes:
        print(f"  - {c}")

    # 验证
    print("\n=== 验证（容积=长×宽×内高 自洽性）===")
    with CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            L = float(row["length_m"]) if row["length_m"] else 0
            W = float(row["width_m"]) if row["width_m"] else 0
            H = float(row["height_m"]) if row["height_m"] else 0
            V = float(row["volume_capacity_m3"]) if row["volume_capacity_m3"] else 0
            MH = float(row.get("max_cargo_height_m", 0) or 0)
            eff = row.get("loading_efficiency", "-")
            if V:
                ok = "✓" if abs(L*W*H - V) / V < 0.05 else f"✗({abs(L*W*H-V)/V*100:.0f}%)"
            else:
                ok = "平板(容积=面积×堆高)"
            print(f"{row['model_id']:26s} 载重{row['max_load_ton']:>5s}t 容积{V:>6.1f} "
                  f"内高{H:>5.2f} 堆高{MH:>4.1f} 效率{eff:>4s} {ok}")

if __name__ == "__main__":
    main()
