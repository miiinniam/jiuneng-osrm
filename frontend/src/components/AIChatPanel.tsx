"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import ChatMessageItem from "@/components/ChatMessage";
import { useAIChat, type ChatRouteCoords } from "@/hooks/useAIChat";

const SUGGESTIONS = [
  { icon: "💱", label: "今日汇率", text: "今天人民币兑越南盾汇率是多少？" },
  { icon: "📦", label: "快速报价", text: "从友谊关到河内，13米平板车，25吨普通货，运费多少？" },
  { icon: "🚛", label: "车型推荐", text: "20吨设备从河内到海防，推荐什么车型？对比13米和17.5米平板车" },
  { icon: "💡", label: "拼车分析", text: "8吨货从友谊关到北宁，拼车和整车哪个更划算？" },
];

export default function AIChatPanel({ onRouteFound, onAction }: {
  onRouteFound?: (coords: ChatRouteCoords) => void;
  onAction?: (action: import("@/lib/chatTypes").ChatAction) => void;
}) {
  const [input, setInput] = useState("");
  const [isPopout, setIsPopout] = useState(false);
  const [popoutSize, setPopoutSize] = useState({ w: 680, h: 0 });
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { messages, loading, error, messagesEndRef, sendMessage, stopGeneration, clearChat } =
    useAIChat(onRouteFound);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    if (!input.trim() || loading) return;
    sendMessage(input.trim());
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  }, [input, loading, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const adjustHeight = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const handleResizeStart = (e: React.MouseEvent, axis: "se" | "e") => {
    e.preventDefault();
    const el = e.currentTarget.parentElement as HTMLElement;
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: el.offsetWidth,
      startH: el.offsetHeight,
    };
    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      setPopoutSize({
        w: Math.max(480, Math.min(1200, resizeRef.current.startW + (ev.clientX - resizeRef.current.startX))),
        h: axis === "se"
          ? Math.max(400, resizeRef.current.startH + (ev.clientY - resizeRef.current.startY))
          : resizeRef.current.startH,
      });
    };
    const onMouseUp = () => {
      resizeRef.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const chatContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0 mb-1">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--brand-100)] to-[var(--brand-50)]">
            <svg className="h-3.5 w-3.5 text-[var(--brand-500)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
          </div>
          <span className="text-xs font-semibold text-[var(--surface-600)]">AI 物流助手</span>
          {loading && <span className="flex gap-1"><span className="h-1 w-1 rounded-full bg-[var(--brand-500)] animate-bounce" style={{animationDelay:"0ms"}}/><span className="h-1 w-1 rounded-full bg-[var(--brand-500)] animate-bounce" style={{animationDelay:"150ms"}}/><span className="h-1 w-1 rounded-full bg-[var(--brand-500)] animate-bounce" style={{animationDelay:"300ms"}}/></span>}
        </div>
        <button type="button" onClick={() => setIsPopout(!isPopout)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--surface-400)] hover:bg-[var(--surface-100)] hover:text-[var(--surface-600)] transition-colors"
          title={isPopout ? "收回嵌入" : "弹出放大"}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {isPopout ? (
              <><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></>
            ) : (
              <><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></>
            )}
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div data-chat-scroll className="flex-1 overflow-y-auto overscroll-contain rounded-lg">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-6 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--brand-100)] to-[var(--brand-50)]">
              <svg className="h-5 w-5 text-[var(--brand-500)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
            </div>
            <p className="text-xs text-[var(--surface-500)]">输入运输问题，AI 实时计算运费</p>
            <div className="flex flex-col gap-1.5 w-full">
              {SUGGESTIONS.map((s) => (
                <button key={s.label} onClick={() => sendMessage(s.text)} disabled={loading}
                  className="flex items-center gap-2 rounded-lg border border-[var(--surface-200)] bg-white px-3 py-1.5 text-left text-[11px] text-[var(--surface-600)] hover:border-[var(--brand-300)] hover:bg-[var(--brand-50)] disabled:opacity-50">
                  <span className="text-sm">{s.icon}</span>
                  <span className="font-medium text-[var(--surface-700)] text-[11px]">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <ChatMessageItem key={i} message={msg} streaming={loading && i === messages.length - 1 && msg.role === "assistant"} onAction={onAction} />
            ))}
            {error && (
              <div className="mx-3 my-2 rounded-lg bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--danger)]">{error}</div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-[var(--surface-100)] pt-2 shrink-0">
        <div className="flex items-end gap-2">
          <textarea ref={inputRef} value={input}
            onChange={(e) => { setInput(e.target.value); adjustHeight(e.target); }}
            onKeyDown={handleKeyDown}
            placeholder="输入运输问题..."
            rows={1} disabled={loading}
            className="flex-1 resize-none rounded-xl border border-[var(--surface-200)] bg-[var(--surface-50)] px-3 py-2 text-sm text-[var(--surface-800)] placeholder:text-[var(--surface-400)] outline-none focus:border-[var(--brand-400)] focus:bg-white"
            style={{ maxHeight: "100px" }}
            onInput={(e) => adjustHeight(e.currentTarget)} />
          {loading ? (
            <button onClick={stopGeneration} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-200)] hover:bg-red-100">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2" /></svg>
            </button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-600)] text-white hover:bg-[var(--brand-700)] disabled:opacity-30">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l7.5-7.5 7.5 7.5m-15 6l7.5-7.5 7.5 7.5" />
              </svg>
            </button>
          )}
        </div>
        {messages.length > 0 && (
          <button onClick={clearChat} className="mt-1.5 w-full text-center text-[11px] text-[var(--surface-400)] hover:text-red-500 transition-colors">
            清空对话
          </button>
        )}
      </div>
    </div>
  );

  // Popout — only renders on client (check at call site, not hooks level)
  const popoutStyle = popoutSize.h > 0
    ? { width: popoutSize.w, height: popoutSize.h, maxHeight: "none" as const }
    : { width: popoutSize.w, maxHeight: "82vh" as const };

  return (
    <>
      {isPopout && typeof document !== "undefined" && document.body && createPortal(
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setIsPopout(false); }}>
          <div className="flex flex-col rounded-2xl bg-white shadow-2xl border border-[var(--surface-200)] overflow-hidden relative" style={popoutStyle}>
            <div className="p-4 h-full flex flex-col overflow-hidden">{chatContent}</div>
            {/* Right-edge resize: drag to change width only */}
            <div onMouseDown={(e) => handleResizeStart(e, "e")}
              className="absolute top-0 -right-1 bottom-0 w-2 cursor-ew-resize hover:bg-[var(--brand-300)]/40 active:bg-[var(--brand-400)]/60 transition-colors select-none rounded-r-2xl"
              title="拖拽调整宽度" />
            {/* Bottom-right corner resize */}
            <div onMouseDown={(e) => handleResizeStart(e, "se")}
              className="absolute bottom-1 right-1 w-4 h-4 cursor-se-resize text-[var(--surface-300)] hover:text-[var(--surface-500)] select-none"
              title="拖拽调整窗口大小">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22 22H20V20H22V22ZM22 18H18V20H20V22H18V20H22V18ZM18 22H16V20H18V22ZM14 22H16V18H18V16H14V22ZM22 14H20V16H22V14Z"/>
              </svg>
            </div>
          </div>
        </div>,
        document.body
      )}
      {!isPopout && chatContent}
    </>
  );
}
