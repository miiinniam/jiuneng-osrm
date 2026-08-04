"""反向费率测算 —— 用真实运单数据反推 §6 公式里的市场费率。

配合 公式反算文件/运费反算SKILL.md 使用。核心思路：
真实成交价 - 已知的固定项 = 距离系数 * R_base + 总用时 * R_wage + 油耗量 * P_fuel

对同一批样本（可以跨车型），R_base 按具体车型（vehicle_model_id）分别求解（每个车型一个未知数），
R_wage / P_fuel 假设是全局共享的市场价（司机工资、油价不分车型），
所以样本量越大、覆盖车型越全，拟合出的三组参数就越准 —— 这是一个线性最小二乘问题。

样本数 < 未知数个数时方程欠定，会在 CalibrationResult.warnings 里明确提示，
不会假装给出一个"看起来正常"但其实不可信的数字。

拼货（consolidated）/整车（full_truck）两种模式的样本线性关系不同（拼货样本的
distance/time/fuel 系数要先乘 capacity_ratio 才进设计矩阵），所以一次 fit_rates 调用
只能吃同一种 loading_mode 的样本 —— 混合两种模式的样本会在 fit_rates 里报错，
调用方（CLI）需要按 loading_mode 字段先把样本分组，分别跑两次。

拼货样本的 capacity_ratio 不是"猜"出来的：历史运单记录的是真实发生过的事情，
vehicle_model_id 就是那趟货实际用的车型（这个信息应该已经在原始数据里），
capacity_ratio 直接用 费用计算公式.容量占比(重量, 体积, 该车型载重, 该车型容积) 算，
不需要（也不能）像正算里"拼货自动匹配最经济车型"那样反过来比较总价选车——
拿"哪个车型总价最低"去反推历史数据用的是哪辆车，会跟本来就要拟合的 R_base/R_wage/P_fuel
形成循环依赖（选车要用到费率，费率又是本次要拟合的目标），所以这里的 capacity_ratio
计算完全不依赖任何费率参数，只用车型本身的物理容量。
"""

import math
from collections import Counter
from dataclasses import dataclass, field

import numpy as np

from app.services import 费用计算公式 as 公式
from app.services.geocoder import search_address
from app.services.osrm_client import OSRMClient
from app.services.presets import CARGO_TYPE_RATES
from app.services.vehicle_registry import get_model


@dataclass
class ObservedShipment:
    """一条真实运单的原始输入 —— 地址可以是经纬度，也可以是文本地址（会自动地理编码）。

    vehicle_model_id 是这趟货实际用的具体车型（两种模式都必填——反算的前提是知道
    历史上真实用的是哪辆车，不是让系统去猜）；volume_m3 只有 consolidated 样本需要
    （用来算 capacity_ratio）。
    """

    loading_mode: str  # "full_truck" | "consolidated"
    vehicle_model_id: str
    weight_kg: float
    actual_cost_vnd: float
    volume_m3: float | None = None
    origin_lat: float | None = None
    origin_lng: float | None = None
    origin_address: str | None = None
    dest_lat: float | None = None
    dest_lng: float | None = None
    dest_address: str | None = None
    cargo_type: str = "normal"
    empty_return: bool = False
    need_loading: bool = False
    avoid_restricted_zones: bool = False
    avoid_construction_zones: bool = False
    via_mountain_road: bool = False
    via_port: bool = False
    cargo_value_vnd: float | None = None
    toll_rate_vnd_per_km: float | None = None
    misc_cost_vnd: float = 0.0
    notes: str = ""


@dataclass
class ResolvedSample:
    """地理编码 + OSRM 路线都解析完毕之后的样本，跟外部服务无关，方便离线单测。

    capacity_ratio：full_truck 恒为 1.0；consolidated 在 resolve 阶段就地算好填入
    （不依赖费率，见模块顶部说明）。
    """

    loading_mode: str
    vehicle_model_id: str
    weight_kg: float
    actual_cost_vnd: float
    distance_m: float
    duration_s: float
    volume_m3: float | None = None
    capacity_ratio: float = 1.0
    cargo_type: str = "normal"
    empty_return: bool = False
    need_loading: bool = False
    avoid_restricted_zones: bool = False
    avoid_construction_zones: bool = False
    via_mountain_road: bool = False
    via_port: bool = False
    cargo_value_vnd: float | None = None
    toll_rate_vnd_per_km: float | None = None
    misc_cost_vnd: float = 0.0
    notes: str = ""


@dataclass
class SamplePrediction:
    notes: str
    actual_cost_vnd: float
    predicted_cost_vnd: float
    error_pct: float


@dataclass
class CalibrationResult:
    mode: str
    base_rate_vnd_per_km: dict[str, float]
    wage_hourly_vnd: float
    fuel_price_vnd: float
    sample_count: int
    samples_per_vehicle: dict[str, int]
    rmse_vnd: float
    predictions: list[SamplePrediction]
    warnings: list[str] = field(default_factory=list)


class CalibrationError(ValueError):
    pass


# 这两个不是拟合目标，只是用来算"已知的固定费用"部分；跟前端默认值保持一致即可，
# 真要跟着系统配置走可以在调用 fit_rates 时通过参数覆盖。
DEFAULT_LOADING_RATE_VND_PER_TON = 50000.0
DEFAULT_INSURANCE_RATE = 0.003


def _design_row(
    sample: ResolvedSample,
    vehicle_index: dict[str, int],
    num_unknowns: int,
    *,
    capacity_ratio: float = 1.0,
    fixed_fuel_price_vnd: float | None = None,
    fixed_wage_hourly_vnd: float | None = None,
) -> tuple[np.ndarray, float]:
    """构造一条样本对应的线性方程行 —— 整车和拼货共用同一个函数。

    整车模式：capacity_ratio=1.0，所有整趟车费用全额参与。
    拼货模式：capacity_ratio < 1.0（从 sample.capacity_ratio 传入），
    整趟车费用（距离/时间/油耗/路桥/车身/路况附加）全部按比例分摊。
    """
    model = get_model(sample.vehicle_model_id)
    if model is None:
        raise CalibrationError(f"未知车型: {sample.vehicle_model_id}")
    cargo = CARGO_TYPE_RATES.get(sample.cargo_type)
    if cargo is None:
        raise CalibrationError(f"未知货物类型: {sample.cargo_type}")

    ratio = capacity_ratio
    weight_ton = sample.weight_kg / 1000
    d_km = sample.distance_m / 1000
    t_raw_h = sample.duration_s / 3600
    load_ratio = weight_ton / model.max_load_ton if model.max_load_ton else 0.0

    _sf, _adj, _rest, _loading, total_duration_h = 公式.计算总用时(
        载重比例=load_ratio,
        原始行驶小时=t_raw_h,
        货物重量吨=weight_ton,
        需要装卸=sample.need_loading,
    )

    combined_multiplier = cargo.rate_multiplier
    return_factor = 公式.空车返回附加比例 if sample.empty_return else 0.0
    distance_coef = d_km * combined_multiplier * (1 + return_factor) * ratio

    combined_fuel_penalty = cargo.fuel_penalty + model.fuel_penalty
    fuel_load_factor = 公式.油耗载重系数(load_ratio)
    fuel_coef = d_km * (model.fuel_l_per_100km / 100) * fuel_load_factor * (1 + combined_fuel_penalty) * ratio
    total_duration_h_scaled = total_duration_h * ratio

    toll_rate = sample.toll_rate_vnd_per_km if sample.toll_rate_vnd_per_km is not None else model.toll_rate_vnd_per_km
    # 装卸费/保险费/misc 是"本单专属"费用，不打折
    # 路桥/车身/三项路况附加费是"整趟车"性质，乘 ratio 分摊
    #
    # 整车与拼货的装卸费/车身附加费模型不同：
    #   - 整车(need_loading=True)：fixed_surcharge_vnd 全部视为装卸费，车身附加费=0
    #   - 整车(need_loading=False)：fixed_surcharge_vnd 视为车身附加费，装卸费=0
    #   - 拼货：装卸费按吨计（不计入 ratio），车身附加费按整趟车算（计入 ratio）
    if sample.loading_mode == "full_truck":
        body_charge = 0.0 if sample.need_loading else 公式.车身附加费(model.fixed_surcharge_vnd)
        loading_charge = model.fixed_surcharge_vnd if sample.need_loading else 0.0
    else:
        body_charge = 公式.车身附加费(model.fixed_surcharge_vnd)
        loading_charge = 公式.装卸费(weight_ton, DEFAULT_LOADING_RATE_VND_PER_TON, sample.need_loading)

    fixed_known = (
        loading_charge
        + 公式.保险费(sample.cargo_value_vnd, DEFAULT_INSURANCE_RATE)
        + sample.misc_cost_vnd
        + ratio
        * (
            公式.路桥费(d_km, toll_rate)
            + body_charge
            + 公式.禁限行绕行费(公式.禁限行绕行基础费_vnd, combined_multiplier, sample.avoid_restricted_zones)
            + 公式.施工封闭绕行费(公式.施工封闭绕行基础费_vnd, combined_multiplier, sample.avoid_construction_zones)
            + 公式.上坡山区附加费(公式.上坡山区附加基础费_vnd, combined_multiplier, sample.via_mountain_road)
            + 公式.港口附加费(model.fixed_surcharge_vnd, sample.via_port)
        )
    )

    row = np.zeros(num_unknowns)
    row[vehicle_index[sample.vehicle_model_id]] = distance_coef

    both_fixed = fixed_fuel_price_vnd is not None and fixed_wage_hourly_vnd is not None
    if not both_fixed:
        if fixed_wage_hourly_vnd is None:
            row[-2] = total_duration_h_scaled  # R_wage
        if fixed_fuel_price_vnd is None:
            row[-1] = fuel_coef  # P_fuel

    b = sample.actual_cost_vnd - fixed_known
    if fixed_fuel_price_vnd is not None:
        b -= fuel_coef * fixed_fuel_price_vnd
    if fixed_wage_hourly_vnd is not None:
        b -= total_duration_h_scaled * fixed_wage_hourly_vnd
    return row, b


def fit_rates(
    samples: list[ResolvedSample],
    fixed_fuel_price_vnd: float | None = None,
    fixed_wage_hourly_vnd: float | None = None,
) -> CalibrationResult:
    if not samples:
        raise CalibrationError("样本为空，无法拟合")

    modes = {s.loading_mode for s in samples}
    if len(modes) > 1:
        raise CalibrationError(
            f"一次拟合的样本必须是同一种 loading_mode，当前混合了: {sorted(modes)}"
            "（调用方应该先按这个字段把样本分组，分别拟合，两种模式的线性关系不同，不能混着解）"
        )
    mode = modes.pop()

    # 整车模式：基价每公里是"全包费率"（距离+油耗+司机时间全在里面），
    # 不需要也分不开这三项——强制把油价和时薪固定为 config 的默认值，
    # 只反算 base_rate_vnd_per_km。
    if mode == "full_truck":
        from app.config import settings

        if fixed_fuel_price_vnd is None:
            fixed_fuel_price_vnd = settings.default_fuel_price_vnd
        if fixed_wage_hourly_vnd is None:
            fixed_wage_hourly_vnd = settings.default_wage_hourly_vnd

    vehicle_ids = sorted({s.vehicle_model_id for s in samples})
    vehicle_index = {v: i for i, v in enumerate(vehicle_ids)}
    fuel_is_fixed = fixed_fuel_price_vnd is not None
    wage_is_fixed = fixed_wage_hourly_vnd is not None
    num_unknowns = len(vehicle_ids) + (0 if fuel_is_fixed else 1) + (0 if wage_is_fixed else 1)

    rows = []
    b_values = []
    for sample in samples:
        ratio = 1.0 if mode == "full_truck" else sample.capacity_ratio
        row, b = _design_row(
            sample, vehicle_index, num_unknowns,
            capacity_ratio=ratio,
            fixed_fuel_price_vnd=fixed_fuel_price_vnd,
            fixed_wage_hourly_vnd=fixed_wage_hourly_vnd,
        )
        rows.append(row)
        b_values.append(b)

    a_matrix = np.array(rows)
    b_vector = np.array(b_values)

    solution, _residuals, rank, _singular_values = np.linalg.lstsq(a_matrix, b_vector, rcond=None)
    condition_number = float(np.linalg.cond(a_matrix))

    warnings: list[str] = []
    if len(samples) < num_unknowns:
        warnings.append(
            f"样本数（{len(samples)}）少于未知数个数（{num_unknowns}），方程欠定，结果仅供参考，建议补充更多样本"
        )
    elif rank < num_unknowns:
        warnings.append("样本之间相关性太强（比如距离/载重比例都差不多），拟合结果可能不稳定")
    elif condition_number > 1e6:
        warnings.append(
            f"设计矩阵条件数偏高（{condition_number:.1e}），说明距离/总用时/油耗这几项在样本里高度相关"
            "（比如全是普通公路运输，车速接近恒定，距离和时间几乎成正比）——"
            "即使总价预测误差很小，拆分出来的单项费率也可能不可靠。"
            "建议补充空车返回、需要装卸、不同载重比例等条件更多样的样本，把这几项的相关性解开"
        )

    base_rates = {v: float(solution[vehicle_index[v]]) for v in vehicle_ids}
    wage_hourly_vnd = fixed_wage_hourly_vnd if wage_is_fixed else float(solution[-2])
    fuel_price_vnd = fixed_fuel_price_vnd if fuel_is_fixed else float(solution[-1])

    negative_rate_reason = "，可能是数据异常，也可能是上面提到的样本相关性问题（总价还是准的，但拆分不可靠）"
    for v, rate in base_rates.items():
        if rate < 0:
            warnings.append(f"车型「{v}」拟合出的基础费率为负数（{rate:.0f}）{negative_rate_reason}，不要直接采用")
    if not wage_is_fixed and wage_hourly_vnd < 0:
        warnings.append(f"拟合出的司机小时工资为负数（{wage_hourly_vnd:.0f}）{negative_rate_reason}")
    if not fuel_is_fixed and fuel_price_vnd < 0:
        warnings.append(f"拟合出的油价为负数（{fuel_price_vnd:.0f}）{negative_rate_reason}")
    fixed_notes = []
    if fuel_is_fixed:
        fixed_notes.append(f"油价固定 {fixed_fuel_price_vnd:.0f} ₫/L")
    if wage_is_fixed:
        fixed_notes.append(f"工资固定 {fixed_wage_hourly_vnd:.0f} ₫/h")
    if fixed_notes:
        warnings.append("；".join(fixed_notes) + "（未参与拟合），仅拟合 R_base")
    if mode == "full_truck" and (fuel_is_fixed or wage_is_fixed):
        warnings.append(
            f"⚠️ 整车模式仅校准 base_rate_vnd_per_km，油耗/司机成本已隐含在当前 fixed 值中。"
            f"如果 config.py 的油价({fixed_fuel_price_vnd:.0f}₫)和时薪({fixed_wage_hourly_vnd:.0f}₫)与当前市场价差异较大，"
            f"请先更新 config.py 再重跑反算——否则拟合出的 base_rate 会带偏。"
        )

    # b_i = actual_cost - fixed_known，所以 fixed_known = actual_cost - b_i；
    # 预测总价 = 拟合系数 · 设计矩阵行 + fixed_known。
    predictions = []
    squared_errors = []
    for sample, row, b in zip(samples, rows, b_values):
        fixed_known = sample.actual_cost_vnd - b
        predicted_total = float(row @ solution) + fixed_known
        error_pct = (
            (predicted_total - sample.actual_cost_vnd) / sample.actual_cost_vnd * 100 if sample.actual_cost_vnd else 0.0
        )
        squared_errors.append((predicted_total - sample.actual_cost_vnd) ** 2)
        predictions.append(
            SamplePrediction(
                notes=sample.notes,
                actual_cost_vnd=sample.actual_cost_vnd,
                predicted_cost_vnd=predicted_total,
                error_pct=error_pct,
            )
        )

    rmse = math.sqrt(sum(squared_errors) / len(squared_errors))

    return CalibrationResult(
        mode=mode,
        base_rate_vnd_per_km=base_rates,
        wage_hourly_vnd=wage_hourly_vnd,
        fuel_price_vnd=fuel_price_vnd,
        sample_count=len(samples),
        samples_per_vehicle=dict(Counter(s.vehicle_model_id for s in samples)),
        rmse_vnd=rmse,
        predictions=predictions,
        warnings=warnings,
    )


async def resolve_shipment(shipment: ObservedShipment, client: OSRMClient) -> ResolvedSample:
    async def _resolve_point(lat: float | None, lng: float | None, address: str | None) -> tuple[float, float]:
        if lat is not None and lng is not None:
            return lat, lng
        if address:
            results = await search_address(address, limit=1)
            if not results:
                raise CalibrationError(f"地理编码找不到地址: {address}")
            return results[0].lat, results[0].lng
        raise CalibrationError("必须提供经纬度或地址其中之一")

    origin_lat, origin_lng = await _resolve_point(shipment.origin_lat, shipment.origin_lng, shipment.origin_address)
    dest_lat, dest_lng = await _resolve_point(shipment.dest_lat, shipment.dest_lng, shipment.dest_address)

    route = await client.get_route([(origin_lng, origin_lat), (dest_lng, dest_lat)])

    model = get_model(shipment.vehicle_model_id)
    if model is None:
        raise CalibrationError(f"未知车型: {shipment.vehicle_model_id}")

    if shipment.loading_mode == "consolidated":
        if shipment.volume_m3 is None:
            raise CalibrationError(f"拼货样本必须提供 volume_m3 才能计算容量占比（{shipment.notes or shipment.vehicle_model_id}）")
        capacity_ratio = 公式.容量占比(
            shipment.weight_kg / 1000, shipment.volume_m3, model.max_load_ton, model.volume_capacity_m3
        )
    else:
        capacity_ratio = 1.0

    return ResolvedSample(
        loading_mode=shipment.loading_mode,
        vehicle_model_id=shipment.vehicle_model_id,
        weight_kg=shipment.weight_kg,
        actual_cost_vnd=shipment.actual_cost_vnd,
        distance_m=route.distance_m,
        duration_s=route.duration_s,
        volume_m3=shipment.volume_m3,
        capacity_ratio=capacity_ratio,
        cargo_type=shipment.cargo_type,
        empty_return=shipment.empty_return,
        need_loading=shipment.need_loading,
        avoid_restricted_zones=shipment.avoid_restricted_zones,
        avoid_construction_zones=shipment.avoid_construction_zones,
        via_mountain_road=shipment.via_mountain_road,
        via_port=shipment.via_port,
        cargo_value_vnd=shipment.cargo_value_vnd,
        toll_rate_vnd_per_km=shipment.toll_rate_vnd_per_km,
        misc_cost_vnd=shipment.misc_cost_vnd,
        notes=shipment.notes,
    )


async def calibrate(
    shipments: list[ObservedShipment],
    fixed_fuel_price_vnd: float | None = None,
    fixed_wage_hourly_vnd: float | None = None,
) -> CalibrationResult:
    """传入的 shipments 应该已经是同一种 loading_mode（调用方负责分组）——
    fit_rates 会在混了两种模式时明确报错，不会静默算出一个不可信的结果。"""
    client = OSRMClient()
    samples = [await resolve_shipment(s, client) for s in shipments]
    return fit_rates(samples, fixed_fuel_price_vnd=fixed_fuel_price_vnd, fixed_wage_hourly_vnd=fixed_wage_hourly_vnd)


def _load_shipments_from_json(data: list[dict]) -> list[ObservedShipment]:
    shipments = []
    for item in data:
        origin = item.get("origin") or {}
        destination = item.get("destination") or {}
        shipments.append(
            ObservedShipment(
                loading_mode=item["loading_mode"],
                vehicle_model_id=item["vehicle_model_id"],
                weight_kg=item["weight_kg"],
                actual_cost_vnd=item["actual_cost_vnd"],
                volume_m3=item.get("volume_m3"),
                origin_lat=origin.get("lat"),
                origin_lng=origin.get("lng"),
                origin_address=item.get("origin_address") or origin.get("address"),
                dest_lat=destination.get("lat"),
                dest_lng=destination.get("lng"),
                dest_address=item.get("dest_address") or destination.get("address"),
                cargo_type=item.get("cargo_type", "normal"),
                empty_return=item.get("empty_return", False),
                need_loading=item.get("need_loading", False),
                avoid_restricted_zones=item.get("avoid_restricted_zones", False),
                avoid_construction_zones=item.get("avoid_construction_zones", False),
                via_mountain_road=item.get("via_mountain_road", False),
                via_port=item.get("via_port", False),
                cargo_value_vnd=item.get("cargo_value_vnd"),
                toll_rate_vnd_per_km=item.get("toll_rate_vnd_per_km"),
                misc_cost_vnd=item.get("misc_cost_vnd", 0.0),
                notes=item.get("notes", ""),
            )
        )
    return shipments


def _print_report(result: CalibrationResult) -> None:
    import json

    report = {
        "mode": result.mode,
        "base_rate_vnd_per_km": {k: round(v) for k, v in result.base_rate_vnd_per_km.items()},
        "wage_hourly_vnd": round(result.wage_hourly_vnd),
        "fuel_price_vnd": round(result.fuel_price_vnd),
        "sample_count": result.sample_count,
        "samples_per_vehicle": result.samples_per_vehicle,
        "rmse_vnd": round(result.rmse_vnd),
        "warnings": result.warnings,
        "predictions": [
            {
                "notes": p.notes,
                "actual_cost_vnd": p.actual_cost_vnd,
                "predicted_cost_vnd": round(p.predicted_cost_vnd),
                "error_pct": round(p.error_pct, 1),
            }
            for p in result.predictions
        ],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    import asyncio
    import json
    import os
    import sys

    if len(sys.argv) < 2:
        print("用法: python calibration.py <运单样本.json>", file=sys.stderr)
        print("样本 JSON 里每条记录的 loading_mode 字段会被自动分组，混合两种模式的一份文件", file=sys.stderr)
        print("会被拆成两组分别拟合、各输出一段报告。", file=sys.stderr)
        print("环境变量 FIXED_FUEL_PRICE_VND=油价 可固定油价（不参与拟合）", file=sys.stderr)
        sys.exit(1)

    fixed_fuel = os.getenv("FIXED_FUEL_PRICE_VND")
    fixed_fuel_price_vnd = float(fixed_fuel) if fixed_fuel else None
    fixed_wage = os.getenv("FIXED_WAGE_HOURLY_VND")
    fixed_wage_hourly_vnd = float(fixed_wage) if fixed_wage else None

    with open(sys.argv[1], encoding="utf-8") as f:
        raw_shipments = json.load(f)

    parsed_shipments = _load_shipments_from_json(raw_shipments)

    shipments_by_mode: dict[str, list[ObservedShipment]] = {}
    for s in parsed_shipments:
        shipments_by_mode.setdefault(s.loading_mode, []).append(s)

    for mode, shipments in shipments_by_mode.items():
        print(f"\n===== loading_mode = {mode}（{len(shipments)} 条样本） =====")
        calibration_result = asyncio.run(
            calibrate(shipments, fixed_fuel_price_vnd=fixed_fuel_price_vnd, fixed_wage_hourly_vnd=fixed_wage_hourly_vnd)
        )
        _print_report(calibration_result)
