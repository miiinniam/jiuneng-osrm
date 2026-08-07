"use client";

import { useEffect, useState } from "react";

/** SSR 安全的媒体查询 hook：初始 false（按桌面渲染），挂载后同步真实值 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** 移动端判定：宽度 < 1024px（与 Tailwind lg 断点一致） */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 1023px)");
}
