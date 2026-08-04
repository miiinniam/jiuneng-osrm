import type {
  BatchRowInput,
  BatchRowResult,
  BorderCostParams,
  BorderCostResult,
  CargoTypeRate,
  DDPFullParams,
  DDPFullResult,
  QuoteFormState,
  QuoteRequest,
  QuoteResponse,
  TemplateOut,
  VehicleModelsByCategory,
} from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `请求失败 (${res.status})`);
  }
  return res.json();
}

async function apiGet<T>(path: string): Promise<T> {
  return handleResponse(await fetch(`${API_BASE}${path}`));
}

async function apiSend<T>(method: string, path: string, body?: unknown): Promise<T> {
  return handleResponse(
    await fetch(`${API_BASE}${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  );
}

export function getVehicleModels(): Promise<VehicleModelsByCategory> {
  return apiGet("/reference/vehicle-models");
}

export function getCargoTypeRates(): Promise<Record<string, CargoTypeRate>> {
  return apiGet("/reference/cargo-types");
}

export function getFuelPrice(): Promise<{ price_vnd: number; source: string }> {
  return apiGet("/reference/fuel-price");
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  display_name: string;
}

export function geocodeAddress(query: string): Promise<GeocodeResult[]> {
  return apiGet(`/geocode?q=${encodeURIComponent(query)}&limit=6`);
}

export function quoteCost(request: QuoteRequest): Promise<QuoteResponse> {
  return apiSend("POST", "/route/cost", request);
}

export function quoteAlternatives(request: QuoteRequest): Promise<{ options: QuoteResponse[] }> {
  return apiSend("POST", "/route/alternatives", request);
}

export function listTemplates(): Promise<TemplateOut[]> {
  return apiGet("/templates");
}

export function createTemplate(name: string, config: QuoteFormState): Promise<TemplateOut> {
  return apiSend("POST", "/templates", { name, config });
}

export function renameTemplate(id: string, name: string): Promise<TemplateOut> {
  return apiSend("PUT", `/templates/${id}`, { name });
}

export function deleteTemplate(id: string): Promise<{ ok: boolean }> {
  return apiSend("DELETE", `/templates/${id}`);
}

export function batchQuote(rows: BatchRowInput[]): Promise<{ results: BatchRowResult[] }> {
  return apiSend("POST", "/batch/quote", { rows });
}

// ── 边境/进出口费用 ──

/** 🆕 纯口岸费用（两端分开） */
export function fetchFeesOnly(
  vehicleCount: number,
  domesticTransportRmb: number = 0,
): Promise<DDPFullResult> {
  const sp = new URLSearchParams();
  sp.set("vehicle_count", String(vehicleCount));
  sp.set("domestic_transport_rmb", String(domesticTransportRmb));
  return apiGet(`/border/fees-only?${sp.toString()}`);
}

/** 旧接口：带税费（保留备用） */
export function fetchDDPFull(params: DDPFullParams): Promise<DDPFullResult> {
  const sp = new URLSearchParams();
  sp.set("vehicle_count", String(params.vehicle_count));
  sp.set("domestic_transport_rmb", String(params.domestic_transport_rmb));
  sp.set("cargo_value_rmb", String(params.cargo_value_rmb));
  sp.set("hs_code", params.hs_code);
  sp.set("transport_cost_vnd", String(params.transport_cost_vnd));
  sp.set("container_count", String(params.container_count));
  sp.set("container_type", params.container_type);
  sp.set("is_breakbulk", String(params.is_breakbulk));
  sp.set("breakbulk_tons", String(params.breakbulk_tons));
  sp.set("detention_days", String(params.detention_days));
  sp.set("heavy_lift_tons", String(params.heavy_lift_tons));
  sp.set("include_export_rebate", String(params.include_export_rebate));
  return apiGet(`/border/ddp-full?${sp.toString()}`);
}

/** 旧接口（保持兼容） */
export function fetchBorderCosts(params: BorderCostParams): Promise<BorderCostResult> {
  const sp = new URLSearchParams();
  sp.set("vehicle_count", String(params.vehicle_count));
  sp.set("container_count", String(params.container_count));
  sp.set("container_type", params.container_type);
  sp.set("cargo_value_rmb", String(params.cargo_value_rmb));
  sp.set("hs_code", params.hs_code);
  if (params.transport_mode === "sea") {
    sp.set("is_breakbulk", "false");
  }
  return apiGet(`/border/ddp-costs?${sp.toString()}`);
}

export function searchHSCode(query: string): Promise<{ hs: string; desc_vn: string; desc_en: string; acfta: number | null; vat: number }[]> {
  return apiGet(`/border/hs-search?q=${encodeURIComponent(query)}&limit=8`);
}

// ── 实时汇率 ──

export interface ExchangeRate {
  vnd_per_rmb: number;
  source: string;
  updated: string;
}

export function fetchExchangeRate(): Promise<ExchangeRate> {
  return apiGet("/reference/exchange-rate");
}
