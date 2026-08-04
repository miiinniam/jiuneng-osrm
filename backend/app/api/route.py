import math

from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app.schemas import (
    BreakdownOutput,
    QuoteRequest,
    QuoteResponse,
    RouteOutput,
    TimingOutput,
)
from app.services.cost_engine import (
    CostResult,
    NoFittingVehicleModel,
    UnknownCargoType,
    UnknownVehicleModel,
    compute_cost_consolidated,
    compute_cost_full_truck,
)
from app.services.osrm_client import OSRMClient, OSRMError, RouteResult
from app.services.vehicle_registry import get_model

router = APIRouter()


def _coords_from_route_input(route) -> list[tuple[float, float]]:
    points = [route.origin, *route.waypoints, route.destination]
    return [(p.lng, p.lat) for p in points]


def build_quote_response(route_result: RouteResult, result: CostResult, vehicle_count: int = 1) -> QuoteResponse:
    """把 OSRM 路线结果 + 费用计算结果组装成统一的响应格式，单条报价和批量报价共用。
    
    vehicle_count > 1 时，各项费用 × vehicle_count 得到总价，cost_per_vehicle 存单车价格。
    """
    b = result.breakdown
    mult = vehicle_count if vehicle_count > 1 else 1
    d_km = result.distance_km

    return QuoteResponse(
        route=RouteOutput(
            distance_km=d_km,
            duration_h=route_result.duration_s / 3600,
            adjusted_duration_h=result.timing.adjusted_duration_h,
            geometry=route_result.geometry,
        ),
        timing=TimingOutput(**result.timing.__dict__),
        breakdown=BreakdownOutput(
            cost_distance=b.cost_distance * mult,
            cost_time=b.cost_time * mult,
            cost_fuel=b.cost_fuel * mult,
            cost_loading=b.cost_loading * mult,
            cost_insurance=b.cost_insurance * mult,
            cost_toll=b.cost_toll * mult,
            cost_misc=b.cost_misc * mult,
            cost_body_surcharge=b.cost_body_surcharge * mult,
            cost_restricted_zone=b.cost_restricted_zone * mult,
            cost_construction_zone=b.cost_construction_zone * mult,
            cost_mountain_road=b.cost_mountain_road * mult,
            cost_port=b.cost_port * mult,
            cost_fixed=b.cost_fixed * mult,
            cost_total=b.cost_total * mult,
            cost_per_km=(b.cost_total * mult) / d_km if d_km > 0 else 0.0,
            cost_per_ton_km=b.cost_per_ton_km,
            capacity_ratio=b.capacity_ratio,
            matched_vehicle_model_id=b.matched_vehicle_model_id,
            matched_vehicle_model_name=b.matched_vehicle_model_name,
            vehicle_count=vehicle_count,
            cost_per_vehicle=b.cost_total if vehicle_count > 1 else None,
        ),
        suggestions=result.suggestions,
        route_fallback=route_result.fallback,
        vehicle_count=vehicle_count,
    )


def _compute_from_request(request: QuoteRequest, route_result: RouteResult) -> tuple[CostResult, int]:
    """计算单车费用，返回 (单车CostResult, 需要车辆数)。"""
    cost_params = request.cost_params
    weight_ton = request.cargo.weight_kg / 1000

    # 整车模式：计算需要几辆车
    vehicle_count = 1
    if request.vehicle.loading_mode == "full_truck" and request.vehicle.vehicle_model_id:
        model = get_model(request.vehicle.vehicle_model_id)
        if model and weight_ton > model.max_load_ton:
            vehicle_count = max(1, math.ceil(weight_ton / model.max_load_ton))

    # 用单车重量计算
    per_vehicle_weight_ton = weight_ton / vehicle_count

    common_kwargs = dict(
        distance_m=route_result.distance_m,
        duration_s=route_result.duration_s,
        cargo_weight_ton=per_vehicle_weight_ton,
        cargo_type=request.cargo.type,
        empty_return=request.vehicle.empty_return,
        need_loading=request.vehicle.need_loading,
        avoid_restricted_zones=request.vehicle.avoid_restricted_zones,
        avoid_construction_zones=request.vehicle.avoid_construction_zones,
        via_mountain_road=request.vehicle.via_mountain_road,
        via_port=request.vehicle.via_port,
        fuel_price_vnd=cost_params.fuel_price_vnd or settings.default_fuel_price_vnd,
        wage_hourly_vnd=cost_params.wage_hourly_vnd or settings.default_wage_hourly_vnd,
        cargo_value_vnd=request.cargo.value_vnd,
        toll_rate_vnd_per_km=cost_params.toll_rate_vnd_per_km,
        misc_cost_vnd=cost_params.misc_cost_vnd,
        loading_rate_vnd_per_ton=settings.loading_rate_vnd_per_ton,
        insurance_rate=settings.insurance_rate,
    )
    if request.vehicle.loading_mode == "full_truck":
        result = compute_cost_full_truck(vehicle_model_id=request.vehicle.vehicle_model_id, **common_kwargs)
    else:
        result = compute_cost_consolidated(cargo_volume_m3=request.cargo.volume_m3, **common_kwargs)
    return result, vehicle_count


@router.post("/route/cost", response_model=QuoteResponse)
async def quote_cost(request: QuoteRequest) -> QuoteResponse:
    coordinates = _coords_from_route_input(request.route)

    client = OSRMClient()
    try:
        route_result = await client.get_route(coordinates)
    except OSRMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    try:
        result, vehicle_count = _compute_from_request(request, route_result)
    except NoFittingVehicleModel as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (UnknownVehicleModel, UnknownCargoType) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return build_quote_response(route_result, result, vehicle_count)


@router.post("/route/alternatives")
async def quote_alternatives(request: QuoteRequest) -> dict:
    """§9 多路线对比 —— 返回 OSRM 找到的每条候选路线各自的完整报价，按总费用从低到高排序。"""
    coordinates = _coords_from_route_input(request.route)

    client = OSRMClient()
    try:
        route_results = await client.get_routes(coordinates)
    except OSRMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    options: list[QuoteResponse] = []
    for route_result in route_results:
        try:
            result, vehicle_count = _compute_from_request(request, route_result)
        except NoFittingVehicleModel as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except (UnknownVehicleModel, UnknownCargoType) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        options.append(build_quote_response(route_result, result, vehicle_count))

    options.sort(key=lambda o: o.breakdown.cost_total)
    return {"options": options}


@router.get("/route")
async def get_route(
    origin_lat: float = Query(...),
    origin_lng: float = Query(...),
    dest_lat: float = Query(...),
    dest_lng: float = Query(...),
) -> dict:
    """只取路线（距离/时间/GeoJSON），不计算费用 — 用于地图预览。"""
    client = OSRMClient()
    try:
        route_result = await client.get_route([(origin_lng, origin_lat), (dest_lng, dest_lat)])
    except OSRMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {
        "distance_km": round(route_result.distance_m / 1000, 2),
        "duration_h": round(route_result.duration_s / 3600, 2),
        "geometry": route_result.geometry,
    }
