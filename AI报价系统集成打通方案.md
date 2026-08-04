# AI 与报价系统集成打通方案

> 设计建议 + 数据流方案，不含代码实现
> 
> 日期: 2026-07-18

---

## 一、现状架构总览

### 1.1 现有数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                       │
│                                                                 │
│  ┌──────────────────┐          ┌──────────────────────────────┐ │
│  │   FloatingPanel   │          │        ResultsPanel          │ │
│  │  ┌──────────────┐ │          │  (总价 Hero / 费用明细 /     │ │
│  │  │  QuoteForm   │─┼──POST───▶│   车型卡片 / 口岸费用)       │ │
│  │  │  (手动报价)   │ │ /quote   │                              │ │
│  │  └──────────────┘ │          │  数据源: QuoteResponse        │ │
│  │  ┌──────────────┐ │          └──────────────────────────────┘ │
│  │  │ AIChatPanel  │ │                                          │
│  │  │  (AI 对话)   │─┼──SSE──▶  useAIChat.ts                   │
│  │  └──────────────┘ │          ├─ tool_start → tool_status msg │
│  └──────────────────┘          ├─ tool_done  → 仅提取 _origin/  │
│                                │               _destination     │
│                                └─ text → assistant bubble       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         Backend (FastAPI)                        │
│                                                                 │
│  POST /ai/chat ──▶ ai_chat.py ──▶ execute_tool()                │
│  (SSE stream)        (编排引擎)     ├─ calculate_freight_cost    │
│                                    │   返回: total_cost_vnd,     │
│                                    │   breakdown{12项},          │
│                                    │   vehicle, distance, etc.   │
│                                    ├─ query_vehicle_models       │
│                                    ├─ compare_routes             │
│                                    ├─ calculate_border_fees      │
│                                    └─ geocode_address            │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 SSE 事件协议（当前）

| 事件 | data 结构 | 前端处理 |
|------|----------|---------|
| `tool_start` | `{name, params}` | 插入 tool_status 消息 |
| `tool_done` | `{name, result}` | 标记完成 + 提取 `_origin/_destination` |
| `text` | `{content}` | 追加到 assistant 气泡 |
| `error` | `{message}` | 显示错误 |
| `done` | `{usage}` | （未处理） |

### 1.3 工具返回数据结构对比

**calculate_freight_cost 返回 (ai_tools.py `_format_cost_result`)**:
```json
{
  "vehicle": "13m 平板车",
  "vehicle_model_id": "flatbed_13m",
  "distance_km": 156.3,
  "duration_h": 4.2,
  "cargo_weight_ton": 25,
  "capacity_ratio": 0.83,
  "vehicle_count": 1,
  "breakdown": {
    "distance_cost_vnd": "1,250,000",    // ← 字符串格式
    "time_cost_vnd": "800,000",
    "fuel_cost_vnd": "2,100,000",
    ...
  },
  "total_cost_vnd": "15,800,000",        // ← 字符串格式
  "cost_per_km_vnd": "101,000",
  "_origin": {"lng": 106.71, "lat": 21.98},   // ← 仅供地图
  "_destination": {"lng": 105.85, "lat": 21.03}
}
```

**QuoteResponse (Typescript types.ts)**:
```ts
{
  route: { distance_km: number, duration_h: number, geometry },
  timing: { speed_factor, adjusted_duration_h, ... },
  breakdown: {
    cost_distance: number,        // ← 数字格式
    cost_time: number,
    cost_fuel: number,
    ...
    cost_total: number,
    matched_vehicle_model_id: string,
    matched_vehicle_model_name: string,
    vehicle_count: number,
    ...
  },
  suggestions: Suggestion[],
  vehicle_count: number
}
```

**关键差异**:
- AI 工具返回的 breakdown 值是**格式化字符串**（如 `"1,250,000"`），QuoteResponse 是 **number**
- AI 工具返回没有 `route.geometry`（路线几何数据）
- AI 工具返回没有 `suggestions` 数组
- AI 工具返回没有 `timing` 对象（仅有原始 duration_h）
- 字段命名不完全一致

---

## 二、五大差距详细分析

### 差距 1: AI 计算结果 → ResultsPanel 不同步

**现象**: 用户在 AI 聊天中让 AI 计算运费，AI 调用了 `calculate_freight_cost` 返回完整报价，但右侧 ResultsPanel 完全不显示。

**根因**:
- `useAIChat.ts` 在 `tool_done` 处理中，只从 result 提取了 `_origin` / `_destination` 用于地图展示（L153-160）
- 没有将完整计算结果传递到上层组件或映射为 `QuoteResponse` 结构
- `page.tsx` 的 `handleChatRoute` 回调仅处理路线几何，ResultPanel 的 `result` prop 只来自手动提交

**影响**: 用户需要手动在 QuoteForm 中重新输入参数并点击计算，AI 算出的结果无法直接进入报价面板。

---

### 差距 2: AI 推荐车型 → QuoteForm 未反馈

**现象**: AI 通过 `query_vehicle_models` 查询并推荐车型（如 "建议使用 13m 平板车，载重 30 吨"），但 QuoteForm 的车型选择器不会自动更新。

**根因**:
- `ChatMessage` 组件只渲染 tool_status 为文本标签（"✅ 完成"）
- 没有 "填入车型" 按钮或自动回填机制
- `AIChatPanel` 没有向外暴露 onVehicleRecommend 回调
- `FloatingPanel` 没有跨 Tab（chat → quote）通信机制

**影响**: 用户需要记住 AI 推荐的车型名，手动切换到报价 Tab 去选择。用户体验断裂。

---

### 差距 3: 聊天上下文缺少表单状态注入

**现象**: AI 聊天不知道用户当前在 QuoteForm 中填了什么参数。例如用户已经选择了起点 "友谊关" 和终点 "河内"，但在聊天中问 "从这里到河内要多少钱"，AI 不知道 "这里" 是什么。

**根因**:
- `POST /ai/chat` 的 `AIChatRequest` 只包含 `messages`（对话历史）
- 没有 `context` 字段携带当前表单状态
- 后端 `run_chat` 没有在 system prompt 中注入当前表单上下文

**影响**: AI 无法利用已有表单数据做增量计算，用户需要重复输入信息。

---

### 差距 4: 缺少一键操作按钮

**现象**: AI 计算完成后，聊天中显示 "✅ 运费计算完成"，但没有任何可点击的按钮来利用这个结果。

**可能的操作**:
- "📊 查看费用明细" — 展开结构化费用卡片
- "📋 用此方案报价" — 将 AI 结果同步到 ResultsPanel
- "🚛 填入车型" — 将推荐车型填入 QuoteForm
- "📍 设为路线" — 将起终点设为当前路线
- "📤 导出报价" — 生成报价单/复制

**根因**: `ChatMessage` 的 `ToolStatus` 组件只渲染文本，没有交互能力。

**影响**: 聊天结果只能"看"，不能"用"。

---

### 差距 5: AI 询价结果仅文字总结

**现象**: AI 最终生成一段 Markdown 文本总结费用（如表格），但没有可视化的费用明细组件。用户无法像在 ResultsPanel 中那样看到进度条式的费用构成、车型卡片、路线指标。

**根因**:
- `AssistantBubble` 只做纯 Markdown 渲染（表格、粗体、代码）
- 没有识别 `tool_done` 结果并渲染富交互组件的能力
- 费用明细卡片（CostBar、车型卡片）只在 ResultsPanel 中实现

**影响**: AI 聊天结果信息密度低，用户需要手动"翻译"AI 的文字总结才能做出决策。

---

## 三、打通方案设计

### 方案总览

核心思路：**在现有架构上增加 3 条数据通道 + 1 个交互协议**，最小侵入实现 AI 与报价系统的双向打通。

```
                    ┌──────────────┐
                    │  page.tsx    │  ← 新增: 统一状态协调层
                    │  (协调者)     │
                    └──┬───┬───┬──┘
         ┌─────────────┼───┼───┼──────────────┐
         │ 通道①       │   │   │ 通道②        │
         ▼             │   │   ▼               │
  ┌──────────┐         │   │  ┌──────────────┐ │
  │ Results  │◄────────┘   │  │  QuoteForm   │ │
  │ Panel    │              │  │  (手动报价)   │ │
  └──────────┘              │  └──────────────┘ │
                            │          ▲        │
                            │  通道③   │        │
  ┌──────────┐              │  ┌───────┴──────┐ │
  │AIChat    │──────────────┘  │  表单上下文   │ │
  │Panel     │─────────────────▶  注入聊天    │ │
  └──────────┘   通道③: 一键操作按钮         │ │
                                     └──────────────┘
```

---

### 通道①: AI 计算结果 → ResultsPanel

#### 3.1.1 数据流设计

```
AI Chat (tool_done)                    ResultsPanel
─────────────────                      ────────────
calculate_freight_cost 结果
        │
        ▼
  useAIChat 新增: onQuoteResult 回调
        │
        ▼
  page.tsx 新增: aiQuoteResult state
        │
        ▼
  映射为 QuoteResponse 兼容结构
        │
        ▼
  ResultsPanel 新增 prop: aiResult?
        │
        ▼
  渲染（复用现有 UI 组件）
```

#### 3.1.2 需要新增/修改的关键点

**A. useAIChat.ts 新增回调**

在 `useAIChat` hook 参数中新增回调：

| 回调 | 触发时机 | 数据类型 |
|------|---------|---------|
| `onRouteFound` | (已有) calculate_freight_cost tool_done | `{origin, destination}` |
| **🆕 `onQuoteResult`** | calculate_freight_cost tool_done | `AIToolQuoteResult`（见下文） |
| **🆕 `onVehicleRecommend`** | query_vehicle_models tool_done | `AIToolVehicleResult`（见下文） |
| **🆕 `onCompareResult`** | compare_routes tool_done | `AIToolCompareResult`（见下文） |

基础思路：`tool_done` 处理不再只提取坐标，而是根据 `data.name` 路由到不同的回调函数。

**B. 新增类型：AIToolQuoteResult**

在 `chatTypes.ts` 新增：

```ts
// AI 工具计算的运费结果（映射前）
export interface AIToolQuoteResult {
  vehicle: string;
  vehicle_model_id: string;
  distance_km: number;
  duration_h: number;
  cargo_weight_ton: number;
  capacity_ratio: number;
  vehicle_count: number;
  breakdown: {
    distance_cost_vnd: string;   // 字符串 → 需要 parse
    time_cost_vnd: string;
    fuel_cost_vnd: string;
    loading_cost_vnd: string;
    insurance_cost_vnd: string;
    toll_cost_vnd: string;
    misc_cost_vnd: string;
    body_surcharge_vnd: string;
    restricted_zone_surcharge_vnd: string;
    construction_zone_surcharge_vnd: string;
    mountain_road_surcharge_vnd: string;
    port_surcharge_vnd: string;
    fixed_surcharge_vnd: string;
  };
  total_cost_vnd: string;
  cost_per_km_vnd: string;
  cost_per_vehicle_vnd?: string;
  _origin?: { lng: number; lat: number };
  _destination?: { lng: number; lat: number };
}
```

**C. 数据映射函数：AIToolQuoteResult → QuoteResponse**

需要在 `useAIChat.ts` 或一个独立的 `lib/aiResultMapper.ts` 中实现转换：

```ts
function mapAIToolResultToQuoteResponse(ai: AIToolQuoteResult): QuoteResponse {
  return {
    route: {
      distance_km: ai.distance_km,
      duration_h: ai.duration_h,
      geometry: null,  // ⚠️ AI 工具不返回 geometry，需要另行获取
    },
    timing: {
      speed_factor: 1.0,
      adjusted_duration_h: ai.duration_h * 1.3,  // 估算
      rest_hours: 0,
      loading_hours: 2,
      total_duration_h: ai.duration_h * 1.3 + 2,
    },
    breakdown: {
      cost_distance: parseVnd(ai.breakdown.distance_cost_vnd),
      cost_time: parseVnd(ai.breakdown.time_cost_vnd),
      cost_fuel: parseVnd(ai.breakdown.fuel_cost_vnd),
      cost_loading: parseVnd(ai.breakdown.loading_cost_vnd),
      cost_insurance: parseVnd(ai.breakdown.insurance_cost_vnd),
      cost_toll: parseVnd(ai.breakdown.toll_cost_vnd),
      cost_misc: parseVnd(ai.breakdown.misc_cost_vnd),
      cost_body_surcharge: parseVnd(ai.breakdown.body_surcharge_vnd),
      cost_restricted_zone: parseVnd(ai.breakdown.restricted_zone_surcharge_vnd),
      cost_construction_zone: parseVnd(ai.breakdown.construction_zone_surcharge_vnd),
      cost_mountain_road: parseVnd(ai.breakdown.mountain_road_surcharge_vnd),
      cost_port: parseVnd(ai.breakdown.port_surcharge_vnd),
      cost_fixed: parseVnd(ai.breakdown.fixed_surcharge_vnd),
      cost_total: parseVnd(ai.total_cost_vnd),
      cost_per_km: parseVnd(ai.cost_per_km_vnd),
      cost_per_ton_km: null,
      capacity_ratio: ai.capacity_ratio,
      matched_vehicle_model_id: ai.vehicle_model_id,
      matched_vehicle_model_name: ai.vehicle,
      vehicle_count: ai.vehicle_count,
      cost_per_vehicle: ai.cost_per_vehicle_vnd 
        ? parseVnd(ai.cost_per_vehicle_vnd) 
        : null,
    },
    suggestions: [],  // AI 结果无 suggestions
    vehicle_count: ai.vehicle_count,
  };
}

// 辅助: 解析 VND 格式化字符串 "1,250,000" → 1250000
function parseVnd(s: string): number {
  return parseInt(s.replace(/,/g, ''), 10) || 0;
}
```

**⚠️ 注意事项**:
- **路线几何缺失**: AI 工具返回不包含 route geometry，ResultsPanel 不直接使用 geometry，但地图需要。可在 page.tsx 中 detect AI 结果后独立请求路线。
- **Timing 估算**: AI 工具不返回完整的 timing 分解（speed_factor, rest_hours 等），需要给默认值或调用 `/route` 接口补充。
- **建议: 后端增加结构化返回** — 最优方案是让后端 `_format_cost_result` 同时返回**数值字段**（而非仅字符串），避免前端 `parseVnd` 的脆弱性。

**D. page.tsx 状态管理**

```ts
// 新增 state
const [aiQuoteResult, setAIQuoteResult] = useState<QuoteResponse | null>(null);
const [aiAlternatives, setAIAlternatives] = useState<QuoteResponse[]>([]);

// ResultsPanel 显示优先级: 手动报价 > AI 报价
const currentResult = alternatives[selectedAltIndex] ?? result ?? aiAlternatives[0] ?? aiQuoteResult;
```

**E. 更优方案：后端改造**

建议后端在 `_format_cost_result` 中增加 numeric 字段（与字符串字段并存），减少前端解析开销：

```python
result = {
    # 现有字符串字段...
    # 🆕 新增数值字段（前端可直接使用）
    "breakdown_numeric": {
        "cost_distance": b.cost_distance,
        "cost_time": b.cost_time,
        ...
    },
    "total_cost_vnd_numeric": b.cost_total * vehicle_count,
    "cost_per_km_vnd_numeric": b.cost_per_km,
    # 🆕 新增 timing 估算
    "timing_estimate": {
        "adjusted_duration_h": round(duration_h * 1.3, 1),
        "rest_hours": 0,
        "loading_hours": 2.0,
        "total_duration_h": round(duration_h * 1.3 + 2, 1),
    },
}
```

---

### 通道②: AI 推荐车型 → QuoteForm 填入

#### 3.2.1 数据流设计

```
AI Chat (tool_done)                       QuoteForm
─────────────────                         ────────
query_vehicle_models 结果
        │
        ▼
  useAIChat: onVehicleRecommend 回调
        │
        ▼
  page.tsx: 接收推荐
        │
        ▼
  FloatingPanel: 
    ┌─ 切换到 Quote Tab (可选)
    └─ 调用 onChange({ vehicleModelId: ... })
        │
        ▼
  QuoteForm: 车型选择器自动更新
```

#### 3.2.2 需要新增/修改的关键点

**A. useAIChat.ts 新增回调类型**

```ts
export interface VehicleRecommendation {
  model_id: string;
  name: string;
  category: string;
  max_load_ton: number;
  reason?: string;  // AI 推荐理由
}

export function useAIChat(
  onRouteFound?: (coords: ChatRouteCoords) => void,
  onQuoteResult?: (result: AIToolQuoteResult) => void,      // 🆕
  onVehicleRecommend?: (vehicles: VehicleRecommendation[]) => void,  // 🆕
  onCompareResult?: (result: AIToolCompareResult) => void,   // 🆕
)
```

**B. ChatMessage 新增 "填入车型" 按钮**

在 `ToolStatus` 组件中，当 `toolName === "query_vehicle_models"` 且 `toolStatus === "done"` 时，渲染一个操作行：

```
🚛 查询车型 ✅ 完成
   [推荐: 13m平板车(30吨)] [📋 填入车型]

🚛 查询车型 ✅ 完成
   [推荐: 17.5m平板车(35吨)] [📋 填入车型]
   [推荐: 40尺集装箱(28吨)]  [📋 填入车型]
```

实现方式：
- ChatMessage 接收新 prop: `onAction?: (action: string, payload: unknown) => void`
- 每种 tool_done 消息根据 toolName 渲染不同的 action buttons
- 点击 "填入车型" → 触发 `onVehicleRecommend` 回调

**C. FloatingPanel 跨 Tab 通信**

当前 Tab 切换只是 CSS `hidden`，两个面板独立。需要：

```
FloatingPanel 新增:
  - onAIApplyVehicle(modelId: string)  → 切换 tab 到 "quote" + 更新 form
  - onAIApplyQuote(result)             → 切换 tab 到 "quote"（或保持） + 更新结果
```

**D. 自动切换 Tab 策略**

| 操作 | 是否自动切换 Tab | 理由 |
|------|:---:|------|
| 填入车型 | ✅ 是 | 用户需要确认并继续填写 |
| 用此方案报价 | ❌ 否 | 结果在 ResultsPanel，不影响左侧面板 |
| 查看费用明细 | ❌ 否 | 在聊天内展开即可 |

---

### 通道③: 表单上下文注入聊天

#### 3.3.1 数据流设计

```
QuoteForm 当前状态           POST /ai/chat
────────────────             ─────────────
form.originLat/Lng    ──┐
form.destLat/Lng      ──┤
form.weightKg         ──┼──▶  AIChatRequest 新增 context 字段
form.cargoType        ──┤     {
form.vehicleModelId   ──┤       messages: [...],
form.loadingMode      ──┤       context: {        // 🆕
form.quoteMode        ──┘         origin: "友谊关, Lạng Sơn",
                                  destination: "Hà Nội",
                                  cargo_weight_ton: 25,
                                  cargo_type: "normal",
                                  vehicle_model_id: "flatbed_13m",
                                  loading_mode: "full_truck",
                                }
                              }
```

#### 3.3.2 需要新增/修改的关键点

**A. 后端 AIChatRequest 扩展**

```python
# schemas.py 新增
class AIChatContext(BaseModel):
    """前端表单上下文，注入到 AI 对话中"""
    origin_address: str | None = None       # 起点地址（反查后的可读名）
    origin_lat: float | None = None
    origin_lng: float | None = None
    destination_address: str | None = None  # 终点地址
    dest_lat: float | None = None
    dest_lng: float | None = None
    cargo_weight_ton: float | None = None
    cargo_type: str | None = None
    vehicle_model_id: str | None = None
    vehicle_model_name: str | None = None   # 车型可读名（前端查表注入）
    loading_mode: str | None = None         # "full_truck" | "consolidated"

class AIChatRequest(BaseModel):
    messages: list[AIChatMessage]
    temperature: float | None = None
    max_tokens: int | None = None
    context: AIChatContext | None = None  # 🆕
```

**B. 后端 System Prompt 注入上下文**

在 `ai_chat_prompt.py` 或 `ai_chat.py` 中，将 context 注入到 system message 尾部：

```
# 原有 OSRM_CHAT_SYSTEM 内容...
#
# 🆕 当前表单状态（用户已填写的参数）:
# - 起点: 友谊关, Lạng Sơn (21.98, 106.71)
# - 终点: Hà Nội, Hoàn Kiếm (21.03, 105.85)
# - 货物: 25吨 普通货
# - 车型: 13m 平板车 (flatbed_13m)
# - 模式: 整车运输 (full_truck)
#
# 注意: 用户可能希望你基于这些参数计算。如果用户说"从这里出发"或"这个货"，
# 请优先使用这些已填参数。如果用户指定的参数与表单不同，以用户最新指令为准。
```

**C. 前端收集上下文**

在 `useAIChat.ts` 的 `sendMessage` 中：

```ts
// 新增参数
const sendMessage = useCallback(async (
  content: string,
  formContext?: AIChatContext  // 🆕
) => {
  // ...
  const body = JSON.stringify({
    messages: apiMessages,
    context: formContext,  // 🆕 注入当前表单状态
  });
  // ...
}, [messages, formContext]);
```

**D. AIChatPanel 接收 form prop**

```tsx
// AIChatPanel 新增 prop
interface AIChatPanelProps {
  onRouteFound?: (coords: ChatRouteCoords) => void;
  formContext?: AIChatContext;  // 🆕 当前表单上下文
}

// 发送消息时自动附带
const handleSend = () => {
  sendMessage(input.trim(), formContext);
};
```

**E. page.tsx 构建 formContext**

```ts
function buildFormContext(form: QuoteFormState): AIChatContext | undefined {
  const hasOrigin = form.originLat && form.originLng;
  const hasDest = form.destLat && form.destLng;
  if (!hasOrigin && !hasDest && !form.vehicleModelId) return undefined;
  
  return {
    origin_address: form.originAddress || undefined,
    origin_lat: hasOrigin ? parseFloat(form.originLat) : undefined,
    origin_lng: hasOrigin ? parseFloat(form.originLng) : undefined,
    destination_address: form.destAddress || undefined,
    dest_lat: hasDest ? parseFloat(form.destLat) : undefined,
    dest_lng: hasDest ? parseFloat(form.destLng) : undefined,
    cargo_weight_ton: form.weightKg ? parseFloat(form.weightKg) : undefined,
    cargo_type: form.cargoType || undefined,
    vehicle_model_id: form.vehicleModelId || undefined,
    loading_mode: form.loadingMode || undefined,
  };
}
```

---

### 交互层: 一键操作按钮协议

#### 3.4.1 按钮设计矩阵

| 按钮 | 触发条件 | 执行操作 | 视觉 |
|------|---------|---------|------|
| **📊 查看费用明细** | `calculate_freight_cost` tool_done | 在聊天消息下方展开内嵌 CostCard | 蓝色 outline 按钮 |
| **📋 用此方案报价** | `calculate_freight_cost` tool_done | 同步到 ResultsPanel | 绿色 primary 按钮 |
| **🚛 填入车型** | `query_vehicle_models` tool_done | 填入 QuoteForm + 切换 Tab | 蓝色 outline 按钮 |
| **📍 设为路线** | `calculate_freight_cost` tool_done | 填入表单起终点 + 切换 Tab | 灰色 outline 按钮 |

#### 3.4.2 ChatMessage 改造方案

**`ToolStatus` 组件扩展**:

```
当前: 
  [📦 计算运费 ✅ 完成]

改造后:
  ┌─────────────────────────────────────────┐
  │ 📦 计算运费 ✅ 完成                       │
  │                                         │
  │ 方案: 13m平板车 | 距离: 156km | 25吨      │
  │ 总费: 15,800,000 VNĐ                     │
  │                                         │
  │ [📊 查看明细] [📋 用此方案报价] [📍 设为路线] │
  └─────────────────────────────────────────┘
```

**实现方式**：在 `ChatMessage` 的 `data` 中传递结构化数据：

```ts
// chatTypes.ts 扩展
export interface ChatMessage {
  role: "user" | "assistant" | "tool_status";
  content: string;
  toolName?: string;
  toolStatus?: "running" | "done";
  toolResult?: Record<string, unknown>;     // 🆕 完整工具返回数据
  toolActions?: ToolAction[];               // 🆕 可用操作列表
}

export interface ToolAction {
  id: string;           // "view_detail" | "apply_quote" | "fill_vehicle" | "set_route"
  label: string;        // "查看明细"
  icon: string;         // "📊"
  variant: "primary" | "secondary" | "outline";
  payload: unknown;     // 操作附带数据
}
```

#### 3.4.3 内嵌费用明细卡片

当用户点击 "📊 查看明细" 时，在消息气泡下方展开一个内嵌的 mini 费用卡片：

```
  ┌─────────────────────────────────────────────┐
  │ 📊 费用明细                                   │
  │                                             │
  │ 整车运价     ████████████████░░░░  3,500,000  │
  │ 装卸费       ██░░░░░░░░░░░░░░░░░░    200,000  │
  │ 保险费       █░░░░░░░░░░░░░░░░░░░    150,000  │
  │ 路桥费       ████░░░░░░░░░░░░░░░░    800,000  │
  │ ...                                         │
  │                                             │
  │ 🚛 13m 平板车 · 单车费 15,800,000 VNĐ         │
  └─────────────────────────────────────────────┘
```

**实现方式**: 
- 新建 `InlineQuoteCard` 组件（复用 ResultsPanel 的 CostBar 逻辑）
- 在 ChatMessage 的 tool_status 消息下方条件渲染
- 通过 `toolActions` 的 payload 传递映射后的数据

---

## 四、数据流完整视图（改造后）

```
用户输入 "从友谊关到河内，25吨普货多少钱？"
        │
        ▼
  AIChatPanel.sendMessage("...", formContext)
        │
        ▼
  POST /ai/chat  { messages, context: { 表单状态 } }
        │
        ▼
  Backend: run_chat (DeepSeek + tools)
        │
        ├─ tool_start: { name: "calculate_freight_cost", params: {...} }
        │      │
        │      ▼
        │   useAIChat → ChatMessage 显示 "📦 计算运费..."
        │
        ├─ tool_done: { name: "calculate_freight_cost", result: {...} }
        │      │
        │      ├─▶ ChatMessage 显示 "📦 计算运费 ✅" + 操作按钮
        │      ├─▶ onRouteFound({origin, destination}) → 地图显示路线
        │      └─▶ onQuoteResult(AIToolQuoteResult)    → page.tsx
        │                                                   │
        │                                      ┌────────────┘
        │                                      ▼
        │                           mapToQuoteResponse()
        │                                      │
        │                                      ▼
        │                           setAIQuoteResult(mapped)
        │                                      │
        │                                      ▼
        │                           ResultsPanel 自动显示
        │                           (总价/明细/车型卡片)
        │
        └─ text: { content: "根据计算..." }
               │
               ▼
            ChatMessage → AssistantBubble 渲染 Markdown

用户点击 "📋 用此方案报价" 按钮
        │
        ▼
  ChatMessage.onAction("apply_quote", { ... })
        │
        ▼
  AIChatPanel → page.tsx
        │
        ├─ setAIQuoteResult(mapped)           ← 同步到 ResultsPanel
        └─ FloatingPanel 切换到 quote Tab?    ← 可配置

用户点击 "🚛 填入车型" 按钮
        │
        ▼
  ChatMessage.onAction("fill_vehicle", { model_id: "flatbed_13m" })
        │
        ▼
  FloatingPanel:
    ├─ setTab("quote")                       ← 切换到报价 Tab
    └─ onChange({ vehicleModelId: "flatbed_13m" })  ← 更新表单
```

---

## 五、实施优先级与阶段

### Phase 1: 最小可行集成 (MVP) — 1-2天

| 优先级 | 改造项 | 改动量 | 影响 |
|:---:|--------|:---:|------|
| P0 | **通道③**: 表单上下文注入聊天 | 后端 2 文件 + 前端 3 文件 | 🔴 高 — AI 变"智能"的基础 |
| P0 | **通道①**: AI 结果回调 + 映射 + ResultsPanel | 前端 4 文件 | 🔴 高 — 核心价值闭环 |
| P0 | **交互层**: tool_done 消息增加操作按钮 | 前端 2 文件 | 🔴 高 — 用户可操作 |

### Phase 2: 完整体验 — 1-2天

| 优先级 | 改造项 | 改动量 |
|:---:|--------|:---:|
| P1 | **通道②**: AI 推荐车型 → QuoteForm 填入 | 前端 4 文件 |
| P1 | **交互层**: 内嵌费用明细卡片 (InlineQuoteCard) | 前端 2 文件 |
| P1 | **后端优化**: `_format_cost_result` 增加 numeric 字段 | 后端 1 文件 |
| P1 | **路线补充**: AI 结果自动请求路线几何 (显示完整地图) | 前端 1 文件 |

### Phase 3: 深度体验 — 后续迭代

| 优先级 | 改造项 | 改动量 |
|:---:|--------|:---:|
| P2 | compare_routes 结果可视化对比卡片 | 前端 |
| P2 | AI 对话历史持久化 (localStorage / 后端存储) | 全栈 |
| P2 | 多轮对话中自动更新上下文 (tool call 后更新 formContext) | 前端 |
| P2 | "导出报价" 生成 PDF / 复制报价文本 | 前端 |

---

## 六、关键设计决策

### 6.1 为什么不直接让 AI 调用 /quote 接口？

**当前**: AI 通过 `execute_tool → _calc_cost` 独立计算运费，与 `/quote` API 是两套并行的计算路径。

**分析**:
- ✅ 好处: AI 工具直接访问后端服务（OSRM、cost_engine），效率高，不依赖 HTTP
- ❌ 坏处: 两套代码路径，结果格式不一致，需要额外映射

**建议**: **维持现状**。`execute_tool` 直接调用引擎是正确的，只需统一输出格式即可。映射层放在前端做是合理的选择（改动量小，不影响后端稳定性）。

### 6.2 数据映射放前端还是后端？

**决定**: **前端做主要映射，后端增加辅助字段**。

理由:
- 前端映射改动快，不阻塞后端
- 后端增加 `breakdown_numeric` 减少前端解析风险
- 长期可以后端统一返回格式（但需要协调前后端同步改动）

### 6.3 AI 结果与手动报价的优先级

**决定**: **手动报价优先**。当用户通过 QuoteForm 手动计算后，AI 结果不再自动覆盖 ResultsPanel。但 AI 结果的 "📋 用此方案报价" 按钮可让用户手动切换。

实现：`page.tsx` 中 `const currentResult = manualResult ?? aiResult`。

### 6.4 路线几何的获取策略

AI 工具返回不包含 `route.geometry`。策略：
- page.tsx 收到 AI 结果后，如果 `_origin` 和 `_destination` 存在，自动调用 `/route` 获取路线几何
- 复用现有的 `handleChatRoute` 逻辑
- 如果获取失败，不影响费用显示（ResultsPanel 不依赖 geometry）

### 6.5 formContext 的注入时机

**决定**: **每次发送消息时注入**，而非仅在初始时注入一次。

理由: 用户可能在对话过程中修改表单（如切换 Tab 修改参数后返回聊天 Tab），AI 应始终感知最新状态。但也要避免过度注入——仅当 formContext 非空且与前次不同时才注入。

---

## 七、文件改动清单

### 后端

| 文件 | 改动类型 | 内容 |
|------|:---:|------|
| `backend/app/schemas.py` | 新增 | `AIChatContext` 模型，`AIChatRequest.context` 字段 |
| `backend/app/api/ai.py` | 修改 | 接收 context 参数，传递给 run_chat |
| `backend/app/services/ai_chat.py` | 修改 | `run_chat` 接收 context，注入 system prompt |
| `backend/app/services/ai_chat_prompt.py` | 修改 | System prompt 模板增加 context 占位区 |
| `backend/app/services/ai_tools.py` | 修改 | `_format_cost_result` 增加 `breakdown_numeric`、`timing_estimate` |
| `backend/app/services/border_costs.py` | 无改动 | (口岸费结果已够用) |

### 前端

| 文件 | 改动类型 | 内容 |
|------|:---:|------|
| `frontend/src/lib/chatTypes.ts` | 修改 | 新增 `ToolAction`、扩展 `ChatMessage.toolResult/toolActions`，新增 `AIToolQuoteResult` 等 |
| `frontend/src/lib/types.ts` | 修改 | 新增 `AIChatContext` 类型 |
| `frontend/src/hooks/useAIChat.ts` | **重点修改** | 新增 `onQuoteResult/onVehicleRecommend/onCompareResult` 回调；`sendMessage` 接收 `formContext`；`tool_done` 分发逻辑；action 处理 |
| `frontend/src/components/ChatMessage.tsx` | **重点修改** | `ToolStatus` 根据 toolName 渲染 action buttons；新增 `InlineQuoteCard` |
| `frontend/src/components/AIChatPanel.tsx` | 修改 | 接收 `formContext` prop；action callback 向上传递 |
| `frontend/src/components/FloatingPanel.tsx` | 修改 | 跨 Tab 通信：接收/发送 AI 操作回调 |
| `frontend/src/app/page.tsx` | **重点修改** | 统一状态协调：`aiQuoteResult` state；`buildFormContext`；回调串联 |
| `frontend/src/components/ResultsPanel.tsx` | 修改 | 新增 `source?: "manual" | "ai"` prop；ai 来源时显示标记 |
| `frontend/src/lib/aiResultMapper.ts` | 🆕 新增 | AI 工具结果 → QuoteResponse 映射函数 |

---

## 八、风险与注意事项

1. **VND 字符串解析风险**: `_format_cost_result` 返回格式化字符串（`"1,250,000"`），前端 `parseVnd` 需处理各种边缘情况（负号、小数、空值）。建议后端 Phase 2 增加 numeric 字段消除此风险。

2. **Timing 估算精度**: AI 工具的 timing 是估算值（无 speed_factor / rest_hours 分解），显示在 ResultsPanel 时需标注 "AI 估算"。

3. **多车情况**: AI 工具返回 `cost_per_vehicle_vnd`（多车时），但 QuoteResponse 的 `breakdown.cost_per_vehicle` 字段兼容。

4. **并发安全问题**: 用户可能在 AI 计算过程中手动提交报价，两个结果可能冲突。建议: AI 结果使用独立 state，手动结果覆盖 AI 结果。

5. **formContext 隐私**: 如果表单包含敏感数据（客户信息），注意 system prompt 中的 context 会被发送到 DeepSeek API。

---

## 九、验收标准

| 场景 | 预期行为 |
|------|---------|
| 用户在 AI 聊天中说 "从 A 到 B，20吨普货" | AI 调用 calculate_freight_cost → ResultsPanel 自动显示完整费用明细 |
| 结果面板显示 AI 计算的费用 | 费用构成进度条、总价 Hero、车型卡片、路线指标均正常显示 |
| 用户点击 "📋 用此方案报价" | ResultsPanel 锁定该 AI 结果，不随后续 AI 对话变化 |
| 用户点击 "🚛 填入车型" | QuoteForm Tab 自动切换，车型选择器更新为 AI 推荐的车型 |
| 用户在 QuoteForm 中填写了起点终点后去 AI 聊天 | AI 知道表单中已填的地址和货物参数，能回应 "从这里出发" 等模糊指代 |
| AI 计算结果的地图路线 | 地图自动显示 AI 计算路线的起终点和路径 |
| 用户点击 "📊 查看明细" | 在聊天消息下方展开费用构成卡片 |
