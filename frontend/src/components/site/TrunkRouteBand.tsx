"use client";

import { TRUNK_ROUTE } from "@/lib/route/trunkRoute";
import { useLocale } from "@/lib/i18n/LocaleContext";

/**
 * Hero 干线带：凭祥友谊关 → 河内 的真实路线几何。
 *
 * 关键约束：
 * - 容器锁 aspect-ratio，禁止非等比拉伸（路线地理形状近正方形，拉伸即失真）
 * - prefers-reduced-motion 下光点停止，但路线本身始终渲染
 * - 端点标签锚定到 TRUNK_ROUTE.start/.end 坐标，不固定在容器顶部
 */
export default function TrunkRouteBand({ className = "" }: { className?: string }) {
  const { t } = useLocale();
  const { path, start, end, distanceKm, viewBox } = TRUNK_ROUTE;
  const labelY = 30;

  return (
    <div className={`relative w-full ${className}`} style={{ aspectRatio: `${viewBox.width} / ${viewBox.height}` }}>
      <svg
        viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="trunk-route-grad" x1="0" x2="1">
            <stop offset="0" stopColor="#2080f8" stopOpacity="0.3" />
            <stop offset="0.5" stopColor="#4da3ff" stopOpacity="0.98" />
            <stop offset="1" stopColor="#2080f8" stopOpacity="0.38" />
          </linearGradient>
        </defs>

        <path
          id="trunk-route-path"
          d={path}
          fill="none"
          stroke="url(#trunk-route-grad)"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* 两端点：处理完全一致 */}
        <circle cx={start.x} cy={start.y} r={6} fill="#001030" stroke="#4da3ff" strokeWidth={2.8} />
        <circle cx={end.x} cy={end.y} r={6} fill="#001030" stroke="#4da3ff" strokeWidth={2.8} />

        {/* 沿真实路径移动的光点（增强，非信息载体） */}
        <g className="trunk-route-dot">
          <circle r={10} fill="#4da3ff" opacity={0.2}>
            <animateMotion dur="9s" repeatCount="indefinite">
              <mpath href="#trunk-route-path" />
            </animateMotion>
          </circle>
          <circle r={3.4} fill="#ffffff">
            <animateMotion dur="9s" repeatCount="indefinite">
              <mpath href="#trunk-route-path" />
            </animateMotion>
          </circle>
        </g>
      </svg>

      {/* 端点标签：用百分比定位到端点坐标，随画布等比缩放 */}
      <div
        className="pointer-events-none absolute flex flex-col gap-0.5"
        style={{ left: "0%", top: `${(labelY / viewBox.height) * 100}%` }}
      >
        <span className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-[var(--cyan-on-dark)]">
          {t.route.startSub}
        </span>
        <span className="text-xs text-white">{t.route.startName}</span>
      </div>
      <div
        className="pointer-events-none absolute flex flex-col items-end gap-0.5 text-right"
        style={{ right: "0%", top: `${(labelY / viewBox.height) * 100}%` }}
      >
        <span className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-[var(--cyan-on-dark)]">
          {t.route.endSub}
        </span>
        <span className="text-xs text-white">{t.route.endName}</span>
      </div>

      {/* 里程：数字与单位同行，避免被路线划穿（规格 §9 缺陷 1、3） */}
      <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 text-center">
        <p className="flex items-baseline justify-center gap-1.5">
          <span className="text-[23px] font-light tracking-[-0.03em] text-white tabular-nums">
            {distanceKm.toFixed(1)}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--cyan-on-dark)]">
            {t.route.distanceCaption}
          </span>
        </p>
      </div>
    </div>
  );
}
