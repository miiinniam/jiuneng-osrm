"use client";

import { useState, useRef, useCallback } from "react";
import QuoteForm from "@/components/QuoteForm";
import TemplateBar from "@/components/TemplateBar";
import AIChatPanel from "@/components/AIChatPanel";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { ChatRouteCoords } from "@/hooks/useAIChat";
import type { CargoTypeRate, QuoteFormState, QuoteMode, VehicleModelsByCategory } from "@/lib/types";

interface FloatingPanelProps {
  vehicleModelsByCategory: VehicleModelsByCategory;
  cargoTypeRates: Record<string, CargoTypeRate>;
  form: QuoteFormState;
  onChange: (patch: Partial<QuoteFormState>) => void;
  pickMode: "origin" | "destination" | null;
  onSetPickMode: (mode: "origin" | "destination" | null) => void;
  onSubmit: () => void;
  onCompareAlternatives: () => void;
  submitting: boolean;
  comparing: boolean;
  onLoadTemplate: (config: QuoteFormState) => void;
  onChatRouteFound?: (coords: ChatRouteCoords) => void;
  onAIAction?: (action: import("@/lib/chatTypes").ChatAction) => void;
  quoteMode: QuoteMode;
  onQuoteModeChange: (v: QuoteMode) => void;
  error: string | null;
  setError: (err: string | null) => void;
}

type Tab = "quote" | "chat";

const MIN_WIDTH = 340;
const MAX_WIDTH = 800;
const QUOTE_DEFAULT = 390;
const CHAT_DEFAULT = 480;

export default function FloatingPanel({
  vehicleModelsByCategory, cargoTypeRates, form, onChange,
  pickMode, onSetPickMode, onSubmit, onCompareAlternatives,
  submitting, comparing, onLoadTemplate, onChatRouteFound,
  quoteMode, onQuoteModeChange, error, setError, onAIAction,
}: FloatingPanelProps) {
  const { t } = useLocale();
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<Tab>("quote");
  const [panelWidth, setPanelWidth] = useState(QUOTE_DEFAULT);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startWidth: panelWidth };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = ev.clientX - resizeRef.current.startX;
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeRef.current.startWidth + delta));
      setPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      resizeRef.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [panelWidth]);

  const handleTabChange = useCallback((newTab: Tab) => {
    setTab(newTab);
    setPanelWidth(newTab === "chat" ? CHAT_DEFAULT : QUOTE_DEFAULT);
  }, []);

  if (collapsed) {
    return (
      <div className="absolute top-14 left-4 z-[800] max-lg:left-0 max-lg:right-0 max-lg:top-auto max-lg:bottom-0 max-lg:border-t max-lg:border-[var(--border)] max-lg:bg-white/95 max-lg:backdrop-blur-xl">
        <button type="button" onClick={() => setCollapsed(false)}
          className="flex w-full items-center gap-2 rounded-xl bg-white shadow-lg shadow-black/10 border border-[var(--brand-200)] px-3 py-2 text-xs font-semibold text-[var(--brand-600)] hover:bg-[var(--brand-50)] hover:border-[var(--brand-400)] transition-all max-lg:rounded-none max-lg:border-0 max-lg:shadow-none"
          aria-label={t.costPanel.expandPanel}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
          <span>{t.costPanel.expandPanel}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="absolute top-14 left-4 bottom-4 z-[800] flex flex-col transition-all duration-300 max-lg:left-0 max-lg:right-0 max-lg:top-auto max-lg:bottom-0 max-lg:h-[62vh] max-lg:!w-full max-lg:rounded-t-2xl max-lg:border-t max-lg:border-[var(--border)] max-lg:bg-white/95 max-lg:shadow-2xl max-lg:shadow-black/15 max-lg:backdrop-blur-xl"
      style={{ width: panelWidth }}
    >
      <div className="flex items-center gap-2 mb-2 px-1">
        <button type="button" onClick={() => setCollapsed(true)}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/60 backdrop-blur-sm hover:bg-white/90 transition-colors text-[var(--surface-400)] hover:text-[var(--surface-600)]"
          aria-label={t.costPanel.collapsePanel}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div className="flex flex-1 rounded-lg bg-white/60 backdrop-blur-sm p-0.5">
          <button onClick={() => handleTabChange("quote")}
            className={`flex-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
              tab === "quote" ? "bg-white text-[var(--surface-800)] shadow-sm" : "text-[var(--surface-400)] hover:text-[var(--surface-600)]"
            }`}>
            📋 {t.costPanel.settingsTitle}
          </button>
          <button onClick={() => handleTabChange("chat")}
            className={`flex-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
              tab === "chat" ? "bg-white text-[var(--brand-700)] shadow-sm" : "text-[var(--surface-400)] hover:text-[var(--surface-600)]"
            }`}>
            💬 AI 助手
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden rounded-2xl bg-white/90 backdrop-blur-xl border border-white/20 shadow-2xl shadow-black/10">
        <div className={`h-full overflow-y-auto p-3 space-y-3 ${tab === "quote" ? "" : "hidden"}`}>
          <TemplateBar form={form} onLoad={onLoadTemplate} />
          <QuoteForm
            vehicleModelsByCategory={vehicleModelsByCategory}
            cargoTypeRates={cargoTypeRates}
            form={form} onChange={onChange}
            pickMode={pickMode} onSetPickMode={onSetPickMode}
            onSubmit={onSubmit} onCompareAlternatives={onCompareAlternatives}
            submitting={submitting} comparing={comparing}
            quoteMode={quoteMode} onQuoteModeChange={onQuoteModeChange}
            error={error} setError={setError}
          />
        </div>
        <div className={`h-full flex flex-col p-3 ${tab === "chat" ? "" : "hidden"}`}>
          <AIChatPanel onRouteFound={onChatRouteFound} onAction={onAIAction} />
        </div>
      </div>

      {/* Right-edge resize handle（仅桌面） */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute top-0 -right-1 bottom-0 w-2 cursor-col-resize hover:bg-[var(--brand-300)]/40 active:bg-[var(--brand-400)]/60 transition-colors select-none z-10 hidden lg:block"
        title="拖拽调整宽度"
      />
      {/* 移动端顶部拖拽把手 */}
      <div className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 lg:hidden">
        <div className="h-1 w-10 rounded-full bg-[var(--surface-300)]" />
      </div>
    </div>
  );
}
