"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ChatMessage, SSEEvent, ChatAction } from "@/lib/chatTypes";
import type { LatLng, QuoteFormState, QuoteResponse } from "@/lib/types";
import { API_BASE } from "@/lib/api";

/** 从 tool_done 中提取的路线起终点 */
export interface ChatRouteCoords {
  origin: LatLng;
  destination: LatLng;
}

export function useAIChat(
  onRouteFound?: (coords: ChatRouteCoords) => void,
  onQuoteResult?: (result: QuoteResponse) => void,
  onVehicleRecommend?: (vehicleModelId: string) => void,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const onRouteFoundRef = useRef(onRouteFound);
  onRouteFoundRef.current = onRouteFound;
  const onQuoteResultRef = useRef(onQuoteResult);
  onQuoteResultRef.current = onQuoteResult;
  const onVehicleRecommendRef = useRef(onVehicleRecommend);
  onVehicleRecommendRef.current = onVehicleRecommend;

  useEffect(() => {
    // 只滚动聊天容器内部，避免 scrollIntoView 把整个页面（官网首页）一起滚动导致弹跳
    const end = messagesEndRef.current;
    if (!end) return;
    const scroller = end.closest('[data-chat-scroll]') as HTMLElement | null;
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    } else {
      end.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const sendMessage = useCallback(async (content: string) => {
    const text = content.trim();
    if (!text) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: ChatMessage = { role: "user", content: text };

    setMessages((prev) => [...prev, userMsg, { role: "assistant", content: "" }]);
    setLoading(true);
    setError(null);

    try {
      const apiMessages = [...messages, userMsg]
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch(`${API_BASE}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.detail ?? `请求失败 (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("无法读取响应流");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ") && eventType) {
            try {
              const data = JSON.parse(line.slice(6));
              processEvent(eventType, data);
            } catch {
              // skip malformed
            }
            eventType = "";
          }
        }
      }

      // 处理残留 buffer
      if (buffer.trim()) {
        const m = buffer.match(/^event: (.+)\ndata: (.+)$/s);
        if (m) {
          try {
            const data = JSON.parse(m[2]);
            processEvent(m[1].trim(), data);
          } catch { /* skip */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "未知错误";
      setError(msg);
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant" && !last.content) {
          copy[copy.length - 1] = { ...last, content: `❌ ${msg}` };
        }
        return copy;
      });
    } finally {
      setLoading(false);
      abortRef.current = null;
    }

    function processEvent(event: string, data: SSEEvent["data"]) {
      switch (event) {
        case "tool_start":
          setMessages((prev) => {
            const copy = [...prev];
            const lastIdx = copy.length - 1;
            copy.splice(lastIdx, 0, {
              role: "tool_status",
              content: "",
              toolName: data.name,
              toolStatus: "running",
            });
            return copy;
          });
          break;

        case "tool_done":
          // 根据工具名生成操作按钮
          const actions: ChatAction[] = [];
          if (data.name === "calculate_freight_cost" && data.result) {
            actions.push({ label: "📊 查看明细", tool: "view_quote", payload: data.result });
            if (data.result.vehicle_model_id) {
              actions.push({ label: "🚛 填入车型", tool: "apply_vehicle", payload: { vehicle_model_id: data.result.vehicle_model_id } });
            }
          } else if (data.name === "query_vehicle_models" && data.result) {
            const vehicles = (data.result as Record<string, unknown>).vehicles as Array<Record<string, unknown>> | undefined;
            if (vehicles && vehicles.length > 0) {
              actions.push({ label: `🚛 用「${vehicles[0].name}」报价`, tool: "apply_vehicle", payload: { vehicle_model_id: vehicles[0].model_id } });
            }
          } else if (data.name === "compare_routes" && data.result) {
            actions.push({ label: "📊 查看对比", tool: "view_quote", payload: data.result });
          }

          setMessages((prev) => {
            const copy = [...prev];
            for (let i = copy.length - 1; i >= 0; i--) {
              if (
                copy[i].role === "tool_status" &&
                copy[i].toolName === data.name &&
                copy[i].toolStatus === "running"
              ) {
                copy[i] = {
                  ...copy[i],
                  content: `✅ ${data.name === "calculate_freight_cost" ? "运费计算完成" : "完成"}`,
                  toolStatus: "done",
                  toolResult: data.result,
                  actions: actions.length > 0 ? actions : undefined,
                };
                break;
              }
            }
            return copy;
          });
          // 提取起终点坐标，传给地图（地图自行获取路线几何）
          if (data.name === "calculate_freight_cost" && data.result) {
            const r = data.result as Record<string, unknown>;
            const origin = r._origin as { lng: number; lat: number } | undefined;
            const dest = r._destination as { lng: number; lat: number } | undefined;
            if (origin && dest && onRouteFoundRef.current) {
              onRouteFoundRef.current({ origin, destination: dest });
            }
          }
          break;

        case "text":
          setMessages((prev) => {
            const copy = [...prev];
            for (let i = copy.length - 1; i >= 0; i--) {
              if (copy[i].role === "assistant") {
                copy[i] = {
                  ...copy[i],
                  content: copy[i].content + (data.content || ""),
                };
                break;
              }
            }
            return copy;
          });
          break;

        case "error":
          setError(data.message || "未知错误");
          break;
      }
    }
  }, [messages]);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
  }, []);

  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setLoading(false);
  }, []);

  return {
    messages,
    loading,
    error,
    messagesEndRef,
    sendMessage,
    stopGeneration,
    clearChat,
  };
}
