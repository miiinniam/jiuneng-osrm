"use client";

import { Badge, Card } from "@/components/ui";
import { formatHours, formatVnd } from "@/lib/format";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { QuoteResponse } from "@/lib/types";

interface RouteOptionsProps {
  options: QuoteResponse[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export default function RouteOptions({ options, selectedIndex, onSelect }: RouteOptionsProps) {
  const { t } = useLocale();

  if (options.length === 0) return null;

  const cheapestIndex = options.reduce(
    (best, o, i) => (o.breakdown.cost_total < options[best].breakdown.cost_total ? i : best),
    0,
  );
  const fastestIndex = options.reduce(
    (best, o, i) => (o.route.duration_h < options[best].route.duration_h ? i : best),
    0,
  );

  return (
    <Card>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--surface-400)]">
        {t.routeOptions.title(options.length)}
      </p>
      <div className="space-y-2">
        {options.map((option, i) => {
          const isCheapest = i === cheapestIndex;
          const isFastest = i === fastestIndex && i !== cheapestIndex;
          const isSelected = i === selectedIndex;

          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              className={`w-full rounded-xl border-2 p-3.5 text-left transition-all duration-200 ${
                isSelected
                  ? "border-[var(--brand-500)] bg-[var(--brand-50)] shadow-sm"
                  : "border-[var(--border)] hover:border-[var(--surface-300)] hover:bg-[var(--surface-50)]"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    isSelected ? "bg-[var(--brand-600)] text-white" : "bg-[var(--surface-200)] text-[var(--surface-500)]"
                  }`}>
                    {i + 1}
                  </span>
                  <span className="font-semibold text-[var(--surface-800)]">
                    {t.routeOptions.option(i + 1)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {isCheapest && <Badge variant="success">{t.routeOptions.cheapest}</Badge>}
                  {isFastest && <Badge variant="warning">{t.routeOptions.fastest}</Badge>}
                </div>
              </div>
              <div className="flex items-center justify-between px-1">
                <span className="text-lg font-bold text-[var(--surface-900)]">{formatVnd(option.breakdown.cost_total)}</span>
                <span className="text-xs text-[var(--surface-400)]">
                  {t.routeOptions.distanceAndTime(
                    `${option.route.distance_km.toFixed(1)} km`,
                    formatHours(option.route.duration_h, t.costPanel.hours),
                  )}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
