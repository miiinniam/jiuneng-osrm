"""
OSRM++ AI 聊天工具定义与执行器
==============================

为 DeepSeek Function Calling 提供工具 schema 定义和对应的 Python 执行函数。

工具列表:
- calculate_freight_cost: 计算运费（核心工具）
- calculate_border_fees: 计算口岸费用（🆕 替换 cargo_estimate）
- query_vehicle_models: 查询可用车型
- compare_routes: 多方案费用对比
- geocode_address: 地址→坐标
- query_exchange_rate: 查询实时汇率（CNY→VND）
"""

import asyncio
import json
import math
from typing import Any

from app.services.cost_engine import (
    CostResult,
    compute_cost_consolidated,
    compute_cost_full_truck,
)
from app.services.exchange_rate import get_exchange_rate
from app.services.geocoder import search_address
from app.services.osrm_client import OSRMClient
from app.services.vehicle_registry import VEHICLE_MODELS, get_model


# ══════════════════════════════════════════════════════════════
# 工具 Schema 定义（OpenAI Function Calling 格式）
# ══════════════════════════════════════════════════════════════

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "calculate_freight_cost",
            "description": (
                "计算越南境内公路运输费用。传入起点/终点地址（或经纬度）、"
                "货物重量和类型、车型等参数，返回真实计算结果（经过 OSRM 路线引擎"
                "和费用公式引擎），包含详细费用明细。\n\n"
                "重要：你必须调用这个工具来获取运费，绝不能凭空编造或凭记忆估计数字。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "origin": {
                        "type": "string",
                        "description": (
                            "起点地址或经纬度。越南地址用越南语，中国地址用中文。"
                            "例如：'友谊关(Huu Nghi), Lạng Sơn' 或 '21.98,106.71'"
                        ),
                    },
                    "destination": {
                        "type": "string",
                        "description": "终点地址或经纬度。例如：'Hà Nội, Hoàn Kiếm'",
                    },
                    "cargo_weight_ton": {
                        "type": "number",
                        "description": "货物重量（吨），如 25 表示 25 吨",
                    },
                    "cargo_type": {
                        "type": "string",
                        "enum": ["normal", "oversized", "heavy_equipment", "cold_chain", "hazardous", "other"],
                        "description": "货物类型，默认 normal（普通货）",
                    },
                    "vehicle_model_id": {
                        "type": "string",
                        "description": (
                            "车型 ID，如 flatbed_13m, flatbed_17m5, container_40ft 等。"
                            "如果不指定，系统自动匹配最佳车型（整车模式必须指定车型或先查询车型列表）。"
                        ),
                    },
                    "loading_mode": {
                        "type": "string",
                        "enum": ["full_truck", "consolidated"],
                        "description": "运输模式：full_truck（整车）/ consolidated（拼货）。默认 full_truck。",
                    },
                    "empty_return": {
                        "type": "boolean",
                        "description": "是否预估空返费用（加收空返附加费），默认 false",
                    },
                    "need_loading": {
                        "type": "boolean",
                        "description": "是否需要装卸费，默认 false",
                    },
                    "volume_m3": {
                        "type": "number",
                        "description": "货物体积（立方米）。拼货模式（consolidated）时必须提供。",
                    },
                },
                "required": ["origin", "destination", "cargo_weight_ton"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_border_fees",
            "description": (
                "计算中国→越南进出口口岸操作费用（两端分开）。\n"
                "返回中国端费用（出口报关、货场、卸货、换车）和越南端费用（进口清关、货场）。\n"
                "不含关税/增值税，仅口岸操作费。\n\n"
                "参数只需车辆数，系统自动从玖能报价数据库读取各项固定费用。\n"
                "用户问'DDP''到门价''进出口费用''口岸费'时调用此工具。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "vehicle_count": {
                        "type": "integer",
                        "description": "车辆数量（默认1）。如果运费计算返回多辆车，传入对应车数。",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_vehicle_models",
            "description": (
                "查询可用的运输车型及其参数（载重、尺寸、费率等）。"
                "帮用户选车时调用此工具，了解有哪些车型可选。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": ["small_box", "flatbed", "high_side", "container", "cold_chain"],
                        "description": "车型大类（可选）。不填则返回全部车型。",
                    },
                    "min_load_ton": {
                        "type": "number",
                        "description": "最低载重（吨），只返回载重大于等于此值的车型",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_routes",
            "description": (
                "对比多个运输方案的费用差异。用于帮用户决定选哪个车型、"
                "走哪条路线更划算。每个方案分别调用费用引擎计算。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "scenarios": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "label": {"type": "string", "description": "方案名称，如 '13m 平板车'"},
                                "origin": {"type": "string"},
                                "destination": {"type": "string"},
                                "cargo_weight_ton": {"type": "number"},
                                "cargo_type": {"type": "string"},
                                "vehicle_model_id": {"type": "string"},
                                "loading_mode": {"type": "string"},
                                "empty_return": {"type": "boolean"},
                            },
                            "required": ["label", "origin", "destination", "cargo_weight_ton"],
                        },
                        "description": "要对比的方案列表（至少 2 个）",
                        "minItems": 2,
                        "maxItems": 5,
                    },
                },
                "required": ["scenarios"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "geocode_address",
            "description": (
                "将地址文本转换为经纬度坐标。用于验证地址是否存在、"
                "获取精确坐标。越南地址用越南语。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "address": {
                        "type": "string",
                        "description": "要查询的地址",
                    },
                },
                "required": ["address"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_exchange_rate",
            "description": (
                "查询今日人民币→越南盾实时汇率。"
                "当用户问'汇率''1块钱换多少越南盾''CNY到VND'时调用。"
                "返回当前汇率（1 CNY = X VND）及数据来源。"
            ),
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
]


# ══════════════════════════════════════════════════════════════
# 工具执行器
# ══════════════════════════════════════════════════════════════

_osrm = OSRMClient()


def _parse_coords(raw: str) -> list[tuple[float, float]] | None:
    """尝试把 '21.98,106.71' 解析为 (lng, lat)。"""
    parts = raw.replace(" ", "").split(",")
    if len(parts) == 2:
        try:
            return [(float(parts[1]), float(parts[0]))]
        except ValueError:
            pass
    return None


async def _resolve_coords(address: str) -> tuple[float, float]:
    """将地址解析为 (lng, lat)。"""
    coords = _parse_coords(address)
    if coords:
        return coords[0]
    results = await search_address(address, limit=1)
    if not results:
        raise ValueError(f"找不到地址: {address}，请尝试更具体的地址（如加上省份名）")
    return (results[0].lng, results[0].lat)


def _fmt_vnd(amount: float) -> str:
    return f"{int(round(amount)):,}"


def _format_cost_result(r: CostResult, vehicle_name: str = "", distance_km: float = 0,
                         duration_h: float = 0, cargo_weight_ton: float = 0,
                         origin_coords: tuple | None = None,
                         dest_coords: tuple | None = None,
                         vehicle_count: int = 1) -> dict:
    """把 CostResult 格式化为 AI 友好的 dict。"""
    b = r.breakdown
    result = {
        "vehicle": vehicle_name or b.matched_vehicle_model_name,
        "vehicle_model_id": b.matched_vehicle_model_id,
        "distance_km": round(distance_km, 1) if distance_km else 0,
        "duration_h": round(duration_h, 1) if duration_h else 0,
        "cargo_weight_ton": cargo_weight_ton,
        "capacity_ratio": round(b.capacity_ratio, 2),
        "vehicle_count": vehicle_count,
        "breakdown": {
            "distance_cost_vnd": _fmt_vnd(b.cost_distance),
            "time_cost_vnd": _fmt_vnd(b.cost_time),
            "fuel_cost_vnd": _fmt_vnd(b.cost_fuel),
            "loading_cost_vnd": _fmt_vnd(b.cost_loading),
            "insurance_cost_vnd": _fmt_vnd(b.cost_insurance),
            "toll_cost_vnd": _fmt_vnd(b.cost_toll),
            "misc_cost_vnd": _fmt_vnd(b.cost_misc),
            "body_surcharge_vnd": _fmt_vnd(b.cost_body_surcharge),
            "restricted_zone_surcharge_vnd": _fmt_vnd(b.cost_restricted_zone),
            "construction_zone_surcharge_vnd": _fmt_vnd(b.cost_construction_zone),
            "mountain_road_surcharge_vnd": _fmt_vnd(b.cost_mountain_road),
            "port_surcharge_vnd": _fmt_vnd(b.cost_port),
            "fixed_surcharge_vnd": _fmt_vnd(b.cost_fixed),
        },
        "total_cost_vnd": _fmt_vnd(b.cost_total * vehicle_count),
    }
    if vehicle_count > 1:
        result["cost_per_vehicle_vnd"] = _fmt_vnd(b.cost_total)
    result["cost_per_km_vnd"] = _fmt_vnd(b.cost_per_km)
    if origin_coords:
        result["_origin"] = {"lng": origin_coords[0], "lat": origin_coords[1]}
    if dest_coords:
        result["_destination"] = {"lng": dest_coords[0], "lat": dest_coords[1]}
    return result


async def execute_tool(name: str, arguments: dict[str, Any]) -> str:
    """执行指定的工具函数，返回 JSON 字符串结果。"""
    try:
        if name == "calculate_freight_cost":
            return await _calc_cost(arguments)
        elif name == "calculate_border_fees":
            return _calc_border_fees(arguments)
        elif name == "query_vehicle_models":
            return _query_vehicles(arguments)
        elif name == "compare_routes":
            return await _compare_routes(arguments)
        elif name == "geocode_address":
            return await _geocode(arguments)
        elif name == "query_exchange_rate":
            return await _query_exchange_rate()
        else:
            return json.dumps({"error": f"未知工具: {name}"}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({
            "error": str(e),
        }, ensure_ascii=False)


async def _calc_cost(args: dict) -> str:
    """执行运费计算。"""
    origin_str = args["origin"]
    dest_str = args["destination"]
    if "cargo_weight_ton" in args:
        weight_ton = float(args["cargo_weight_ton"])
    elif "cargo_weight_kg" in args:
        weight_ton = float(args["cargo_weight_kg"]) / 1000.0
    else:
        return json.dumps({"error": "缺少货物重量参数 (cargo_weight_ton)"}, ensure_ascii=False)
    weight_kg = weight_ton * 1000.0
    cargo_type = args.get("cargo_type", "normal")
    vehicle_id = args.get("vehicle_model_id", "")
    loading_mode = args.get("loading_mode", "full_truck")
    empty_return = bool(args.get("empty_return", False))
    need_loading = bool(args.get("need_loading", False))

    origin_lng, origin_lat = await _resolve_coords(origin_str)
    dest_lng, dest_lat = await _resolve_coords(dest_str)

    route = await _osrm.get_route([(origin_lng, origin_lat), (dest_lng, dest_lat)])
    distance_m = route.distance_m
    duration_s = route.duration_s
    distance_km = distance_m / 1000.0

    from app.config import settings

    vehicle_count = 1
    if loading_mode == "full_truck":
        if not vehicle_id:
            return json.dumps({
                "error": "整车模式需要指定车型。请先调用 query_vehicle_models 查看可用车型，或告诉我货物的大致吨位我帮你推荐。",
                "hint": "让用户选择车型，或直接指定 vehicle_model_id",
            }, ensure_ascii=False)

        model = get_model(vehicle_id)
        if model and weight_ton > model.max_load_ton:
            vehicle_count = max(1, math.ceil(weight_ton / model.max_load_ton))

        per_vehicle_weight_ton = weight_ton / vehicle_count

        result = compute_cost_full_truck(
            distance_m=distance_m, duration_s=duration_s,
            cargo_weight_ton=per_vehicle_weight_ton,
            vehicle_model_id=vehicle_id, cargo_type=cargo_type,
            empty_return=empty_return, need_loading=need_loading,
            fuel_price_vnd=settings.default_fuel_price_vnd,
            wage_hourly_vnd=settings.default_wage_hourly_vnd,
            loading_rate_vnd_per_ton=settings.loading_rate_vnd_per_ton,
            insurance_rate=settings.insurance_rate,
        )
        return json.dumps(
            _format_cost_result(result, distance_km=distance_km, duration_h=duration_s / 3600,
                                cargo_weight_ton=weight_ton,
                                origin_coords=(origin_lng, origin_lat),
                                dest_coords=(dest_lng, dest_lat),
                                vehicle_count=vehicle_count),
            ensure_ascii=False,
        )
    else:
        volume_m3 = args.get("volume_m3", 0) or 0
        result = compute_cost_consolidated(
            distance_m=distance_m, duration_s=duration_s,
            cargo_weight_ton=weight_ton, cargo_volume_m3=volume_m3,
            cargo_type=cargo_type, empty_return=empty_return,
            need_loading=need_loading,
            fuel_price_vnd=settings.default_fuel_price_vnd,
            wage_hourly_vnd=settings.default_wage_hourly_vnd,
            loading_rate_vnd_per_ton=settings.loading_rate_vnd_per_ton,
            insurance_rate=settings.insurance_rate,
        )
        return json.dumps(
            _format_cost_result(result, distance_km=distance_km, duration_h=duration_s / 3600,
                                cargo_weight_ton=weight_ton,
                                origin_coords=(origin_lng, origin_lat),
                                dest_coords=(dest_lng, dest_lat)),
            ensure_ascii=False,
        )


def _calc_border_fees(args: dict) -> str:
    """🆕 计算口岸费用（两端分开，不含税）"""
    from app.services.border_costs import calc_ddp_fees_only

    vehicle_count = int(args.get("vehicle_count", 1))
    result = calc_ddp_fees_only(vehicle_count=vehicle_count)

    return json.dumps({
        "vehicle_count": vehicle_count,
        "china_side": {
            "items": result.china_side.items,
            "subtotal_rmb": result.china_total,
        },
        "vietnam_side": {
            "items": result.vietnam_side.items,
            "subtotal_rmb": result.vietnam_total,
        },
        "total_border_fees_rmb": result.ddp_total,
        "note": "仅口岸操作费用，不含关税/增值税。费用基于玖能国际实际报价数据。",
    }, ensure_ascii=False)


def _query_vehicles(args: dict) -> str:
    """查询车型列表。"""
    category = args.get("category", "")
    min_load = float(args.get("min_load_ton", 0) or 0)

    filtered = VEHICLE_MODELS
    if category:
        filtered = [m for m in filtered if m.category == category]
    if min_load > 0:
        filtered = [m for m in filtered if m.max_load_ton >= min_load]

    vehicles = [
        {
            "model_id": m.model_id,
            "name": m.display_name,
            "category": m.category,
            "max_load_ton": m.max_load_ton,
            "volume_m3": m.volume_capacity_m3,
            "length_m": m.length_m,
            "base_rate_vnd_per_km": m.base_rate_vnd_per_km,
            "fuel_l_per_100km": m.fuel_l_per_100km,
            "suitable_cargo": list(m.suitable_cargo_types),
        }
        for m in filtered
    ]
    return json.dumps({"count": len(vehicles), "vehicles": vehicles}, ensure_ascii=False)


async def _compare_routes(args: dict) -> str:
    """多方案对比。"""
    scenarios = args.get("scenarios", [])
    if len(scenarios) < 2:
        return json.dumps({"error": "至少需要 2 个方案进行对比"}, ensure_ascii=False)

    results = []
    for sc in scenarios:
        label = sc["label"]
        try:
            cost_args = {
                "origin": sc["origin"],
                "destination": sc["destination"],
                "cargo_weight_ton": sc.get("cargo_weight_ton", 0),
                "cargo_type": sc.get("cargo_type", "normal"),
                "vehicle_model_id": sc.get("vehicle_model_id", ""),
                "loading_mode": sc.get("loading_mode", "full_truck"),
                "empty_return": bool(sc.get("empty_return", False)),
            }
            cost_json = await _calc_cost(cost_args)
            cost_data = json.loads(cost_json)
            cost_data["label"] = label
            results.append(cost_data)
        except Exception as e:
            results.append({"label": label, "error": str(e)})

    valid = [r for r in results if "total_cost_vnd" in r]
    cheapest = min(valid, key=lambda r: r["total_cost_vnd"]) if valid else None

    return json.dumps({
        "scenarios": results,
        "cheapest_label": cheapest["label"] if cheapest else None,
        "cheapest_total_vnd": cheapest["total_cost_vnd"] if cheapest else None,
    }, ensure_ascii=False)


async def _geocode(args: dict) -> str:
    """地址→坐标。"""
    address = args["address"]
    results = await search_address(address, limit=3)
    return json.dumps({
        "query": address,
        "results": [
            {"lat": r.lat, "lng": r.lng, "display_name": r.display_name}
            for r in results
        ],
    }, ensure_ascii=False)


async def _query_exchange_rate() -> str:
    """查询实时汇率 CNY→VND。"""
    rate_data = await get_exchange_rate()
    vnd = rate_data["vnd_per_rmb"]
    return json.dumps({
        "vnd_per_rmb": vnd,
        "source": rate_data["source"],
        "updated": rate_data["updated"],
        "message": f"今日汇率 1 CNY = {vnd:,.0f} VND",
    }, ensure_ascii=False)
