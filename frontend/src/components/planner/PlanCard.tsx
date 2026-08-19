"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { PlannerPlanResponse, PlannerQuoteResponse } from "@/lib/plannerApi";
import { CARBOX_VEHICLES } from "@/lib/plannerApi";

/**
 * 方案卡 — AI 回复的结构化工件 (@web-design-01)
 * 三个区块: 装载方案 / 3D 入口 / 费用明细 + 动作条
 * 交互: 换车型 = 新对话轮次重算; 导出 CSV = 装箱单; 3D = 完整工作台
 */
export default function PlanCard({
  plan,
  quote,
  onVehicleChange,
}: {
  plan: PlannerPlanResponse;
  quote: PlannerQuoteResponse | null;
  onVehicleChange: (modelId: string) => void;
}) {
  const { t } = useLocale();
  const [show3d, setShow3d] = useState(false);
  const [exported, setExported] = useState(false);
  const s = plan.stats;

  const rate = Math.min(100, s.volumeUtilPct);
  const rateColor =
    s.overweight ? "bg-[var(--red)]"
      : rate >= 85 ? "bg-[var(--green)]"
        : rate >= 70 ? "bg-[var(--orange)]"
          : "bg-[var(--surface-300)]";
  const cgWarn =
    s.cgX < 0.25 * plan.vehicle.L_cm ? "⚠️ 重心偏前(车头方向)" : s.cgX > 0.55 * plan.vehicle.L_cm ? "⚠️ 重心偏后" : "✓ 重心安全";

  const csv = useMemo(() => {
    const head = "序号,货物名称,尺寸(cm),单件重(kg),位置(x,y,z)";
    const rows = plan.placements.map((p, i) =>
      `${i + 1},${p.name},"${p.dx}×${p.dy}×${p.dz}",${p.weight},(${p.x},${p.y},${p.z})`,
    );
    return [head, ...rows].join("\n");
  }, [plan.placements]);

  const exportCsv = () => {
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `装箱单-${plan.vehicle.model_id}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  return (
    <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--brand-200)] bg-white shadow-[0_10px_30px_rgba(0,16,48,0.08)]">
      {/* 顶部青蓝渐变线 */}
      <span className="block h-[3px] bg-gradient-to-r from-[var(--cyan)] to-[var(--blue)]" />

      <div className="p-4">
        {/* ── 装载方案 ── */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--surface-400)]">
              📦 {t.planner.loadRateLabel}
            </p>
            <p className="mt-1 text-lg font-bold text-[var(--navy)]">
              {Math.round(rate)}%
              <span className="ml-2 text-xs font-medium text-[var(--surface-500)]">
                {s.placedCount}/{s.totalQty} {t.planner.placedLabel} · {t.planner.weightLabel}{" "}
                {(s.totalWeight / 1000).toFixed(1)}t/{plan.vehicle.max_weight_kg / 1000}t
              </span>
            </p>
            <div className="mt-1.5 h-2 w-full max-w-[280px] overflow-hidden rounded-full bg-[var(--surface-100)]">
              <div className={`h-full rounded-full ${rateColor}`} style={{ width: `${rate}%` }} />
            </div>
          </div>
          <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${s.overweight ? "bg-red-50 text-[var(--red)]" : "bg-[var(--brand-50)] text-[var(--brand-600)]"}`}>
            {s.overweight ? "⚠️ 超重" : `${plan.vehicle.name}`}
          </span>
        </div>

        {/* 重心 / 未装入 */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--surface-500)]">
          <span className="rounded-md bg-[var(--surface-50)] px-2 py-1">
            {t.planner.cgLabel} x={s.cgX}cm <b className={cgWarn.startsWith("✓") ? "text-[var(--green)]" : "text-[var(--orange)]"}>{cgWarn}</b>
          </span>
          {s.frontPct > 0 && (
            <span className="rounded-md bg-[var(--surface-50)] px-2 py-1">
              {t.planner.vehicleLabel}轴载 前{s.frontPct}%/后{s.rearPct}%
            </span>
          )}
        </div>

        {plan.unplaced.length > 0 && (
          <div className="mt-3 rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 text-xs text-[var(--red)]">
            {t.planner.unplacedLabel}: {plan.unplaced.map((u) => `${u.name}(${u.reason})`).join("、")}
          </div>
        )}

        {/* ── 3D 展开 ── */}
        <button
          type="button"
          onClick={() => setShow3d((v) => !v)}
          className="mt-3 flex w-full items-center justify-between rounded-lg bg-[var(--surface-50)] px-3 py-2 text-xs font-medium text-[var(--surface-700)] transition-colors hover:bg-[var(--surface-100)]"
        >
          <span>{show3d ? "▾" : "▸"} 3D 装车图（{plan.placements.length} 件）</span>
          <span className="text-[var(--brand-500)]">{show3d ? "收起" : "展开"}</span>
        </button>
        {show3d && (
          <div className="mt-2 rounded-xl border border-[var(--surface-200)] bg-[#101318] px-3 py-4 text-center">
            <p className="text-xs text-white/70">读模式预览（与方案卡坐标逐件一致，跳过坐标变换）</p>
            <p className="mt-1 text-[11px] text-white/40">
              示例: {plan.placements.slice(0, 3).map((p) => `${p.name}@(${p.x},${p.y},${p.z})`).join("  ")}…
            </p>
            <Link
              href={`/tools/loader?vehicle=${encodeURIComponent(plan.vehicle.model_id)}`}
              target="_blank"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--cyan)] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--brand-500)]"
            >
              {t.planner.openWorkbench} ↗
            </Link>
          </div>
        )}

        {/* ── 费用 ── */}
        {quote && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-[var(--brand-50)] px-3 py-2.5">
            <span className="text-xs text-[var(--surface-500)]">
              {t.planner.costLabel}（{quote.distance_km}km · {quote.duration_h}h）
            </span>
            <span className="text-base font-bold text-[var(--brand-700)]">
              {quote.currency === "VND" ? "" : "¥"}{quote.cost_total.toLocaleString()}
            </span>
          </div>
        )}

        {/* ── 动作条 ── */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={plan.vehicle.model_id}
            onChange={(e) => onVehicleChange(e.target.value)}
            className="rounded-lg border border-[var(--surface-200)] bg-white px-2.5 py-1.5 text-xs text-[var(--surface-700)] focus:border-[var(--brand-400)] focus:outline-none"
            title={t.planner.changeVehicle}
          >
            {CARBOX_VEHICLES.map((v) => (
              <option key={v.model_id} value={v.model_id}>
                {t.planner.changeVehicle}: {v.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-lg border border-[var(--surface-200)] px-3 py-1.5 text-xs font-medium text-[var(--surface-700)] transition-colors hover:bg-[var(--surface-50)]"
          >
            {exported ? `✓ ${t.planner.exported}` : `📄 ${t.planner.exportCsv}`}
          </button>
        </div>
      </div>
    </div>
  );
}
