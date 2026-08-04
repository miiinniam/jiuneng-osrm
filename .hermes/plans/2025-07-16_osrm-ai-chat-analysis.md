# OSRM++ AI 对话助手 — 功能定位与架构分析

> 背景：OSRM++ 是一个越南运输费用预测系统（FastAPI + Next.js + OSRM + Leaflet）。
> 已有 AI 集成（单轮 batch 分析），现需要新增**多轮对话式 AI 助手**，
> 让用户通过自然语言查询运费、分析路线、选择车型。

---

## 一、现有能力盘点

### 1.1 已有 AI 基础设施

| 文件 | 当前能力 | 不足 |
|------|---------|------|
| `ai_client.py` | DeepSeek API 封装，同步+异步，JSON mode | **无流式输出**（`stream: false`） |
| `ai_prompts.py` | 4 组系统提示词（偏差/路线/提取/优化） | 无对话助手提示词 |
| `ai_analyzers.py` | 5 个 batch 分析函数 | 全是单轮 JSON 输出，无对话 |
| `ai/api.py` | 4 个 REST 端点 | 无流式聊天端点 |
| `config.py` | `deepseek-chat` 模型，`temperature=0` | temperature=0 不适合对话 |

### 1.2 已有业务能力（AI 可以调用的）

| 能力 | API/函数 | 输入 | 输出 |
|------|---------|------|------|
| 运费计算 | `cost_engine.compute()` | 起终点坐标+货物+车辆参数 | 完整费用明细 |
| 路线计算 | `osrm_client.get_route()` | 坐标 | 距离、时间、几何 |
| 地理编码 | `/api/v1/geocode/search` | 地址文本 | 经纬度 |
| 车型查询 | `vehicle_registry` | model_id / category | 车型参数列表 |
| 货物费率 | `presets.CARGO_TYPE_RATES` | cargo_type | 费率系数 |
| 批量计算 | `/api/v1/batch` | rows[] | results[] |

### 1.3 前端布局

```
┌─────────────────────────────────────────────────┐
│  Header (NavBar + Language + Template)           │
├─────────────────────────────────────────────────┤
│                                                  │
│              🗺️ Leaflet 地图                      │
│                                                  │
│  ┌──────────────┐                                │
│  │ FloatingPanel │ ← 报价表单 (QuoteForm)          │
│  │              │                                 │
│  └──────────────┘                                │
│  ┌──────────────┐                                │
│  │ ResultsPanel │ ← 费用明细 + 路线信息             │
│  └──────────────┘                                │
└─────────────────────────────────────────────────┘
```

**插入位置**：AI 对话助手作为右下角浮动聊天窗口（类似 Intercom/Crisp 客服窗口），可展开/折叠。

---

## 二、AI 对话助手应该做什么

### 2.1 核心定位：物流报价 Copilot

不是通用聊天，而是**嵌入了 OSRM++ 业务能力的对话式助手**：

```
用户: "从友谊关到河内，17米5平板车，拉25吨钢管，运费多少？"
     ↓
AI 理解意图 → 提取参数 → 调用计算引擎 → 格式化结果 → 返回报价
     ↓
助手: "根据计算：
       • 距离：168 km（约 3.5 小时）
       • 运费明细：
         - 距离费：3,528,000 VNĐ（168km × 21,000đ/km）
         - 时间费：630,000 VNĐ
         - 燃油费：798,000 VNĐ
         - 装卸费：1,250,000 VNĐ
         - 其他：1,200,000 VNĐ
         ───────────────────────
         💰 总计：7,406,000 VNĐ
       
       如需正式报价单，可以点击下方「生成报价单」按钮。"
```

### 2.2 能做什么（7 大场景）

| # | 场景 | 示例对话 | AI 需要调用的能力 |
|---|------|---------|-----------------|
| 1 | **查运费** | "从友谊关到北宁，13米平板车，20吨普通货，多少钱？" | 地理编码 → 路线计算 → 费用引擎 |
| 2 | **比车型** | "17.5米和13米平板车，哪个拉货更划算？" | 车型查询 → 多次费用引擎 |
| 3 | **分析路线** | "去海防走哪条路？要不要走高速？路况怎么样？" | 路线计算 → 路线特征识别 |
| 4 | **拼车优化** | "5吨货从河内到海防，拼车还是整车？" | 费用引擎（两种模式对比） |
| 5 | **油价影响** | "油价涨了2000盾，我这趟运费会涨多少？" | 费用引擎（参数灵敏度） |
| 6 | **解释构成** | "距离费是怎么算出来的？" | 公式解释 + 参数展示 |
| 7 | **批量估算** | "以下是5个目的地的报价，帮我看看哪个最贵" | 批量费用引擎 |

### 2.3 不能做什么（明确边界）

- ❌ 不修改数据库 / 车型库 / 公式
- ❌ 不执行服务器命令
- ❌ 不发送邮件 / 生成正式报价单（这些由主界面按钮完成）
- ⚠️ 不虚构不存在的数据 —— 如果用户给的信息不全，**主动追问**而不是猜

---

## 三、架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (Next.js)                                      │
│                                                          │
│  ┌──────────────┐    ┌──────────────────────────────┐   │
│  │ 主界面 (地图   │    │ AI 助手面板 (ChatPanel)       │   │
│  │ + 表单 + 结果)│    │                              │   │
│  │              │    │ ┌────────────────────────┐   │   │
│  │              │    │ │ 消息列表 (MessageList)  │   │   │
│  │              │    │ │                        │   │   │
│  │              │    │ │ 用户: "从友谊关到..."    │   │   │
│  │              │    │ │ AI: "费用明细..."        │   │   │
│  │              │    │ │                        │   │   │
│  │              │    │ └────────────────────────┘   │   │
│  │              │    │ ┌────────────────────────┐   │   │
│  │              │    │ │ 输入框 + 快捷按钮        │   │   │
│  │              │    │ └────────────────────────┘   │   │
│  │              │    └──────────────────────────────┘   │
│  └──────────────┘                                       │
│         │                          │                    │
│         │ HTTP/JSON                │ SSE (Server-Sent   │
│         │                          │ Events) 流式       │
└─────────┼──────────────────────────┼────────────────────┘
          │                          │
┌─────────▼──────────────────────────▼────────────────────┐
│  Backend (FastAPI)                                       │
│                                                          │
│  ┌──────────────────────┐  ┌─────────────────────────┐  │
│  │ 现有 API              │  │ 新增: /ai/chat (流式)    │  │
│  │ /route, /cost, /batch│  │                         │  │
│  └──────────────────────┘  │ POST {messages, stream}  │  │
│                            │ → SSE 逐 token 返回      │  │
│                            │                          │  │
│                            │ 内部:                     │  │
│                            │ 1. 构建系统提示词          │  │
│                            │ 2. 注入工具定义            │  │
│                            │ 3. DeepSeek 流式调用       │  │
│                            │ 4. 拦截 tool_calls        │  │
│                            │ 5. 执行 cost_engine 等    │  │
│                            │ 6. 返回 tool_result       │  │
│                            │ 7. 继续流式生成最终回复    │  │
│                            └─────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 3.2 关键技术：Function Calling（工具调用）

**这是实现"AI 真正会算运费"的核心机制**。而不是让 AI "猜"运费。

```
用户消息 → AI 判断需要调用工具 → DeepSeek 返回 tool_call → 
后端拦截 → 执行 cost_engine.compute() → 把结果喂回 AI → 
AI 基于真实结果生成自然语言回复 → 流式返回前端
```

DeepSeek API 支持 OpenAI 兼容的 function calling 格式：

```python
# DeepSeek 请求中的 tools 定义
tools = [
    {
        "type": "function",
        "function": {
            "name": "calculate_freight_cost",
            "description": "计算越南境内公路运输费用。需要起点和终点的地址或坐标。",
            "parameters": {
                "type": "object",
                "properties": {
                    "origin": {
                        "type": "string",
                        "description": "起点地址，如 '友谊关(Huu Nghi), Lạng Sơn' 或经纬度 '21.98,106.71'"
                    },
                    "destination": {
                        "type": "string",
                        "description": "终点地址，如 'Hà Nội, Hoàn Kiếm'"
                    },
                    "cargo_weight_kg": {
                        "type": "number",
                        "description": "货物重量（公斤）"
                    },
                    "cargo_type": {
                        "type": "string",
                        "enum": ["normal", "heavy", "fragile", "dangerous", "cold_chain", "liquid"],
                        "description": "货物类型"
                    },
                    "vehicle_model_id": {
                        "type": "string",
                        "description": "车型ID，如 flatbed_13m, flatbed_17m5。如果不指定则自动匹配最佳车型。"
                    },
                    "loading_mode": {
                        "type": "string",
                        "enum": ["full_truck", "consolidated"],
                        "description": "整车或拼货"
                    },
                    "empty_return": {
                        "type": "boolean",
                        "description": "是否空返，默认 false"
                    }
                },
                "required": ["origin", "destination", "cargo_weight_kg"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "query_vehicle_models",
            "description": "查询可用的车型列表及其参数（载重、尺寸、费率等）",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": ["small_box", "flatbed", "high_side", "container", "cold_chain"],
                        "description": "车型大类，不指定则返回全部"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "compare_routes",
            "description": "对比两条不同路线或两种方案的费用差异",
            "parameters": {
                "type": "object",
                "properties": {
                    "scenarios": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "label": {"type": "string", "description": "方案标签"},
                                "origin": {"type": "string"},
                                "destination": {"type": "string"},
                                "cargo_weight_kg": {"type": "number"},
                                "cargo_type": {"type": "string"},
                                "vehicle_model_id": {"type": "string"},
                                "loading_mode": {"type": "string"}
                            },
                            "required": ["label", "origin", "destination", "cargo_weight_kg"]
                        },
                        "description": "要对比的方案列表"
                    }
                },
                "required": ["scenarios"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "geocode_address",
            "description": "将地址文本转换为经纬度坐标。越南地址请用越南语。",
            "parameters": {
                "type": "object",
                "properties": {
                    "address": {
                        "type": "string",
                        "description": "要查询的地址"
                    }
                },
                "required": ["address"]
            }
        }
    }
]
```

### 3.3 数据流（一次典型查询）

```
1. 用户在前端输入: "从友谊关到海防，13米平板车，25吨钢管，运费？"
2. 前端 POST /api/v1/ai/chat  {messages: [{role: "user", content: "..."}]}
3. 后端构建完整请求 → DeepSeek API (stream=true, tools=...)
4. DeepSeek 返回 function_call: calculate_freight_cost({origin: "友谊关", ...})
5. 后端拦截 tool_call:
   a. geocode_address("友谊关") → {lat: 21.98, lng: 106.71}
   b. geocode_address("Hải Phòng") → {lat: 20.86, lng: 106.68}
   c. cost_engine.compute(origin, dest, cargo, vehicle, ...) → QuoteResponse
6. 把 tool_result (JSON格式的计算结果) 追加到 messages
7. DeepSeek 基于 tool_result 生成自然语言回复
8. 流式返回前端 {type: "text", content: "根据计算..."}
```

### 3.4 SSE 流式协议设计

```
event: tool_start
data: {"name": "calculate_freight_cost", "params": {"origin": "友谊关", ...}}

event: tool_done
data: {"name": "calculate_freight_cost", "result": {...}}

event: text
data: {"content": "根据"}

event: text
data: {"content": "计算"}

event: text
data: {"content": "，从..."}

event: done
data: {"session_id": "xxx", "usage": {"prompt_tokens": 800, "completion_tokens": 350}}
```

### 3.5 需要改造/新增的文件

```
新增文件:
  backend/app/services/ai_chat.py        ← 对话引擎（tool calling + 流式编排）
  backend/app/services/ai_tools.py       ← 工具定义 + 执行器
  backend/app/services/ai_chat_prompt.py ← 对话助手系统提示词
  frontend/src/components/AIChatPanel.tsx    ← AI 聊天面板 UI
  frontend/src/components/ChatMessage.tsx    ← 消息气泡组件
  frontend/src/hooks/useAIChat.ts        ← SSE 流式接收 hook

修改文件:
  backend/app/services/ai_client.py      ← 新增 stream_chat() 方法
  backend/app/api/ai.py                  ← 新增 POST /ai/chat 端点
  backend/app/config.py                  ← 新增 chat 用 temperature
  backend/app/schemas.py                 ← 新增聊天相关 schema
  frontend/src/app/page.tsx              ← 集成 AIChatPanel
  frontend/src/lib/types.ts              ← 新增聊天类型
```

---

## 四、系统提示词设计

### 4.1 核心提示词

```python
OSRM_AI_CHAT_SYSTEM = """你是 OSRM++ 物流报价助手，专门帮助用户计算越南境内公路运输费用。

## 你的身份
- 你是玖能国际（JIUNENG International）的 AI 物流顾问
- 你精通越南公路运输市场，了解各车型、路线、费率
- 你运行在 OSRM++ 系统中，背后有真实的路线计算和费用引擎

## 你的能力
你**必须使用工具（function calling）**来计算运费，绝不能凭空编造数字：
- `calculate_freight_cost` — 计算运费（你的核心工具）
- `query_vehicle_models` — 查询可用车型
- `compare_routes` — 对比多个方案
- `geocode_address` — 地址转坐标

## 核心原则
1. **先算后说** — 任何运费数字必须来自工具调用结果，绝不凭空报价
2. **参数不全要追问** — 如果用户没提供：货物重量、目的地、车型，主动追问
3. **简洁但完整** — 报费用时列出关键明细，不要只给总数
4. **用越南语/中文回复** — 中文用户用中文，越南用户用越南语
5. **推荐最佳方案** — 如果用户没指定车型，计算后推荐最经济的

## 费用展示格式
报价时按以下格式输出：
```
📦 运输方案
━━━━━━━━━━━━━━━━━━
🚛 路线: 友谊关 → 河内（168km / 3.5h）
📐 车型: 13m 平板车（载重 30 吨）
⚖️ 货物: 25 吨 钢管（整车）
━━━━━━━━━━━━━━━━━━
💰 费用明细
  距离费: 3,528,000 VNĐ (168km × 21,000đ/km)
  时间费:   630,000 VNĐ
  燃油费:   798,000 VNĐ
  ...
━━━━━━━━━━━━━━━━━━
💵 总价: 7,406,000 VNĐ
💡 建议: 如果拼货可以省约15%，但需要等拼车时间
```

## 边界
- 不确定的事明确说"不确定"
- 如果计算引擎返回错误，如实告知用户
- 不要建议修改公式参数（那是开发者的事）
- 不要泄露车型库的内部费率给用户（只报总价和分项）
"""
```

### 4.2 快捷入口提示词（建议给用户展示）

在聊天窗口底部展示 4 个快捷按钮：

```
[📦 快速报价]  [🚛 车型对比]  [🗺 路线分析]  [💡 拼车建议]
```

点击后自动填入提示文本，不需要用户手动打字。

---

## 五、前端 UI 设计

### 5.1 布局

```
┌──────────────────────────────────────────────────────────┐
│  Header                                                   │
├───────────────────────────────────┬──────────────────────┤
│                                   │  💬 AI 助手          │
│          🗺️ 地图                   │  ┌────────────────┐ │
│                                   │  │ 消息列表        │ │
│                                   │  │                │ │
│  ┌─────────────────┐             │  │ 用户: ...       │ │
│  │ 报价表单         │             │  │ AI: ...         │ │
│  └─────────────────┘             │  │                │ │
│  ┌─────────────────┐             │  ├────────────────┤ │
│  │ 费用结果         │             │  │ [快捷按钮行]    │ │
│  └─────────────────┘             │  │ [输入框]        │ │
│                                   │  └────────────────┘ │
└───────────────────────────────────┴──────────────────────┘
```

### 5.2 交互细节

- **右下角浮动按钮** 触发打开/关闭聊天面板
- **面板宽度**: 380px（桌面端）/ 全屏（移动端 bottom drawer）
- **消息气泡**: 用户右侧蓝底，AI 左侧白底，支持 Markdown
- **工具调用状态**: 显示 "🔍 正在查询路线..." / "💰 正在计算费用..."
- **费用卡片**: 在聊天中嵌入格式化的费用卡片（非纯文本）
- **操作按钮**: AI 回复底部有「填充到表单」「生成报价单」按钮
- **流式输入**: 逐字显示，跟 ChatGPT 一样

### 5.3 与主界面联动

| 触发方式 | 效果 |
|---------|------|
| 点击 "填充到表单" | 把聊天中的参数自动填入主界面 QuoteForm |
| 主界面计算出结果后 | "发送到 AI 分析" 按钮，把 QuoteResponse 发过去分析 |
| 地图上选点 | 自动带入坐标到聊天输入（"从 [选点] 到..."） |

---

## 六、与原计划的差异

| 方面 | 之前的理解（Hermes 插件） | 正确的需求（OSRM++ 内嵌） |
|------|-------------------------|------------------------|
| 运行环境 | Hermes 桌面 Electron 插件 | OSRM++ Next.js 前端内 |
| AI 模型 | 通过插件 SDK 直接调 DeepSeek | 通过 OSRM++ 后端代理 |
| 核心能力 | 通用文本分析 | **运费计算 + 路线分析 + 车型推荐** |
| 关键机制 | 纯对话 | **Function Calling** 驱动真实计算 |
| API 协议 | 前端直接 fetch | 后端 SSE 流式 |
| 系统提示词 | 通用分析模板 | 物流领域专用 + 工具绑定 |

---

## 七、开发阶段建议

### Phase 1: 核心对话（MVP — 2-3天）
1. `ai_client.py` 增加 `stream_chat()` 流式方法
2. `ai_tools.py` 实现 `calculate_freight_cost` + `query_vehicle_models`
3. `ai_chat.py` 实现 tool calling 编排引擎
4. `POST /ai/chat` SSE 端点
5. 前端 AIChatPanel 基础 UI + SSE 接收
6. 验证：输入 "从友谊关到河内，13米平板，25吨，运费？" → 返回真实计算结果

### Phase 2: 体验完善（1-2天）
7. 快捷按钮 + 费用卡片组件
8. "填充到表单" 联动
9. 消息历史持久化（localStorage）
10. 错误处理 + 重试逻辑

### Phase 3: 高级功能（按需）
11. `compare_routes` 多方案对比
12. 图片识别（OCR 报价单 → 自动填入）
13. 语音输入（移动端）
