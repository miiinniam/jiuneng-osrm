"use client";

import { useEffect, useState } from "react";
import { formatVnd, formatHours } from "@/lib/format";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { DDPFullResult, LoadingMode, QuoteResponse } from "@/lib/types";
import { fetchExchangeRate } from "@/lib/api";
import RouteOptions from "@/components/RouteOptions";

interface Props {
  result: QuoteResponse;
  alternatives: QuoteResponse[];
  selectedAltIndex: number;
  onSelectAlt: (i: number) => void;
  loadingMode: LoadingMode;
  collapsed: boolean;
  onToggle: () => void;
  ddpFullResult?: DDPFullResult | null;
  ddpFullLoading?: boolean;
  isDDPFull?: boolean;
}

/* ── 费用进度条 ── */
function CostBar({ label, value, pct }: { label: string; value: number; pct: number }) {
  const colors = ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#06b6d4", "#6366f1"];
  const color = colors[Math.abs(label.length) % colors.length];
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-20 shrink-0 text-xs text-[var(--surface-500)] truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-[var(--surface-100)] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }} />
      </div>
      <span className="w-24 shrink-0 text-right text-xs text-[var(--surface-700)] tabular-nums font-semibold">{formatVnd(value)}</span>
    </div>
  );
}

/* ── 口岸费用卡片 ── */
function BorderFeesCard({ result, loading, vehicleCount, vndPerRmb, t }: {
  result: DDPFullResult | null | undefined; loading: boolean; vehicleCount: number;
  vndPerRmb: number;
  t: ReturnType<typeof useLocale>["t"];
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-50)] p-3 animate-pulse">
        <div className="h-4 w-1/2 rounded bg-[var(--surface-200)] mb-3" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-20 rounded bg-[var(--surface-200)]" />
          <div className="h-20 rounded bg-[var(--surface-200)]" />
        </div>
      </div>
    );
  }
  if (!result) return null;

  const borderVnd = Math.round(result.ddp_total * vndPerRmb);
  const itemLabels = t.border.itemLabels as Record<string, string>;

  const renderSide = (items: Record<string, number>, subtotal: number, title: string, cls: string) => {
    const entries = Object.entries(items).filter(([, v]) => v !== 0);
    if (entries.length === 0) return null;
    return (
      <div className={`rounded-xl border p-3 ${cls}`}>
        <p className="text-[11px] font-semibold mb-2 text-[var(--surface-500)]">{title}</p>
        {entries.map(([key, value]) => (
          <div key={key} className="flex justify-between text-xs py-0.5">
            <span className="text-[var(--surface-500)]">{itemLabels[key] ?? key}</span>
            <span className="font-medium tabular-nums">¥{value.toLocaleString()}</span>
          </div>
        ))}
        <div className="mt-2 pt-2 border-t border-[var(--border)] flex justify-between text-xs">
          <span className="font-semibold text-[var(--surface-600)]">小计</span>
          <span className="font-bold tabular-nums">¥{subtotal.toLocaleString()}</span>
        </div>
      </div>
    );
  };

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--surface-400)] mb-2">
        📦 口岸费用{vehicleCount > 1 ? ` (${vehicleCount}辆车)` : ""}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {renderSide(result.china_side.items as Record<string, number>, result.china_side.subtotal, t.border.chinaSideTitle, "bg-red-50/50 border-red-100")}
        {renderSide(result.vietnam_side.items as Record<string, number>, result.vietnam_side.subtotal, t.border.vietnamSideTitle, "bg-blue-50/50 border-blue-100")}
      </div>
      <div className="mt-2 flex items-center justify-between rounded-lg bg-[var(--surface-50)] px-3 py-2">
        <span className="text-xs text-[var(--surface-500)]">
          口岸合计 ¥{result.ddp_total.toLocaleString()}
          {vehicleCount > 1 && <span className="text-[var(--surface-400)]"> · 单车 ¥{Math.round(result.ddp_total / vehicleCount).toLocaleString()}</span>}
        </span>
        <span className="text-xs font-semibold tabular-nums">{formatVnd(borderVnd)}</span>
      </div>
    </div>
  );
}

export default function ResultsPanel(p: Props) {
  const { t } = useLocale();
  const isFullTruck = p.loadingMode === "full_truck";
  const cur = p.alternatives[p.selectedAltIndex] ?? p.result;
  const { route, timing, breakdown, suggestions } = cur;
  const vc = breakdown.vehicle_count || cur.vehicle_count || 1;

  // ── 实时汇率（从后端 API 获取，带降级） ──
  const [vndPerRmb, setVndPerRmb] = useState(3500);
  const [rateSource, setRateSource] = useState("");
  const [rateUpdated, setRateUpdated] = useState("");
  useEffect(() => {
    fetchExchangeRate()
      .then((r) => {
        setVndPerRmb(r.vnd_per_rmb);
        setRateSource(r.source || "");
        setRateUpdated(r.updated || "");
      })
      .catch(() => {
        // API 不可用时使用现有值（默认 3500）
      });
  }, []);

  // ── 费用数据 ──
  const rawBars = [
    { label: isFullTruck ? "整车运价(含油耗时间)" : "距离成本", value: breakdown.cost_distance },
    ...(isFullTruck ? [] : [
      { label: "时间成本", value: breakdown.cost_time },
      { label: "油耗成本", value: breakdown.cost_fuel },
    ]),
    { label: "装卸费", value: breakdown.cost_loading },
    { label: "保险费", value: breakdown.cost_insurance },
    { label: "路桥费", value: breakdown.cost_toll },
    { label: "车身附加", value: breakdown.cost_body_surcharge },
    { label: "禁行附加", value: breakdown.cost_restricted_zone },
    { label: "其他", value: breakdown.cost_misc },
  ].filter(b => b.value > 0);

  const transportRmb = Math.round(breakdown.cost_total / vndPerRmb);
  const borderRmb = p.ddpFullResult?.ddp_total ?? 0;
  const ddpTotalVnd = breakdown.cost_total + borderRmb * vndPerRmb;
  const perVehicleCost = vc > 1 ? Math.round(breakdown.cost_total / vc) : null;

  // ── Collapsed ──
  if (p.collapsed) {
    return (
      <div className="absolute top-14 right-4 z-[800]">
        <button onClick={p.onToggle}
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-lg border border-[var(--border)] text-[var(--surface-400)] hover:text-[var(--surface-700)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6"/></svg>
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-14 right-4 bottom-4 z-[800] w-[380px] flex flex-col max-lg:left-0 max-lg:right-0 max-lg:top-auto max-lg:bottom-0 max-lg:z-[900] max-lg:!w-full max-lg:max-h-[70vh] max-lg:rounded-t-2xl max-lg:border-t max-lg:border-[var(--border)] max-lg:bg-white/95 max-lg:shadow-2xl max-lg:shadow-black/15 max-lg:backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-sm font-semibold text-white/90 drop-shadow-sm">报价结果</span>
        <button onClick={p.onToggle}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/60 backdrop-blur-sm hover:bg-white/90 text-[var(--surface-400)] hover:text-[var(--surface-600)]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto rounded-2xl bg-white/90 backdrop-blur-xl border border-white/20 shadow-2xl shadow-black/10">
        <div className="p-4 space-y-4">

          {/* ──── 1. 路线方案对比 ──── */}
          {p.alternatives.length > 1 && (
            <RouteOptions
              options={p.alternatives}
              selectedIndex={p.selectedAltIndex}
              onSelect={p.onSelectAlt}
            />
          )}

          {/* ──── 2. 总价 Hero ──── */}
          <div className="rounded-xl bg-gradient-to-br from-[var(--brand-800)] to-[var(--brand-950)] p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-[var(--brand-300)]">
                {p.isDDPFull ? "DDP 到门总价" : "总运费"}
              </p>
              <button
                type="button"
                onClick={() => {
                  const total = p.isDDPFull && p.ddpFullResult ? formatVnd(ddpTotalVnd) : formatVnd(breakdown.cost_total);
                  const dist = route.distance_km.toFixed(0);
                  const dur = formatHours(timing.total_duration_h, "h");
                  const vehicle = breakdown.matched_vehicle_model_name;
                  const text = `OSRM++ 报价结果\n总运费: ${total}\n距离: ${dist} km\n时长: ${dur}\n车型: ${vehicle}\n每公里: ${formatVnd(breakdown.cost_per_km)}`;
                  navigator.clipboard.writeText(text).then(
                    () => { /* copied */ },
                    () => { /* fallback */ },
                  );
                }}
                className="flex items-center gap-1 rounded-md bg-white/10 hover:bg-white/20 px-2 py-1 text-[10px] text-white/60 hover:text-white transition-colors"
                title="复制报价"
              >
                📋 复制
              </button>
            </div>
            <p className="text-3xl font-bold text-white tracking-tight">
              {p.isDDPFull && p.ddpFullResult ? formatVnd(ddpTotalVnd) : formatVnd(breakdown.cost_total)}
            </p>

            {/* DDP 分解 — VNĐ 为主 + RMB 参考 */}
            {p.isDDPFull && p.ddpFullResult && (
              <div className="mt-2 pt-2 border-t border-white/10 space-y-0.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-[var(--brand-300)]">运费</span>
                  <span className="text-white font-medium">{formatVnd(breakdown.cost_total)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-[var(--brand-300)]">口岸费</span>
                  <span className="text-white font-medium">{formatVnd(borderRmb * vndPerRmb)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-[var(--brand-200)]">≈ RMB</span>
                  <span className="text-[var(--brand-200)] font-medium">¥{(transportRmb + borderRmb).toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* 路线指标 */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-white/10 p-2">
                <p className="text-[11px] text-[var(--brand-300)]">距离</p>
                <p className="text-sm font-semibold text-white">{route.distance_km.toFixed(0)}<span className="text-[11px] font-normal text-white/60"> km</span></p>
              </div>
              <div className="rounded-lg bg-white/10 p-2">
                <p className="text-[11px] text-[var(--brand-300)]">时长</p>
                <p className="text-sm font-semibold text-white">{formatHours(timing.total_duration_h, "h")}</p>
              </div>
              <div className="rounded-lg bg-white/10 p-2">
                <p className="text-[11px] text-[var(--brand-300)]">每公里</p>
                <p className="text-sm font-semibold text-white">{formatVnd(breakdown.cost_per_km)}</p>
              </div>
            </div>
          </div>

          {/* ──── 3. 车型 + 单车费 ──── */}
          <div className="rounded-xl bg-[var(--brand-50)] px-3 py-3">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">🚛</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--brand-700)] truncate">{breakdown.matched_vehicle_model_name}</p>
                {perVehicleCost && (
                  <p className="text-xs text-[var(--brand-500)] mt-0.5">
                    单车运费 {formatVnd(perVehicleCost)} · {vc} 辆
                  </p>
                )}
              </div>
              {vc > 1 && (
                <span className="text-sm font-bold text-[var(--brand-600)] bg-[var(--brand-100)] rounded-lg px-2 py-1">{vc}辆</span>
              )}
            </div>
          </div>

          {/* ──── 4. 费用明细 ──── */}
          {rawBars.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--surface-400)] mb-2.5">费用构成</p>
              <div className="space-y-1">
                {rawBars.map(b => (
                  <CostBar key={b.label} label={b.label} value={b.value} pct={(b.value / breakdown.cost_total) * 100} />
                ))}
              </div>
            </div>
          )}

          {/* ──── 5. 口岸费用 (DDP) ──── */}
          {p.isDDPFull && (
            <BorderFeesCard result={p.ddpFullResult} loading={p.ddpFullLoading ?? false} vehicleCount={vc} vndPerRmb={vndPerRmb} t={t} />
          )}

          {/* ──── 6. 吨公里成本 ──── */}
          {breakdown.cost_per_ton_km != null && (
            <div className="flex items-center justify-between rounded-xl bg-[var(--surface-50)] px-3 py-2.5">
              <span className="text-xs text-[var(--surface-500)]">吨公里成本</span>
              <span className="text-sm font-bold text-[var(--surface-800)]">{formatVnd(breakdown.cost_per_ton_km)}</span>
            </div>
          )}

          {/* ──── 7. 建议 ──── */}
          {suggestions.length > 0 && (
            <div className="rounded-xl bg-[var(--accent-50)] p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-[var(--accent-600)]">💡 建议</p>
              <ul className="space-y-1.5">
                {suggestions.map((s, i) => {
                  const fn = t.suggestions[s.code as keyof typeof t.suggestions];
                  if (!fn) return <li key={i} className="text-xs text-[var(--surface-600)]">{s.code}</li>;
                  const pv = Object.values(s.params);
                  const text = typeof fn === "function"
                    ? (fn as (...args: string[]) => string)(pv[0] ?? "", pv[1] ?? "", pv[2] ?? "")
                    : fn;
                  return <li key={i} className="flex items-start gap-1.5 text-xs text-[var(--surface-700)]"><span>•</span><span>{text}</span></li>;
                })}
              </ul>
            </div>
          )}

          {/* ──── 汇率信息 ──── */}
          {rateSource && (
            <div className="text-center text-[10px] text-[var(--surface-400)]">
              💱 1 CNY = {vndPerRmb.toLocaleString()} VND
              {rateSource === "api" && <span className="text-[var(--success)]"> · 实时</span>}
              {rateSource === "file_cache" && <span> · 缓存</span>}
              {rateSource === "fixed_fees" && <span className="text-[var(--warning)]"> · 默认值</span>}
              {rateUpdated && <span> · 更新于 {rateUpdated.slice(0, 10)}</span>}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
