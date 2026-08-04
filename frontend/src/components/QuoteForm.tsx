"use client";

import { useState } from "react";
import AddressSearch from "@/components/AddressSearch";
import VehiclePicker from "@/components/VehiclePicker";
import { Button, Checkbox, Field, Input, Select } from "@/components/ui";
import type { GeocodeResult } from "@/lib/api";
import type { QuoteFormState, VehicleModelsByCategory, CargoTypeRate, QuoteMode } from "@/lib/types";
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
  const stepLabels = mode === "full_truck"
    ? [t.quoteForm.steps.route, t.quoteForm.steps.vehicle, t.quoteForm.steps.cost]
    : [t.quoteForm.steps.route, t.quoteForm.steps.cargo, t.quoteForm.steps.vehicle, t.quoteForm.steps.cost];
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);

  const maxStep = Math.max(0, stepLabels.length - 1);
  const safeStep = Math.min(step, maxStep);

  // ── Step validation ──
  const validateStep = (): string | null => {
    // Step 0: route info
    if (safeStep === 0) {
      if (!form.originLat || !form.originLng || !form.destLat || !form.destLng) {
        return t.errors.setOriginDest;
      }
    }
    // Step 1: cargo/vehicle (full_truck) or cargo (consolidated)
    if (mode === "full_truck" && safeStep === 1) {
      if (!form.vehicleModelId) {
        return t.errors.selectVehicleModel;
      }
    }
    if (mode === "consolidated" && safeStep === 1) {
      if (!form.weightKg || !form.volumeM3) {
        return t.errors.volumeRequiredForConsolidated;
      }
    }
    // Step 2: vehicle (consolidated only)
    if (mode === "consolidated" && safeStep === 2) {
      // vehicle step in consolidated mode — validation is optional
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
  const categoryLabel = (key: string) => t.labels.vehicleCategory[key] ?? key;
  const allModels = Object.values(vehicleModelsByCategory).flat();
  const selectedModel = allModels.find((m) => m.model_id === form.vehicleModelId);

  return (
    <div className="space-y-3">
      {/* Mode selector */}
      <div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (mode === "full_truck") return; // already selected
              if (!window.confirm("切换运输模式将清空当前已选车型和步骤进度，确定要切换吗？")) return;
              onChange({ loadingMode: "full_truck" }); setStep(0); setStepError(null);
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
              if (!window.confirm("切换运输模式将清空当前已选车型和步骤进度，确定要切换吗？")) return;
              onChange({ loadingMode: "consolidated" }); setStep(0); setStepError(null);
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
          <div className="mt-2 rounded-xl border border-[var(--accent-200)] bg-[var(--accent-50)] p-2.5">
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
        {/* ── Route ── */}
        {safeStep === 0 && (
          <div className="space-y-2.5">
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

        {/* ── Cargo (consolidated) ── */}
        {mode === "consolidated" && safeStep === 1 && (
          <div className="space-y-3">
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
                  当前: {form.weightUnit === "ton" ? "吨 (tấn)" : "公斤 (kg)"}
                  {form.weightKg && form.weightUnit === "ton" ? ` = ${(parseFloat(form.weightKg) * 1000).toLocaleString()} 公斤` : ""}
                  {form.weightKg && form.weightUnit === "kg" ? ` = ${(parseFloat(form.weightKg) / 1000).toLocaleString()} 吨` : ""}
                </span>
              </div>
              <Field label={t.quoteForm.cargo.volumeLabel} required hint="m³">
                <Input type="number" min={0} value={form.volumeM3} onChange={(e) => onChange({ volumeM3: e.target.value })} />
              </Field>
            </div>
            <Field label={t.quoteForm.cargo.typeLabel}>
              <Select value={form.cargoType} onChange={(e) => onChange({ cargoType: e.target.value })}>
                {Object.keys(cargoTypeRates).map((k) => (
                  <option key={k} value={k}>{cargoTypeLabel(k)} {t.quoteForm.cargo.rateSuffix(cargoTypeRates[k].rate_multiplier)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t.quoteForm.cargo.valueLabel} hint="VND">
              <Input type="number" min={0} value={form.cargoValueVnd} onChange={(e) => onChange({ cargoValueVnd: e.target.value })} />
            </Field>
          </div>
        )}

        {/* ── Vehicle ── */}
        {((mode === "full_truck" && safeStep === 1) || (mode === "consolidated" && safeStep === 2)) && (
          <div className="space-y-3">
            {mode === "consolidated" && (
              <div className="rounded-lg bg-[var(--brand-50)] p-2.5 text-xs space-y-0.5">
                <div className="flex justify-between"><span className="text-[var(--surface-500)]">{t.quoteForm.cargo.weightLabel}</span><span className="font-medium">{form.weightKg || "—"} {form.weightUnit === "ton" ? "吨" : "kg"}</span></div>
                <div className="flex justify-between"><span className="text-[var(--surface-500)]">{t.quoteForm.cargo.volumeLabel}</span><span className="font-medium">{form.volumeM3 || "—"} m³</span></div>
                <p className="text-[var(--brand-600)] mt-1">💡 {t.quoteForm.vehicle.loadingModeConsolidatedHint}</p>
              </div>
            )}
            {mode === "full_truck" && (
              <>
                <Field label={t.quoteForm.cargo.typeLabel}>
                  <Select value={form.cargoType} onChange={(e) => onChange({ cargoType: e.target.value })}>
                    {Object.keys(cargoTypeRates).map((k) => (
                      <option key={k} value={k}>{cargoTypeLabel(k)} {t.quoteForm.cargo.rateSuffix(cargoTypeRates[k].rate_multiplier)}</option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold uppercase text-[var(--surface-400)]">
                        {t.quoteForm.cargo.weightLabel}
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
                      placeholder={form.weightUnit === "ton" ? "吨（超载校验）" : "公斤（超载校验）"} />
                    <span className="text-[10px] text-[var(--surface-400)] mt-0.5 block">
                      {form.weightUnit === "ton" ? "吨 (tấn)" : "公斤 (kg)"}
                      {form.weightKg && form.weightUnit === "ton" ? ` = ${(parseFloat(form.weightKg) * 1000).toLocaleString()} 公斤` : ""}
                      {form.weightKg && form.weightUnit === "kg" ? ` = ${(parseFloat(form.weightKg) / 1000).toLocaleString()} 吨` : ""}
                    </span>
                  </div>
                  <Field label={t.quoteForm.cargo.valueLabel} hint="0.3%">
                    <Input type="number" min={0} value={form.cargoValueVnd} onChange={(e) => onChange({ cargoValueVnd: e.target.value })} placeholder="可选" />
                  </Field>
                </div>
                <Field label={t.quoteForm.vehicle.modelLabel} required>
                  <VehiclePicker
                    modelsByCategory={vehicleModelsByCategory}
                    selectedId={form.vehicleModelId}
                    onSelect={(id) => onChange({ vehicleModelId: id })}
                    cargoType={form.cargoType}
                  />
                  {selectedModel && (
                    <div className="mt-2 rounded-lg bg-[var(--surface-50)] p-2.5 text-xs text-[var(--surface-600)] space-y-1">
                      <div className="flex gap-3">
                        <span>载重 <strong>{selectedModel.max_load_ton}t</strong></span>
                        {selectedModel.volume_capacity_m3 != null && <span>容积 <strong>{selectedModel.volume_capacity_m3}m³</strong></span>}
                        <span>油耗 <strong>{selectedModel.fuel_l_per_100km}L/100km</strong></span>
                      </div>
                      {(() => {
                        const weightTon = form.weightUnit === "ton"
                          ? parseFloat(form.weightKg) || 0
                          : (parseFloat(form.weightKg) || 0) / 1000;
                        if (weightTon <= 0) return null;
                        const needed = Math.ceil(weightTon / selectedModel.max_load_ton);
                        if (needed > 1) {
                          return (
                            <div className="mt-1.5 pt-1.5 border-t border-[var(--surface-200)] text-[var(--brand-600)] font-medium">
                              🚛 {weightTon} 吨 ÷ {selectedModel.max_load_ton} 吨/车 = 需要 <strong>{needed}</strong> 辆车
                            </div>
                          );
                        }
                        return (
                          <div className="mt-1.5 pt-1.5 border-t border-[var(--surface-200)] text-[var(--success)]">
                            ✅ 1 辆车即可，载重利用率 {Math.round(weightTon / selectedModel.max_load_ton * 100)}%
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </Field>
              </>
            )}
            <div className="rounded-lg bg-[var(--surface-50)] p-3 space-y-2">
              <Checkbox label={t.quoteForm.vehicle.needLoadingLabel} description="加收装卸费" checked={form.needLoading} onChange={(e) => onChange({ needLoading: e.target.checked })} />
            </div>
          </div>
        )}

        {/* ── Cost ── */}
        {safeStep === maxStep && (
          <div className="space-y-3">
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
            <p className="text-[10px] text-[var(--surface-400)] leading-relaxed">
              {t.quoteForm.cost.autoDefaultsHint}
            </p>
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
      {error && !stepError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-start gap-1.5">
          <span className="shrink-0">⚠️</span>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
