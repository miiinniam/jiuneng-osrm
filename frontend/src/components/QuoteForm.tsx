"use client";

import { useMemo, useState } from "react";
import AddressSearch from "@/components/AddressSearch";
import VehiclePicker from "@/components/VehiclePicker";
import { Button, Checkbox, Field, Input, Select } from "@/components/ui";
import type { GeocodeResult } from "@/lib/api";
import type { CargoItem, QuoteFormState, VehicleModelsByCategory, CargoTypeRate, QuoteMode } from "@/lib/types";
import { useLocale } from "@/lib/i18n/LocaleContext";

interface QuoteFormProps {
  vehicleModelsByCategory: VehicleModelsByCategory;
  cargoTypeRates: Record<string, CargoTypeRate>;
  form: QuoteFormState;
  onChange: (patch: Partial<QuoteFormState>) => void;
  pickMode: "origin" | "destination" | null;
  onSetPickMode: (mode: "origin" | "destination" | null) => void;
  onSubmit: () => void;
  onCompareAlternatives: () => void;
  submitting: boolean;
  comparing: boolean;
  quoteMode: QuoteMode;
  onQuoteModeChange: (v: QuoteMode) => void;
  error: string | null;
  setError: (err: string | null) => void;
}

/* ── Step Indicator ── */
function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-1">
      {steps.map((label, i) => (
        <div key={label} className="flex flex-1 items-center">
          <div className="flex flex-col items-center gap-0.5 flex-1">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-all ${
                i < current
                  ? "bg-[var(--success)] text-white"
                  : i === current
                    ? "bg-[var(--brand-600)] text-white ring-2 ring-[var(--brand-200)]"
                    : "bg-[var(--surface-200)] text-[var(--surface-400)]"
              }`}
            >
              {i < current ? "✓" : i + 1}
            </div>
            <span className={`text-[10px] font-medium ${i === current ? "text-[var(--brand-600)]" : "text-[var(--surface-400)]"}`}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`h-px flex-1 -mt-4 ${i < current ? "bg-[var(--success)]" : "bg-[var(--surface-200)]"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

/** 🆕 本地四约束车辆数预估（与后端 compute_vehicle_count 同逻辑，用于选车实时反馈） */
function localVehicleCount(
  m: { max_load_ton: number; volume_capacity_m3: number | null; effective_volume_m3?: number | null; length_m: number | null; floor_area_m2?: number | null; loading_efficiency?: number },
  weightTon: number,
  volumeM3: number | null,
  items: CargoItem[],
): { count: number; reasons: string[] } {
  const eff = m.loading_efficiency ?? 0.9;
  let n = 1;
  const reasons: string[] = [];

  // ① 重量
  if (m.max_load_ton > 0) {
    const w = Math.ceil(weightTon / m.max_load_ton);
    if (w > n) { n = w; reasons.push(`weight`); }
  }
  // ② 体积
  const effVol = m.effective_volume_m3 ?? m.volume_capacity_m3;
  if (volumeM3 && effVol && effVol > 0) {
    const v = Math.ceil(volumeM3 / (effVol * eff));
    if (v > n) { n = v; reasons.push(`volume`); }
  }
  // ③ 长件
  const maxLen = items.length > 0 ? Math.max(...items.map((i) => i.lengthM)) : 0;
  if (maxLen > 0 && m.length_m && m.length_m > 0) {
    const l = Math.ceil(maxLen / m.length_m);
    if (l > n) { n = l; reasons.push(`length`); }
  }
  // ④ 面积（不可堆叠件）
  const footprint = items
    .filter((i) => !i.stackable)
    .reduce((s, i) => s + i.lengthM * i.widthM * i.count, 0);
  if (footprint > 0 && m.floor_area_m2 && m.floor_area_m2 > 0) {
    const a = Math.ceil(footprint / (m.floor_area_m2 * eff));
    if (a > n) { n = a; reasons.push(`area`); }
  }
  return { count: Math.max(1, n), reasons };
}

export default function QuoteForm({
  vehicleModelsByCategory,
  cargoTypeRates,
  form,
  onChange,
  pickMode,
  onSetPickMode,
  onSubmit,
  onCompareAlternatives,
  submitting,
  comparing,
  quoteMode,
  onQuoteModeChange,
  error,
  setError,
}: QuoteFormProps) {
  const { t } = useLocale();
  const mode = form.loadingMode;

  // 🆕 两种模式统一 4 步：路线 → 货物 → 车辆 → 报价
  const stepLabels = [
    t.quoteForm.steps.route,
    t.quoteForm.steps.cargo,
    t.quoteForm.steps.vehicle,
    t.quoteForm.steps.cost,
  ];
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [itemsOpen, setItemsOpen] = useState(false);

  const maxStep = stepLabels.length - 1;
  const safeStep = Math.min(step, maxStep);

  // ── Step validation ──
  const validateStep = (): string | null => {
    if (safeStep === 0) {
      if (!form.originLat || !form.originLng || !form.destLat || !form.destLng) {
        return t.errors.setOriginDest;
      }
    }
    if (safeStep === 1) {
      if (!form.weightKg || parseFloat(form.weightKg) <= 0) {
        return t.errors.stepWeightRequired;
      }
      if (mode === "consolidated" && (!form.volumeM3 || parseFloat(form.volumeM3) <= 0)) {
        return t.errors.volumeRequiredForConsolidated;
      }
    }
    if (safeStep === 2 && mode === "full_truck") {
      if (!form.vehicleModelId) {
        return t.errors.selectVehicleModel;
      }
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep();
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    setError(null);
    setStep((s) => Math.min(s + 1, maxStep));
  };
  const goPrev = () => {
    setStepError(null);
    setStep((s) => Math.max(s - 1, 0));
  };

  const addWaypoint = () => onChange({ waypoints: [...form.waypoints, { lat: 0, lng: 0 }] });
  const removeWaypoint = (i: number) => onChange({ waypoints: form.waypoints.filter((_, j) => j !== i) });
  const selectOrigin = (r: GeocodeResult) => onChange({ originLat: r.lat.toFixed(6), originLng: r.lng.toFixed(6) });
  const selectDest = (r: GeocodeResult) => onChange({ destLat: r.lat.toFixed(6), destLng: r.lng.toFixed(6) });

  const cargoTypeLabel = (key: string) => t.labels.cargoType[key] ?? key;
  const allModels = Object.values(vehicleModelsByCategory).flat();
  const selectedModel = allModels.find((m) => m.model_id === form.vehicleModelId);

  // 🆕 单件明细操作
  const addItem = () => {
    const newItem: CargoItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: "", count: 1, lengthM: 0, widthM: 0, heightM: null, weightKg: null, stackable: true,
    };
    onChange({ items: [...form.items, newItem] });
    setItemsOpen(true);
  };
  const updateItem = (id: string, patch: Partial<CargoItem>) => {
    onChange({ items: form.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  };
  const removeItem = (id: string) => {
    onChange({ items: form.items.filter((i) => i.id !== id) });
  };

  // 🆕 货物数据计算（重量吨/体积）
  const weightTon = form.weightUnit === "ton"
    ? parseFloat(form.weightKg) || 0
    : (parseFloat(form.weightKg) || 0) / 1000;
  const volumeM3 = form.volumeM3 ? parseFloat(form.volumeM3) : null;

  // 🆕 推荐车型：四约束本地过滤，按"最小够用"排序（载重升序）
  const recommendedModels = useMemo(() => {
    if (!vehicleModelsByCategory || weightTon <= 0) return [];
    const maxLen = form.items.length > 0 ? Math.max(...form.items.map((i) => i.lengthM)) : 0;
    return allModels
      .filter((m) => {
        if (m.max_load_ton < weightTon) return false;
        if (maxLen > 0 && m.length_m && maxLen > m.length_m) return false;
        const effVol = (m as { effective_volume_m3?: number | null }).effective_volume_m3 ?? m.volume_capacity_m3;
        if (volumeM3 && effVol && volumeM3 > effVol * (m.loading_efficiency ?? 0.9)) return false;
        return true;
      })
      .sort((a, b) => a.max_load_ton - b.max_load_ton);
  }, [vehicleModelsByCategory, weightTon, volumeM3, form.items]);

  const recommended = recommendedModels[0];

  // 🆕 已选车型的实时车数预估
  const selectedCount = selectedModel
    ? localVehicleCount(selectedModel, weightTon, volumeM3, form.items)
    : null;

  // 🆕 超大件/重设备自动提示展开明细
  const shouldHintItems = (form.cargoType === "oversized" || form.cargoType === "heavy_equipment") && form.items.length === 0;

  return (
    <div className="space-y-3 animate-form-enter">
      {/* Mode selector */}
      <div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (mode === "full_truck") return;
              onChange({ loadingMode: "full_truck" });
              setStepError(null);
            }}
            className={`flex-1 rounded-lg border-2 px-3 py-2.5 text-xs font-semibold transition-all ${
              mode === "full_truck"
                ? "border-[var(--brand-500)] bg-[var(--brand-50)] text-[var(--brand-700)]"
                : "border-transparent text-[var(--surface-400)] hover:bg-[var(--surface-50)]"
            }`}
          >
            🚛 {t.quoteForm.vehicle.loadingModeFullTruckLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              if (mode === "consolidated") return;
              onChange({ loadingMode: "consolidated" });
              setStepError(null);
            }}
            className={`flex-1 rounded-lg border-2 px-3 py-2.5 text-xs font-semibold transition-all ${
              mode === "consolidated"
                ? "border-[var(--accent-400)] bg-[var(--accent-50)] text-[var(--accent-600)]"
                : "border-transparent text-[var(--surface-400)] hover:bg-[var(--surface-50)]"
            }`}
          >
            📦 {t.quoteForm.vehicle.loadingModeConsolidatedLabel}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-[var(--surface-400)]">
          {mode === "consolidated" ? t.quoteForm.vehicle.loadingModeConsolidatedHint : t.quoteForm.vehicle.loadingModeFullTruckHint}
        </p>
      </div>

      {/* Quote mode toggle: transport-only vs full DDP */}
      <div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onQuoteModeChange("transport_only")}
            className={`flex-1 rounded-lg border-2 px-3 py-2 text-xs font-semibold transition-all ${
              quoteMode === "transport_only"
                ? "border-[var(--brand-500)] bg-[var(--brand-50)] text-[var(--brand-700)]"
                : "border-transparent text-[var(--surface-400)] hover:bg-[var(--surface-50)]"
            }`}
          >
            🚛 {t.border.transportOnly}
          </button>
          <button
            type="button"
            onClick={() => onQuoteModeChange("ddp_full")}
            className={`flex-1 rounded-lg border-2 px-3 py-2 text-xs font-semibold transition-all ${
              quoteMode === "ddp_full"
                ? "border-[var(--accent-500)] bg-[var(--accent-50)] text-[var(--accent-700)]"
                : "border-transparent text-[var(--surface-400)] hover:bg-[var(--surface-50)]"
            }`}
          >
            🌏 {t.border.ddpFull}
          </button>
        </div>
        {quoteMode === "ddp_full" && (
          <div className="mt-2 rounded-xl border border-[var(--accent-200)] bg-[var(--accent-50)] p-2.5 animate-pop-in">
            <p className="text-[11px] font-medium text-[var(--accent-700)]">
              💡 {t.border.ddpFullHint} — 系统根据车数自动计算中国端和越南端口岸操作费。
            </p>
          </div>
        )}
      </div>

      {/* Steps */}
      <Steps steps={stepLabels} current={safeStep} />

      {/* Step content */}
      <div className="min-h-[140px]">
        {/* ── Step 0: Route ── */}
        {safeStep === 0 && (
          <div className="space-y-2.5 animate-step-enter">
            <div className="rounded-lg bg-[var(--surface-50)] p-2.5 space-y-1.5">
              <Field label={t.quoteForm.route.originAddressLabel} required>
                <AddressSearch placeholder={t.addressSearch.originPlaceholder} onSelect={selectOrigin} />
              </Field>
              <div className="grid grid-cols-2 gap-1.5">
                <Input type="number" placeholder="lat" value={form.originLat} onChange={(e) => onChange({ originLat: e.target.value })} />
                <Input type="number" placeholder="lng" value={form.originLng} onChange={(e) => onChange({ originLng: e.target.value })} />
              </div>
              <Button variant={pickMode === "origin" ? "primary" : "outline"} size="sm" onClick={() => onSetPickMode(pickMode === "origin" ? null : "origin")} className="w-full text-xs">
                📍 {pickMode === "origin" ? t.quoteForm.route.pickingOrigin : t.quoteForm.route.pickOriginButton}
              </Button>
            </div>

            <div className="rounded-lg bg-[var(--surface-50)] p-3 space-y-2">
              <Field label={t.quoteForm.route.destAddressLabel} required>
                <AddressSearch placeholder={t.addressSearch.destPlaceholder} onSelect={selectDest} />
              </Field>
              <div className="grid grid-cols-2 gap-1.5">
                <Input type="number" placeholder="lat" value={form.destLat} onChange={(e) => onChange({ destLat: e.target.value })} />
                <Input type="number" placeholder="lng" value={form.destLng} onChange={(e) => onChange({ destLng: e.target.value })} />
              </div>
              <Button variant={pickMode === "destination" ? "primary" : "outline"} size="sm" onClick={() => onSetPickMode(pickMode === "destination" ? null : "destination")} className="w-full text-xs">
                📍 {pickMode === "destination" ? t.quoteForm.route.pickingDest : t.quoteForm.route.pickDestButton}
              </Button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold uppercase text-[var(--surface-400)]">{t.quoteForm.route.waypointsLabel}</span>
                <Button variant="ghost" size="sm" onClick={addWaypoint} className="text-xs">
                  + {t.quoteForm.route.addWaypoint}
                </Button>
              </div>
              {form.waypoints.map((w, i) => (
                <div key={i} className="rounded-lg border border-dashed border-[var(--surface-300)] bg-[var(--surface-50)] p-2.5 mb-1.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[var(--surface-400)]">{t.quoteForm.route.waypointIndex(i + 1)}</span>
                    <button type="button" onClick={() => removeWaypoint(i)} className="text-[11px] text-red-400 hover:text-red-600">✕</button>
                  </div>
                  <AddressSearch placeholder={t.quoteForm.route.waypointPlaceholder} onSelect={(r) => onChange({
                    waypoints: form.waypoints.map((pw, pi) => pi === i ? { lat: r.lat, lng: r.lng, address: r.display_name } : pw),
                  })} />
                  <div className="flex gap-1.5">
                    <Input type="number" placeholder="lat" value={w.lat || ""} onChange={(e) => onChange({ waypoints: form.waypoints.map((pw, pi) => pi === i ? { ...pw, lat: Number(e.target.value) } : pw) })} />
                    <Input type="number" placeholder="lng" value={w.lng || ""} onChange={(e) => onChange({ waypoints: form.waypoints.map((pw, pi) => pi === i ? { ...pw, lng: Number(e.target.value) } : pw) })} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 1: Cargo (两种模式统一) ── */}
        {safeStep === 1 && (
          <div className="space-y-3 animate-step-enter">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold uppercase text-[var(--surface-400)]">
                    {t.quoteForm.cargo.weightLabel} *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const currentVal = parseFloat(form.weightKg) || 0;
                      if (form.weightUnit === "ton") {
                        onChange({ weightUnit: "kg", weightKg: currentVal ? String(Math.round(currentVal * 1000)) : "" });
                      } else {
                        onChange({ weightUnit: "ton", weightKg: currentVal ? String(currentVal / 1000) : "" });
                      }
                    }}
                    className="rounded-full border border-[var(--surface-300)] px-2 py-0.5 text-[10px] font-medium text-[var(--brand-600)] hover:bg-[var(--brand-50)] transition-colors"
                  >
                    {form.weightUnit === "ton" ? "📐 吨 → 公斤" : "📐 公斤 → 吨"}
                  </button>
                </div>
                <Input type="number" min={0} value={form.weightKg}
                  onChange={(e) => onChange({ weightKg: e.target.value })}
                  placeholder={form.weightUnit === "ton" ? "吨" : "公斤"} />
                <span className="text-[10px] text-[var(--surface-400)] mt-0.5 block">
                  {form.weightUnit === "ton" ? "吨 (tấn)" : "公斤 (kg)"}
                  {weightTon > 0 && ` = ${weightTon.toLocaleString()} 吨`}
                </span>
              </div>
              <Field label={t.quoteForm.cargo.volumeLabel} hint="m³">
                <Input type="number" min={0} value={form.volumeM3} onChange={(e) => onChange({ volumeM3: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.quoteForm.cargo.typeLabel}>
                <Select value={form.cargoType} onChange={(e) => onChange({ cargoType: e.target.value })}>
                  {Object.keys(cargoTypeRates).map((k) => (
                    <option key={k} value={k}>{cargoTypeLabel(k)} {t.quoteForm.cargo.rateSuffix(cargoTypeRates[k].rate_multiplier)}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t.quoteForm.cargo.valueLabel} hint="VND">
                <Input type="number" min={0} value={form.cargoValueVnd} onChange={(e) => onChange({ cargoValueVnd: e.target.value })} placeholder="可选" />
              </Field>
            </div>

            {/* 🆕 单件货物明细（可折叠） */}
            <div className="rounded-lg border border-[var(--surface-200)] overflow-hidden">
              <button
                type="button"
                onClick={() => setItemsOpen((o) => !o)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-[var(--surface-50)] transition-colors"
              >
                <span className="text-xs font-semibold text-[var(--surface-700)]">{t.quoteForm.cargo.itemsTitle}</span>
                <span className="text-[10px] text-[var(--brand-600)] font-medium">
                  {itemsOpen ? `▴ ${t.quoteForm.cargo.itemsCollapse}` : `▾ ${t.quoteForm.cargo.itemsExpand}`}
                  {form.items.length > 0 && <span className="ml-1 text-[var(--brand-600)]">({form.items.length})</span>}
                </span>
              </button>

              {itemsOpen && (
                <div className="px-3 pb-3 space-y-2 border-t border-[var(--surface-100)] pt-2 animate-expand">
                  <p className="text-[10px] text-[var(--surface-400)] leading-relaxed">
                    💡 {t.quoteForm.cargo.itemsHint}
                  </p>
                  {shouldHintItems && form.items.length === 0 && (
                    <p className="text-[10px] text-[var(--accent-600)] bg-[var(--accent-50)] rounded-md px-2 py-1.5">
                      🔔 {t.quoteForm.cargo.itemsAutoExpandHint}
                    </p>
                  )}
                  {form.items.length === 0 && (
                    <p className="text-[11px] text-[var(--surface-400)] py-1">（未填写，系统按重量+体积估算）</p>
                  )}
                  {form.items.map((item, idx) => (
                    <div key={item.id} className="rounded-lg bg-[var(--surface-50)] p-2.5 space-y-2 animate-item-enter">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-[var(--surface-400)] w-5 shrink-0">#{idx + 1}</span>
                        <Input
                          type="text"
                          placeholder={t.quoteForm.cargo.itemsName}
                          value={item.name}
                          onChange={(e) => updateItem(item.id, { name: e.target.value })}
                          className="flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="text-[10px] text-red-400 hover:text-red-600 shrink-0"
                        >
                          ✕ {t.quoteForm.cargo.itemsRemove}
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        <div>
                          <label className="text-[9px] text-[var(--surface-400)] block mb-0.5">{t.quoteForm.cargo.itemsCount}</label>
                          <Input type="number" min={1} value={item.count} onChange={(e) => updateItem(item.id, { count: Math.max(1, parseInt(e.target.value) || 1) })} />
                        </div>
                        <div>
                          <label className="text-[9px] text-[var(--surface-400)] block mb-0.5">{t.quoteForm.cargo.itemsLength}</label>
                          <Input type="number" min={0} step={0.1} value={item.lengthM || ""} onChange={(e) => updateItem(item.id, { lengthM: parseFloat(e.target.value) || 0 })} />
                        </div>
                        <div>
                          <label className="text-[9px] text-[var(--surface-400)] block mb-0.5">{t.quoteForm.cargo.itemsWidth}</label>
                          <Input type="number" min={0} step={0.1} value={item.widthM || ""} onChange={(e) => updateItem(item.id, { widthM: parseFloat(e.target.value) || 0 })} />
                        </div>
                        <div>
                          <label className="text-[9px] text-[var(--surface-400)] block mb-0.5">{t.quoteForm.cargo.itemsHeight}</label>
                          <Input type="number" min={0} step={0.1} value={item.heightM ?? ""} onChange={(e) => updateItem(item.id, { heightM: e.target.value ? parseFloat(e.target.value) : null })} />
                        </div>
                      </div>
                      <label className="flex items-center gap-1.5 text-[10px] text-[var(--surface-600)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.stackable}
                          onChange={(e) => updateItem(item.id, { stackable: e.target.checked })}
                          className="accent-[var(--brand-600)]"
                        />
                        {t.quoteForm.cargo.itemsStackable}
                        {!item.stackable && <span className="text-[var(--brand-600)]">（按地板面积计）</span>}
                      </label>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addItem} className="w-full text-xs">
                    {t.quoteForm.cargo.itemsAdd}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Vehicle ── */}
        {safeStep === 2 && (
          <div className="space-y-3 animate-step-enter">
            {mode === "full_truck" ? (
              <>
                <Field label={t.quoteForm.vehicle.modelLabel} required>
                  {/* 🆕 推荐车型置顶提示 */}
                  {recommended && !form.vehicleModelId && (
                    <div className="mb-2 rounded-lg bg-[var(--accent-50)] border border-[var(--accent-200)] p-2.5 text-[11px] text-[var(--accent-700)] animate-pop-in">
                      ✅ 推荐: <strong>{recommended.display_name}</strong>（载重 {recommended.max_load_ton}t，最小够用 · 成本最低）
                    </div>
                  )}
                  <VehiclePicker
                    modelsByCategory={vehicleModelsByCategory}
                    selectedId={form.vehicleModelId}
                    onSelect={(id) => onChange({ vehicleModelId: id })}
                    cargoType={form.cargoType}
                  />
                  {selectedModel && (
                    <div className="mt-2 rounded-lg bg-[var(--surface-50)] p-2.5 text-xs text-[var(--surface-600)] space-y-1.5">
                      <div className="flex gap-3 flex-wrap">
                        <span>载重 <strong>{selectedModel.max_load_ton}t</strong></span>
                        {(selectedModel as { effective_volume_m3?: number | null }).effective_volume_m3 != null && (
                          <span>容积 <strong>{(selectedModel as { effective_volume_m3?: number | null }).effective_volume_m3?.toFixed(0)}m³</strong></span>
                        )}
                        {selectedModel.length_m != null && <span>地板长 <strong>{selectedModel.length_m}m</strong></span>}
                        <span>油耗 <strong>{selectedModel.fuel_l_per_100km}L/100km</strong></span>
                      </div>

                      {/* 🆕 实时车数预估 */}
                      {selectedCount && (
                        selectedCount.count > 1 ? (
                          <div className="pt-1.5 border-t border-[var(--surface-200)] text-[var(--brand-600)] font-medium animate-pop-in">
                            🚛 {weightTon} 吨{volumeM3 ? ` / ${volumeM3}m³` : ""} → 需要 <strong>{selectedCount.count}</strong> 辆车
                            {selectedCount.reasons.includes("length") && form.items.length > 0 && (
                              <div className="text-[10px] font-normal text-[var(--warning)]">
                                {t.quoteForm.cargo.itemsSplitWarn(Math.max(...form.items.map((i) => i.lengthM)) / (selectedModel.length_m || 1) > 1 ? Math.ceil(Math.max(...form.items.map((i) => i.lengthM)) / (selectedModel.length_m || 1)) : selectedCount.count)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="pt-1.5 border-t border-[var(--surface-200)] text-[var(--success)]">
                            ✅ 1 辆车即可，载重利用率 {Math.round(weightTon / selectedModel.max_load_ton * 100)}%
                          </div>
                        )
                      )}
                    </div>
                  )}
                </Field>
                <div className="rounded-lg bg-[var(--surface-50)] p-3 space-y-2">
                  <Checkbox label={t.quoteForm.vehicle.needLoadingLabel} description="加收装卸费" checked={form.needLoading} onChange={(e) => onChange({ needLoading: e.target.checked })} />
                  <Checkbox label={t.quoteForm.vehicle.emptyReturnLabel} checked={form.emptyReturn} onChange={(e) => onChange({ emptyReturn: e.target.checked })} />
                </div>
              </>
            ) : (
              <>
                <div className="rounded-lg bg-[var(--brand-50)] p-2.5 text-xs space-y-0.5">
                  <div className="flex justify-between"><span className="text-[var(--surface-500)]">{t.quoteForm.cargo.weightLabel}</span><span className="font-medium">{form.weightKg || "—"} {form.weightUnit === "ton" ? "吨" : "kg"}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--surface-500)]">{t.quoteForm.cargo.volumeLabel}</span><span className="font-medium">{form.volumeM3 || "—"} m³</span></div>
                  {form.items.length > 0 && (
                    <div className="flex justify-between"><span className="text-[var(--surface-500)]">单件明细</span><span className="font-medium">{form.items.length} 件</span></div>
                  )}
                  <p className="text-[var(--brand-600)] mt-1">💡 {t.quoteForm.vehicle.loadingModeConsolidatedHint}</p>
                </div>
                <div className="rounded-lg bg-[var(--surface-50)] p-3 space-y-2">
                  <Checkbox label={t.quoteForm.vehicle.needLoadingLabel} description="加收装卸费" checked={form.needLoading} onChange={(e) => onChange({ needLoading: e.target.checked })} />
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Step 3: Quote (成本参数折叠为高级选项) ── */}
        {safeStep === maxStep && (
          <div className="space-y-3 animate-step-enter">
            {/* 关键摘要卡 */}
            <div className="rounded-xl bg-[var(--brand-50)] p-3 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--surface-500)]">路线</span>
                <span className="font-medium">
                  {form.originLat && form.destLat ? "✓ 已设置" : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--surface-500)]">货物</span>
                <span className="font-medium">{weightTon || 0} 吨{volumeM3 ? ` / ${volumeM3}m³` : ""} · {cargoTypeLabel(form.cargoType)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--surface-500)]">车辆</span>
                <span className="font-medium">
                  {mode === "full_truck"
                    ? selectedModel
                      ? `${selectedModel.display_name}${selectedCount && selectedCount.count > 1 ? ` × ${selectedCount.count}辆` : ""}`
                      : "未选择"
                    : "系统自动匹配"}
                </span>
              </div>
              {quoteMode === "ddp_full" && (
                <div className="flex justify-between">
                  <span className="text-[var(--surface-500)]">口岸费</span>
                  <span className="font-medium">按车数自动计算</span>
                </div>
              )}
            </div>

            {/* 🆕 高级选项折叠 */}
            <details className="rounded-lg border border-[var(--surface-200)] overflow-hidden group">
              <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-[var(--surface-700)] hover:bg-[var(--surface-50)] transition-colors select-none">
                ⚙️ 高级选项
                <span className="float-right text-[10px] text-[var(--surface-400)]">油价/装卸/路桥/空返</span>
              </summary>
              <div className="px-3 pb-3 space-y-3 border-t border-[var(--surface-100)] pt-2.5">
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t.quoteForm.cost.fuelPriceLabel} hint="VND/L">
                    <Input type="number" value={form.fuelPriceVnd} onChange={(e) => onChange({ fuelPriceVnd: e.target.value })} />
                  </Field>
                  <Field label={t.quoteForm.cost.tollRateLabel} hint="VND/km">
                    <Input type="number" value={form.tollRateVndPerKm} onChange={(e) => onChange({ tollRateVndPerKm: e.target.value })} />
                  </Field>
                </div>
                <Field label={t.quoteForm.cost.miscCostLabel} hint="VND">
                  <Input type="number" value={form.miscCostVnd} onChange={(e) => onChange({ miscCostVnd: e.target.value })} />
                </Field>
                <Checkbox label={t.quoteForm.vehicle.avoidRestrictedZonesLabel} checked={form.avoidRestrictedZones} onChange={(e) => onChange({ avoidRestrictedZones: e.target.checked })} />
                <Checkbox label={t.quoteForm.vehicle.avoidConstructionZonesLabel} checked={form.avoidConstructionZones} onChange={(e) => onChange({ avoidConstructionZones: e.target.checked })} />
                <Checkbox label={t.quoteForm.vehicle.viaMountainRoadLabel} checked={form.viaMountainRoad} onChange={(e) => onChange({ viaMountainRoad: e.target.checked })} />
                <p className="text-[10px] text-[var(--surface-400)] leading-relaxed">
                  {t.quoteForm.cost.autoDefaultsHint}
                </p>
              </div>
            </details>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-1.5">
        {safeStep > 0 && (
          <Button variant="outline" onClick={goPrev} className="flex-1 text-xs">
            ← {t.quoteForm.buttons.prev}
          </Button>
        )}
        {safeStep < maxStep && (
          <Button variant="secondary" onClick={goNext} className="flex-1 text-xs">
            {t.quoteForm.buttons.next} →
          </Button>
        )}
        {safeStep === maxStep && (
          <Button variant="primary" loading={submitting} onClick={onSubmit} className="flex-1 text-sm font-bold">
            {submitting ? "⏳" : "💰"} {submitting ? t.quoteForm.buttons.submitting : t.quoteForm.buttons.submit}
          </Button>
        )}
      </div>
      {safeStep === maxStep && (
        <Button variant="outline" loading={comparing} onClick={onCompareAlternatives} className="w-full text-xs">
          {comparing ? "⏳" : "🔄"} {comparing ? t.quoteForm.buttons.comparing : "刷新方案"}
        </Button>
      )}

      {/* ── Error display ── */}
      {stepError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-start gap-1.5">
          <span className="shrink-0">⚠️</span>
          <span>{stepError}</span>
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-start gap-1.5">
          <span className="shrink-0">⚠️</span>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
