"use client";

import dynamic from "next/dynamic";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { OPEN_AI_CHAT_EVENT } from "@/components/site/AIChatFAB";

// AIChatPanel 有 createPortal（客户端专用），动态导入避免 SSR 问题
const AIChatPanel = dynamic(() => import("@/components/AIChatPanel"), { ssr: false });

/**
 * 官网首页 AI 助手区块
 * - 桌面（≥lg）：左侧文案 + 右侧 540px 聊天卡（复用 AIChatPanel，SSE 流式 + 工具调用）
 * - 移动端（<lg）：精简入口卡，点击打开全屏聊天（AIChatFAB 悬浮气泡），不再内嵌大聊天卡
 */
export default function AIChatSection() {
  const { t } = useLocale();
  const s = t.site.aiAssistant;

  const openFullscreenChat = () => window.dispatchEvent(new Event(OPEN_AI_CHAT_EVENT));

  return (
    <section id="ai-assistant" className="scroll-mt-16 bg-[#0a1a2e] py-20">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        {/* ═══════ 移动端：精简入口卡 ═══════ */}
        <div className="lg:hidden">
          <div className="flex items-center gap-3">
            <span className="h-0.5 w-8 bg-[var(--teal-500)]" />
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--teal-500)]">
              {s.eyebrow}
            </p>
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-white">{s.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--brand-100)]/65">{s.intro}</p>
          <div className="mt-6 space-y-2.5">
            {[s.hint1, s.hint2, s.hint3].map((hint, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--teal-500)]/15 text-[var(--teal-400)]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                    <path d="m5 12 5 5 9-10" />
                  </svg>
                </span>
                <span className="text-sm font-medium text-[var(--brand-100)]/80">{hint}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={openFullscreenChat}
            className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--teal-500)] px-5 py-3.5 text-sm font-bold text-[#06281f] shadow-lg shadow-[#08c792]/25 transition-all active:scale-[0.98]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <path d="M8 9h8M8 13h5" />
            </svg>
            {s.fabOpen}
          </button>
        </div>

        {/* ═══════ 桌面：文案 + 聊天卡 ═══════ */}
        <div className="hidden grid-cols-[0.9fr_1.1fr] items-center gap-14 lg:grid">
          {/* 左：文案 */}
          <div>
            <div className="flex items-center gap-3">
              <span className="h-0.5 w-8 bg-[var(--teal-500)] sm:w-10" />
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--teal-500)] sm:text-xs sm:tracking-[0.22em]">
                {s.eyebrow}
              </p>
            </div>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-white sm:mt-5 sm:text-3xl">
              {s.title}
            </h2>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-[var(--brand-100)]/65">
              {s.intro}
            </p>

            {/* 能力点 */}
            <div className="mt-7 space-y-3">
              {[s.hint1, s.hint2, s.hint3].map((hint, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--teal-500)]/15 text-[var(--teal-400)]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                      <path d="m5 12 5 5 9-10" />
                    </svg>
                  </span>
                  <span className="text-sm font-medium text-[var(--brand-100)]/80">{hint}</span>
                </div>
              ))}
            </div>

            {/* 示例提问 */}
            <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-100)]/40">
                💡 Example
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--brand-100)]/80">{s.example}</p>
            </div>
          </div>

          {/* 右：AI 聊天卡片 */}
          <div className="h-[540px] overflow-hidden overscroll-contain rounded-2xl border border-white/15 bg-white p-4 shadow-2xl shadow-black/20">
            <AIChatPanel />
          </div>
        </div>
      </div>
    </section>
  );
}
