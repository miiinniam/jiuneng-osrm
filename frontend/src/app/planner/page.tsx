"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import {
  plannerParse,
  plannerPlan,
  plannerQuote,
  type PlannerPlanResponse,
  type PlannerQuoteResponse,
} from "@/lib/plannerApi";
import PlanCard from "@/components/planner/PlanCard";

type Msg =
  | { id: number; role: "user"; text: string }
  | {
      id: number;
      role: "ai";
      text?: string;
      plan?: PlannerPlanResponse;
      quote?: PlannerQuoteResponse | null;
    };

let msgSeq = 0;
const nextId = () => ++msgSeq;

/**
 * /planner — 货运方案工作台 (二期 B v1, mock 联调)
 * 交互形态: 整页滚动对话流 + 底部固定输入 + 乐观 UI + 方案卡结构化回复
 * 契约: /api/planner/* (codex-01 v1); 后端未就绪时 plannerApi 自动回退 mock
 */
export default function PlannerPage() {
  const { t } = useLocale();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const runPlan = async (text: string, vehicleModelId: string) => {
    setBusy(true);
    const aiId = nextId();
    setMessages((ms) => [...ms, { id: aiId, role: "ai", text: t.planner.thinking }]);
    try {
      const parsed = await plannerParse(text);
      const summary =
        parsed.cargo_items.map((c) => `${c.name}×${c.count}（${c.length_m}×${c.width_m}×${c.height_m}m, ${c.weight_kg}kg）`).join(" + ") +
        (parsed.route ? `，${parsed.route.origin} → ${parsed.route.destination}` : "");
      const plan = await plannerPlan(parsed.cargo_items, vehicleModelId);
      const quote = parsed.route
        ? await plannerQuote(parsed.cargo_items, vehicleModelId, parsed.route.origin, parsed.route.destination)
        : null;
      setMessages((ms) =>
        ms.map((m) => (m.id === aiId ? { ...m, text: `已识别：${summary}`, plan, quote } : m)),
      );
    } catch {
      setMessages((ms) => ms.map((m) => (m.id === aiId ? { ...m, text: t.planner.planFailed } : m)));
    } finally {
      setBusy(false);
    }
  };

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((ms) => [...ms, { id: nextId(), role: "user", text }]);
    void runPlan(text, "40hq");
  };

  const handleVehicleChange = (modelId: string) => {
    // 换车型 = 新对话轮次 (上一条方案卡保留可对比)
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser && !busy) {
      void runPlan(lastUser.text, modelId);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-[var(--surface-50)] pt-16">
      {/* 对话流 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 pb-8 pt-6">
          {/* 空态引导 */}
          {messages.length === 0 && (
            <div className="mt-[12vh] text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-50)] text-2xl shadow-[inset_0_0_0_1px_var(--brand-200)]">
                🚚
              </div>
              <h1 className="mt-4 text-xl font-bold text-[var(--navy)]">{t.planner.title}</h1>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--surface-500)]">
                {t.planner.subtitle}
              </p>
              <button
                type="button"
                onClick={() => setInput(t.planner.exampleA)}
                className="mt-6 rounded-xl border border-[var(--brand-200)] bg-white px-4 py-2.5 text-xs text-[var(--brand-600)] shadow-sm transition-all hover:border-[var(--brand-400)] hover:shadow-md"
              >
                💬 {t.planner.exampleA}
              </button>
            </div>
          )}

          {/* 消息流 */}
          <div className="space-y-4">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-[var(--blue)] px-4 py-2.5 text-sm text-white shadow-sm">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex justify-start">
                  <div className="max-w-[92%] space-y-2">
                    {m.text && (
                      <div className="inline-block rounded-2xl rounded-bl-sm bg-[var(--brand-50)] px-4 py-2.5 text-sm text-[var(--surface-700)] shadow-sm">
                        {m.text}
                      </div>
                    )}
                    {m.plan && <PlanCard plan={m.plan} quote={m.quote ?? null} onVehicleChange={handleVehicleChange} />}
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      </div>

      {/* 底部固定输入栏 */}
      <div className="border-t border-[var(--surface-200)] bg-white/90 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t.planner.placeholder}
            className="flex-1 rounded-xl border border-[var(--surface-200)] bg-white px-4 py-2.5 text-sm text-[var(--surface-800)] placeholder:text-[var(--surface-400)] focus:border-[var(--brand-400)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-100)]"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !input.trim()}
            className="shrink-0 rounded-xl bg-[var(--blue)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--blue-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t.planner.send}
          </button>
        </div>
      </div>
    </div>
  );
}
