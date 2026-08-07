"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { formatVnd, formatHours } from "@/lib/format";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { LoadingMode, QuoteResponse } from "@/lib/types";

const SNAP_POINTS = {
  collapsed: 80,    // 仅显示总价摘要
  half: "50vh",     // 路线卡片 + 摘要
  full: "85vh",     // 完整明细
} as const;

type SnapState = keyof typeof SNAP_POINTS;

interface BottomDrawerProps {
  result: QuoteResponse;
  alternatives: QuoteResponse[];
  selectedAltIndex: number;
  onSelectAlt: (i: number) => void;
  loadingMode: LoadingMode;
  /** 关闭抽屉（父组件收起结果、恢复表单） */
  onClose?: () => void;
}

function CostBarRow({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 truncate text-[var(--surface-500)]">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-[var(--surface-100)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-24 shrink-0 text-right text-[var(--surface-600)] tabular-nums font-medium">
        {formatVnd(value)}
      </span>
    </div>
  );
}

export default function BottomDrawer({
  result,
  alternatives,
  selectedAltIndex,
  onSelectAlt,
  loadingMode,
  onClose,
}: BottomDrawerProps) {
  const { t } = useLocale();
  const isFullTruck = loadingMode === "full_truck";

  // Snap state
  const [snap, setSnap] = useState<SnapState>("half");
  const drawerRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const [height, setHeight] = useState<string | number>(SNAP_POINTS.half);

  const currentResult = alternatives[selectedAltIndex] ?? result;
  const { route, timing, breakdown, suggestions } = currentResult;

  // Route card comparison
  const cheapestIndex = alternatives.reduce(
    (best, o, i) => (o.breakdown.cost_total < alternatives[best].breakdown.cost_total ? i : best),
    0,
  );
  const fastestIndex = alternatives.reduce(
    (best, o, i) => (o.route.duration_h < alternatives[best].route.duration_h ? i : best),
    0,
  );

  // Drag handlers
  const onDragStart = useCallback((e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    if (drawerRef.current) {
      dragStartHeight.current = drawerRef.current.getBoundingClientRect().height;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!e.buttons) return;
    const dy = dragStartY.current - e.clientY;
    const newH = Math.max(60, Math.min(window.innerHeight * 0.9, dragStartHeight.current + dy));
    setHeight(newH);
  }, []);

  const onDragEnd = useCallback(() => {
    if (!drawerRef.current) return;
    const currentH = drawerRef.current.getBoundingClientRect().height;
    // Snap to nearest
    const halfPx = window.innerHeight * 0.5;
    const fullPx = window.innerHeight * 0.85;
    const distToCollapsed = Math.abs(currentH - SNAP_POINTS.collapsed);
    const distToHalf = Math.abs(currentH - halfPx);
    const distToFull = Math.abs(currentH - fullPx);
    const minDist = Math.min(distToCollapsed, distToHalf, distToFull);

    if (minDist === distToCollapsed) {
      setSnap("collapsed"); setHeight(SNAP_POINTS.collapsed);
    } else if (minDist === distToHalf) {
      setSnap("half"); setHeight(SNAP_POINTS.half);
    } else {
      setSnap("full"); setHeight(SNAP_POINTS.full);
    }
  }, []);

  const expandTo = (s: SnapState) => {
    setSnap(s);
    setHeight(SNAP_POINTS[s]);
  };

  useEffect(() => {
    setHeight(SNAP_POINTS[snap]);
  }, [snap]);

  const costBars = [
    { label: isFullTruck ? t.costPanel.fullTruckDistanceCost : t.costPanel.distanceCost, value: breakdown.cost_distance, color: "#3b82f6" },
    ...(isFullTruck ? [] : [
      { label: t.costPanel.timeCost, value: breakdown.cost_time, color: "#8b5cf6" },
      { label: t.costPanel.fuelCost, value: breakdown.cost_fuel, color: "#f59e0b" },
    ]),
    { label: t.costPanel.loadingCost, value: breakdown.cost_loading, color: "#10b981" },
    { label: t.costPanel.insuranceCost, value: breakdown.cost_insurance, color: "#06b6d4" },
    { label: t.costPanel.tollCost, value: breakdown.cost_toll, color: "#6366f1" },
    { label: t.costPanel.bodySurchargeCost, value: breakdown.cost_body_surcharge, color: "#f97316" },
    { label: t.costPanel.restrictedZoneCost, value: breakdown.cost_restricted_zone, color: "#ef4444" },
    { label: t.costPanel.constructionZoneCost, value: breakdown.cost_construction_zone, color: "#dc2626" },
    { label: t.costPanel.mountainRoadCost, value: breakdown.cost_mountain_road, color: "#be123c" },
    { label: t.costPanel.miscCost, value: breakdown.cost_misc, color: "#71717a" },
  ].filter((c) => c.value > 0);

  return (
    <div
      ref={drawerRef}
      className="absolute bottom-0 left-0 right-0 z-[800] bg-white rounded-t-3xl shadow-2xl shadow-black/15 flex flex-col border-t border-[var(--border)]"
      style={{ height, transition: snap ? "height 0.35s cubic-bezier(0.25, 0.8, 0.25, 1.2)" : undefined }}
    >
      {/* Drag handle + 关闭按钮 */}
      <div className="relative shrink-0">
        <div
          className="flex flex-col items-center py-2.5 cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
        >
          <div className="w-8 h-1 rounded-full bg-[var(--surface-300)]" />
        </div>
        {onClose && snap !== "collapsed" && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t.site.aiAssistant.fabClose}
            className="absolute right-3 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg text-[var(--surface-400)] transition-colors hover:bg-[var(--surface-100)] hover:text-[var(--surface-600)]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Collapsed: mini summary */}
      {snap === "collapsed" && (
        <div className="flex items-center justify-between px-4 pb-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-[var(--surface-900)]">
              {formatVnd(breakdown.cost_total)}
            </span>
            <span className="text-xs text-[var(--surface-400)]">
              {route.distance_km.toFixed(0)}km · {formatHours(timing.total_duration_h, t.costPanel.hours)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => expandTo("half")} className="text-xs text-[var(--brand-600)] font-medium hover:underline">
              {t.costPanel.expandDetail}
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t.site.aiAssistant.fabClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--surface-400)] transition-colors hover:bg-[var(--surface-100)] hover:text-[var(--surface-600)]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Half / Full: route cards + breakdown */}
      {snap !== "collapsed" && (
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4" style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}>
          {/* Route cards slider */}
          {alternatives.length > 1 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--surface-400)]">
                {t.routeOptions.title(alternatives.length)}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 snap-x snap-mandatory">
                {alternatives.map((alt, i) => {
                  const isSel = i === selectedAltIndex;
                  const isCheapest = i === cheapestIndex;
                  const isFastest = i === fastestIndex && i !== cheapestIndex;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onSelectAlt(i)}
                      className={`shrink-0 snap-start w-[200px] rounded-xl border-2 p-3 text-left transition-all duration-200 ${
                        isSel
                          ? "border-[var(--brand-500)] bg-[var(--brand-50)] shadow-sm"
                          : "border-[var(--border)] hover:border-[var(--surface-300)] bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                          isSel ? "bg-[var(--brand-600)] text-white" : "bg-[var(--surface-200)] text-[var(--surface-500)]"
                        }`}>
                          {i + 1}
                        </span>
                        <span className="text-sm font-semibold text-[var(--surface-800)]">
                          {t.routeOptions.option(i + 1)}
                        </span>
                        {isCheapest && <span className="ml-auto text-[10px] bg-[var(--success-bg)] text-[var(--success)] rounded-full px-1.5 py-0.5 font-medium">{t.routeOptions.cheapest}</span>}
                        {isFastest && <span className="ml-auto text-[10px] bg-[var(--warning-bg)] text-[var(--warning)] rounded-full px-1.5 py-0.5 font-medium">{t.routeOptions.fastest}</span>}
                      </div>
                      <p className="text-base font-bold text-[var(--surface-900)]">{formatVnd(alt.breakdown.cost_total)}</p>
                      <p className="text-[11px] text-[var(--surface-400)] mt-0.5">
                        {alt.route.distance_km.toFixed(0)} km · {formatHours(alt.route.duration_h, t.costPanel.hours)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Route KPIs */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-[var(--surface-50)] p-3 text-center">
              <p className="text-xs text-[var(--surface-400)]">{t.costPanel.distance}</p>
              <p className="mt-0.5 text-base font-bold text-[var(--surface-800)]">{route.distance_km.toFixed(1)} km</p>
            </div>
            <div className="rounded-xl bg-[var(--surface-50)] p-3 text-center">
              <p className="text-xs text-[var(--surface-400)]">{t.costPanel.totalDuration}</p>
              <p className="mt-0.5 text-base font-bold text-[var(--surface-800)]">{formatHours(timing.total_duration_h, t.costPanel.hours)}</p>
            </div>
            <div className="rounded-xl bg-[var(--surface-50)] p-3 text-center">
              <p className="text-xs text-[var(--surface-400)]">{t.costPanel.costPerKm}</p>
              <p className="mt-0.5 text-base font-bold text-[var(--surface-800)]">{formatVnd(breakdown.cost_per_km)}</p>
            </div>
          </div>

          {/* Vehicle info */}
          <div className="flex items-center gap-2 rounded-xl bg-[var(--brand-50)] px-3.5 py-2.5">
            <span>🚛</span>
            <span className="text-sm font-semibold text-[var(--brand-700)]">{breakdown.matched_vehicle_model_name}</span>
            {!isFullTruck && (
              <span className="ml-auto text-[11px] text-[var(--brand-500)] font-medium">
                {t.costPanel.volumeRatio((breakdown.capacity_ratio * 100).toFixed(0))}
              </span>
            )}
          </div>

          {/* Cost breakdown bars */}
          {costBars.length > 1 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--surface-400)]">
                {isFullTruck ? t.costPanel.fullTruckBreakdownTitle : t.costPanel.breakdownTitle}
              </p>
              <div className="space-y-1.5">
                {costBars.map((c) => (
                  <CostBarRow key={c.label} label={c.label} value={c.value} pct={(c.value / breakdown.cost_total) * 100} color={c.color} />
                ))}
              </div>
            </div>
          )}

          {/* Per ton-km */}
          {breakdown.cost_per_ton_km != null && (
            <div className="flex items-center justify-between rounded-xl bg-[var(--surface-50)] px-3.5 py-2.5">
              <span className="text-sm text-[var(--surface-500)]">{t.costPanel.costPerTonKm}</span>
              <span className="text-sm font-bold text-[var(--surface-800)]">{formatVnd(breakdown.cost_per_ton_km)}</span>
            </div>
          )}

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="rounded-xl bg-[var(--accent-50)] p-3.5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--accent-600)]">
                💡 {t.costPanel.suggestionsTitle}
              </p>
              <ul className="space-y-1">
                {suggestions.map((s, i) => {
                  const fn = t.suggestions[s.code as keyof typeof t.suggestions];
                  if (!fn) return <li key={i} className="text-sm text-[var(--surface-600)]">{s.code}</li>;
                  const pv = Object.values(s.params);
                  const text = typeof fn === "function"
                    ? (fn as (...args: string[]) => string)(pv[0] ?? "", pv[1] ?? "", pv[2] ?? "")
                    : fn;
                  return (
                    <li key={i} className="flex items-start gap-1.5 text-sm text-[var(--surface-700)]">
                      <span className="mt-0.5 text-[10px]">•</span>
                      <span>{text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Snap controls */}
          <div className="flex justify-center gap-2 pt-1">
            {snap === "half" && (
              <button onClick={() => expandTo("full")} className="text-xs text-[var(--brand-600)] font-medium hover:underline">
                {t.costPanel.viewFullDetail}
              </button>
            )}
            {snap === "full" && (
              <button onClick={() => expandTo("half")} className="text-xs text-[var(--brand-600)] font-medium hover:underline">
                {t.costPanel.collapseDetail}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
