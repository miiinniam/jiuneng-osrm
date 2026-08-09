"""API 集成测试：POST /api/v1/route/cost 带 items 单件明细的车辆数计算。
使用 TestClient，不依赖真实 OSRM（用 monkeypatch 模拟路线结果）。
"""
import sys
sys.path.insert(0, r"D:\01_业务\玖能\OSRM\OSRM++\backend")

from fastapi.testclient import TestClient
from app.main import app
from app.services import osrm_client
from app.services.osrm_client import RouteResult

# 模拟 OSRM 返回：河内→海防 150km
async def fake_get_route(self, coords, **kw):
    return RouteResult(
        distance_m=150000,
        duration_s=9000,
        geometry={"type": "LineString", "coordinates": coords},
        fallback=False,
    )
osrm_client.OSRMClient.get_route = fake_get_route

client = TestClient(app)

def post_quote(payload):
    r = client.post("/api/v1/route/cost", json=payload)
    return r.status_code, r.json()

passed = 0
failed = 0
def check(name, cond, extra=""):
    global passed, failed
    if cond:
        print(f"✓ {name}")
        passed += 1
    else:
        print(f"✗ {name} {extra}")
        failed += 1

# ===== 场景 1：9m 管道 3t，选 6.2m 平板 → 应拆分 2 车 =====
payload = {
    "route": {"origin": {"lat": 21.02, "lng": 105.85}, "destination": {"lat": 20.85, "lng": 106.68}},
    "cargo": {
        "weight_kg": 3000,
        "volume_m3": 18,
        "type": "normal",
        "items": [{"name": "管道", "count": 1, "length_m": 9.0, "width_m": 2.0, "height_m": 1.0, "weight_kg": 3000, "stackable": False}],
    },
    "vehicle": {"loading_mode": "full_truck", "vehicle_model_id": "flatbed_6m2"},
}
code, data = post_quote(payload)
check("场景1: 200 状态码", code == 200, f"code={code} data={data}")
if code == 200:
    check("场景1: 9m管/6.2m平板 → vehicle_count=2", data["vehicle_count"] == 2, f"count={data['vehicle_count']}")
    check("场景1: cost_per_vehicle 存在", data["breakdown"]["cost_per_vehicle"] is not None)
    check("场景1: 总价 = 单车×2", 
          abs(data["breakdown"]["cost_total"] - data["breakdown"]["cost_per_vehicle"] * 2) < 1)

# ===== 场景 2：同 9m 管道，选 17.5m 低平板 → 1 车 =====
payload["vehicle"]["vehicle_model_id"] = "flatbed_low_17m5"
code, data = post_quote(payload)
check("场景2: 17.5m平板 → vehicle_count=1", code == 200 and data["vehicle_count"] == 1, f"code={code} data={data}")

# ===== 场景 3：40t 变压器 → 2 车 =====
payload = {
    "route": {"origin": {"lat": 21.02, "lng": 105.85}, "destination": {"lat": 20.85, "lng": 106.68}},
    "cargo": {
        "weight_kg": 40000,
        "volume_m3": 64,
        "type": "heavy_equipment",
        "items": [{"name": "变压器", "count": 1, "length_m": 8.0, "width_m": 2.5, "height_m": 3.2, "weight_kg": 40000, "stackable": False}],
    },
    "vehicle": {"loading_mode": "full_truck", "vehicle_model_id": "flatbed_low_17m5"},
}
code, data = post_quote(payload)
check("场景3: 40t变压器/17.5m → vehicle_count=2", code == 200 and data["vehicle_count"] == 2, f"code={code} data={data}")

# ===== 场景 4：无 items（Level 1 回退）→ 30t 高栏18t = 2 车 =====
payload = {
    "route": {"origin": {"lat": 21.02, "lng": 105.85}, "destination": {"lat": 20.85, "lng": 106.68}},
    "cargo": {"weight_kg": 30000, "volume_m3": 40, "type": "normal"},
    "vehicle": {"loading_mode": "full_truck", "vehicle_model_id": "high_side_18t"},
}
code, data = post_quote(payload)
check("场景4: 30t 无明细/高栏18t → vehicle_count=2", code == 200 and data["vehicle_count"] == 2, f"code={code} data={data}")

# ===== 场景 5：拼货模式带 items（长件排除小卡）=====
payload = {
    "route": {"origin": {"lat": 21.02, "lng": 105.85}, "destination": {"lat": 20.85, "lng": 106.68}},
    "cargo": {
        "weight_kg": 3000,
        "volume_m3": 18,
        "type": "normal",
        "items": [{"name": "管道", "count": 1, "length_m": 9.0, "width_m": 2.0, "height_m": 1.0, "weight_kg": 3000, "stackable": False}],
    },
    "vehicle": {"loading_mode": "consolidated"},
}
code, data = post_quote(payload)
check("场景5: 拼货9m管 → 200 且匹配车型地板长≥9m", code == 200, f"code={code} data={data}")
if code == 200:
    matched = data["breakdown"]["matched_vehicle_model_id"]
    # 匹配到的车型长度必须 >= 9m
    from app.services.vehicle_registry import get_model
    mm = get_model(matched)
    check(f"场景5: 匹配车型 {matched} 长度 {mm.length_m} ≥ 9m", mm.length_m is not None and mm.length_m >= 9.0, f"matched={matched} len={mm.length_m}")

# ===== 场景 6：拼货超重 → 422 =====
payload["cargo"]["weight_kg"] = 50000
payload["cargo"]["volume_m3"] = 80
code, data = post_quote(payload)
check("场景6: 拼货 50t 无车型装得下 → 422", code == 422, f"code={code}")

print(f"\n===== API 测试: {passed} 通过, {failed} 失败 =====")
sys.exit(1 if failed else 0)
