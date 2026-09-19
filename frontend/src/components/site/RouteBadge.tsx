"use client";

import { TRUNK_ROUTE } from "@/lib/route/trunkRoute";
import { useLocale } from "@/lib/i18n/LocaleContext";

/**
 * 案例卡微缩路线角标（26×13）。与主带同源几何。
 *
 * 说明：规格 §12 允许角标独立简化以压 DOM 体积，当前复用主 path 即可
 * （26×13 下渲染成本可忽略）；若日后性能告警，再引入 ~40 点简化版。
 *
 * 描边：viewBox 宽 1160 渲染到 26px，缩放系数约 0.0224。
 * 若不用 non-scaling-stroke，要得到 ~1.5 屏幕像素需 strokeWidth≈67。
 * 用 vectorEffect="non-scaling-stroke" 后 strokeWidth 直接按屏幕像素解释，
 * 故取 1.5（计划原值 26 会渲染成 26 屏幕像素的粗线，已修正）。
 */
export default function RouteBadge({ className = "" }: { className?: string }) {
  const { t } = useLocale();
  const { path, viewBox } = TRUNK_ROUTE;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border border-[var(--surface-200)] bg-white px-1.5 py-0.5 text-[10.5px] text-[var(--surface-500)] ${className}`}
    >
      <svg
        viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-[13px] w-[26px] shrink-0"
        aria-hidden="true"
      >
        <path
          d={path}
          fill="none"
          stroke="#2080f8"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {t.route.badgeLabel}
    </span>
  );
}
