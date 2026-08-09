# OSRM++ 前端功能改动分析 — 配合四约束车辆数公式

> 日期: 2026-08-09
> 背景: 后端已上线四约束车辆数公式（重量/体积/长件/面积），API 已支持 `cargo.items`
> 单件明细。前端当前**未做任何配套改动**，新公式已通过现有 API 自动生效（不填 items
> 时车辆数仍按重量+体积算），但有以下缺口。

---

## 一、现状盘点（前端代码已核实）

| 层 | 现状 | 对新车数公式的支持 |
|----|------|-------------------|
| `QuoteFormState` (types.ts) | 无 items 字段 | ❌ 无法收集单件明细 |
| `buildRequest()` (useQuoteForm.ts) | `cargo` 只发 weight/volume/type/value | ❌ items 不发送 |
| `validateStep()` | 整车只校验 vehicleModelId | ⚠️ 不校验长件可行性 |
| `ResultsPanel.tsx` | 已显示 `vc > 1` 和 `单车运费`（L248-256） | ✅ 已有基础展示 |
| `RouteOptions.tsx` | 方案对比 | ⚠️ 未展示各方案车数差异 |
| `BottomDrawer.tsx`（移动端） | 结果抽屉 | ⚠️ 同 ResultsPanel 待确认 |
| i18n (zh/vi/en) | 无 items 相关文案 | ❌ 需新增 |
| `lib/api.ts` | `quoteCost()` 透传 request | ✅ 无需改（JSON 自动带 items） |

**好消息**：后端改动是纯增量、向后兼容的——前端零改动也能运行（不填 items 时按重量+体积算车数）。以下改动是"让用户能真正用上长件/面积约束"的必要配套。

---

## 二、必须改（否则新公式对用户不可用）

### 2.1 类型层：`QuoteFormState` + `CargoItem` (types.ts)

```ts
// 新增单件货物类型
export interface CargoItem {
  id: string;          // 前端唯一 id（增删用）
  name: string;
  count: number;
  lengthM: number;     // 米
  widthM: number;
  heightM: number | null;
  weightKg: number | null;
  stackable: boolean;  // 是否可堆叠
}

// QuoteFormState 增加
items: CargoItem[];
```

### 2.2 请求构建：`buildRequest()` (useQuoteForm.ts)

```ts
cargo: {
  ...,
  items: fm.items
    .filter(i => i.lengthM > 0 && i.widthM > 0)
    .map(i => ({
      name: i.name,
      count: i.count,
      length_m: i.lengthM,
      width_m: i.widthM,
      height_m: i.heightM ?? undefined,
      weight_kg: i.weightKg ?? undefined,
      stackable: i.stackable,
    })),
},
```

### 2.3 表单 UI：QuoteForm 货物步骤新增"单件货物明细"面板

**设计建议（遵循现有紧凑风格）：**

```
┌─ 📦 单件货物明细（选填）──────────────┐
│  [折叠面板，默认收起]                  │
│                                        │
│  ▸ 添加一件货物                        │
│  ┌────────────┬────┬────┬────┬───────┐ │
│  │ 名称(选填)  │数量 │长m │宽m │可堆叠 │ │
│  ├────────────┼────┼────┼────┼───────┤ │
│  │ 变压器     │ 1  │ 8  │2.5 │ ✗    │ │
│  │ 配件箱     │ 20 │1.2 │0.8 │ ✓    │ │
│  └────────────┴────┴────┴────┴───────┘ │
│  [+ 添加]                              │
│  💡 单件长度超过车厢或不可堆叠的设备，   │
│     填写后系统自动计算所需车辆数        │
└───────────────────────────────────────┘
```

**关键交互规则**：
1. **默认收起**——不增加普通用户负担（90% 用户只需重量+体积）
2. **"可堆叠"开关**：默认 ✓；勾掉=按地板面积计（设备/变压器类）
3. **高度可选**（`height_m` 可空）——不强制用户填，只用于容积校验
4. **重量可选**——不填时按总量比例分摊
5. **展开时机建议**：用户选了 `oversized`/`heavy_equipment` 货物类型时，自动展开并提示（这两类货物 90% 需要长件/面积约束）

### 2.4 车辆数校验：`validateStep()`

整车模式：如果 items 里有单件 `lengthM > 已选车型地板长`，提交前给出警告（不阻断，但提示"该货物超出所选车型长度，系统将自动拆分为 N 辆"）。需要后端返回车型长度信息——`GET /reference/vehicle-models` 已有 `length_m` 字段 ✅

### 2.5 i18n 三语新增（types.ts 是契约 ⚠️）

| key | zh | vi | en |
|-----|----|----|----|
| `cargo.items.title` | 单件货物明细 | Chi tiết kiện hàng | Cargo items |
| `cargo.items.add` | 添加货物 | Thêm kiện | Add item |
| `cargo.items.name` | 名称 | Tên | Name |
| `cargo.items.count` | 数量 | SL | Qty |
| `cargo.items.length` | 长 (m) | Dài (m) | L (m) |
| `cargo.items.width` | 宽 (m) | Rộng (m) | W (m) |
| `cargo.items.height` | 高 (m) | Cao (m) | H (m) |
| `cargo.items.stackable` | 可堆叠 | Xếp chồng | Stackable |
| `cargo.items.hint` | 长件/不可堆叠设备请填写 | ... | ... |
| `cargo.items.splitWarn` | 超长将自动拆分 N 辆 | ... | ... |

**改字典前先查 `types.ts` 的 `Translations` 接口**（见 osrmpp-dev skill Pitfall：漏 key 会三个语言文件同时报 TS2353）。

---

## 三、应该改（提升体验）

### 3.1 ResultsPanel：车数拆分原因展示

当前只显示 `单车运费 · N 辆`。建议在 N>1 时增加一行说明：

```
🚛 高栏 18t · 整车
   单车运费 12,345,000 VND · 2 辆
   └─ 因货物长度 14m > 车厢 9.6m，需 2 辆
```

**实现**：后端已可提供（`suggestions` 增加 `split_by_length` / `split_by_weight` / `split_by_area` 码），前端 i18n 渲染。这是**后端小改 + 前端展示**，让用户理解"为什么要 N 辆车"。

### 3.2 VehiclePicker：展示新载荷字段

`VehiclePicker` 目前每行显示载重+费率。建议加**地板长**（`length_m`）——用户选车时一眼看到"这车能不能装下我的长件"。数据已有 ✅

### 3.3 RouteOptions：方案对比显示车数

多方案对比时，不同车型可能算出不同车数（13m 平板 1 车 vs 6.2m 平板 2 车），对比卡上显示 `2辆` 徽标，价格对比才有意义。

---

## 四、可以不改（保持现状）

| 项 | 原因 |
|----|------|
| `lib/api.ts` | request 是 JSON 透传，items 自动带上 |
| `BottomDrawer.tsx` | 复用 ResultsPanel 渲染逻辑（待确认，若独立实现则需同步） |
| `MapView.tsx` | 与车辆数无关 |
| `AIChatPanel.tsx` | AI 侧 items 由 AI 工具 schema 处理（后端已支持） |
| 批量报价页 | BatchRowInput 已加 cargo_items，Excel 模板暂不加列（用户可后续扩展） |

---

## 五、改动清单汇总（按优先级）

| 优先级 | 文件 | 改动 | 工作量 |
|--------|------|------|--------|
| P0 | `types.ts` | +`CargoItem` 接口, `QuoteFormState.items` | 小 |
| P0 | `useQuoteForm.ts` | `buildRequest()` 加 items 映射 | 小 |
| P0 | `QuoteForm.tsx` | 货物步骤加"单件明细"折叠面板 | 中 |
| P0 | i18n × 4 | 新增 10 个 key（zh/vi/en/types） | 小 |
| P1 | `ResultsPanel.tsx` | N>1 时显示拆分原因 | 小（需后端 suggestions 配合）|
| P1 | `VehiclePicker.tsx` | 行内显示地板长 | 小 |
| P1 | `RouteOptions.tsx` | 对比卡显示车数徽标 | 小 |
| P1 | `useQuoteForm.ts` | validateStep 超长预警 | 小 |
| P2 | 后端 | suggestions 增加 split_by_* 码 | 小 |

**总计**：P0 约 0.5 天，P0+P1 约 1-1.5 天。

---

## 六、建议实施顺序

1. **先做 P0**（types + buildRequest + 折叠面板 + i18n）——让用户能填 items，新公式真正可用
2. **再做 P1 展示层**（拆分原因 + 车型地板长 + 对比车数）——让用户理解计算结果
3. P2 后端 suggestions 拆分码——等前端 P1 需要时一起做

**验证方案**：
- `npx tsc --noEmit` 全项目通过（⚠️ 单文件 tsc 在 Windows 是误报，用全项目）
- 浏览器实测：选 6.2m 平板 + 填 9m 管道 item → 结果应显示 2 辆
- 三语切换检查新文案
- 移动端（BottomDrawer）实测折叠面板交互
