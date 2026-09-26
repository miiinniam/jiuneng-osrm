"use client";

import { TRUNK_ROUTE } from "@/lib/route/trunkRoute";
import { useLocale } from "@/lib/i18n/LocaleContext";

/**
 * Hero 干线带：凭祥友谊关 → 河内 的真实路线几何。
 *
 * 关键约束：
 * - 容器锁 aspect-ratio，禁止非等比拉伸（路线地理形状近正方形，拉伸即失真）
 * - prefers-reduced-motion 下光点停止，但路线本身始终渲染
 * - 端点标签锚定到 TRUNK_ROUTE.start/.end 坐标，垂直居中于圆点
 *
 * 端点标签定位（规格 §9 缺陷 2）：
 *   路线在 x=1080~1100 处陡降（y 从 22 掉到 136），右端整条竖直方向被占满——
 *   实测「终点居中于端点」压线 26 处，上下偏移 ±8~14 全部压线，全宽搜索无可用位置。
 *   故给 viewBox 左右各加 PAD_X 侧栏：路线收进中间、标签放侧栏，与路线在水平方向
 *   完全不重叠，零碰撞。侧栏宽度按最宽语言（英文 "Pingxiang · Friendship Pass"
 *   ≈ 161 单位）留足。
 *
 *   但窄屏侧栏按比例缩小：390px 下仅 43px 宽，标签被迫折成 3 行 80px 高，
 *   而带只有 38px 高（实测超出上下 13.5/28.3px）。故 <768px 改为「带下方一行」，
 *   侧栏标签仅在 ≥768px 显示（768px 侧栏 86px、1440px 侧栏 150px，均放得下）。
 */
const PAD_X = 190;

export default function TrunkRouteBand({ className = "" }: { className?: string }) {
  const { t } = useLocale();
  const { path, start, end, distanceKm, viewBox } = TRUNK_ROUTE;
  const vbW = viewBox.width + PAD_X * 2;
  const vbH = viewBox.height;
  const colPct = (PAD_X / vbW) * 100;

  return (
    <div className={className}>
      <div className="relative w-full" style={{ aspectRatio: `${vbW} / ${vbH}` }}>
        <svg
          viewBox={`${-PAD_X} 0 ${vbW} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full overflow-visible"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="trunk-route-grad" x1="0" x2="1">
              <stop offset="0" stopColor="#2080f8" stopOpacity="0.35" />
              <stop offset="0.5" stopColor="#0040c0" stopOpacity="0.95" />
              <stop offset="1" stopColor="#2080f8" stopOpacity="0.4" />
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
          <circle cx={start.x} cy={start.y} r={6} fill="#ffffff" stroke="#2080f8" strokeWidth={2.8} />
          <circle cx={end.x} cy={end.y} r={6} fill="#ffffff" stroke="#2080f8" strokeWidth={2.8} />

          {/* 沿真实路径移动的光点（增强，非信息载体） */}
          <g className="trunk-route-dot">
            <circle r={10} fill="#2080f8" opacity={0.22}>
              <animateMotion dur="9s" repeatCount="indefinite">
                <mpath href="#trunk-route-path" />
              </animateMotion>
            </circle>
            <circle r={3.4} fill="#0040c0">
              <animateMotion dur="9s" repeatCount="indefinite">
                <mpath href="#trunk-route-path" />
              </animateMotion>
            </circle>
          </g>
        </svg>

        {/* ≥768px：左端点标签，锚定 start 坐标，垂直居中于圆点，位于左侧栏 */}
        <div
          className="pointer-events-none absolute hidden flex-col justify-center gap-0.5 pr-3 text-left md:flex"
          style={{
            left: 0,
            width: `${colPct}%`,
            // clamp 半高 18px：端点 y 贴近带下沿时（如 768px 右端点 83%）标签会
            // 溢出容器（实测 3.4px），夹住即可，位置仍锚定端点。
            top: `clamp(18px, ${(start.y / vbH) * 100}%, calc(100% - 18px))`,
            transform: "translateY(-50%)",
          }}
        >
          <span className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-[var(--blue)]">
            {t.route.startSub}
          </span>
          <span className="text-xs leading-snug text-[var(--navy)]">{t.route.startName}</span>
        </div>

        {/* ≥768px：右端点标签，锚定 end 坐标，垂直居中于圆点，位于右侧栏 */}
        <div
          className="pointer-events-none absolute hidden flex-col items-end justify-center gap-0.5 pl-3 text-right md:flex"
          style={{
            right: 0,
            width: `${colPct}%`,
            top: `clamp(18px, ${(end.y / vbH) * 100}%, calc(100% - 18px))`,
            transform: "translateY(-50%)",
          }}
        >
          <span className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-[var(--blue)]">
            {t.route.endSub}
          </span>
          <span className="text-xs leading-snug text-[var(--navy)]">{t.route.endName}</span>
        </div>

        {/* ≥768px：里程，数字与单位同行（规格 §9 缺陷 1、3） */}
        <div className="pointer-events-none absolute left-1/2 top-0 hidden -translate-x-1/2 text-center md:block">
          <p className="flex items-baseline justify-center gap-1.5">
            <span className="text-[23px] font-light tracking-[-0.03em] text-[var(--navy)] tabular-nums">
              {distanceKm.toFixed(1)}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--blue)]">
              {t.route.distanceCaption}
            </span>
          </p>
        </div>
      </div>

      {/* <768px：带下方一行（侧栏太窄放不下，且带仅 38px 高，里程放带内会压线） */}
      <div className="mt-2 flex items-start justify-between gap-3 md:hidden">
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--blue)]">
            {t.route.startSub}
          </span>
          <span className="text-[11px] leading-snug text-[var(--navy)]">{t.route.startName}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-base font-light leading-none tracking-[-0.03em] text-[var(--navy)] tabular-nums">
            {distanceKm.toFixed(1)}
          </span>
          <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--blue)]">
            {t.route.distanceCaption}
          </span>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-right">
          <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--blue)]">
            {t.route.endSub}
          </span>
          <span className="text-[11px] leading-snug text-[var(--navy)]">{t.route.endName}</span>
        </div>
      </div>
    </div>
  );
}
