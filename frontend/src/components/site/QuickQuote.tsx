"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { geocodeAddress, getVehicleModels, quoteCost, type GeocodeResult } from "@/lib/api";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { formatVnd } from "@/lib/format";
import type { QuoteResponse, VehicleModelsByCategory, LatLng, RouteGeometry } from "@/lib/types";

/* 动态导入 Leaflet 地图与 AI 面板（SSR 不兼容） */
const MiniMap = dynamic(() => import("@/components/site/MiniMap"), { ssr: false });
const AIChatPanel = dynamic(() => import("@/components/AIChatPanel"), { ssr: false });

type QuickQuoteResult = {
  total: number;
  distanceKm: number;
  durationH: number;
  vehicleName: string;
} | null;

type TabKey = "quote" | "ai" | "map";

function AddressPicker({
  label,
  placeholder,
  value,
  onSelect,
}: {
  label: string;
  placeholder: string;
  value: GeocodeResult | null;
  onSelect: (r: GeocodeResult) => void;
}) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const skipRef = useRef(false);
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    if (value) {
      skipRef.current = true;
      setQuery(value.display_name);
    }
  }, [value]);

  useEffect(() => {
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const found = await geocodeAddress(query);
        setResults(found);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="relative">
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-200)]">
        {label}
      </label>
      <input
        type="text"
        className="w-full rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-[var(--brand-200)]/60 backdrop-blur-sm transition-colors focus:border-[var(--teal-400)] focus:bg-white/15 focus:outline-none"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {loading && (
        <div className="absolute right-3 top-[34px] text-xs text-[var(--teal-400)]">…</div>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto overscroll-contain rounded-xl border border-white/15 bg-[#0f2b4a] shadow-xl">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              className="block w-full px-3.5 py-2 text-left text-sm text-[var(--brand-100)] transition-colors hover:bg-[var(--teal-500)]/15 hover:text-white"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(r);
                setQuery(r.display_name);
                setOpen(false);
              }}
            >
              {r.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function QuickQuote() {
  const { t } = useLocale();
  const [tab, setTab] = useState<TabKey>("quote");

  const [origin, setOrigin] = useState<GeocodeResult | null>(null);
  const [dest, setDest] = useState<GeocodeResult | null>(null);
  const [weightTon, setWeightTon] = useState("");
  const [cargoType, setCargoType] = useState("normal");
  const [vehicleModelId, setVehicleModelId] = useState(""); // "" = 自动匹配
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuickQuoteResult>(null);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<VehicleModelsByCategory>({});

  // 地图联动：AI 或报价计算出的路线
  const [mapOrigin, setMapOrigin] = useState<LatLng | null>(null);
  const [mapDest, setMapDest] = useState<LatLng | null>(null);
  const [mapRoute, setMapRoute] = useState<RouteGeometry | null>(null);

  const cargoTypes = ["normal", "cold_chain", "hazardous", "oversized", "heavy_equipment", "other"];

  useEffect(() => {
    getVehicleModels()
      .then(setModels)
      .catch(() => setModels({}));
  }, []);

  // 扁平化车型列表供下拉选择
  const allModels = useCallback(() => Object.values(models).flat(), [models]);

  /** 根据货型+重量过滤可用车型 */
  const filteredModels = useCallback(() => {
    const ton = (parseFloat(weightTon) || 0);
    const all = allModels();
    if (ton <= 0) return all;
    return all.filter((m) => m.suitable_cargo_types.includes(cargoType) && m.max_load_ton >= ton);
  }, [allModels, weightTon, cargoType]);

  /** 解析选中的车型；空 = 自动匹配最小可用 */
  const resolveVehicleId = useCallback(
    (weightKg: number): string | undefined => {
      if (vehicleModelId) return vehicleModelId;
      const all = allModels();
      if (all.length === 0) return undefined;
      const ton = weightKg / 1000;
      const suitable = all.filter(
        (m) => m.suitable_cargo_types.includes(cargoType) && m.max_load_ton >= ton,
      );
      const pool = suitable.length > 0 ? suitable : all;
      pool.sort((a, b) => a.max_load_ton - b.max_load_ton);
      return pool[0].model_id;
    },
    [allModels, cargoType, vehicleModelId],
  );

  const loadRoute = useCallback(async (o: LatLng, d: LatLng) => {
    try {
      const url = `${
        process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1"
      }/route?origin_lat=${o.lat}&origin_lng=${o.lng}&dest_lat=${d.lat}&dest_lng=${d.lng}`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        setMapRoute(data.geometry as RouteGeometry);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    setError(null);
    setResult(null);
    if (!origin || !dest) {
      setError(t.site.quickQuote.error);
      return;
    }
    const weightKg = (parseFloat(weightTon) || 0) * 1000;
    if (weightKg <= 0) {
      setError(t.site.quickQuote.error);
      return;
    }
    const vid = resolveVehicleId(weightKg);
    if (!vid) {
      setError(t.site.quickQuote.error);
      return;
    }
    setSubmitting(true);
    try {
      const resp = await quoteCost({
        route: {
          origin: { lat: origin.lat, lng: origin.lng },
          destination: { lat: dest.lat, lng: dest.lng },
          waypoints: [],
        },
        cargo: {
          weight_kg: weightKg,
          type: cargoType,
        },
        vehicle: {
          loading_mode: "full_truck",
          vehicle_model_id: vid,
          empty_return: false,
          need_loading: false,
          avoid_restricted_zones: false,
          avoid_construction_zones: false,
          via_mountain_road: false,
        },
        cost_params: { misc_cost_vnd: 0 },
      });
      const q: QuoteResponse = resp;
      setResult({
        total: q.breakdown.cost_total,
        distanceKm: q.route.distance_km,
        durationH: q.route.duration_h,
        vehicleName: q.breakdown.matched_vehicle_model_name,
      });
      // 地图联动
      setMapOrigin({ lat: origin.lat, lng: origin.lng });
      setMapDest({ lat: dest.lat, lng: dest.lng });
      loadRoute({ lat: origin.lat, lng: origin.lng }, { lat: dest.lat, lng: dest.lng });
    } catch {
      setError(t.site.quickQuote.error);
    } finally {
      setSubmitting(false);
    }
  }, [origin, dest, weightTon, cargoType, resolveVehicleId, t, loadRoute]);

  // AI 路线联动回调（由 AIChatPanel 传入）
  const handleChatRoute = useCallback(
    (coords: { origin: LatLng; destination: LatLng }) => {
      setMapOrigin(coords.origin);
      setMapDest(coords.destination);
      loadRoute(coords.origin, coords.destination);
    },
    [loadRoute],
  );

  const s = t.site.quickQuote;

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-white/15 bg-[#0f2b4a]/90 shadow-2xl backdrop-blur-md">
      {/* Tab 栏 */}
      <div className="flex items-stretch border-b border-white/10">
        {(
          [
            { key: "quote", icon: "🧮", label: s.tabQuote },
            { key: "ai", icon: "💬", label: s.tabAI },
            { key: "map", icon: "🗺️", label: s.tabMap },
          ] as { key: TabKey; icon: string; label: string }[]
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-3 text-sm font-semibold transition-colors ${
              tab === item.key
                ? "border-b-2 border-[var(--teal-500)] bg-white/5 text-[var(--teal-300)]"
                : "text-[var(--brand-100)]/60 hover:bg-white/5 hover:text-[var(--brand-100)]"
            }`}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div className="p-5 sm:p-6">
        {/* ═══════ 报价表单 ═══════ */}
        <div className={tab === "quote" ? "" : "hidden"}>
          <div className="mb-4 flex items-center gap-3">
              <span className="h-8 w-1 rounded-full bg-[var(--teal-500)]" />
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[var(--teal-400)]">
                  {s.eyebrow}
                </p>
                <h3 className="mt-0.5 text-lg font-bold leading-snug text-white">{s.title}</h3>
              </div>
            </div>
            <p className="mb-4 text-[13px] leading-relaxed text-[var(--brand-100)]/70">{s.intro}</p>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <AddressPicker
                label={s.originLabel}
                placeholder={s.originPlaceholder}
                value={origin}
                onSelect={setOrigin}
              />
              <AddressPicker
                label={s.destLabel}
                placeholder={s.destPlaceholder}
                value={dest}
                onSelect={setDest}
              />
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-200)]">
                  {s.weightLabel}
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  inputMode="decimal"
                  className="w-full rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-[var(--brand-200)]/60 backdrop-blur-sm transition-colors focus:border-[var(--teal-400)] focus:bg-white/15 focus:outline-none"
                  placeholder={s.weightPlaceholder}
                  value={weightTon}
                  onChange={(e) => setWeightTon(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-200)]">
                  {s.typeLabel}
                </label>
                <select
                  className="w-full rounded-xl border border-white/15 bg-[#122f52] px-3.5 py-2.5 text-sm text-white transition-colors focus:border-[var(--teal-400)] focus:outline-none"
                  value={cargoType}
                  onChange={(e) => setCargoType(e.target.value)}
                >
                  {cargoTypes.map((ct) => (
                    <option key={ct} value={ct}>
                      {t.labels.cargoType[ct] ?? ct}
                    </option>
                  ))}
                </select>
              </div>
              {/* 车型选择（含自动匹配） */}
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-200)]">
                  {s.vehicleLabel}
                </label>
                <select
                  className="w-full rounded-xl border border-white/15 bg-[#122f52] px-3.5 py-2.5 text-sm text-white transition-colors focus:border-[var(--teal-400)] focus:outline-none"
                  value={vehicleModelId}
                  onChange={(e) => setVehicleModelId(e.target.value)}
                >
                  <option value="">{s.vehicleAuto}</option>
                  {filteredModels().map((m) => (
                    <option key={m.model_id} value={m.model_id}>
                      {m.display_name}（{m.max_load_ton} 吨）
                    </option>
                  ))}
                </select>
                {vehicleModelId === "" && filteredModels().length === 0 && allModels().length === 0 && (
                  <p className="mt-1 text-[11px] text-[var(--brand-100)]/40">车型库加载中…</p>
                )}
              </div>
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="mt-4 w-full rounded-xl bg-[var(--teal-500)] px-4 py-3 text-sm font-bold text-[#06281f] shadow-lg shadow-[#08c792]/20 transition-all hover:bg-[var(--teal-400)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? s.calculating : s.submit}
            </button>

            {error && (
              <div className="mt-3.5 rounded-lg border border-red-400/30 bg-red-500/15 px-3.5 py-2.5 text-sm text-red-200">
                {error}
              </div>
            )}

            {result && (
              <div className="mt-4 rounded-xl border border-[var(--teal-500)]/25 bg-[var(--teal-500)]/8 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-[var(--teal-400)]">
                  {s.resultTitle}
                </p>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-[var(--brand-100)]/60">{s.totalLabel}</p>
                    <p className="text-2xl font-bold tabular-nums text-[var(--teal-300)]">
                      {formatVnd(result.total)}
                    </p>
                  </div>
                  <div className="text-right text-xs text-[var(--brand-100)]/60">
                    <p>
                      {s.distanceLabel}:{" "}
                      <span className="font-semibold text-white">{result.distanceKm.toFixed(1)} km</span>
                    </p>
                    <p>
                      {s.modelLabel}:{" "}
                      <span className="font-semibold text-white">{result.vehicleName}</span>
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Link
                    href="/quote"
                    className="flex-1 rounded-lg bg-white/5 py-2 text-center text-sm font-semibold text-[var(--teal-300)] transition-colors hover:bg-white/10 hover:text-[var(--teal-200)]"
                  >
                    {s.fullTool} →
                  </Link>
                  <button
                    type="button"
                    onClick={() => setTab("map")}
                    className="flex-1 rounded-lg bg-[var(--teal-500)]/15 py-2 text-center text-sm font-semibold text-[var(--teal-300)] transition-colors hover:bg-[var(--teal-500)]/25"
                  >
                    🗺️ {s.tabMap} →
                  </button>
                </div>
              </div>
            )}

            <p className="mt-3.5 text-xs leading-relaxed text-[var(--brand-100)]/50">{s.note}</p>
        </div>

        {/* ═══════ AI 聊天 ═══════ */}
        <div className={tab === "ai" ? "h-[380px]" : "hidden"}>
          <AIChatPanel onRouteFound={handleChatRoute} />
        </div>

        {/* ═══════ 地图小窗 ═══════ */}
        <div className={tab === "map" ? "" : "hidden"}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[var(--teal-400)]">
                {s.tabMap}
              </p>
              <h3 className="mt-0.5 text-base font-bold text-white">
                {mapOrigin ? "中越运输路线" : "选择起终点后自动显示路线"}
              </h3>
            </div>
            {(mapOrigin || mapDest) && (
              <Link
                href="/quote"
                className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-[var(--teal-300)] transition-colors hover:bg-white/10"
              >
                {s.fullTool} →
              </Link>
            )}
          </div>
          <div className="h-[320px] overflow-hidden rounded-xl border border-white/15">
            {/* 仅在地图 tab 激活时挂载，避免页面加载即初始化 Leaflet 拉取瓦片 */}
            {tab === "map" && (
              <MiniMap
                origin={mapOrigin}
                destination={mapDest}
                routeGeometry={mapRoute}
              />
            )}
          </div>
          {(origin || dest) && !mapOrigin && (
            <p className="mt-3 text-center text-xs text-[var(--brand-100)]/50">
              💡 在「{s.tabQuote}」或「{s.tabAI}」中选择起终点并计算后，路线将显示在这里
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
