// AI 聊天消息类型

export interface ChatAction {
  label: string;           // 按钮文本，如 "📊 查看明细"
  icon?: string;
  tool: string;            // "view_quote" | "apply_vehicle" | "view_route" | "view_border"
  payload: Record<string, unknown>;
}

export interface ChatMessage {
  role: "user" | "assistant" | "tool_status";
  content: string;
  toolName?: string;        // tool_status 时显示工具名
  toolStatus?: "running" | "done";
  toolResult?: Record<string, unknown>;  // tool_done 返回的完整结构化数据
  actions?: ChatAction[];   // 可操作按钮列表
}

export interface SSEEvent {
  event: string;  // "text" | "tool_start" | "tool_done" | "error" | "done"
  data: {
    content?: string;
    name?: string;
    params?: Record<string, unknown>;
    result?: Record<string, unknown>;
    message?: string;
    usage?: Record<string, unknown>;
  };
}
