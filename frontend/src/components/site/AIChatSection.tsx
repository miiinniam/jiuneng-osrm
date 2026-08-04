"use client";

import dynamic from "next/dynamic";
import { useLocale } from "@/lib/i18n/LocaleContext";

// AIChatPanel 有 createPortal（客户端专用），动态导入避免 SSR 问题
const AIChatPanel = dynamic(() => import("@/components/AIChatPanel"), { ssr: false });

/**
 * 官网首页 AI 助手区块 — 复用 OSRM++ 的 AIChatPanel（SSE 流式 + 工具调用）
 * 深蓝背景 + 白色聊天卡片，延续 K&N 风格
 */
export default function AIChatSection() {
  const { t } = useLocale();
  const s = t.site.aiAssistant;

  return (
    <section id="ai-assistant" className="scroll-mt-16 bg-[#0a1a2e] py-20">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
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
