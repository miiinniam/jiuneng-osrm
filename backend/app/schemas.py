"""Pydantic 请求/响应模型，字段对应 DEVELOPMENT_GOALS.md §8.2 的示例。

注：地理编码服务（地址 -> 经纬度）不在本阶段范围内，起点/终点直接传经纬度；
address 只是可选的展示字段，不会被后端解析。
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class LatLng(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    address: str | None = None


class RouteInput(BaseModel):
    origin: LatLng
    destination: LatLng
    waypoints: list[LatLng] = Field(default_factory=list)


class CargoInput(BaseModel):
    weight_kg: float = Field(gt=0)
    volume_m3: float | None = None
    type: str = "normal"
    value_vnd: float | None = None  # 用于保险费计算


class VehicleInput(BaseModel):
    loading_mode: Literal["consolidated", "full_truck"]
    vehicle_model_id: str | None = None  # full_truck 必填，consolidated 忽略
    empty_return: bool = False
    need_loading: bool = False
    avoid_restricted_zones: bool = False
    avoid_construction_zones: bool = False
    via_mountain_road: bool = False
    via_port: bool = False

    @model_validator(mode="after")
    def _check_model_id_required_for_full_truck(self) -> "VehicleInput":
        if self.loading_mode == "full_truck" and not self.vehicle_model_id:
            raise ValueError("整车模式（full_truck）必须指定 vehicle_model_id")
        return self


class CostParamsInput(BaseModel):
    fuel_price_vnd: float | None = None
    wage_hourly_vnd: float | None = None
    toll_rate_vnd_per_km: float | None = None
    misc_cost_vnd: float = 0.0


class QuoteRequest(BaseModel):
    route: RouteInput
    cargo: CargoInput
    vehicle: VehicleInput
    cost_params: CostParamsInput = Field(default_factory=CostParamsInput)

    @model_validator(mode="after")
    def _check_volume_required_for_consolidated(self) -> "QuoteRequest":
        # 跨字段校验（vehicle.loading_mode 决定 cargo.volume_m3 是否必填），
        # Pydantic v2 只能在最外层模型上做
        if self.vehicle.loading_mode == "consolidated" and self.cargo.volume_m3 is None:
            raise ValueError("拼货模式（consolidated）必须填写 cargo.volume_m3")
        return self


class RouteOutput(BaseModel):
    distance_km: float
    duration_h: float  # OSRM 原始行驶时间（未经速度惩罚调整）
    adjusted_duration_h: float  # 经速度惩罚系数调整后的实际预计行驶时间
    geometry: dict


class TimingOutput(BaseModel):
    speed_factor: float
    adjusted_duration_h: float
    rest_hours: float
    loading_hours: float
    total_duration_h: float


class BreakdownOutput(BaseModel):
    cost_distance: float
    cost_time: float
    cost_fuel: float
    cost_loading: float
    cost_insurance: float
    cost_toll: float
    cost_misc: float
    cost_body_surcharge: float
    cost_restricted_zone: float
    cost_construction_zone: float
    cost_mountain_road: float
    cost_port: float
    cost_fixed: float
    cost_total: float
    cost_per_km: float
    cost_per_ton_km: float | None
    capacity_ratio: float
    matched_vehicle_model_id: str
    matched_vehicle_model_name: str
    vehicle_count: int = 1
    cost_per_vehicle: float | None = None


class QuoteResponse(BaseModel):
    route: RouteOutput
    timing: TimingOutput
    breakdown: BreakdownOutput
    suggestions: list[dict]  # [{"code": str, "params": dict}, ...]
    route_fallback: bool = False  # True 表示路线为降级估算（非 OSRM 实测）
    vehicle_count: int = 1


class TemplateCreate(BaseModel):
    name: str
    config: dict


class TemplateUpdate(BaseModel):
    name: str


class TemplateOut(BaseModel):
    id: str
    name: str
    config: dict
    created_at: datetime


class BatchRowInput(BaseModel):
    """对应批量导入 Excel 里的一行。"""

    origin_lat: float
    origin_lng: float
    dest_lat: float
    dest_lng: float
    weight_kg: float = Field(gt=0)
    volume_m3: float | None = None
    cargo_type: str = "normal"
    loading_mode: Literal["consolidated", "full_truck"]  # 替代旧 vehicle_type+body_type
    vehicle_model_id: str | None = None
    empty_return: bool = False
    need_loading: bool = False
    avoid_restricted_zones: bool = False
    avoid_construction_zones: bool = False
    via_mountain_road: bool = False
    via_port: bool = False
    cargo_value_vnd: float | None = None
    fuel_price_vnd: float | None = None
    wage_hourly_vnd: float | None = None
    toll_rate_vnd_per_km: float | None = None
    misc_cost_vnd: float = 0.0

    @model_validator(mode="after")
    def _check_conditional_fields(self) -> "BatchRowInput":
        if self.loading_mode == "full_truck" and not self.vehicle_model_id:
            raise ValueError("整车模式（full_truck）必须指定 vehicle_model_id")
        if self.loading_mode == "consolidated" and self.volume_m3 is None:
            raise ValueError("拼货模式（consolidated）必须填写 volume_m3")
        return self


class BatchRequest(BaseModel):
    rows: list[dict]


class BatchRowResult(BaseModel):
    row_index: int
    success: bool
    error: str | None = None
    quote: QuoteResponse | None = None


class BatchResponse(BaseModel):
    results: list[BatchRowResult]


# ── AI 分析 API 模型 ──

class AIPredictionSample(BaseModel):
    """单个预测偏差样本，供 AI 分析。"""
    vehicle_model_id: str
    dest: str = ""
    distance_km: float
    actual_vnd: float
    predicted_vnd: float
    error_pct: float
    notes: str = ""


class AIAnalysisRequest(BaseModel):
    """AI 分析请求。"""
    predictions: list[AIPredictionSample]
    context: str | None = None


class AIAnalysisResponse(BaseModel):
    """AI 分析响应。"""
    deviation_analysis: dict | None = None
    route_features: dict | None = None
    optimization_suggestions: dict | None = None


class AIRouteClassifyRequest(BaseModel):
    """路线特征分类请求。"""
    destinations: list[str]


class AIRouteClassifyResponse(BaseModel):
    """路线特征分类响应。"""
    route_features: dict


class AIExtractQuoteRequest(BaseModel):
    """报价提取请求。"""
    raw_text: str


class AIExtractQuoteResponse(BaseModel):
    """报价提取响应。"""
    extracted: dict


class AIStatusResponse(BaseModel):
    """AI 服务状态。"""
    status: str
    model: str
    message: str


# ── AI 对话聊天 API 模型 ──

class AIChatMessage(BaseModel):
    """单条聊天消息。"""
    role: str  # "user" | "assistant"
    content: str


class AIChatRequest(BaseModel):
    """AI 对话请求。"""
    messages: list[AIChatMessage]
    temperature: float | None = None
    max_tokens: int | None = None
