import pytest

from app.services import cost_engine
from app.services import 费用计算公式 as 公式
from app.services.cost_engine import (
    NoFittingVehicleModel,
    UnknownCargoType,
    UnknownVehicleModel,
    compute_cost_consolidated,
    compute_cost_full_truck,
)
from app.services.vehicle_registry import VehicleModel

DEFAULT_KWARGS = dict(
    loading_rate_vnd_per_ton=50000.0,
    insurance_rate=0.003,
)

# 测试用固定车型库——不用真实 CSV（那份数据用户会在 Excel 里手工调整，测试断言
# 不该绑死在会被改动的具体数字上），用 monkeypatch 替换 cost_engine 里实际用到的
# VEHICLE_MODELS/get_model，保证测试跟 CSV 内容解耦、可重复。
SMALL = VehicleModel(
    category="small_box", model_id="test_small", display_name="测试小车",
    max_load_ton=3.5, volume_capacity_m3=15.0, length_m=None, width_m=None, height_m=None,
    base_rate_vnd_per_km=17000, fuel_l_per_100km=8.0, fuel_penalty=0.0, fixed_surcharge_vnd=0.0,
    toll_rate_vnd_per_km=0.0, osrm_profile="driving", suitable_cargo_types=("normal", "other"), notes="",
)
COLD = VehicleModel(
    category="cold_chain", model_id="test_cold", display_name="测试冷链车",
    max_load_ton=3.5, volume_capacity_m3=15.0, length_m=None, width_m=None, height_m=None,
    base_rate_vnd_per_km=22000, fuel_l_per_100km=10.0, fuel_penalty=0.25, fixed_surcharge_vnd=200000.0,
    toll_rate_vnd_per_km=0.0, osrm_profile="truck", suitable_cargo_types=("cold_chain",), notes="",
)
FLATBED = VehicleModel(
    category="flatbed", model_id="test_flatbed", display_name="测试平板车",
    max_load_ton=10.0, volume_capacity_m3=None, length_m=None, width_m=None, height_m=None,
    base_rate_vnd_per_km=27000, fuel_l_per_100km=17.0, fuel_penalty=0.0, fixed_surcharge_vnd=0.0,
    toll_rate_vnd_per_km=0.0, osrm_profile="truck", suitable_cargo_types=("oversized", "normal", "other"), notes="",
)
# 明显"性价比差"的大车——费率涨幅超过运力涨幅，保证不会被拼货自动匹配误选中
BIG = VehicleModel(
    category="container", model_id="test_big", display_name="测试大车",
    max_load_ton=25.0, volume_capacity_m3=80.0, length_m=None, width_m=None, height_m=None,
    base_rate_vnd_per_km=200000, fuel_l_per_100km=40.0, fuel_penalty=0.0, fixed_surcharge_vnd=0.0,
    toll_rate_vnd_per_km=0.0, osrm_profile="truck", suitable_cargo_types=("normal", "other"), notes="",
)
TEST_REGISTRY = [SMALL, COLD, FLATBED, BIG]


@pytest.fixture(autouse=True)
def _patch_registry(monkeypatch):
    monkeypatch.setattr(cost_engine, "VEHICLE_MODELS", TEST_REGISTRY)
    index = {m.model_id: m for m in TEST_REGISTRY}
    monkeypatch.setattr(cost_engine, "get_model", lambda model_id: index.get(model_id))


# ============================== 整车（full_truck）模式 ==============================


def test_light_load_no_rest_no_loading():
    result = compute_cost_full_truck(
        distance_m=100_000,
        duration_s=3600 * 2,
        cargo_weight_ton=1.0,
        vehicle_model_id="test_small",
        fuel_price_vnd=24500,
        wage_hourly_vnd=180000,
        **DEFAULT_KWARGS,
    )

    assert result.distance_km == 100
    assert result.timing.speed_factor == 1.0
    assert result.timing.adjusted_duration_h == pytest.approx(2.0)
    assert result.timing.rest_hours == 0
    assert result.timing.loading_hours == 0
    assert result.timing.total_duration_h == pytest.approx(2.0)

    b = result.breakdown
    assert b.capacity_ratio == pytest.approx(1.0)
    assert b.matched_vehicle_model_id == "test_small"
    # 整车模式：cost_time/cost_fuel 填 0（全包费率已隐含时间+油耗成本）
    assert b.cost_distance == pytest.approx(1_700_000)
    assert b.cost_time == pytest.approx(0.0)
    assert b.cost_fuel == pytest.approx(0.0)
    assert b.cost_fixed == pytest.approx(0)
    assert b.cost_total == pytest.approx(1_700_000)
    assert b.cost_per_km == pytest.approx(17_000)
    assert b.cost_per_ton_km == pytest.approx(17_000)


def test_heavy_load_cold_chain_empty_return_with_loading_and_insurance():
    result = compute_cost_full_truck(
        distance_m=200_000,
        duration_s=3600 * 5,
        cargo_weight_ton=9.0,
        vehicle_model_id="test_flatbed",
        cargo_type="cold_chain",
        empty_return=True,
        need_loading=True,
        fuel_price_vnd=24500,
        wage_hourly_vnd=180000,
        cargo_value_vnd=100_000_000,
        toll_rate_vnd_per_km=1000,
        misc_cost_vnd=50_000,
        **DEFAULT_KWARGS,
    )

    # load_ratio = 9/10 = 0.9 -> 重载档 speed_factor=1.25
    assert result.timing.speed_factor == 1.25
    assert result.timing.adjusted_duration_h == pytest.approx(6.25)
    assert result.timing.rest_hours == pytest.approx(0.5)
    assert result.timing.loading_hours == pytest.approx(4.5)
    assert result.timing.total_duration_h == pytest.approx(11.25)

    b = result.breakdown
    # 整车模式：cost_time/cost_fuel 填 0；装卸费=固定调度费(flatbed=0)
    assert b.cost_distance == pytest.approx(10_530_000)
    assert b.cost_time == pytest.approx(0.0)
    assert b.cost_fuel == pytest.approx(0.0)
    assert b.cost_loading == pytest.approx(0)  # flatbed fixed_surcharge=0
    assert b.cost_insurance == pytest.approx(300_000)
    assert b.cost_toll == pytest.approx(200_000)
    assert b.cost_misc == pytest.approx(50_000)
    # cost_fixed = toll(200k) + loading(0) + insurance(300k) + misc(50k) = 550k
    assert b.cost_fixed == pytest.approx(550_000)
    # cost_total = distance(10.53M) + time(0) + fuel(0) + fixed(550k)
    assert b.cost_total == pytest.approx(11_080_000)
    assert b.cost_per_km == pytest.approx(55_400)
    assert b.cost_per_ton_km == pytest.approx(11_080_000 / (200 * 9), rel=1e-4)

    assert any(s["code"] == "heavy_load" for s in result.suggestions)


def test_overnight_rest_when_adjusted_duration_over_8_hours():
    result = compute_cost_full_truck(
        distance_m=500_000,
        duration_s=3600 * 10,
        cargo_weight_ton=0.5,  # ratio 0.5/3.5 = 0.14 -> speed_factor 1.0
        vehicle_model_id="test_small",
        fuel_price_vnd=24500,
        wage_hourly_vnd=180000,
        **DEFAULT_KWARGS,
    )

    assert result.timing.adjusted_duration_h == pytest.approx(10.0)
    # 每4小时+0.5(两次=1.0) + 超过8小时的过夜+8 = 9.0
    assert result.timing.rest_hours == pytest.approx(9.0)
    assert result.timing.total_duration_h == pytest.approx(19.0)
    assert any(s["code"] == "overnight_rest" for s in result.suggestions)


def test_unknown_vehicle_model_raises():
    with pytest.raises(UnknownVehicleModel):
        compute_cost_full_truck(
            distance_m=1000,
            duration_s=60,
            cargo_weight_ton=1,
            vehicle_model_id="spaceship",
            fuel_price_vnd=24500,
            wage_hourly_vnd=180000,
            **DEFAULT_KWARGS,
        )


def test_unknown_cargo_type_raises():
    with pytest.raises(UnknownCargoType):
        compute_cost_full_truck(
            distance_m=1000,
            duration_s=60,
            cargo_weight_ton=1,
            vehicle_model_id="test_small",
            cargo_type="antimatter",
            fuel_price_vnd=24500,
            wage_hourly_vnd=180000,
            **DEFAULT_KWARGS,
        )


def test_cold_chain_model_adds_fuel_penalty_and_surcharge_and_no_mismatch_suggestion():
    result = compute_cost_full_truck(
        distance_m=100_000,
        duration_s=3600 * 2,
        cargo_weight_ton=1.0,
        vehicle_model_id="test_cold",
        cargo_type="cold_chain",
        fuel_price_vnd=24500,
        wage_hourly_vnd=180000,
        **DEFAULT_KWARGS,
    )

    # 货物类型系数(1.3)——车型不再有独立的系数，差异已经体现在具体车型的费率数字里
    assert result.breakdown.cost_distance == pytest.approx(100 * 22000 * 1.3)
    # 整车模式 cost_fuel = 0（全包费率已隐含油耗）
    assert result.breakdown.cost_fuel == pytest.approx(0.0)
    assert result.breakdown.cost_body_surcharge == pytest.approx(200_000)
    assert not any(s["code"] == "mismatched_cargo" for s in result.suggestions)


def test_mismatched_model_for_cargo_triggers_suggestion():
    result = compute_cost_full_truck(
        distance_m=100_000,
        duration_s=3600 * 2,
        cargo_weight_ton=1.0,
        vehicle_model_id="test_small",
        cargo_type="cold_chain",
        fuel_price_vnd=24500,
        wage_hourly_vnd=180000,
        **DEFAULT_KWARGS,
    )

    assert result.breakdown.cost_body_surcharge == pytest.approx(0)
    assert any(s["code"] == "mismatched_cargo" for s in result.suggestions)


def test_route_condition_surcharges_flag_off_zero_flag_on_base_times_multiplier():
    result_off = compute_cost_full_truck(
        distance_m=100_000,
        duration_s=3600 * 2,
        cargo_weight_ton=1.0,
        vehicle_model_id="test_small",
        fuel_price_vnd=24500,
        wage_hourly_vnd=180000,
        **DEFAULT_KWARGS,
    )
    assert result_off.breakdown.cost_restricted_zone == pytest.approx(0)
    assert result_off.breakdown.cost_construction_zone == pytest.approx(0)
    assert result_off.breakdown.cost_mountain_road == pytest.approx(0)

    # cargo_type=hazardous(1.5)，车型不再叠加系数
    # 2026-07-16: 三项基础费归零 (v1.2)，开启时费用也为 0
    result_on = compute_cost_full_truck(
        distance_m=100_000,
        duration_s=3600 * 2,
        cargo_weight_ton=1.0,
        vehicle_model_id="test_small",
        cargo_type="hazardous",
        avoid_restricted_zones=True,
        avoid_construction_zones=True,
        via_mountain_road=True,
        fuel_price_vnd=24500,
        wage_hourly_vnd=180000,
        **DEFAULT_KWARGS,
    )
    assert result_on.breakdown.cost_restricted_zone == pytest.approx(0)
    assert result_on.breakdown.cost_construction_zone == pytest.approx(0)
    assert result_on.breakdown.cost_mountain_road == pytest.approx(0)
    # 公式函数本身（禁限行绕行费/施工封闭绕行费/上坡山区附加费）在基础费非零时正常计算，
    # 此处用硬编码基础费验证函数逻辑不会被破坏：
    from app.services.费用计算公式 import 禁限行绕行费, 施工封闭绕行费, 上坡山区附加费
    assert 禁限行绕行费(150_000, 1.5, True) == pytest.approx(225_000)
    assert 施工封闭绕行费(150_000, 1.5, True) == pytest.approx(225_000)
    assert 上坡山区附加费(200_000, 1.5, True) == pytest.approx(300_000)
    codes = {s["code"] for s in result_on.suggestions}
    assert "restricted_zone" in codes
    assert "construction_zone" in codes
    assert "mountain_road" in codes


# ============================== 拼货（consolidated）模式 ==============================


def test_容量占比_uses_weight_ratio_only_when_volume_capacity_missing():
    # 平板车没有厢体容积上限，容量占比只看重量比
    assert 公式.容量占比(2.5, 5.0, 10.0, None) == pytest.approx(0.25)


def test_容量占比_takes_the_larger_of_weight_and_volume_ratio():
    assert 公式.容量占比(2.5, 5.0, 3.5, 15.0) == pytest.approx(2.5 / 3.5)  # 重量比(0.714) > 体积比(0.333)
    assert 公式.容量占比(1.0, 12.0, 10.0, 15.0) == pytest.approx(12.0 / 15.0)  # 体积比(0.8) > 重量比(0.1)


def test_consolidated_auto_match_picks_cheapest_candidate_and_scales_shareable_costs():
    # 2.5吨/5m3：SMALL/COLD/FLATBED/BIG 都装得下，手算过 FLATBED（费率虽高但容量占比最低，
    # 且没有体积上限只看重量比）总价最低，应该被自动匹配选中
    result = compute_cost_consolidated(
        distance_m=100_000,
        duration_s=3600 * 2,
        cargo_weight_ton=2.5,
        cargo_volume_m3=5.0,
        fuel_price_vnd=24500,
        wage_hourly_vnd=180000,
        **DEFAULT_KWARGS,
    )

    b = result.breakdown
    assert b.matched_vehicle_model_id == "test_flatbed"
    assert b.capacity_ratio == pytest.approx(0.25)  # 纯重量比：2.5/10
    assert b.cost_distance == pytest.approx(675_000)  # 100*27000*0.25
    assert b.cost_time == pytest.approx(90_000)  # 2.0h*180000*0.25
    assert b.cost_fuel == pytest.approx(104_125)
    assert b.cost_total == pytest.approx(869_125)
    # 最后一条建议是拼货自动匹配车型提示
    last = result.suggestions[-1]
    assert last["code"] == "consolidated_match"
    assert "测试平板车" in last["params"]["modelName"]
    assert "25%" in last["params"]["capacityPct"]


def test_consolidated_dedicated_costs_not_scaled_by_capacity_ratio():
    # 本单专属费用（装卸费/保险费）不能被 capacity_ratio 打折
    result = compute_cost_consolidated(
        distance_m=100_000,
        duration_s=3600 * 2,
        cargo_weight_ton=2.5,
        cargo_volume_m3=5.0,
        need_loading=True,
        cargo_value_vnd=10_000_000,
        fuel_price_vnd=24500,
        wage_hourly_vnd=180000,
        **DEFAULT_KWARGS,
    )
    b = result.breakdown
    assert b.capacity_ratio < 1.0  # 确认这条样本确实打了折扣（不是恰好=1的退化情况）
    assert b.cost_loading == pytest.approx(2.5 * 50000)  # 全额，不乘 ratio
    assert b.cost_insurance == pytest.approx(10_000_000 * 0.003)  # 全额，不乘 ratio


def test_consolidated_no_fitting_model_raises():
    with pytest.raises(NoFittingVehicleModel, match="没有能装下"):
        compute_cost_consolidated(
            distance_m=100_000,
            duration_s=3600 * 2,
            cargo_weight_ton=999,
            cargo_volume_m3=999,
            fuel_price_vnd=24500,
            wage_hourly_vnd=180000,
            **DEFAULT_KWARGS,
        )
