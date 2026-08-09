"""四约束车辆数公式专项验证：
① 重量约束 ② 体积约束 ③ 长件约束 ④ 面积约束
直接运行: python tests/test_vehicle_count.py（独立脚本，不参与 pytest 收集）
"""
import sys
sys.path.insert(0, r"D:\01_业务\玖能\OSRM\OSRM++\backend")

from app.services import 费用计算公式 as 公式
from app.services.cost_engine import compute_vehicle_count, match_consolidated_model
from app.services.vehicle_registry import get_model

passed = 0
failed = 0

def check(name, actual, expected):
    global passed, failed
    ok = actual == expected
    status = "✓" if ok else f"✗ (期望 {expected}, 实际 {actual})"
    print(f"{status} {name}")
    if ok: passed += 1
    else: failed += 1

# ============ 测试 1：重量约束 ============
# 高栏18t 运 40t → 3 车（ceil(40/18)=3）
m = get_model("high_side_18t")
check("① 重量: 40t/高栏18t → 3车", compute_vehicle_count(model=m, cargo_weight_ton=40), 3)
check("① 重量: 10t/高栏18t → 1车", compute_vehicle_count(model=m, cargo_weight_ton=10), 1)

# ============ 测试 2：体积约束 ============
# container_40hc 容积76m³×0.9效率=68.4m³；运 140m³ → ceil(140/68.4)=3
m = get_model("container_40hc")
check("② 体积: 140m³/40HC(76×0.9=68.4) → 3车", compute_vehicle_count(model=m, cargo_weight_ton=10, cargo_volume_m3=140), 3)
check("② 体积: 60m³/40HC → 1车", compute_vehicle_count(model=m, cargo_weight_ton=10, cargo_volume_m3=60), 1)

# ============ 测试 3：长件约束（核心新增）============
# 9m 管道 3t：重量/体积都满足 6.2m 小卡，但 9m > 6.2m → 2 车
m = get_model("flatbed_6m2")
items_9m = [{"count": 1, "length_m": 9.0, "width_m": 2.0, "height_m": 1.0, "weight_kg": 3000, "stackable": False}]
check("③ 长件: 9m管/6.2m平板 → 2车 (重量体积都够但长度不够)", compute_vehicle_count(model=m, cargo_weight_ton=3, cargo_volume_m3=18, cargo_items=items_9m), 2)

# 17.5m 低平板：9m 管 1 车
m = get_model("flatbed_low_17m5")
check("③ 长件: 9m管/17.5m低平板 → 1车", compute_vehicle_count(model=m, cargo_weight_ton=3, cargo_volume_m3=18, cargo_items=items_9m), 1)

# 12m 管 vs 13m 平板 → 1 车（恰好放下）
m = get_model("flatbed_13m")
items_12m = [{"count": 1, "length_m": 12.0, "width_m": 2.0, "height_m": 1.0, "weight_kg": 5000, "stackable": False}]
check("③ 长件: 12m管/13m平板 → 1车", compute_vehicle_count(model=m, cargo_weight_ton=5, cargo_volume_m3=24, cargo_items=items_12m), 1)

# 14m 管 vs 13m 平板 → 2 车
items_14m = [{"count": 1, "length_m": 14.0, "width_m": 2.0, "height_m": 1.0, "weight_kg": 5000, "stackable": False}]
check("③ 长件: 14m管/13m平板 → 2车", compute_vehicle_count(model=m, cargo_weight_ton=5, cargo_volume_m3=28, cargo_items=items_14m), 2)

# ============ 测试 4：面积约束（不可堆叠）============
# 4 台不可堆叠设备 3×2m → 占地 24m²；13m平板面积 32.5×0.85=27.6 → 1车
m = get_model("flatbed_13m")
items_4_dev = [{"count": 4, "length_m": 3.0, "width_m": 2.0, "height_m": 1.5, "weight_kg": 3000, "stackable": False}]
check("④ 面积: 4台3×2m设备(24m²)/13m平板(27.6m²有效) → 1车", compute_vehicle_count(model=m, cargo_weight_ton=12, cargo_volume_m3=36, cargo_items=items_4_dev), 1)

# 6 台设备 → 36m² > 27.6m² → 2车
items_6_dev = [{"count": 6, "length_m": 3.0, "width_m": 2.0, "height_m": 1.5, "weight_kg": 3000, "stackable": False}]
check("④ 面积: 6台3×2m设备(36m²)/13m平板(27.6m²有效) → 2车", compute_vehicle_count(model=m, cargo_weight_ton=18, cargo_volume_m3=54, cargo_items=items_6_dev), 2)

# 可堆叠件不占面积约束：20 个 1.2×0.8×0.6 箱子（可堆叠）→ 只看体积
m = get_model("high_side_18t")
items_boxes = [{"count": 20, "length_m": 1.2, "width_m": 0.8, "height_m": 0.6, "weight_kg": 350, "stackable": True}]
# 体积 = 20×1.2×0.8×0.6 = 11.5m³ < 55×0.9=49.5m³ → 1车
check("④ 可堆叠: 20箱(11.5m³)/高栏18t → 1车", compute_vehicle_count(model=m, cargo_weight_ton=7, cargo_volume_m3=11.5, cargo_items=items_boxes), 1)

# ============ 测试 5：多约束组合 ============
# 40t 变压器（8×2.5×3.2m，不可堆叠）用 17.5m 低平板（载重38t）
# ① 重量: ceil(40/38)=2  ② 体积: 8×2.5×3.2=64m³ < 157.5×0.85=133.9 → 1
# ③ 长度: 8m < 17.5m → 1  ④ 面积: 20m² < 52.5×0.85=44.6 → 1
# → 2 车
m = get_model("flatbed_low_17m5")
items_transformer = [{"name": "变压器", "count": 1, "length_m": 8.0, "width_m": 2.5, "height_m": 3.2, "weight_kg": 40000, "stackable": False}]
check("组合: 40t变压器/17.5m低平板 → 2车", compute_vehicle_count(model=m, cargo_weight_ton=40, cargo_volume_m3=64, cargo_items=items_transformer), 2)

# ============ 测试 6：无 items → Level 1 回退 ============
m = get_model("high_side_18t")
check("回退: 40t 无明细 → 3车 (纯重量)", compute_vehicle_count(model=m, cargo_weight_ton=40), 3)
check("回退: 30t 无明细 → 2车", compute_vehicle_count(model=m, cargo_weight_ton=30), 2)

# ============ 测试 7：拼货匹配长件排除 ============
# 9m 长件拼货 → 小卡/高栏(≤9.6m)/平板候选；但 6.2m 平板应被排除
# 直接验证候选过滤逻辑
max_len, footprint = 公式.货物载荷特征(
    货物总重量吨=3, 货物总体积立方米=18, 单件货物=items_9m)
print(f"\n载荷特征: 最大单件长={max_len}m, 占地={footprint}m²")
m62 = get_model("flatbed_6m2")
allowed_62 = (max_len is None or m62.length_m is None or max_len <= m62.length_m)
check("拼货排除: 9m件 vs 6.2m平板 → 不允许", not allowed_62, True)

print(f"\n===== 结果: {passed} 通过, {failed} 失败 =====")
sys.exit(1 if failed else 0)
