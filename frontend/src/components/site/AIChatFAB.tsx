"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useLocale } from "@/lib/i18n/LocaleContext";

// AIChatPanel 有 createPortal（客户端专用），动态导入避免 SSR 问题
const AIChatPanel = dynamic(() => import("@/components/AIChatPanel"), { ssr: false });

/** 全局事件：外部（如 AIChatSection 移动端 CTA）触发打开全屏聊天 */
export const OPEN_AI_CHAT_EVENT = "jiuneng:open-ai-chat";

/**
 * 移动端 AI 助手悬浮气泡（仅 <lg 显示，桌面端保留页面内嵌 AIChatSection）
 * 右下角青绿 FAB → 点击打开全屏聊天（AIChatPanel 全屏容器）
 */
export default function AIChatFAB() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const s = t.site.aiAssistant;

  // 外部事件可打开（AIChatSection 移动端 CTA）
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_AI_CHAT_EVENT, handler);
    return () => window.removeEventListener(OPEN_AI_CHAT_EVENT, handler);
  }, []);

  // 全屏聊天时锁定 body 滚动
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* 悬浮气泡 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={s.fabLabel}
        title={s.fabLabel}
        className="fixed right-5 z-[1500] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[var(--teal-400)] to-[var(--teal-600)] text-[#06281f] shadow-xl shadow-[#08c792]/30 transition-transform active:scale-95 lg:hidden"
        style={{ bottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <path d="M8 9h8M8 13h5" />
        </svg>
      </button>

      {/* 全屏聊天（仅移动端） */}
      {open && (
        <div className="fixed inset-0 z-[1600] flex flex-col bg-white lg:hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--surface-100)] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--teal-400)] to-[var(--teal-600)] text-[#06281f]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <span className="text-sm font-bold text-[var(--surface-800)]">{s.fabLabel}</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={s.fabClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--surface-400)] transition-colors hover:bg-[var(--surface-100)] hover:text-[var(--surface-600)]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-hidden px-3 pb-4 pt-1">
            <AIChatPanel autoFocus hideHeader />
          </div>
        </div>
      )}
    </>
  );
}
