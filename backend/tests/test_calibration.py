import numpy as np
import pytest

from app.services import calibration
from app.services.calibration import (
    CalibrationError,
    ResolvedSample,
    _design_row,
    fit_rates,
)
from app.services.vehicle_registry import VehicleModel

LIGHT = VehicleModel(
    category="small_box", model_id="light_truck", display_name="轻卡",
    max_load_ton=3.5, volume_capacity_m3=15.0, length_m=None, width_m=None, height_m=None,
    base_rate_vnd_per_km=0.0, fuel_l_per_100km=8.0, fuel_penalty=0.0, fixed_surcharge_vnd=0.0,
    toll_rate_vnd_per_km=0.0, osrm_profile="driving", suitable_cargo_types=("normal", "other"), notes="",
)
HEAVY = VehicleModel(
    category="high_side", model_id="heavy_truck", display_name="重卡",
    max_load_ton=25.0, volume_capacity_m3=55.0, length_m=None, width_m=None, height_m=None,
    base_rate_vnd_per_km=0.0, fuel_l_per_100km=35.0, fuel_penalty=0.0, fixed_surcharge_vnd=0.0,
    toll_rate_vnd_per_km=0.0, osrm_profile="truck", suitable_cargo_types=("normal", "other"), notes="",
)
TEST_MODELS = {"light_truck": LIGHT, "heavy_truck": HEAVY}


@pytest.fixture(autouse=True)
def _patch_registry(monkeypatch):
    monkeypatch.setattr(calibration, "get_model", lambda model_id: TEST_MODELS.get(model_id))


def _make_sample(
    vehicle_model_id, distance_m, duration_s, weight_kg, solution, vehicle_index, num_unknowns,
    loading_mode="full_truck", volume_m3=None, capacity_ratio=1.0, **kwargs,
):
    """反向构造一条"完美符合模型"的样本：先用 actual_cost=0 拿到设计矩阵行和 b0=-固定费用，
    再用已知的真实系数算出对应的 actual_cost，这样样本就是这套公式在这组参数下应该产生的结果。
    """
    placeholder = ResolvedSample(
        loading_mode=loading_mode, vehicle_model_id=vehicle_model_id, weight_kg=weight_kg, actual_cost_vnd=0.0,
        distance_m=distance_m, duration_s=duration_s, volume_m3=volume_m3, capacity_ratio=capacity_ratio, **kwargs,
    )
    row, b0 = calibration._design_row(placeholder, vehicle_index, num_unknowns, capacity_ratio=capacity_ratio)
    fixed_known = -b0
    actual_cost = float(row @ solution) + fixed_known
    return ResolvedSample(
        loading_mode=loading_mode, vehicle_model_id=vehicle_model_id, weight_kg=weight_kg, actual_cost_vnd=actual_cost,
        distance_m=distance_m, duration_s=duration_s, volume_m3=volume_m3, capacity_ratio=capacity_ratio, **kwargs,
    )


# ============================== 整车（full_truck）round-trip ==============================


def test_fit_recovers_known_rates_for_single_vehicle_type():
    vehicle_index = {"light_truck": 0}
    num_unknowns = 3  # R_base(light_truck) + R_wage + P_fuel
    # 整车模式 fit_rates 强制使用 config 默认油价/时薪,
    # 所以 true_solution 的 R_wage/P_fuel 必须与 config 一致
    from app.config import settings
    true_solution = np.array([5500.0, settings.default_wage_hourly_vnd, settings.default_fuel_price_vnd])

    samples = [
        _make_sample("light_truck", 50_000, 3600 * 1, 1000, true_solution, vehicle_index, num_unknowns),
        _make_sample("light_truck", 120_000, 3600 * 2, 2500, true_solution, vehicle_index, num_unknowns),
        _make_sample(
            "light_truck", 200_000, 3600 * 4, 3000, true_solution, vehicle_index, num_unknowns, need_loading=True
        ),
        _make_sample(
            "light_truck", 80_000, 3600 * 1.5, 500, true_solution, vehicle_index, num_unknowns, empty_return=True
        ),
        _make_sample("light_truck", 300_000, 3600 * 6, 3400, true_solution, vehicle_index, num_unknowns),
        _make_sample(
            "light_truck", 150_000, 3600 * 3, 2000, true_solution, vehicle_index, num_unknowns,
            avoid_restricted_zones=True, via_mountain_road=True,
        ),
    ]

    result = fit_rates(samples)

    assert result.mode == "full_truck"
    assert result.base_rate_vnd_per_km["light_truck"] == pytest.approx(5500.0, rel=1e-6)
    assert result.wage_hourly_vnd == pytest.approx(settings.default_wage_hourly_vnd, rel=1e-6)
    assert result.fuel_price_vnd == pytest.approx(settings.default_fuel_price_vnd, rel=1e-6)
    assert result.rmse_vnd == pytest.approx(0.0, abs=1e-3)
    # fit_rates 对整车模式自动固定油价/时薪后会生成一条 info 级提示
    assert any("仅拟合 R_base" in w for w in result.warnings)
    assert all(p.error_pct == pytest.approx(0.0, abs=1e-6) for p in result.predictions)


def test_fit_pools_wage_and_fuel_across_vehicle_types_with_separate_base_rates():
    vehicle_index = {"light_truck": 0, "heavy_truck": 1}
    num_unknowns = 4  # 2 车型的 R_base + R_wage + P_fuel
    from app.config import settings
    true_solution = np.array([5500.0, 15200.0, settings.default_wage_hourly_vnd, settings.default_fuel_price_vnd])

    samples = [
        _make_sample("light_truck", 60_000, 3600 * 1, 1000, true_solution, vehicle_index, num_unknowns),
        _make_sample("light_truck", 150_000, 3600 * 2.5, 3000, true_solution, vehicle_index, num_unknowns),
        _make_sample("heavy_truck", 400_000, 3600 * 6, 18000, true_solution, vehicle_index, num_unknowns),
        _make_sample(
            "heavy_truck", 250_000, 3600 * 4, 12000, true_solution, vehicle_index, num_unknowns, need_loading=True
        ),
    ]

    result = fit_rates(samples)

    assert result.base_rate_vnd_per_km["light_truck"] == pytest.approx(5500.0, rel=1e-6)
    assert result.base_rate_vnd_per_km["heavy_truck"] == pytest.approx(15200.0, rel=1e-6)
    assert result.wage_hourly_vnd == pytest.approx(settings.default_wage_hourly_vnd, rel=1e-6)
    assert result.fuel_price_vnd == pytest.approx(settings.default_fuel_price_vnd, rel=1e-6)
    assert result.samples_per_vehicle == {"light_truck": 2, "heavy_truck": 2}


# ============================== 拼货（consolidated）round-trip ==============================


def test_fit_recovers_known_rates_for_consolidated_mode():
    # capacity_ratio 手动指定（模拟 resolve 阶段已经算好、直接写在样本上的已知量），
    # 不同样本给不同的 ratio，验证拟合不受 ratio 取值影响、依然能精确 recover
    vehicle_index = {"light_truck": 0}
    num_unknowns = 3
    true_solution = np.array([6200.0, 195000.0, 23500.0])

    samples = [
        _make_sample(
            "light_truck", 50_000, 3600 * 1, 1000, true_solution, vehicle_index, num_unknowns,
            loading_mode="consolidated", volume_m3=3.0, capacity_ratio=0.4,
        ),
        _make_sample(
            "light_truck", 120_000, 3600 * 2, 2500, true_solution, vehicle_index, num_unknowns,
            loading_mode="consolidated", volume_m3=6.0, capacity_ratio=0.7,
        ),
        _make_sample(
            "light_truck", 200_000, 3600 * 4, 3000, true_solution, vehicle_index, num_unknowns,
            loading_mode="consolidated", volume_m3=8.0, capacity_ratio=0.85, need_loading=True,
        ),
        _make_sample(
            "light_truck", 80_000, 3600 * 1.5, 500, true_solution, vehicle_index, num_unknowns,
            loading_mode="consolidated", volume_m3=1.5, capacity_ratio=0.15, empty_return=True,
        ),
        _make_sample(
            "light_truck", 300_000, 3600 * 6, 3400, true_solution, vehicle_index, num_unknowns,
            loading_mode="consolidated", volume_m3=9.0, capacity_ratio=0.95,
        ),
        _make_sample(
            "light_truck", 150_000, 3600 * 3, 2000, true_solution, vehicle_index, num_unknowns,
            loading_mode="consolidated", volume_m3=5.0, capacity_ratio=0.55,
            avoid_restricted_zones=True, via_mountain_road=True,
        ),
    ]

    result = fit_rates(samples)

    assert result.mode == "consolidated"
    assert result.base_rate_vnd_per_km["light_truck"] == pytest.approx(6200.0, rel=1e-6)
    assert result.wage_hourly_vnd == pytest.approx(195000.0, rel=1e-6)
    assert result.fuel_price_vnd == pytest.approx(23500.0, rel=1e-6)
    assert result.rmse_vnd == pytest.approx(0.0, abs=1e-3)
    assert result.warnings == []


def test_consolidated_insurance_not_scaled_by_capacity_ratio():
    # 保险费不打折——只改 cargo_value_vnd（不影响用时/装卸小时数，所以设计矩阵行不变），
    # 验证 b 的差值正好是全额保险费（没有被 capacity_ratio=0.5 打折成一半）
    vehicle_index = {"light_truck": 0}
    num_unknowns = 3

    base = ResolvedSample(
        loading_mode="consolidated", vehicle_model_id="light_truck", weight_kg=1000, actual_cost_vnd=0.0,
        distance_m=100_000, duration_s=3600, volume_m3=3.0, capacity_ratio=0.5,
    )
    with_insurance = ResolvedSample(
        loading_mode="consolidated", vehicle_model_id="light_truck", weight_kg=1000, actual_cost_vnd=0.0,
        distance_m=100_000, duration_s=3600, volume_m3=3.0, capacity_ratio=0.5,
        cargo_value_vnd=10_000_000,
    )

    row1, b1 = calibration._design_row(base, vehicle_index, num_unknowns, capacity_ratio=base.capacity_ratio)
    row2, b2 = calibration._design_row(with_insurance, vehicle_index, num_unknowns, capacity_ratio=with_insurance.capacity_ratio)

    assert row1 == pytest.approx(row2)  # cargo_value 不影响时间/装卸小时数，设计矩阵行应该一样
    expected_insurance = 10_000_000 * 0.003  # DEFAULT_INSURANCE_RATE，全额不打折
    assert b1 - b2 == pytest.approx(expected_insurance)


def test_consolidated_loading_fee_charged_full_not_scaled_by_capacity_ratio():
    # 装卸费按实际重量全额收，不受 capacity_ratio 影响
    sample = ResolvedSample(
        loading_mode="consolidated", vehicle_model_id="light_truck", weight_kg=1000, actual_cost_vnd=1_000_000,
        distance_m=100_000, duration_s=3600, volume_m3=3.0, capacity_ratio=0.5, need_loading=True,
    )
    _, b = calibration._design_row(sample, {"light_truck": 0}, 3, capacity_ratio=sample.capacity_ratio)
    fixed_known = sample.actual_cost_vnd - b
    expected_loading = 1.0 * 50000.0  # DEFAULT_LOADING_RATE_VND_PER_TON * weight_ton(1.0)，全额
    assert fixed_known == pytest.approx(expected_loading)


def test_mixed_loading_mode_samples_raises():
    with pytest.raises(CalibrationError, match="loading_mode"):
        fit_rates(
            [
                ResolvedSample(
                    loading_mode="full_truck", vehicle_model_id="light_truck", weight_kg=1000,
                    actual_cost_vnd=100000, distance_m=1000, duration_s=60,
                ),
                ResolvedSample(
                    loading_mode="consolidated", vehicle_model_id="light_truck", weight_kg=1000,
                    actual_cost_vnd=100000, distance_m=1000, duration_s=60, volume_m3=3.0, capacity_ratio=0.5,
                ),
            ]
        )


# ============================== 通用 ==============================


def test_underdetermined_system_produces_warning():
    # 拼货模式下 1 样本 < 3 未知数 → 欠定；整车模式 fit_rates 强制固定油价/时薪只剩 1 未知数，不再欠定
    vehicle_index = {"light_truck": 0}
    num_unknowns = 3
    true_solution = np.array([6200.0, 195000.0, 23500.0])

    samples = [
        _make_sample("light_truck", 50_000, 3600, 1000, true_solution, vehicle_index, num_unknowns,
                     loading_mode="consolidated", volume_m3=3.0, capacity_ratio=0.4),
    ]

    result = fit_rates(samples)

    assert any("少于未知数" in w for w in result.warnings)


def test_unknown_vehicle_model_raises():
    with pytest.raises(CalibrationError):
        fit_rates(
            [
                ResolvedSample(
                    loading_mode="full_truck", vehicle_model_id="spaceship", weight_kg=1000,
                    actual_cost_vnd=100000, distance_m=1000, duration_s=60,
                )
            ]
        )


def test_empty_samples_raises():
    with pytest.raises(CalibrationError):
        fit_rates([])
