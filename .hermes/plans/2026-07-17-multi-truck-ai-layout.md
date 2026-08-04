# OSRM++ 多车自动匹配 + AI联动 + 布局优化 — 开发计划

> 日期: 2026-07-17 | 版本: v0.1

---

## 总览: 8 个任务, 涉及 15+ 文件

```
后端 (4个任务)
├── T1: cost_engine.py 移除超载硬报错, 改为返回"需要多车"信号
├── T2: route.py API 层多车拆分逻辑 + 新响应字段
├── T3: presets.py 新增货物类型进出口估算表 + API 端点
├── T4: ai_tools.py / ai_chat_prompt.py AI 工具联动更新

前端 (5个任务)
├── T5: QuoteForm 实时显示"需要 N 辆车"
├── T6: ResultsPanel 多车价格展示
├── T7: 货物类型快速估算卡片
├── T8: 布局修改 (LayersControl 左下角 + AI 面板嵌入左侧)
└── T9: i18n 新增翻译段 + 前后端类型定义更新
```

---

## T1: 后端 — cost_engine.py 移除超载硬报错

**现状**: `compute_cost_full_truck()` 第 276-280 行, `cargo_weight_ton > model.max_load_ton` 直接 `raise ValueError`

**改动**: 改为返回一个"需要多车"的标记，而不是抛异常

```python
# cost_engine.py — compute_cost_full_truck() 修改

# 原代码 (删除):
if cargo_weight_ton > model.max_load_ton:
    raise ValueError(...)

# 新代码 (替换为):
# 不在 cost_engine 层抛错, 多车拆分由上层 API 处理
# 这里照常计算一辆车的成本（作为 per-vehicle 基准）
# 调用方自行判断是否需要多车
```

**影响**: `ai_tools.py` 的 `_calc_cost()` 也需要同步修改 — 当前第 310 行调用 `compute_cost_full_truck` 可能抛错，去掉 try-except 里的超载处理，改为在 AI 工具层做多车计算。

**风险**: 拼货模式的 `match_consolidated_model` 也有超载逻辑 (第 413 行 `cargo_weight_ton <= m.max_load_ton`)，但拼货模式超载是真的装不下，应该保持报错。

---

## T2: 后端 — API 层多车拆分 (route.py + schemas.py)

### 2a. schemas.py — 新增响应字段

```python
# BreakdownOutput 追加:
class BreakdownOutput(BaseModel):
    # ... 现有字段不变 ...
    vehicle_count: int = 1              # 车辆数量
    cost_per_vehicle: float | None = None  # 单车价格 (只有 >1 车时有意义)

# QuoteResponse 追加:
class QuoteResponse(BaseModel):
    # ... 现有字段不变 ...
    vehicle_count: int = 1
```

### 2b. route.py — `_compute_from_request` 多车拆分

```python
def _compute_from_request(request: QuoteRequest, route_result: RouteResult) -> tuple[CostResult, int]:
    """返回 (单辆车费用结果, 需要车辆数)"""
    
    model_id = request.vehicle.vehicle_model_id
    model = get_model(model_id)
    weight_ton = request.cargo.weight_kg / 1000
    
    if model is None:
        raise UnknownVehicleModel(model_id)
    
    # 计算需要几辆车
    vehicle_count = max(1, math.ceil(weight_ton / model.max_load_ton))
    
    # 用 "每辆车装的重量" 来计算单车成本
    per_vehicle_weight_ton = weight_ton / vehicle_count
    
    common_kwargs = dict(
        # ... 现有参数 ...
        cargo_weight_ton=per_vehicle_weight_ton,  # 改: 用单车重量
        # ... 其余不变 ...
    )
    
    result = compute_cost_full_truck(vehicle_model_id=model_id, **common_kwargs)
    return result, vehicle_count
```

### 2c. route.py — `quote_cost` 组装响应

```python
@router.post("/route/cost")
async def quote_cost(request: QuoteRequest):
    # ... OSRM 路线解析 (不变) ...
    
    result, vehicle_count = _compute_from_request(request, route_result)
    resp = build_quote_response(route_result, result)
    
    # 填充多车字段
    resp.vehicle_count = vehicle_count
    if vehicle_count > 1:
        resp.breakdown.vehicle_count = vehicle_count
        resp.breakdown.cost_per_vehicle = result.breakdown.cost_total
        resp.breakdown.cost_total = result.breakdown.cost_total * vehicle_count
        # cost_per_km / cost_per_ton_km 也相应调整
    
    return resp
```

### 2d. build_quote_response 修改

```python
def build_quote_response(route_result, result, vehicle_count=1):
    """组装响应。多车时总成本 = 单车成本 × 车辆数"""
    b = result.breakdown
    
    # 多车总成本: 各项费用都 × vehicle_count
    total_multiplier = vehicle_count if vehicle_count > 1 else 1
    
    return QuoteResponse(
        route=RouteOutput(...),
        timing=TimingOutput(...),
        breakdown=BreakdownOutput(
            cost_distance=b.cost_distance * total_multiplier,
            cost_time=b.cost_time * total_multiplier,
            # ... 所有费用项 × total_multiplier ...
            cost_total=b.cost_total * total_multiplier,
            cost_per_km=(b.cost_total * total_multiplier) / (result.distance_km),
            vehicle_count=vehicle_count,
            cost_per_vehicle=b.cost_total if vehicle_count > 1 else None,
            # ... 其余不变 ...
        ),
        vehicle_count=vehicle_count,
        ...
    )
```

### 2e. AI 工具同步修改 (ai_tools.py)

`_calc_cost()` 第 274-329 行:
- 调用前先检查重量 vs 载重，算 vehicle_count
- 调整 `cargo_weight_ton` 为单车重量再传给 `compute_cost_full_truck`
- `_format_cost_result` 增加 `vehicle_count` 和 `cost_per_vehicle` 字段

```python
# ai_tools.py _calc_cost() 修改

# 在调用 compute_cost_full_truck 之前:
model = get_model(vehicle_id)
per_vehicle_weight = weight_ton
vehicle_count = 1
if model and weight_ton > model.max_load_ton:
    vehicle_count = max(1, math.ceil(weight_ton / model.max_load_ton))
    per_vehicle_weight = weight_ton / vehicle_count

result = compute_cost_full_truck(
    ...,
    cargo_weight_ton=per_vehicle_weight,  # 改: 单车重量
    ...
)

# _format_cost_result 新增:
result_dict["vehicle_count"] = vehicle_count
result_dict["cost_per_vehicle_vnd"] = _fmt_vnd(b.cost_total)
result_dict["total_cost_vnd"] = _fmt_vnd(b.cost_total * vehicle_count)
```

---

## T3: 后端 — presets.py 新增货物类型进出口估算表

### 3a. 数据定义

```python
# presets.py 新增

@dataclass(frozen=True)
class CargoImportExportEstimate:
    """根据货物类型的粗略进出口费用估算 (非 HS 码精确查询)"""
    export_fee_rmb_per_vehicle: float   # 每车出口费用 (¥)
    import_fee_rmb_per_vehicle: float   # 每车进口费用 (¥)
    estimated_duty_rate: float          # 预估关税率
    estimated_vat_rate: float           # 预估增值税率
    description_zh: str                 # 中文说明
    description_vi: str                 # 越南语说明

CARGO_IMPORT_EXPORT_ESTIMATES: dict[str, CargoImportExportEstimate] = {
    "normal": CargoImportExportEstimate(
        export_fee_rmb_per_vehicle=800,
        import_fee_rmb_per_vehicle=1500,
        estimated_duty_rate=0.05,
        estimated_vat_rate=0.10,
        description_zh="普通货物：出口报关+口岸操作 ~800¥/车，进口清关 ~1500¥/车",
        description_vi="Hàng thông thường: thông quan XK ~800¥/xe, NK ~1500¥/xe",
    ),
    "oversized": CargoImportExportEstimate(
        export_fee_rmb_per_vehicle=1500,
        import_fee_rmb_per_vehicle=3000,
        estimated_duty_rate=0.08,
        estimated_vat_rate=0.10,
        description_zh="超限货物：出口报关+超限申报 ~1500¥/车，进口清关 ~3000¥/车",
        description_vi="Hàng quá khổ: thông quan XK ~1500¥/xe, NK ~3000¥/xe",
    ),
    "heavy_equipment": CargoImportExportEstimate(
        export_fee_rmb_per_vehicle=2000,
        import_fee_rmb_per_vehicle=5000,
        estimated_duty_rate=0.08,
        estimated_vat_rate=0.10,
        description_zh="重型设备：出口报关+特种装卸 ~2000¥/车，进口清关+检验 ~5000¥/车",
        description_vi="Thiết bị nặng: thông quan XK ~2000¥/xe, NK ~5000¥/xe",
    ),
    "cold_chain": CargoImportExportEstimate(
        export_fee_rmb_per_vehicle=1200,
        import_fee_rmb_per_vehicle=2500,
        estimated_duty_rate=0.05,
        estimated_vat_rate=0.10,
        description_zh="冷链货物：出口报关+温控 ~1200¥/车，进口清关 ~2500¥/车",
        description_vi="Hàng lạnh: thông quan XK ~1200¥/xe, NK ~2500¥/xe",
    ),
    "hazardous": CargoImportExportEstimate(
        export_fee_rmb_per_vehicle=2000,
        import_fee_rmb_per_vehicle=4000,
        estimated_duty_rate=0.05,
        estimated_vat_rate=0.10,
        description_zh="危险品：出口报关+危品申报 ~2000¥/车，进口清关+检验 ~4000¥/车",
        description_vi="Hàng nguy hiểm: thông quan XK ~2000¥/xe, NK ~4000¥/xe",
    ),
    "other": CargoImportExportEstimate(
        export_fee_rmb_per_vehicle=800,
        import_fee_rmb_per_vehicle=1500,
        estimated_duty_rate=0.05,
        estimated_vat_rate=0.10,
        description_zh="其他货物：标准进出口费用",
        description_vi="Hàng khác: phí XNK tiêu chuẩn",
    ),
}
```

### 3b. API 端点

在 `backend/app/api/reference.py` 新增:

```python
@router.get("/reference/cargo-estimates")
async def get_cargo_estimates(cargo_type: str = None):
    """返回货物类型进出口费用估算。不传参数返回全部。"""
    from app.services.presets import CARGO_IMPORT_EXPORT_ESTIMATES
    if cargo_type:
        estimate = CARGO_IMPORT_EXPORT_ESTIMATES.get(cargo_type)
        if not estimate:
            raise HTTPException(404, f"未知货物类型: {cargo_type}")
        return asdict(estimate)
    return {k: asdict(v) for k, v in CARGO_IMPORT_EXPORT_ESTIMATES.items()}
```

---

## T4: 后端 — AI Prompt 更新

### 4a. ai_chat_prompt.py

在系统提示词中新增:

```
## 进出口费用估算

当用户询问"到门价/DDP/进出口费用"时，你已经有 calculate_freight_cost 工具返回的运费。
对于进出口费用，使用 cargo_estimate 工具获取粗略估算（不是 HS 码精确查询）。
在回答模板中按以下格式输出：

> 📦 DDP 总费用估算（友谊关 → 河内）：
> - 运费: XX,XXX,XXX ₫ (N 辆 车型名，XX,XXX,XXX ₫/辆)
> - 出口费用: ~X,XXX ¥/车 × N 车 = X,XXX ¥
> - 进口费用: ~X,XXX ¥/车 × N 车 = X,XXX ¥

当用户没有提供 HS 码时，用货物类型估算进出口费用，不要假装知道精确税率。
```

### 4b. ai_tools.py — 新增工具

```python
# TOOLS 列表新增:
{
    "type": "function",
    "function": {
        "name": "cargo_estimate",
        "description": "根据货物类型返回进出口费用粗略估算（非HS码精确查询）。用于快速报价场景。",
        "parameters": {
            "type": "object",
            "properties": {
                "cargo_type": {
                    "type": "string",
                    "enum": ["normal", "oversized", "heavy_equipment", "cold_chain", "hazardous", "other"],
                    "description": "货物类型"
                },
                "vehicle_count": {
                    "type": "integer",
                    "description": "车辆数量，用于计算总进出口费用",
                },
            },
            "required": ["cargo_type"],
        },
    },
}

# execute_tool 新增分支:
elif name == "cargo_estimate":
    return _cargo_estimate(arguments)

# 新增函数:
def _cargo_estimate(args: dict) -> str:
    from app.services.presets import CARGO_IMPORT_EXPORT_ESTIMATES
    ct = args["cargo_type"]
    vc = int(args.get("vehicle_count", 1))
    est = CARGO_IMPORT_EXPORT_ESTIMATES.get(ct)
    if not est:
        return json.dumps({"error": f"未知货物类型: {ct}"}, ensure_ascii=False)
    return json.dumps({
        "cargo_type": ct,
        "vehicle_count": vc,
        "per_vehicle": {
            "export_fee_rmb": est.export_fee_rmb_per_vehicle,
            "import_fee_rmb": est.import_fee_rmb_per_vehicle,
            "estimated_duty_rate": est.estimated_duty_rate,
            "estimated_vat_rate": est.estimated_vat_rate,
        },
        "total": {
            "export_fee_rmb": est.export_fee_rmb_per_vehicle * vc,
            "import_fee_rmb": est.import_fee_rmb_per_vehicle * vc,
        },
        "description_zh": est.description_zh,
        "disclaimer": "⚠️ 此为货物类型粗略估算，非精确HS码查询。精确费用请在表单填写HS码。",
    }, ensure_ascii=False)
```

### 4c. _format_cost_result 增加车辆数量字段

```python
# _format_cost_result 返回值新增:
result["vehicle_count"] = vehicle_count
if vehicle_count > 1:
    result["cost_per_vehicle_vnd"] = _fmt_vnd(b.cost_total)
    result["total_cost_vnd"] = _fmt_vnd(b.cost_total * vehicle_count)
```

---

## T5: 前端 — QuoteForm 实时显示车辆数量

### 5a. 逻辑

在 QuoteForm 的 Vehicle 步骤 (整车模式):
- 当用户选择了车型 + 填了重量后
- 实时计算: `neededTrucks = Math.ceil(weightTon / maxLoadTon)`
- 显示:

```
🚛 50 吨 ÷ 26 吨/车 = 需要 2 辆 普通平板 13米
```

### 5b. 代码位置

`QuoteForm.tsx` 第 416-421 行 (selectedModel specs 显示区域):

```tsx
{selectedModel && (
  <div className="mt-1.5 rounded-lg bg-[var(--surface-50)] p-2 text-[11px] text-[var(--surface-600)]">
    {(() => {
      const weightTon = form.weightUnit === "ton"
        ? parseFloat(form.weightKg) || 0
        : (parseFloat(form.weightKg) || 0) / 1000;
      const neededTrucks = weightTon > 0
        ? Math.ceil(weightTon / selectedModel.max_load_ton)
        : 1;
      return (
        <>
          <div>{t.quoteForm.vehicle.specs(...)}</div>
          {neededTrucks > 1 && (
            <div className="mt-1 pt-1 border-t border-[var(--surface-200)] text-[var(--brand-600)] font-medium">
              🚛 {weightTon} 吨 ÷ {selectedModel.max_load_ton} 吨/车 = 需要 <strong>{neededTrucks}</strong> 辆车
            </div>
          )}
          {neededTrucks === 1 && weightTon > 0 && (
            <div className="mt-1 pt-1 border-t border-[var(--surface-200)] text-[var(--success)]">
              ✅ 1 辆车即可，载重利用率 {Math.round(weightTon / selectedModel.max_load_ton * 100)}%
            </div>
          )}
        </>
      );
    })()}
  </div>
)}
```

---

## T6: 前端 — ResultsPanel 多车价格展示

### 6a. types.ts 更新

```typescript
export interface QuoteResponse {
  // ... 现有字段 ...
  vehicle_count: number;
}

export interface BreakdownOutput {
  // ... 现有字段 ...
  vehicle_count: number;
  cost_per_vehicle: number | null;
}
```

### 6b. ResultsPanel 总价区域修改

`ResultsPanel.tsx` 第 216-221 行 (Total Hero):

```tsx
{/* ── Total Hero ── */}
{alternatives.length <= 1 && (
  <div className="text-center py-2">
    <p className="text-xs font-medium text-[var(--surface-400)] mb-1">
      {t.costPanel.singleCostLabel}
    </p>
    <p className="text-4xl font-bold text-[var(--surface-900)] tracking-tight">
      {formatVnd(breakdown.cost_total)}
    </p>
    {/* 多车时显示单车单价 */}
    {currentResult.vehicle_count > 1 && (
      <p className="mt-1 text-xs text-[var(--surface-500)]">
        {currentResult.vehicle_count} 辆 × {formatVnd(breakdown.cost_per_vehicle!)} ₫/辆
      </p>
    )}
  </div>
)}
```

### 6c. Key Metrics Row 加车辆数

```tsx
{/* 多车时替换 matched model 显示 */}
{currentResult.vehicle_count > 1 ? (
  <div className="rounded-lg bg-[var(--brand-50)] p-2 text-center">
    <p className="text-[10px] text-[var(--surface-400)]">车辆数</p>
    <p className="text-sm font-bold text-[var(--brand-600)]">
      {currentResult.vehicle_count} 辆
    </p>
  </div>
) : (
  <div className="rounded-lg bg-[var(--surface-50)] p-2 text-center">
    <p className="text-[10px] text-[var(--surface-400)]">{t.costPanel.matchedModelLabel}</p>
    <p className="text-sm font-bold text-[var(--surface-800)] truncate">
      {breakdown.matched_vehicle_model_name.split(/\s/)[0]}
    </p>
  </div>
)}
```

---

## T7: 前端 — 货物类型快速估算卡片

### 7a. 新增 Hook 或 API 调用

在 `api.ts` 新增:

```typescript
export interface CargoEstimate {
  export_fee_rmb_per_vehicle: number;
  import_fee_rmb_per_vehicle: number;
  estimated_duty_rate: number;
  estimated_vat_rate: number;
  description_zh: string;
  description_vi: string;
}

export function getCargoEstimates(cargoType?: string): Promise<Record<string, CargoEstimate>> {
  const path = cargoType
    ? `/reference/cargo-estimates?cargo_type=${encodeURIComponent(cargoType)}`
    : "/reference/cargo-estimates";
  return apiGet(path);
}
```

### 7b. QuoteForm 中新增估算卡片

在 Vehicle/Cargo 步骤中，当选择了 cargoType 后，在 BorderSection 下方显示:

```tsx
{/* 货物类型进出口费用快速估算 */}
{form.cargoType && form.cargoType !== "normal" && (
  <div className="rounded-xl border border-[var(--accent-200)] bg-[var(--accent-50)] p-2.5">
    <div className="flex items-center gap-1.5 mb-1.5">
      <span className="text-xs">📊</span>
      <span className="text-[11px] font-semibold text-[var(--accent-700)]">
        进出口费用快速估算
      </span>
      <span className="text-[10px] text-[var(--accent-500)] ml-auto">非HS码精确查询</span>
    </div>
    <div className="text-[10px] text-[var(--accent-600)] space-y-0.5">
      <div>出口费用: ~{estimate?.export_fee_rmb_per_vehicle}¥/车</div>
      <div>进口费用: ~{estimate?.import_fee_rmb_per_vehicle}¥/车</div>
      <div>预估关税: {(estimate?.estimated_duty_rate || 0) * 100}% · 增值税: {(estimate?.estimated_vat_rate || 0) * 100}%</div>
    </div>
    <p className="mt-1 text-[10px] text-[var(--surface-400)]">
      精确费用请在「进出口费用」栏填写 HS 编码
    </p>
  </div>
)}
```

### 7c. 估算卡片联动 AI 聊天

在 AI 聊天面板的欢迎页新增快捷建议:

```tsx
{ icon: "📊", label: "进出口估算", text: "20吨普通货从友谊关到河内，DDP到门价估算" },
```

---

## T8: 前端 — 布局修改

### 8a. MapView — LayersControl 移到左下角

`MapView.tsx` 第 99 行:

```tsx
// 改前:
<LayersControl position="topright" key={locale}>

// 改后:
<LayersControl position="bottomleft" key={locale}>
```

同时调整 `FlyToRoute` 的 padding:
```tsx
// 第 62 行 paddingBottomRight 不变
paddingBottomRight: [bottomPad, 60] as [number, number],
```

### 8b. AIChatPanel — 嵌入左侧 FloatingPanel

**方案**: 将 AI 聊天窗口作为 FloatingPanel 底部的一个可展开 section，折叠时显示一行提示 "💬 AI 助手 · 点击展开"，展开时占据面板下半部分。

`FloatingPanel.tsx` 修改:

```tsx
export default function FloatingPanel(...) {
  const { t } = useLocale();
  const [collapsed, setCollapsed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);  // 新增

  return (
    <div className="absolute top-14 left-4 bottom-4 z-[800] w-[380px] flex flex-col">
      {/* Header 不变 */}
      ...
      
      <div className="flex-1 overflow-y-auto rounded-2xl bg-white/90 ...">
        <div className="p-3 space-y-3">
          <TemplateBar ... />
          <QuoteForm ... />
          
          {/* ── AI 聊天嵌入区 ── */}
          <div className="border-t border-[var(--surface-200)] pt-2">
            {chatOpen ? (
              <EmbeddedChat onRouteFound={onRouteFound} onClose={() => setChatOpen(false)} />
            ) : (
              <button
                onClick={() => setChatOpen(true)}
                className="w-full flex items-center gap-2 rounded-lg border border-dashed border-[var(--surface-300)] bg-[var(--surface-50)] px-3 py-2 text-xs text-[var(--surface-500)] hover:border-[var(--brand-300)] hover:text-[var(--brand-600)] transition-colors"
              >
                <span>💬</span>
                <span>AI 物流助手 · 点击展开</span>
                <span className="ml-auto text-[10px] text-[var(--surface-400)]">DeepSeek</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

**EmbeddedChat 组件** (新建或内联):

```tsx
function EmbeddedChat({ onRouteFound, onClose }: { onRouteFound: ..., onClose: () => void }) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { messages, loading, error, messagesEndRef, sendMessage, stopGeneration, clearChat } =
    useAIChat(onRouteFound);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  return (
    <div className="flex flex-col" style={{ maxHeight: "280px" }}>
      {/* Mini Header */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold text-[var(--surface-600)]">💬 AI 助手</span>
        <div className="flex gap-0.5">
          {messages.length > 0 && (
            <button onClick={clearChat} className="text-[10px] text-[var(--surface-400)] hover:text-red-500">清空</button>
          )}
          <button onClick={onClose} className="text-[10px] text-[var(--surface-400)] hover:text-[var(--surface-600)]">收起</button>
        </div>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-[var(--surface-50)] rounded-lg p-2 mb-2" style={{ maxHeight: "160px" }}>
        {messages.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-[11px] text-[var(--surface-400)]">输入运输问题，AI 实时计算</p>
            <div className="flex flex-wrap gap-1 mt-2 justify-center">
              {SUGGESTIONS.slice(0, 2).map(s => (
                <button key={s.label} onClick={() => sendMessage(s.text)}
                  className="rounded-full border border-[var(--surface-200)] px-2 py-0.5 text-[10px] text-[var(--surface-500)] hover:border-[var(--brand-300)]">
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <ChatMessageItem key={i} message={msg} streaming={loading && i === messages.length - 1 && msg.role === "assistant"} />
          ))
        )}
        {error && <div className="text-[10px] text-red-500 px-1">{error}</div>}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input */}
      <div className="flex gap-1.5">
        <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input.trim()); setInput(""); }}}
          placeholder="输入运输问题..." rows={1} disabled={loading}
          className="flex-1 resize-none rounded-lg border border-[var(--surface-200)] bg-[var(--surface-50)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--brand-400)]"
        />
        {loading ? (
          <button onClick={stopGeneration} className="shrink-0 rounded-lg bg-red-100 px-2 py-1 text-xs text-red-500">停止</button>
        ) : (
          <button onClick={() => { sendMessage(input.trim()); setInput(""); }}
            disabled={!input.trim()}
            className="shrink-0 rounded-lg bg-[var(--brand-600)] px-2.5 py-1 text-xs text-white disabled:opacity-30">发送</button>
        )}
      </div>
    </div>
  );
}
```

### 8c. FloatingPanel 传递 onRouteFound

`FloatingPanel` 新增 prop:
```typescript
onChatRouteFound?: (coords: ChatRouteCoords) => void;
```

`page.tsx` 传递:
```tsx
<FloatingPanel
  ...现有props...
  onChatRouteFound={handleChatRoute}
/>
```

### 8d. 原 AIChatPanel 保留但默认不渲染

`page.tsx` 中:
```tsx
{/* AIChatPanel 已嵌入左侧面板, 此处不再渲染独立弹窗 */}
{/* <AIChatPanel onRouteFound={handleChatRoute} /> */}
```

---

## T9: i18n 新增翻译段

### zh.ts / en.ts / vi.ts 新增:

```typescript
// zh.ts
cargoEstimate: {
  title: "进出口费用快速估算",
  disclaimer: "非HS码精确查询",
  exportFee: "出口费用",
  importFee: "进口费用",
  perVehicle: "/车",
  estimatedDuty: "预估关税",
  estimatedVat: "增值税",
  preciseNote: "精确费用请在「进出口费用」栏填写 HS 编码",
},
multiTruck: {
  trucksNeeded: "吨 ÷ {maxLoad} 吨/车 = 需要 {count} 辆车",
  oneTruckEnough: "1 辆车即可，载重利用率 {pct}%",
  perVehicle: "辆 × {cost} ₫/辆",
  vehicleCount: "车辆数",
},

// types.ts
cargoEstimate: {
  title: string;
  disclaimer: string;
  exportFee: string;
  importFee: string;
  perVehicle: string;
  estimatedDuty: string;
  estimatedVat: string;
  preciseNote: string;
};
multiTruck: {
  trucksNeeded: string;  // with params
  oneTruckEnough: string;
  perVehicle: string;
  vehicleCount: string;
};
```

---

## 执行顺序

```
T1 → T2 → T6 (后端多车逻辑打通 → 前端展示)
T3 → T7 (后端估算表 → 前端卡片)
T4 (AI 联动, 依赖 T1-T3)
T8 (布局修改, 独立)
T9 (翻译, 贯穿全程)
```

> ⚠️ i18n 新增翻译段后必须清除 Turbopack 缓存:
> ```bash
> docker compose stop frontend
> docker compose rm -sfv frontend
> docker compose up -d frontend
> ```

---

## 验证清单

- [ ] `POST /route/cost` 返回 `vehicle_count` 字段
- [ ] 50吨 + 普通平板13米(26t) → vehicle_count=2, cost_per_vehicle 有值
- [ ] ResultsPanel 显示 "2 辆 × 18,500,000 ₫/辆"
- [ ] QuoteForm 车辆选择后实时显示 "需要 2 辆车"
- [ ] `GET /reference/cargo-estimates?cargo_type=oversized` 返回估算数据
- [ ] AI 聊天输入 "50吨设备从友谊关到河内 DDP价" 返回多车 + 进出口估算
- [ ] 地图图层切换按钮在左下角, 不遮挡语言切换
- [ ] AI 聊天在左侧面板底部可展开
- [ ] 三语言切换正常 (zh/vi/en)
- [ ] `docker compose restart` 后无报错
