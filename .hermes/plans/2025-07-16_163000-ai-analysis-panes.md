# AI Analysis Panes — Desktop Plugin Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 新增一个 Hermes 桌面插件，在主对话窗口旁边提供多个独立的 AI 分析窗格（pane），每个窗格使用 DeepSeek v4 flash 模型进行独立的分析对话。

**Architecture:** 一个 Hermes desktop plugin（纯 JS ESM），通过插件 SDK 注册多个分析窗格（panes）。每个窗格是一个独立的轻量级聊天界面，直接调用 DeepSeek API（不经过 Hermes agent loop），避免污染主会话上下文。用户可以从侧边栏或命令面板创建/切换分析窗格。

**Tech Stack:** Hermes Desktop Plugin SDK (`@hermes/plugin-sdk`), React (jsx runtime), DeepSeek API (deepseek-chat via `https://api.deepseek.com/v1`), 纯前端实现 — 不需要后端 Python 插件。

---

## 设计概览

```
┌─────────────────────────────────────────────────────────┐
│  Hermes Desktop App                                     │
│  ┌─────────────┬──────────┬──────────┬──────────┐      │
│  │ 主对话       │ AI分析#1  │ AI分析#2  │ AI分析#3  │      │
│  │ (workspace) │ (flash)  │ (flash)  │ (flash)  │      │
│  │             │          │          │          │      │
│  │ deepseek    │ deepseek │ deepseek │ deepseek │      │
│  │ v4-pro      │ v4-flash │ v4-flash │ v4-flash │      │
│  └─────────────┴──────────┴──────────┴──────────┘      │
│  StatusBar: [🔍 AI Analysis ▼] [Analysis #1] [#2] [#3]  │
└─────────────────────────────────────────────────────────┘
```

### 核心功能
1. **多窗格管理** — 创建、关闭、重命名分析窗格，最多 5 个
2. **独立 AI 对话** — 每个窗格有独立的消息历史和系统提示词
3. **DeepSeek v4 flash** — 直接调用 DeepSeek API（流式输出）
4. **上下文传递** — 可从主对话复制/引用文本到分析窗格
5. **持久化** — 窗格列表和最近消息存储到 `ctx.storage`

---

## Task 1: 创建插件骨架和目录结构

**Objective:** 搭建插件基础目录和入口文件，验证插件能被 Hermes 桌面端加载。

**Files:**
- Create: `~/.hermes/desktop-plugins/ai-analysis-panes/plugin.js`

**Step 1: 创建插件目录**

```bash
mkdir -p "$HOME/AppData/Local/hermes/desktop-plugins/ai-analysis-panes"
```

**Step 2: 写入最小插件骨架**

```javascript
// ~/.hermes/desktop-plugins/ai-analysis-panes/plugin.js

import { host, useValue } from '@hermes/plugin-sdk'
import { jsx } from 'react/jsx-runtime'

function AnalysisPanePlaceholder() {
  return jsx('div', {
    className: 'flex h-full flex-col items-center justify-center gap-2 p-3 text-sm',
    children: [
      jsx('div', {
        className: 'text-lg font-medium',
        children: 'AI Analysis Pane'
      }),
      jsx('div', {
        className: 'text-(--ui-text-tertiary)',
        children: 'DeepSeek v4 Flash — 独立分析窗口'
      })
    ]
  })
}

export default {
  id: 'ai-analysis-panes',
  name: 'AI Analysis Panes',
  register(ctx) {
    // 注册一个初始分析窗格
    ctx.register({
      id: 'analysis-pane-1',
      area: 'panes',
      title: 'AI Analysis #1',
      data: {
        placement: 'right',
        width: '400px',
        dock: { pane: 'workspace', pos: 'right' }
      },
      render: () => jsx(AnalysisPanePlaceholder, {})
    })
  }
}
```

**Step 3: 验证加载**

在 Hermes 桌面端按 `Ctrl+K` → 搜索 "Reload desktop plugins" → 执行。确认侧边出现 "AI Analysis #1" 窗格，无错误提示。

---

## Task 2: 实现分析窗格状态管理

**Objective:** 实现窗格的多实例管理逻辑：创建、关闭、切换、重命名，以及每窗格独立的消息历史。

**Files:**
- Modify: `~/.hermes/desktop-plugins/ai-analysis-panes/plugin.js`

**Step 1: 添加状态管理核心**

```javascript
import { useState, useCallback, useEffect, useRef } from 'react'

// 单窗格状态
function createEmptyPane(id) {
  return {
    id,
    name: `Analysis #${id}`,
    messages: [],        // [{ role: 'user'|'assistant', content: '...' }]
    systemPrompt: '你是一个专业的AI分析助手。请用中文回复，简洁直接。',
    isLoading: false,
    createdAt: Date.now()
  }
}

// 全局窗格管理器 (通过 ctx.storage 持久化)
function useAnalysisPanes(ctx) {
  const [panes, setPanes] = useState(() => {
    const saved = ctx.storage.get('panes')
    return saved?.length ? saved : [createEmptyPane(1)]
  })
  const [activePaneId, setActivePaneId] = useState(() => panes[0]?.id ?? 1)
  const nextIdRef = useRef(panes.length + 1)

  // 持久化
  useEffect(() => {
    ctx.storage.set('panes', panes)
  }, [panes])

  const addPane = useCallback(() => {
    const id = nextIdRef.current++
    setPanes(prev => [...prev, createEmptyPane(id)])
    setActivePaneId(id)
  }, [])

  const removePane = useCallback((id) => {
    setPanes(prev => prev.filter(p => p.id !== id))
    setActivePaneId(prev => prev === id ? (panes[0]?.id ?? 1) : prev)
  }, [panes])

  const updatePane = useCallback((id, updater) => {
    setPanes(prev => prev.map(p => p.id === id
      ? (typeof updater === 'function' ? updater(p) : { ...p, ...updater })
      : p
    ))
  }, [])

  const activePane = panes.find(p => p.id === activePaneId) ?? panes[0]

  return {
    panes, activePane, activePaneId,
    setActivePaneId, addPane, removePane, updatePane
  }
}
```

**Step 2: 验证状态持久化**

在 `register()` 中测试：创建窗格 → 关闭 → 重新加载插件，窗格状态应该恢复。

---

## Task 3: 实现 DeepSeek API 调用层（流式输出）

**Objective:** 封装 DeepSeek API 的流式聊天完成调用，支持自定义 system prompt 和消息历史。

**Files:**
- Modify: `~/.hermes/desktop-plugins/ai-analysis-panes/plugin.js`

**Step 1: 添加 API 调用函数**

```javascript
const DEEPSEEK_BASE = 'https://api.deepseek.com/v1'
const MODEL = 'deepseek-chat'  // deepseek v4 flash

// 从 Hermes 配置获取 API key
function getApiKey() {
  // 读取 env 或 config 中的 deepseek key
  // 因为桌面插件无法直接读取 .env，改用 host.request 获取
  // 备选方案：让用户手动输入，或硬编码（不推荐）
  // 最佳方案：通过 Hermes 的 gateway RPC 获取 credentials
  return null // 将在 Task 6 中完善
}

async function* streamChat(messages, systemPrompt, signal) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('DeepSeek API key not configured')

  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
    ],
    stream: true,
    temperature: 0.3,
    max_tokens: 4096
  })

  const response = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body,
    signal
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`API error ${response.status}: ${errText}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') return

      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch { /* skip malformed JSON chunks */ }
    }
  }
}
```

**Step 2: 添加 AbortController 管理**

```javascript
function useAbortController() {
  const ref = useRef(null)

  const abort = useCallback(() => {
    ref.current?.abort()
    ref.current = null
  }, [])

  const create = useCallback(() => {
    abort()
    ref.current = new AbortController()
    return ref.current.signal
  }, [abort])

  return { create, abort, signal: ref.current?.signal }
}
```

---

## Task 4: 实现分析窗格聊天 UI

**Objective:** 构建分析窗格的完整聊天界面：消息列表、输入框、发送按钮、加载动画、流式文本渲染。

**Files:**
- Modify: `~/.hermes/desktop-plugins/ai-analysis-panes/plugin.js`

**Step 1: 消息渲染组件**

```javascript
import { ScrollArea } from '@hermes/plugin-sdk'

function MessageList({ messages, streamingText }) {
  return jsx(ScrollArea, {
    className: 'flex-1',
    children: jsx('div', { className: 'flex flex-col gap-3 p-3', children: [
      ...messages.map((msg, i) =>
        jsx('div', {
          key: i,
          className: `flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`,
          children: jsx('div', {
            className: `max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              msg.role === 'user'
                ? 'bg-(--ui-accent) text-white'
                : 'bg-(--chrome-surface) text-(--ui-text-primary)'
            }`,
            children: msg.content
          })
        })
      ),
      streamingText && jsx('div', {
        className: 'flex justify-start',
        children: jsx('div', {
          className: 'max-w-[85%] rounded-lg bg-(--chrome-surface) px-3 py-2 text-sm text-(--ui-text-primary)',
          children: streamingText + '▊'
        })
      })
    ]})
  })
}
```

**Step 2: 输入框组件**

```javascript
import { useRef } from 'react'

function ChatInput({ onSend, disabled }) {
  const inputRef = useRef(null)

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const text = inputRef.current?.value?.trim()
      if (text && !disabled) {
        onSend(text)
        inputRef.current.value = ''
      }
    }
  }

  return jsx('div', {
    className: 'border-t border-(--ui-stroke-secondary) p-2',
    children: jsx('textarea', {
      ref: inputRef,
      rows: 2,
      disabled,
      placeholder: '输入分析问题... (Enter 发送, Shift+Enter 换行)',
      className: 'w-full resize-none rounded-md border border-(--ui-stroke-secondary) bg-(--chrome-input-bg) px-3 py-2 text-sm text-(--ui-text-primary) placeholder:text-(--ui-text-quaternary) outline-none focus:border-(--ui-accent) disabled:opacity-50',
      onKeyDown: handleKeyDown
    })
  })
}
```

**Step 3: 组合完整分析窗格**

```javascript
function AnalysisPane({ pane, updatePane, ctx }) {
  const [streamingText, setStreamingText] = useState('')
  const abortCtrl = useAbortController()

  const sendMessage = useCallback(async (content) => {
    const userMsg = { role: 'user', content }
    updatePane(pane.id, p => ({
      ...p,
      messages: [...p.messages, userMsg],
      isLoading: true
    }))
    setStreamingText('')

    const signal = abortCtrl.create()
    let fullResponse = ''

    try {
      for await (const chunk of streamChat(
        [...pane.messages, userMsg],
        pane.systemPrompt,
        signal
      )) {
        fullResponse += chunk
        setStreamingText(fullResponse)
      }
      updatePane(pane.id, p => ({
        ...p,
        messages: [...p.messages, userMsg, { role: 'assistant', content: fullResponse }],
        isLoading: false
      }))
      setStreamingText('')
    } catch (err) {
      if (err.name === 'AbortError') return
      updatePane(pane.id, p => ({
        ...p,
        messages: [...p.messages, userMsg, { role: 'assistant', content: `❌ 错误: ${err.message}` }],
        isLoading: false
      }))
      setStreamingText('')
    }
  }, [pane, updatePane, abortCtrl])

  return jsxs('div', {
    className: 'flex h-full flex-col',
    children: [
      // 顶部工具栏
      jsx('div', {
        className: 'flex items-center gap-2 border-b border-(--ui-stroke-secondary) px-3 py-2',
        children: [
          jsx('span', { className: 'text-sm font-medium flex-1', children: pane.name }),
          jsx('button', {
            onClick: () => abortCtrl.abort(),
            disabled: !pane.isLoading,
            className: 'rounded px-2 py-0.5 text-xs text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) disabled:opacity-30',
            children: '⏹ 停止'
          })
        ]
      }),
      // 消息列表
      jsx(MessageList, { messages: pane.messages, streamingText }),
      // 输入框
      jsx(ChatInput, { onSend: sendMessage, disabled: pane.isLoading })
    ]
  })
}
```

---

## Task 5: 实现多窗格管理 UI（标签栏 + 新建/关闭）

**Objective:** 在插件顶部添加窗格标签切换栏，支持新建窗格和关闭窗格。

**Files:**
- Modify: `~/.hermes/desktop-plugins/ai-analysis-panes/plugin.js`

**Step 1: 标签栏组件**

```javascript
function PaneTabs({ panes, activePaneId, onSelect, onAdd, onRemove }) {
  return jsxs('div', {
    className: 'flex items-center border-b border-(--ui-stroke-secondary) bg-(--chrome-sidebar-bg)',
    children: [
      ...panes.map(p => jsxs('button', {
        key: p.id,
        onClick: () => onSelect(p.id),
        className: cn(
          'group flex items-center gap-1 px-3 py-1.5 text-xs border-b-2 transition-colors',
          activePaneId === p.id
            ? 'border-(--ui-accent) text-(--ui-text-primary)'
            : 'border-transparent text-(--ui-text-tertiary) hover:text-(--ui-text-secondary)'
        ),
        children: [
          jsx('span', { children: p.name }),
          panes.length > 1 && jsx('span', {
            onClick: (e) => { e.stopPropagation(); onRemove(p.id) },
            className: 'ml-0.5 opacity-0 group-hover:opacity-100 hover:text-red-500 cursor-pointer',
            children: '×'
          })
        ]
      })),
      jsx('button', {
        onClick: onAdd,
        disabled: panes.length >= 5,
        className: 'px-3 py-1.5 text-xs text-(--ui-text-tertiary) hover:text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) disabled:opacity-30',
        children: '+ 新建'
      })
    ]
  })
}
```

**Step 2: 改造 register 逻辑**

```javascript
export default {
  id: 'ai-analysis-panes',
  name: 'AI Analysis Panes',
  register(ctx) {
    // 主容器 — 包含标签栏 + 活跃窗格
    function AnalysisContainer() {
      const {
        panes, activePane, activePaneId,
        setActivePaneId, addPane, removePane, updatePane
      } = useAnalysisPanes(ctx)

      if (!activePane) return null

      return jsxs('div', {
        className: 'flex h-full flex-col',
        children: [
          jsx(PaneTabs, {
            panes, activePaneId,
            onSelect: setActivePaneId,
            onAdd: addPane,
            onRemove: removePane
          }),
          jsx(AnalysisPane, {
            key: activePane.id,
            pane: activePane,
            updatePane,
            ctx
          })
        ]
      })
    }

    ctx.register({
      id: 'ai-analysis-container',
      area: 'panes',
      title: 'AI Analysis',
      data: {
        placement: 'right',
        width: '420px',
        dock: { pane: 'workspace', pos: 'right' }
      },
      render: () => jsx(AnalysisContainer, {})
    })
  }
}
```

---

## Task 6: 解决 API Key 获取问题

**Objective:** 让插件能安全获取 DeepSeek API key。

**Files:**
- Modify: `~/.hermes/desktop-plugins/ai-analysis-panes/plugin.js`

**方案分析：**

由于桌面插件运行在前端沙箱中，无法直接读取 `.env` 文件。有两种方案：

**方案 A（推荐）: 通过 Hermes config gateway RPC 获取**

```javascript
async function getApiKey() {
  try {
    const config = await host.request('config.get', {})
    // 尝试从各种可能的 key 位置获取
    const keyPath = config?.['model.deepseek.api_key']
      || config?.model?.api_key
    return keyPath
  } catch {
    return null
  }
}
```

**方案 B: 在插件首次加载时要求用户输入**

如果方案 A 不可用（gateway RPC 不会暴露 secrets），则回退到在窗格中显示一个 key 输入框，并存入 `ctx.storage`。

```javascript
function ApiKeySetup({ onReady }) {
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    ctx.storage.set('deepseek_key', key.trim())
    setSaved(true)
    onReady()
  }

  if (saved) return null

  return jsxs('div', {
    className: 'flex h-full flex-col items-center justify-center gap-3 p-6 text-sm',
    children: [
      jsx('div', { className: 'font-medium', children: '配置 DeepSeek API Key' }),
      jsx('input', {
        type: 'password',
        value: key,
        placeholder: 'sk-...',
        onChange: (e) => setKey(e.target.value),
        className: 'w-full rounded border border-(--ui-stroke-secondary) bg-(--chrome-input-bg) px-3 py-2 text-sm'
      }),
      jsx('button', {
        onClick: handleSave,
        disabled: !key.trim(),
        className: 'rounded bg-(--ui-accent) px-4 py-2 text-sm text-white disabled:opacity-50',
        children: '保存'
      })
    ]
  })
}
```

**Step 1: 在 AnalysisContainer 中集成**

```javascript
function AnalysisContainer() {
  const [apiKey, setApiKey] = useState(() => ctx.storage.get('deepseek_key') || null)
  // ... rest

  if (!apiKey) {
    return jsx(ApiKeySetup, { ctx, onReady: () => setApiKey(ctx.storage.get('deepseek_key')) })
  }

  // 将 apiKey 传给 AnalysisPane
  // ...
}
```

**优先尝试方案 A，失败则使用方案 B。**

---

## Task 7: 添加系统提示词编辑功能

**Objective:** 每个窗格可以自定义系统提示词，编辑后影响后续对话。

**Files:**
- Modify: `~/.hermes/desktop-plugins/ai-analysis-panes/plugin.js`

**Step 1: 添加系统提示词编辑按钮**

在分析窗格顶部工具栏扩展：

```javascript
function SystemPromptEditor({ prompt, onSave }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(prompt)

  if (!editing) {
    return jsx('button', {
      onClick: () => { setEditing(true); setText(prompt) },
      className: 'rounded px-2 py-0.5 text-xs text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover)',
      children: '⚙ 系统提示词'
    })
  }

  return jsxs('div', {
    className: 'p-2 border-b border-(--ui-stroke-secondary)',
    children: [
      jsx('textarea', {
        value: text,
        onChange: (e) => setText(e.target.value),
        rows: 3,
        className: 'w-full resize-none rounded border border-(--ui-stroke-secondary) bg-(--chrome-input-bg) px-2 py-1 text-xs'
      }),
      jsxs('div', {
        className: 'mt-1 flex gap-2',
        children: [
          jsx('button', {
            onClick: () => { onSave(text); setEditing(false) },
            className: 'rounded bg-(--ui-accent) px-2 py-0.5 text-xs text-white',
            children: '保存'
          }),
          jsx('button', {
            onClick: () => setEditing(false),
            className: 'rounded px-2 py-0.5 text-xs text-(--ui-text-tertiary)',
            children: '取消'
          })
        ]
      })
    ]
  })
}
```

---

## Task 8: 添加上下文传递功能（从主对话复制文本）

**Objective:** 允许用户从主对话中选中文本，右键或通过命令面板发送到指定分析窗格进行分析。

**Files:**
- Modify: `~/.hermes/desktop-plugins/ai-analysis-panes/plugin.js`

**Step 1: 注册命令面板指令**

```javascript
ctx.register({
  id: 'analyze-selection',
  area: 'palette',  // PALETTE_AREA
  data: {
    label: 'AI Analysis: 发送选中文本到分析窗格',
    codicon: 'send'
  },
  handler: async () => {
    // 获取当前选中文本 (通过 host 的 clipboard/selection API)
    // 这里需要 Hermes SDK 支持 — 如果没有原生 API，
    // 可以用 clipboard read + 弹窗确认的方式
    const selection = await host.getSelection?.()  // 如果 SDK 支持
    if (selection) {
      // 发送到活跃的分析窗格
      // 需要访问 AnalysisContainer 的状态 — 通过全局事件/回调
    }
  }
})
```

**Step 2: 简化方案 — 分析窗格内部粘贴**

由于桌面插件 SDK 可能暂不支持获取主窗口选中文本，采用简化方案：
- 用户从主对话复制文本 (`Ctrl+C`)
- 在分析窗格输入框中粘贴 (`Ctrl+V`)
- 或添加 "粘贴并分析" 按钮

```javascript
function PasteAndAnalyze({ onPaste }) {
  const handleClick = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) onPaste(text)
    } catch {
      host.notify({ kind: 'warning', message: '无法读取剪贴板，请手动粘贴' })
    }
  }

  return jsx('button', {
    onClick: handleClick,
    className: 'rounded px-2 py-0.5 text-xs text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover)',
    children: '📋 粘贴剪贴板并分析'
  })
}
```

---

## Task 9: 添加状态栏指示器

**Objective:** 在状态栏显示分析窗格数量和工作状态。

**Files:**
- Modify: `~/.hermes/desktop-plugins/ai-analysis-panes/plugin.js`

**Step 1: 状态栏芯片**

```javascript
function AnalysisStatusChip() {
  const [panes, setPanes] = useState([])

  useEffect(() => {
    // 轮询或监听窗格状态变化
    // 简化：通过 storage 事件
    const interval = setInterval(() => {
      const saved = ctx.storage.get('panes')
      if (saved) setPanes(saved)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  const loadingCount = panes.filter(p => p.isLoading).length

  return jsx(Tip, {
    label: `${panes.length} 个分析窗格${loadingCount > 0 ? `，${loadingCount} 个工作` : ''}`,
    children: jsx('button', {
      className: cn(
        'inline-flex h-full items-center gap-1 px-1.5 text-[0.6875rem] transition-colors',
        'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover)',
        loadingCount > 0 && 'text-(--ui-accent)'
      ),
      type: 'button',
      onClick: () => host.navigate('/ai-analysis'),
      children: loadingCount > 0
        ? `🔍 ${loadingCount}`
        : `🔍 ${panes.length}`
    })
  })
}

// 在 register 中：
ctx.register({
  id: 'analysis-status',
  area: 'statusBar.right',
  order: 120,
  render: () => jsx(AnalysisStatusChip, {})
})
```

---

## Task 10: 最终集成测试 & 完善

**Objective:** 完整测试所有功能，修复边缘情况。

**Files:**
- Modify: `~/.hermes/desktop-plugins/ai-analysis-panes/plugin.js`

**验证清单:**
- [ ] 插件加载无错误 toast
- [ ] AI Analysis 窗格出现在主对话右侧
- [ ] 可创建多个分析窗格（最多 5 个）
- [ ] 窗格标签栏可切换
- [ ] 可关闭非活跃窗格
- [ ] 首次使用提示输入 API Key
- [ ] 输入问题后可流式获取 AI 回复
- [ ] 停止按钮可中断正在生成的回复
- [ ] 系统提示词可编辑，编辑后影响后续对话
- [ ] 消息历史跨窗格独立
- [ ] 关闭窗格后重新打开，消息历史恢复
- [ ] 状态栏显示窗格数量
- [ ] 粘贴剪贴板按钮可工作
- [ ] `Ctrl+K` 命令面板可找到 "AI Analysis" 指令
- [ ] 窗格可被用户拖拽到其他位置

---

## 文件清单

| 文件 | 操作 | 用途 |
|------|------|------|
| `~/.hermes/desktop-plugins/ai-analysis-panes/plugin.js` | Create | 插件主文件，约 400 行 |

---

## 风险 & 未决问题

1. **API Key 获取** — 如果 `host.request('config.get')` 不暴露 secrets，需要方案 B（用户手动输入）。这是最大风险点，实施时需优先验证。
2. **CORS** — DeepSeek API 需要支持来自 Electron 的跨域请求。如果被 CORS 阻止，可能需要通过 gateway 代理转发。
3. **流式解析健壮性** — `fetch` + `ReadableStream` 在 Electron 中一般可用，但需要处理网络异常、超时、API 限流（429）等情况。
4. **性能** — 多个窗格同时流式生成时，需确保 UI 不卡顿。每个窗格独立渲染，React 的 fiber 架构应该能处理。
5. **SDK 能力边界** — `host.getSelection()` 等 API 可能不存在，需在实施时确认 SDK 版本并回退到剪贴板方案。

---

## 开发顺序

```
Task 1 (骨架)       → 验证加载
Task 2 (状态管理)   → 多窗格基础
Task 6 (API Key)    → 先解决关键依赖 ⚠️
Task 3 (API 调用)    → 流式调用验证
Task 4 (聊天 UI)    → 核心交互完成
Task 5 (标签栏)     → 多窗格切换
Task 7 (提示词编辑) → 锦上添花
Task 8 (上下文传递) → 主对话互通
Task 9 (状态栏)     → 视觉指示器
Task 10 (集成测试)  → 完善收尾
```
