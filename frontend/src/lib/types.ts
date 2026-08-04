export interface LatLng {
  lat: number;
  lng: number;
  address?: string;
}

export type LoadingMode = "consolidated" | "full_truck";

export interface VehicleModel {
  model_id: string;
  display_name: string;
  max_load_ton: number;
  volume_capacity_m3: number | null;
  length_m: number | null;
  width_m: number | null;
  height_m: number | null;
  base_rate_vnd_per_km: number;
  fuel_l_per_100km: number;
  fuel_penalty: number;
  fixed_surcharge_vnd: number;
  toll_rate_vnd_per_km: number;
  osrm_profile: string;
  suitable_cargo_types: string[];
  notes: string;
}

export type VehicleModelsByCategory = Record<string, VehicleModel[]>;

export interface CargoTypeRate {
  rate_multiplier: number;
  fuel_penalty: number;
}

export interface QuoteRequest {
  route: {
    origin: LatLng;
    destination: LatLng;
    waypoints: LatLng[];
  };
  cargo: {
    weight_kg: number;
    volume_m3?: number;
    type: string;
    value_vnd?: number;
  };
  vehicle: {
    loading_mode: LoadingMode;
    vehicle_model_id?: string;
    empty_return: boolean;
    need_loading: boolean;
    avoid_restricted_zones: boolean;
    avoid_construction_zones: boolean;
    via_mountain_road: boolean;
  };
  cost_params: {
    fuel_price_vnd?: number;
    wage_hourly_vnd?: number;
    toll_rate_vnd_per_km?: number;
    misc_cost_vnd: number;
  };
}

export interface RouteGeometry {
  type: "LineString";
  coordinates: [number, number][];
}

export interface QuoteFormState {
  originLat: string;
  originLng: string;
  destLat: string;
  destLng: string;
  waypoints: LatLng[];
  weightKg: string;
  weightUnit: "ton" | "kg";  // 显示单位，提交时统一转 kg
  volumeM3: string;
  cargoType: string;
  cargoValueVnd: string;
  loadingMode: LoadingMode;
  vehicleModelId: string;
  emptyReturn: boolean;
  needLoading: boolean;
  avoidRestrictedZones: boolean;
  avoidConstructionZones: boolean;
  viaMountainRoad: boolean;
  fuelPriceVnd: string;
  wageHourlyVnd: string;
  tollRateVndPerKm: string;
  miscCostVnd: string;
}

export interface QuoteResponse {
  route: {
    distance_km: number;
    duration_h: number;
    geometry: RouteGeometry;
  };
  timing: {
    speed_factor: number;
    adjusted_duration_h: number;
    rest_hours: number;
    loading_hours: number;
    total_duration_h: number;
  };
  breakdown: {
    cost_distance: number;
    cost_time: number;
    cost_fuel: number;
    cost_loading: number;
    cost_insurance: number;
    cost_toll: number;
    cost_misc: number;
    cost_body_surcharge: number;
    cost_restricted_zone: number;
    cost_construction_zone: number;
    cost_mountain_road: number;
    cost_port: number;
    cost_fixed: number;
    cost_total: number;
    cost_per_km: number;
    cost_per_ton_km: number | null;
    capacity_ratio: number;
    matched_vehicle_model_id: string;
    matched_vehicle_model_name: string;
    vehicle_count: number;
    cost_per_vehicle: number | null;
  };
  suggestions: Suggestion[];
  vehicle_count: number;
}

export interface Suggestion {
  code: string;
  params: Record<string, string>;
}

export interface TemplateOut {
  id: string;
  name: string;
  config: QuoteFormState;
  created_at: string;
}

export interface BatchRowInput {
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  weight_kg: number;
  volume_m3?: number;
  cargo_type: string;
  loading_mode: LoadingMode;
  vehicle_model_id?: string;
  empty_return: boolean;
  need_loading: boolean;
  avoid_restricted_zones: boolean;
  avoid_construction_zones: boolean;
  via_mountain_road: boolean;
  cargo_value_vnd?: number;
  fuel_price_vnd?: number;
  wage_hourly_vnd?: number;
  toll_rate_vnd_per_km?: number;
  misc_cost_vnd: number;
}

export interface BatchRowResult {
  row_index: number;
  success: boolean;
  error: string | null;
  quote: QuoteResponse | null;
}

// ── 边境/进出口费用 ──

export type TransportMode = "land" | "sea";

/** 报价模式 */
export type QuoteMode = "transport_only" | "ddp_full";

export interface BorderCostParams {
  vehicle_count: number;
  container_count: number;
  container_type: string;
  transport_mode: TransportMode;
  cargo_value_rmb: number;
  hs_code: string;
}

/** 旧版接口类型（保持兼容） */
export interface BorderCostResult {
  china_export: {
    customs_declaration: number;
    yard_fee: number;
    unloading: number;
    total: number;
  };
  border_crossing: {
    transloading: number;
    total: number;
  };
  vietnam_import: {
    customs_clearance: number;
    yard_fee: number;
    inspection?: number;
    total: number;
  };
  import_duty_rmb: number;
  vat_rmb: number;
  total_rmb: number;
  tariff_desc?: string;
  duty_source?: string;
  duty_rate?: number;
  vat_rate?: number;
}

/** 🆕 两端分开报价结果 */
export interface DDPFullItem {
  customs_declaration?: number;
  yard_fee?: number;
  unloading?: number;
  transloading?: number;
  domestic_transport?: number;
  export_tax_rebate?: number;
  customs_clearance?: number;
  inspection?: number;
  insurance?: number;
  import_duty?: number;
  vat?: number;
  detention?: number;
  heavy_lift?: number;
  port_charge?: number;
  trucking_to_site?: number;
  breakbulk_port?: number;
}

export interface DDPFullSide {
  items: DDPFullItem;
  subtotal: number;
}

export interface DDPFullResult {
  china_side: DDPFullSide;
  vietnam_side: DDPFullSide;
  china_total: number;
  vietnam_total: number;
  ddp_total: number;
  tariff_info?: {
    hs_code: string;
    desc: string;
    duty_source: string;
    duty_rate: number | null;
    vat_rate: number | null;
  } | null;
}

/** DDP 全链路参数 */
export interface DDPFullParams {
  vehicle_count: number;
  domestic_transport_rmb: number;
  cargo_value_rmb: number;
  hs_code: string;
  transport_cost_vnd: number;
  container_count: number;
  container_type: string;
  is_breakbulk: boolean;
  breakbulk_tons: number;
  detention_days: number;
  heavy_lift_tons: number;
  include_export_rebate: boolean;
}
