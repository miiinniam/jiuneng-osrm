"""
OSRM++ AI 对话编排引擎
======================

处理多轮对话的 Tool Calling 循环：
1. 用户消息 → DeepSeek（带工具定义）
2. DeepSeek 返回 text 或 tool_calls
3. 如果是 tool_calls → 执行工具 → 把结果追加到 messages → 回到步骤 1
4. 如果是 text → 流式输出到前端

防无限循环：
- 连续 tool call 超过 3 轮 → 强制要求模型给出最终答案
- tool call 前的闲聊文本不输出（"好的，我来算..." 等）
- 总轮次上限 20 轮

作为 async generator，yield SSE 事件 dict:
  {"event": "tool_start", "data": {"name": "...", "params": {...}}}
  {"event": "tool_done",  "data": {"name": "...", "result": {...}}}
  {"event": "text",       "data": {"content": "..."}}
  {"event": "error",      "data": {"message": "..."}}
  {"event": "done",       "data": {"usage": {...}}}
"""

import json
from typing import AsyncGenerator

from app.services.ai_client import StreamChunk, astream_chat
from app.services.ai_chat_prompt import OSRM_CHAT_SYSTEM
from app.services.ai_tools import TOOLS, execute_tool

MAX_TOOL_ROUNDS = 20       # 总轮次上限
MAX_CONSECUTIVE_TOOLS = 5  # 连续 tool call 上限，超过后强制要求回答


async def run_chat(
    messages: list[dict],
    *,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> AsyncGenerator[dict, None]:
    """运行多轮对话（自动处理 tool calling 循环），yield SSE 事件。"""

    full_messages = list(messages)
    tool_rounds = 0
    consecutive_tools = 0  # 连续 tool call 计数

    while tool_rounds < MAX_TOOL_ROUNDS:
        tool_rounds += 1

        # 如果连续 tool call 太多，注入强制回答提示
        if consecutive_tools >= MAX_CONSECUTIVE_TOOLS:
            full_messages.append({
                "role": "user",
                "content": (
                    "你已经调用了足够多的工具，数据已经齐全。"
                    "现在请直接给出最终回答：列出费用明细、总价、路线分析和建议。"
                    "不要再说「好的，我来计算」之类的话，直接输出结果。"
                    "如果某个工具返回了错误，请根据已有的正确数据给出最佳估算并注明。"
                ),
            })
            consecutive_tools = 0  # 重置，给最后一次机会

        tool_calls_buffer: list[dict] = []
        text_buffer: list[str] = []

        # 流式调用 DeepSeek
        async for chunk in astream_chat(
            full_messages,
            system=OSRM_CHAT_SYSTEM,
            tools=TOOLS if consecutive_tools < MAX_CONSECUTIVE_TOOLS else None,  # 强制模式下不给工具
            temperature=temperature,
            max_tokens=max_tokens,
        ):
            if chunk.finish_reason == "tool_calls":
                tool_calls_buffer = chunk.tool_calls
                break
            elif chunk.delta_content:
                text_buffer.append(chunk.delta_content)

        # 如果有工具调用
        if tool_calls_buffer:
            consecutive_tools += 1

            # 把 assistant 的 tool_calls 消息追加到对话
            # 注意：不保留 tool call 前的闲聊文本（如"好的，我来算..."）
            full_messages.append({
                "role": "assistant",
                "content": None,
                "tool_calls": tool_calls_buffer,
            })

            # 执行每个工具
            for tc in tool_calls_buffer:
                fn_name = tc["function"]["name"]
                try:
                    fn_args = json.loads(tc["function"]["arguments"])
                except json.JSONDecodeError:
                    fn_args = {}

                yield {
                    "event": "tool_start",
                    "data": {"name": fn_name, "params": fn_args},
                }

                result_str = await execute_tool(fn_name, fn_args)
                try:
                    result_data = json.loads(result_str)
                except json.JSONDecodeError:
                    result_data = {"raw": result_str}

                yield {
                    "event": "tool_done",
                    "data": {"name": fn_name, "result": result_data},
                }

                full_messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result_str,
                })

            continue

        # 没有工具调用 — 流式输出缓冲的文本
        consecutive_tools = 0  # 重置
        for text in text_buffer:
            yield {"event": "text", "data": {"content": text}}
        break

    else:
        yield {
            "event": "error",
            "data": {"message": "对话轮次超限，请重新提问"},
        }

    yield {
        "event": "done",
        "data": {"usage": {}},
    }
