"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import {
  fetchFeesOnly,
  getCargoTypeRates,
  getFuelPrice,
  getVehicleModels,
  quoteAlternatives,
  quoteCost,
} from "@/lib/api";
import type {
  CargoTypeRate,
  DDPFullResult,
  QuoteFormState,
  QuoteMode,
  QuoteRequest,
  QuoteResponse,
  VehicleModelsByCategory,
} from "@/lib/types";

function buildDefaultForm(): QuoteFormState {
  return {
    originLat: "",
    originLng: "",
    destLat: "",
    destLng: "",
    waypoints: [],
    weightKg: "",
    weightUnit: "ton" as const,
    volumeM3: "",
    cargoType: "normal",
    cargoValueVnd: "",
    loadingMode: "full_truck",
    vehicleModelId: "",
    emptyReturn: false,
    needLoading: false,
    avoidRestrictedZones: false,
    avoidConstructionZones: false,
    viaMountainRoad: false,
    fuelPriceVnd: "",
    wageHourlyVnd: "",
    tollRateVndPerKm: "",
    miscCostVnd: "0",
  };
}

export function useQuoteForm() {
  const [form, setForm] = useState<QuoteFormState>(buildDefaultForm());
  const [vehicleModelsByCategory, setVehicleModels] = useState<VehicleModelsByCategory>({});
  const [cargoTypeRates, setCargoTypeRates] = useState<Record<string, CargoTypeRate>>({});
  const [pickMode, setPickMode] = useState<"origin" | "destination" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState<QuoteResponse | null>(null);
  const [alternatives, setAlternatives] = useState<QuoteResponse[]>([]);
  const [selectedAltIndex, setSelectedAltIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // 报价模式
  const [quoteMode, setQuoteMode] = useState<QuoteMode>("transport_only");

  // DDP 纯口岸费用
  const [ddpFullResult, setDDPFullResult] = useState<DDPFullResult | null>(null);
  const [ddpFullLoading, setDDPFullLoading] = useState(false);

  const ddpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // DDP 模式自动拉取口岸费（车数变化时触发）
  const fetchDDP = useCallback(
    (vehicleCount: number) => {
      setDDPFullLoading(true);
      fetchFeesOnly(vehicleCount)
        .then((res) => setDDPFullResult(res))
        .catch(() => setDDPFullResult(null))
        .finally(() => setDDPFullLoading(false));
    },
    [],
  );

  useEffect(() => {
    if (quoteMode !== "ddp_full") {
      setDDPFullResult(null);
      return;
    }
    if (ddpTimer.current) clearTimeout(ddpTimer.current);
    ddpTimer.current = setTimeout(() => {
      const vc = result?.vehicle_count || result?.breakdown?.vehicle_count || 1;
      fetchDDP(vc);
    }, 300);
    return () => {
      if (ddpTimer.current) clearTimeout(ddpTimer.current);
    };
  }, [quoteMode, result, fetchDDP]);

  // Load reference data
  useEffect(() => {
    Promise.all([getVehicleModels(), getCargoTypeRates(), getFuelPrice()])
      .then(([models, rates, fuel]) => {
        setVehicleModels(models);
        setCargoTypeRates(rates);
        setForm((f) => ({
          ...f,
          fuelPriceVnd: String(fuel.price_vnd),
        }));
      })
      .catch((e) => console.error("Failed to load reference data", e));
  }, []);

  const updateForm = useCallback((patch: Partial<QuoteFormState>) => {
    setForm((f) => ({ ...f, ...patch }));
  }, []);

  const buildRequest = useCallback(
    (fm: QuoteFormState): QuoteRequest => {
      const costParams: QuoteRequest["cost_params"] = { misc_cost_vnd: parseFloat(fm.miscCostVnd) || 0 };
      if (fm.fuelPriceVnd) costParams.fuel_price_vnd = parseFloat(fm.fuelPriceVnd);
      if (fm.wageHourlyVnd) costParams.wage_hourly_vnd = parseFloat(fm.wageHourlyVnd);
      if (fm.tollRateVndPerKm) costParams.toll_rate_vnd_per_km = parseFloat(fm.tollRateVndPerKm);

      return {
        route: {
          origin: { lat: parseFloat(fm.originLat), lng: parseFloat(fm.originLng) },
          destination: { lat: parseFloat(fm.destLat), lng: parseFloat(fm.destLng) },
          waypoints: fm.waypoints.filter((w) => w.lat && w.lng),
        },
        cargo: {
          weight_kg: fm.weightUnit === "ton"
            ? (parseFloat(fm.weightKg) || 0) * 1000
            : (parseFloat(fm.weightKg) || 0),
          volume_m3: fm.volumeM3 ? parseFloat(fm.volumeM3) : undefined,
          type: fm.cargoType,
          value_vnd: fm.cargoValueVnd ? parseFloat(fm.cargoValueVnd) : undefined,
        },
        vehicle: {
          loading_mode: fm.loadingMode,
          vehicle_model_id: fm.loadingMode === "full_truck" ? fm.vehicleModelId || undefined : undefined,
          empty_return: fm.emptyReturn,
          need_loading: fm.needLoading,
          avoid_restricted_zones: fm.avoidRestrictedZones,
          avoid_construction_zones: fm.avoidConstructionZones,
          via_mountain_road: fm.viaMountainRoad,
        },
        cost_params: costParams,
      };
    },
    [],
  );

  const validate = useCallback(
    (fm: QuoteFormState): string | null => {
      if (!fm.originLat || !fm.originLng || !fm.destLat || !fm.destLng) {
        return "setOriginDest";
      }
      if (fm.loadingMode === "consolidated" && (!fm.weightKg || !fm.volumeM3)) {
        return "volumeRequiredForConsolidated";
      }
      if (fm.loadingMode === "full_truck" && !fm.vehicleModelId) {
        return "selectVehicleModel";
      }
      return null;
    },
    [],
  );

  /** 逐步骤验证：返回错误码或 null */
  const validateStep = useCallback(
    (fm: QuoteFormState, stepIndex: number, mode: string): string | null => {
      if (stepIndex === 0) {
        if (!fm.originLat || !fm.originLng) return "stepOriginRequired";
        if (!fm.destLat || !fm.destLng) return "stepDestRequired";
        return null;
      }
      if (mode === "consolidated" && stepIndex === 1) {
        if (!fm.weightKg || parseFloat(fm.weightKg) <= 0) return "stepWeightRequired";
        if (!fm.volumeM3 || parseFloat(fm.volumeM3) <= 0) return "stepVolumeRequired";
        return null;
      }
      if (mode === "full_truck" && stepIndex === 1) {
        if (!fm.vehicleModelId) return "stepVehicleRequired";
        return null;
      }
      return null;
    },
    [],
  );

  const submit = useCallback(async () => {
    const err = validate(form);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setSubmitting(true);
    setAlternatives([]);
    setDDPFullResult(null);
    try {
      const req = buildRequest(form);

      // Step 1: 获取 OSRM 多路线
      const altRes = await quoteAlternatives(req);
      const osrmRoutes = altRes.options.length > 0 ? altRes.options : [];

      // Step 2: 无路线 → 兜底单路线
      if (osrmRoutes.length === 0) {
        const single = await quoteCost(req);
        setResult(single);
        setAlternatives([single]);
        setSelectedAltIndex(0);
        setSubmitting(false);
        return;
      }

      // Step 3: OSRM 有多条路线 → 直接使用
      if (osrmRoutes.length >= 2) {
        setAlternatives(osrmRoutes);
        setResult(osrmRoutes[0]);
        setSelectedAltIndex(0);
        setSubmitting(false);
        return;
      }

      // Step 4: OSRM 只有 1 条路线 → 用不同车型生成对比方案
      const mainRoute = osrmRoutes[0];
      const allResults: QuoteResponse[] = [mainRoute];

      // 收集同类可适配车型（排除当前选中车型，最多3个）
      const altModels: string[] = [];
      for (const models of Object.values(vehicleModelsByCategory)) {
        for (const m of models) {
          if (m.model_id !== form.vehicleModelId && m.suitable_cargo_types.includes(form.cargoType)) {
            altModels.push(m.model_id);
            if (altModels.length >= 3) break;
          }
        }
        if (altModels.length >= 3) break;
      }

      // 并行计算备选车型报价
      if (altModels.length > 0) {
        const altReqs = altModels.map((modelId) => {
          const altReq = buildRequest({ ...form, vehicleModelId: modelId });
          return quoteCost(altReq).catch(() => null);
        });
        const altResults = await Promise.all(altReqs);
        for (const r of altResults) {
          if (r) allResults.push(r);
        }
      }

      // 按总费用排序
      allResults.sort((a, b) => a.breakdown.cost_total - b.breakdown.cost_total);
      setAlternatives(allResults);
      setResult(allResults[0]);
      setSelectedAltIndex(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [form, validate, buildRequest, vehicleModelsByCategory]);

  const compareAlternatives = useCallback(async () => {
    const err = validate(form);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setComparing(true);
    try {
      const req = buildRequest(form);
      const res = await quoteAlternatives(req);
      const all = res.options.length > 0 ? res.options : [];
      setAlternatives(all);
      if (all.length === 0) {
        setError("未找到备选路线，请尝试调整起终点距离或更换车型再试");
      } else {
        setResult(all[0]);
        setSelectedAltIndex(0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setComparing(false);
    }
  }, [form, validate, buildRequest, result]);

  return {
    form,
    vehicleModelsByCategory,
    cargoTypeRates,
    pickMode,
    setPickMode,
    submitting,
    comparing,
    result,
    alternatives,
    selectedAltIndex,
    setSelectedAltIndex,
    error,
    setError,
    updateForm,
    submit,
    compareAlternatives,
    validateStep,
    quoteMode,
    setQuoteMode,
    ddpFullResult,
    ddpFullLoading,
  };
}
