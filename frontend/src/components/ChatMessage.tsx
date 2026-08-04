"use client";

import React from "react";
import type { ChatMessage } from "@/lib/chatTypes";

// ═══════════════════════════════════════════════════════
// 轻量 Markdown → JSX 渲染器
// ═══════════════════════════════════════════════════════

type MdBlock =
  | { type: "paragraph"; lines: string[] }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "code"; lang: string; code: string }
  | { type: "hr" }
  | { type: "list"; items: string[]; ordered: boolean };

/** 解析 markdown 文本为块级结构 */
function parseBlocks(text: string): MdBlock[] {
  const rawLines = text.split("\n");
  // 如果正在流式生成，丢弃最后一行（可能不完整）
  const lines = rawLines;

  const blocks: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 空行跳过
    if (line.trim() === "") {
      i++;
      continue;
    }

    // 表格检测：连续以 | 开头的行
    if (line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }
      const parsed = parseTable(tableLines);
      if (parsed) blocks.push(parsed);
      continue;
    }

    // 代码块 ```
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // 跳过闭合 ```
      blocks.push({ type: "code", lang, code: codeLines.join("\n") });
      continue;
    }

    // 水平线 --- 或 ━━━
    if (/^(-{3,}|━{3,})$/.test(line.trim())) {
      i++;
      blocks.push({ type: "hr" });
      continue;
    }

    // 无序列表 - item 或 * item
    if (/^[\-\*]\s/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^[\-\*]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[\-\*]\s+/, ""));
        i++;
      }
      blocks.push({ type: "list", items, ordered: false });
      continue;
    }

    // 有序列表 1. item
    if (/^\d+[\.\)]\s/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[\.\)]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[\.\)]\s+/, ""));
        i++;
      }
      blocks.push({ type: "list", items, ordered: true });
      continue;
    }

    // 普通段落：收集连续非空行
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      // 遇到特殊块开头就停
      const l = lines[i].trim();
      if (l.startsWith("```") || l.startsWith("|") || /^(-{3,}|━{3,})$/.test(l) ||
          /^[\-\*]\s/.test(l) || /^\d+[\.\)]\s/.test(l)) {
        break;
      }
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", lines: paraLines });
    }
  }

  return blocks;
}

/** 解析 markdown 表格行 */
function parseTable(lines: string[]): MdBlock | null {
  if (lines.length < 2) return null;

  const parseRow = (l: string) =>
    l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

  const header = parseRow(lines[0]);

  // 跳过分隔行 (|------|------|)
  let dataStart = 1;
  if (lines.length > 1 && /^[\|\s\-:]+$/.test(lines[1])) {
    dataStart = 2;
  }

  const rows: string[][] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const cells = parseRow(lines[i]);
    // 确保列数与 header 对齐
    while (cells.length < header.length) cells.push("");
    rows.push(cells.slice(0, header.length));
  }

  return { type: "table", header, rows };
}

/** 行内渲染：**bold**, `code` */
function InlineMarkdown({ text }: { text: string }) {
  // 匹配 **bold** 和 `code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="font-semibold text-[var(--surface-900)]">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={i} className="rounded bg-[var(--surface-100)] px-1 py-0.5 text-xs font-mono text-[var(--brand-700)]">{part.slice(1, -1)}</code>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ═══════════════════════════════════════════════════════
// 块级渲染组件
// ═══════════════════════════════════════════════════════

function TableBlock({ header, rows }: { header: string[]; rows: string[][] }) {
  return (
    <div className="my-2 overflow-x-auto rounded-lg border border-[var(--surface-200)]">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[var(--brand-50)]">
            {header.map((h, i) => (
              <th key={i} className={`px-3 py-2 text-left font-semibold text-[var(--brand-800)] ${i === header.length - 1 ? "text-right" : ""}`}>
                <InlineMarkdown text={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={`border-t border-[var(--surface-100)] ${ri % 2 === 0 ? "bg-white" : "bg-[var(--surface-50)]"}`}>
              {row.map((cell, ci) => (
                <td key={ci} className={`px-3 py-1.5 text-[var(--surface-700)] ${ci === row.length - 1 ? "text-right font-mono tabular-nums" : ""}`}>
                  <InlineMarkdown text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <div className="my-2 overflow-x-auto rounded-lg bg-[var(--surface-900)] p-3">
      {lang && <div className="mb-1 text-[10px] text-[var(--surface-400)]">{lang}</div>}
      <pre className="text-xs text-[var(--surface-100)] leading-relaxed whitespace-pre-wrap font-mono">{code}</pre>
    </div>
  );
}

function ListBlock({ items, ordered }: { items: string[]; ordered: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={`my-1.5 space-y-0.5 pl-5 text-sm ${ordered ? "list-decimal" : "list-disc"}`}>
      {items.map((item, i) => (
        <li key={i} className="text-[var(--surface-700)]">
          <InlineMarkdown text={item} />
        </li>
      ))}
    </Tag>
  );
}

/** 渲染全部块 */
function RenderBlocks({ blocks }: { blocks: MdBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "paragraph":
            return (
              <p key={i} className="my-1 leading-relaxed">
                {block.lines.map((line, j) => (
                  <React.Fragment key={j}>
                    {j > 0 && <br />}
                    <InlineMarkdown text={line} />
                  </React.Fragment>
                ))}
              </p>
            );
          case "table":
            return <TableBlock key={i} header={block.header} rows={block.rows} />;
          case "code":
            return <CodeBlock key={i} lang={block.lang} code={block.code} />;
          case "hr":
            return <hr key={i} className="my-2 border-[var(--surface-100)]" />;
          case "list":
            return <ListBlock key={i} items={block.items} ordered={block.ordered} />;
          default:
            return null;
        }
      })}
    </>
  );
}

// ═══════════════════════════════════════════════════════
// 聊天组件
// ═══════════════════════════════════════════════════════

function ToolStatus({ message, onAction }: { message: ChatMessage; onAction?: (action: ChatMessage["actions"] extends (infer T)[] | undefined ? T : never) => void }) {
  const isRunning = message.toolStatus === "running";
  const iconMap: Record<string, string> = {
    calculate_freight_cost: "📦",
    query_vehicle_models: "🚛",
    compare_routes: "⚖️",
    geocode_address: "📍",
    calculate_border_fees: "📋",
    query_exchange_rate: "💱",
  };
  const labelMap: Record<string, string> = {
    calculate_freight_cost: "计算运费",
    query_vehicle_models: "查询车型",
    compare_routes: "对比方案",
    geocode_address: "查询地址",
    calculate_border_fees: "口岸费用",
    query_exchange_rate: "查询汇率",
  };

  return (
    <div className="px-3 py-1">
      <div className="flex items-center gap-2">
        <span className="text-xs">{iconMap[message.toolName || ""] || "🔧"}</span>
        <span className={`text-xs ${isRunning ? "text-[var(--surface-500)]" : "text-[var(--success)]"}`}>
          {isRunning ? `${labelMap[message.toolName || ""] || "执行中"}...` : message.content}
        </span>
        {isRunning && (
          <span className="ml-auto flex gap-1">
            <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-[var(--brand-500)]" style={{ animationDelay: "0ms" }} />
            <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-[var(--brand-500)]" style={{ animationDelay: "150ms" }} />
            <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-[var(--brand-500)]" style={{ animationDelay: "300ms" }} />
          </span>
        )}
        {!isRunning && message.toolResult && (
          <span className="ml-auto text-[10px] text-[var(--surface-400)]">
            {message.toolResult.total_cost_vnd ? `${(message.toolResult.total_cost_vnd as string)}` : ""}
          </span>
        )}
      </div>
      {/* Action buttons */}
      {!isRunning && message.actions && message.actions.length > 0 && (
        <div className="mt-1.5 flex gap-1.5 flex-wrap">
          {message.actions.map((action, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onAction?.(action)}
              className="rounded-md border border-[var(--brand-200)] bg-[var(--brand-50)] px-2 py-1 text-[10px] font-medium text-[var(--brand-700)] hover:bg-[var(--brand-100)] hover:border-[var(--brand-400)] transition-colors"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end px-3">
      <div className="max-w-[82%] rounded-2xl rounded-br-md bg-[var(--brand-600)] px-3.5 py-2 text-sm leading-relaxed text-white">
        {content}
      </div>
    </div>
  );
}

function AssistantBubble({ content, streaming }: { content: string; streaming: boolean }) {
  if (!content && !streaming) return null;

  const blocks = parseBlocks(content);

  return (
    <div className="flex justify-start px-3">
      <div className="max-w-[94%] rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm leading-relaxed text-[var(--surface-700)] border border-[var(--surface-100)]">
        <RenderBlocks blocks={blocks} />
        {streaming && (
          <span className="ml-0.5 inline-block h-4 w-1 animate-pulse rounded-sm bg-[var(--brand-500)] align-middle" />
        )}
      </div>
    </div>
  );
}

export default function ChatMessageItem({
  message,
  streaming,
  onAction,
}: {
  message: ChatMessage;
  streaming: boolean;
  onAction?: (action: ChatMessage["actions"] extends (infer T)[] | undefined ? T : never) => void;
}) {
  if (message.role === "tool_status") {
    return <ToolStatus message={message} onAction={onAction} />;
  }
  if (message.role === "user") {
    return <UserBubble content={message.content} />;
  }
  if (message.role === "assistant") {
    return <AssistantBubble content={message.content} streaming={streaming} />;
  }
  return null;
}
