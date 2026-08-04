"use client";

import { useLocale } from "@/lib/i18n/LocaleContext";
import type { VehicleModel } from "@/lib/types";

interface VehiclePickerProps {
  modelsByCategory: Record<string, VehicleModel[]>;
  selectedId: string;
  onSelect: (id: string) => void;
  cargoType: string;
}

export default function VehiclePicker({
  modelsByCategory, selectedId, onSelect, cargoType,
}: VehiclePickerProps) {
  const { t } = useLocale();
  const categoryLabel = (key: string) => t.labels.vehicleCategory[key] ?? key;

  const allCategories = Object.entries(modelsByCategory).filter(([, m]) => m.length > 0);

  return (
    <div className="space-y-2 max-h-[280px] overflow-y-auto">
      {allCategories.map(([cat, models]) => (
        <div key={cat}>
          <p className="text-[11px] font-semibold uppercase text-[var(--surface-400)] mb-1.5 px-0.5">
            {categoryLabel(cat)}
          </p>
          <div className="space-y-1">
            {models.map((m) => {
              const isSelected = m.model_id === selectedId;
              const isRecommended = m.suitable_cargo_types.includes(cargoType);
              const borderClass = isSelected
                ? "border-[var(--brand-500)] bg-[var(--brand-50)] shadow-sm"
                : "border-[var(--border)] bg-white hover:border-[var(--surface-300)]";
              return (
                <button
                  key={m.model_id}
                  type="button"
                  onClick={() => onSelect(m.model_id)}
                  className={"w-full rounded-lg border-2 px-3 py-2.5 text-left transition-all " + borderClass}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={
                        "shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold " +
                        (isSelected ? "bg-[var(--brand-600)] text-white" : "bg-[var(--surface-200)] text-[var(--surface-400)]")
                      }>
                        {isSelected ? "✓" : ""}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--surface-800)] truncate">
                          {m.display_name}
                          {isRecommended && (
                            <span className="ml-1.5 text-[10px] text-[var(--brand-600)] font-normal">
                              {t.quoteForm.vehicle.recommendedSuffix}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-bold text-[var(--brand-700)] bg-[var(--brand-50)] rounded-md px-2 py-0.5">
                        {m.max_load_ton}t
                      </span>
                      <span className="text-[10px] text-[var(--surface-400)] tabular-nums w-16 text-right">
                        ¥{m.base_rate_vnd_per_km.toLocaleString()}/km
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
