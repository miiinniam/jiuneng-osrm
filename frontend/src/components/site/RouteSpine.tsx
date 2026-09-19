"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * 左缘贯穿 spine：同一条干线在页面上的垂直延续，随滚动填充。
 *
 * 性能关键：进度**不经过 React state**（否则每次滚动重渲染整页子树）。
 * 直接写 DOM 的 CSS 自定义属性 --spine-fill，由 CSS 消费。
 */
export default function RouteSpine({ children }: { children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      el.style.setProperty("--spine-fill", "1");
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      if (rect.height <= 0) return;
      const center = window.innerHeight / 2;
      const raw = (center - rect.top) / rect.height;
      const clamped = Math.min(1, Math.max(0, raw));
      el.style.setProperty("--spine-fill", String(clamped));
    };
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div ref={wrapRef} className="route-spine relative" style={{ ["--spine-fill" as string]: 0 }}>
      {children}
    </div>
  );
}
