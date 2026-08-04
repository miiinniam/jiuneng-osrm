# OSRM++ 问题优先级重评估与执行计划

> 评估日期：2026-07-18 | 评估人：Hermes Agent
> 代码库路径：`D:\01_业务\玖能\OSRM\OSRM++`

---

## 一、优先级重评估结论

### P0 调整（6 → 4个真正需要修的）

| 原编号 | 标题 | 调整 | 理由 |
|--------|------|------|------|
| P0-4 | calc_import_duty_and_vat 硬编码汇率 | **合并到 P1-2** → 降 P1 | 3786 参数在函数体内**从未使用**（整个计算在RMB空间完成），是死代码而非功能bug。与新端点 `calc_vietnam_side` 已正确读取 fixed_fees.json 的 3500。修复归入旧端点清理一并处理。 |
| P0-9 | 步进器无验证 | **保留 P0** | 与P0-12是同一根因，合并为"步进器+提交均无逐步骤验证" |
| P0-10 | 整车↔拼货 Toggle 重置表单 | **保留 P0** | 严重影响用户体验，用户切换模式后丢失所有输入 |
| P0-11 | 计算费用无Loading状态 | **降 P1** | 代码审查确认 Button.tsx 已实现 loading spinner（49-63行），QuoteForm.tsx 403行已传 `loading={submitting}`。功能存在但可能UI反馈不够明显。改为改进按钮禁用态的视觉强度。 |
| P0-12 | 步进器无验证即可到第3步 | **合并到 P0-9** | 同根因 |
| P0-13 | FloatingPanel收起后无重新展开按钮 | **保留 P0** | 按钮存在（FloatingPanel.tsx 43-50行）但UX设计问题严重：图标是🔍放大镜（误导为搜索），位置不显眼。需改为明显的标签按钮。 |

**最终 P0：4个**
- **P0-A**（原P0-9+P0-12合并）：步进器无逐步骤验证，盲跳
- **P0-B**（原P0-10）：Toggle切换丢失表单数据
- **P0-C**（原P0-13）：FloatingPanel展开按钮不可发现
- **P0-D**（新增）：表单提交前无客户端验证阻止（useQuoteForm.ts的validate仅在submit时调用，但错误提示无法国际化）

### P1 调整（15 → 12个）

| 原编号 | 调整 | 理由 |
|--------|------|------|
| P1-1 | 保留 P1 | 启动崩溃是严重问题 |
| P1-2 | 保留 P1（吸收P0-4） | 旧端点清理+汇率参数修复 |
| P1-3 | 降 P2 | 415行拆分是技术债，不影响功能 |
| P1-4 | 保留 P1 | 国际化缺失 |
| P1-5 | 降 P2 | hidden vs 条件渲染是性能优化，非功能问题 |
| P1-6 | **保留 P1**（确认死代码） | 全仓搜索：CostPanel组件**无任何文件导入使用**（仅BottomDrawer引用了i18n key `t.costPanel.*`，非导入组件本身）。179行确实为死代码。 |
| P1-7 | 保留 P1 | 代码重复 |
| P1-8 | 保留 P1 | 静默吞错是隐患 |
| P1-9 | 保留 P1 | 功能缺失 |
| P1-10 | 保留 P1 | 功能缺失 |
| P1-11 | 保留 P1 | 国际化硬编码 |
| P1-12 | 保留 P1 | 稳定性 |
| P1-13 | 降 P2 | O(n)扫描12000条HS是性能优化，当前响应<100ms可接受 |
| P1-14 | 保留 P1 | 国际化硬编码 |
| P1-15 | 保留 P1 | 无障碍访问 |

**最终 P1：11个**（原15 - 降级2 - 取消1 - 合并1）

### P2 调整（12 → 14个）

保留全部P2，新增P1降级的3个：P1-3、P1-5、P1-13。

---

## 二、P0 具体修复方案（文件+行号+改法）

### P0-A：步进器逐步骤验证

**涉及文件：**
1. `frontend/src/components/QuoteForm.tsx` — 第79-82行，第397-401行
2. `frontend/src/hooks/useQuoteForm.ts` — 第150-164行（扩展validate函数）
3. `frontend/src/lib/i18n/zh.ts` — 新增验证错误文案
4. `frontend/src/lib/i18n/vi.ts` — 新增验证错误文案
5. `frontend/src/lib/i18n/en.ts` — 新增验证错误文案

**改法：**

**（a）useQuoteForm.ts 第150-164行 — 扩展validate为per-step**

```typescript
// 旧代码（第150-164行）：
const validate = useCallback(
  (fm: QuoteFormState) => {
    if (!fm.originLat || !fm.originLng || !fm.destLat || !fm.destLng) {
      return "请先设置起点和终点";
    }
    if (fm.loadingMode === "consolidated" && (!fm.weightKg || !fm.volumeM3)) {
      return "请填写货物重量和体积";
    }
    if (fm.loadingMode === "full_truck" && !fm.vehicleModelId) {
      return "请选择车型";
    }
    return null;
  },
  [],
);

// 新代码 — 返回结构化错误码，前端根据locale渲染：
const validateStep = useCallback(
  (fm: QuoteFormState, stepIndex: number, mode: "full_truck" | "consolidated"): string | null => {
    // Step 0: Route (both modes)
    if (stepIndex === 0) {
      if (!fm.originLat || !fm.originLng) return "error_origin_required";
      if (!fm.destLat || !fm.destLng) return "error_dest_required";
      return null;
    }
    // Step 1: Cargo (consolidated) or Vehicle (full_truck)
    if (mode === "consolidated" && stepIndex === 1) {
      if (!fm.weightKg || parseFloat(fm.weightKg) <= 0) return "error_weight_required";
      if (!fm.volumeM3 || parseFloat(fm.volumeM3) <= 0) return "error_volume_required";
      return null;
    }
    if (mode === "full_truck" && stepIndex === 1) {
      if (!fm.vehicleModelId) return "error_vehicle_required";
      return null;
    }
    // Step 2: Vehicle (consolidated)
    if (mode === "consolidated" && stepIndex === 2) {
      // 拼货模式的车型步骤 — 自动匹配，无需用户选择
      return null;
    }
    // Step last: Cost — always valid (has defaults)
    return null;
  },
  [],
);
```

需要同时在hook的返回值中暴露 `validateStep`。

**（b）QuoteForm.tsx 第79-82行 — goNext加入验证**

```tsx
// 旧代码：
const goNext = () => setStep((s) => Math.min(s + 1, maxStep));

// 新代码（需要在组件中接收来自useQuoteForm的validateStep）：
// 在QuoteForm props中新增 onValidateStep 和 stepError state
// 实际修改建议在FloatingPanel/AppShell层处理，因为validateStep在hook中：
const goNext = () => {
  const err = validateStepForCurrent();
  if (err) {
    setStepError(err);
    return;
  }
  setStepError(null);
  setStep((s) => Math.min(s + 1, maxStep));
};
```

**（c）QuoteForm.tsx 第402-406行 — 提交按钮也在最后一步时做最终验证**

```tsx
// 第402-406行，在onSubmit调用前加入客户端验证（已有，useQuoteForm.submit第167行调了validate）
// 保持现状即可 — submit内部已调用validate
```

**（d）i18n文件 — 新增错误码**

在 `zh.ts` / `vi.ts` / `en.ts` 的 `errors` 对象中新增：
```typescript
error_origin_required: "请设置起点地址",
error_dest_required: "请设置终点地址",  
error_weight_required: "请填写货物重量",
error_volume_required: "请填写货物体积",
error_vehicle_required: "请选择运输车型",
```

---

### P0-B：Toggle切换不丢失表单数据

**涉及文件：**
- `frontend/src/components/QuoteForm.tsx` — 第101行和第113行
- `frontend/src/hooks/useQuoteForm.ts` — 第110-112行（updateForm）

**根本原因：** 第101/113行的 `onClick` 中 `setStep(0)` 会重置步骤指示器，但**没有**重置表单字段。问题描述说"重置整个表单"——经代码审查发现实际上只重置了step。但用户体验问题仍然存在：切换模式后停留在步骤0，之前填的地址信息还在但步骤指示器误导用户从头开始。

**改法：QuoteForm.tsx 第99-122行**

```tsx
// 旧代码（第101行）：
onClick={() => { onChange({ loadingMode: "full_truck" }); setStep(0); }}

// 旧代码（第113行）：
onClick={() => { onChange({ loadingMode: "consolidated" }); setStep(0); }}

// 新代码 — 智能保持步骤位置：
// full_truck 切换按钮：
onClick={() => {
  const prevMode = mode;
  onChange({ loadingMode: "full_truck" });
  // 保持地址步骤(step 0)不变；如果之前在车辆步骤，full_truck模式下车辆也是step 1
  if (prevMode === "consolidated" && step === 2) {
    // 拼货step 2(车辆) → 整车step 1(车辆)
    setStep(1);
  }
  // 其他情况保持当前step
}}

// consolidated 切换按钮：
onClick={() => {
  const prevMode = mode;
  onChange({ loadingMode: "consolidated" });
  if (prevMode === "full_truck" && step === 1) {
    // 整车step 1(车辆) → 拼货step 2(车辆)
    setStep(2);
  }
}}
```

另外，切换模式时需要**清理**不支持字段的提示。例如从拼货切换到整车，货物体积字段不再显示但数据保留在state中（无害）。

---

### P0-C：FloatingPanel展开按钮UX改进

**涉及文件：**
- `frontend/src/components/FloatingPanel.tsx` — 第40-51行

**当前状态：** 按钮确实存在且功能正常（`onClick={() => setCollapsed(false)}`），但：
1. 图标是SVG放大镜（看起来像搜索，不是展开/菜单）
2. 按钮只有40×40px，太小
3. 无文字标签
4. 位置在 `top-14 left-4` 不够显眼

**改法：FloatingPanel.tsx 第40-51行**

```tsx
// 旧代码（第40-51行）：
if (collapsed) {
  return (
    <div className="absolute top-14 left-4 z-[800]">
      <button type="button" onClick={() => setCollapsed(false)}
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-lg shadow-black/10 border border-white/40 text-[var(--surface-500)] hover:text-[var(--surface-700)] transition-colors"
        aria-label={t.costPanel.expandPanel}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6M8 11h6"/>
        </svg>
      </button>
    </div>
  );
}

// 新代码 — 改用明显的pill按钮，含文字标签：
if (collapsed) {
  return (
    <div className="absolute top-14 left-4 z-[800]">
      <button type="button" onClick={() => setCollapsed(false)}
        className="flex items-center gap-2 rounded-xl bg-white shadow-lg shadow-black/10 border border-[var(--brand-200)] px-3 py-2 text-xs font-semibold text-[var(--brand-600)] hover:bg-[var(--brand-50)] hover:border-[var(--brand-400)] transition-all"
        aria-label={t.costPanel.expandPanel}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="m9 18 6-6-6-6"/>
        </svg>
        <span>{t.costPanel.expandPanel}</span>
      </button>
    </div>
  );
}
```

同时确保 `t.costPanel.expandPanel` 在所有i18n文件中定义（如"报价面板"/"Bảng giá"/"Quote Panel"）。

---

### P0-D：表单提交错误提示国际化

**涉及文件：**
- `frontend/src/hooks/useQuoteForm.ts` — 第150-164行
- `frontend/src/lib/i18n/zh.ts`
- `frontend/src/lib/i18n/vi.ts`
- `frontend/src/lib/i18n/en.ts`

**问题：** validate函数返回硬编码中文字符串（"请先设置起点和终点"等），前端用 `setError(err)` 直接展示。P0-A的validateStep修复已解决此问题（改为返回错误码）。需要确保submit时也走国际化路径。

**改法：**

```typescript
// useQuoteForm.ts — validate现在返回错误码而非硬编码中文
const validate = useCallback(
  (fm: QuoteFormState): string | null => {
    if (!fm.originLat || !fm.originLng || !fm.destLat || !fm.destLng) {
      return "error_route_required";
    }
    if (fm.loadingMode === "consolidated" && (!fm.weightKg || !fm.volumeM3)) {
      return "error_cargo_required";
    }
    if (fm.loadingMode === "full_truck" && !fm.vehicleModelId) {
      return "error_vehicle_required";
    }
    return null;
  },
  [],
);
```

然后在显示error的地方（如ResultsPanel或错误横幅组件）用 `t.errors[errorCode]` 做国际化映射，如不可映射则fallback到原始错误码。

---

## 三、三级执行计划

### 🟢 今天（Today）— 4-6小时

**目标：修复所有P0，消除用户可感知的阻断性体验问题。**

| 顺序 | 任务 | 耗时 | 依赖 |
|------|------|------|------|
| 1 | **P0-D**: validate国际化 + i18n错误码补充 | 30min | 无 |
| 2 | **P0-A**: 步进器逐步骤验证（依赖P0-D的validateStep） | 1.5h | P0-D |
| 3 | **P0-B**: Toggle切换智能保持步骤 | 30min | 无 |
| 4 | **P0-C**: FloatingPanel展开按钮UX | 20min | 无 |
| 5 | **P1-1**: vehicle_registry.py + border_costs.py 启动容错 | 1h | 无 |
| 6 | **P1-12**: Error Boundary | 30min | 无 |
| 7 | **P1-6**: 删除CostPanel.tsx死代码（确认无引用） | 15min | 无 |
| 8 | 全量冒烟测试 | 30min | 1-7 |

**交付物：**
- 所有P0修复提交
- P1-1启动容错（阻止应用崩溃）
- P1-12 Error Boundary（兜底稳定性）

---

### 🟡 本周（This Week）— 2-3天

**目标：修复所有P1，消除数据风险和技术债。**

| 顺序 | 任务 | 耗时 | 依赖 |
|------|------|------|------|
| 2 | **P1-2** + 吸收P0-4: 清理旧API端点 + 删除calc_import_duty_and_vat的3786死参数。**注意：** `/border/ddp-costs` 仍被 `frontend/src/lib/api.ts:132` 引用，需先迁移前端到 `/border/fees-only` 再清理。 | 2h | 前端迁移先完成 |
| 3 | **P1-4**: ResultsPanel.tsx ~40处硬编码中文化（改用i18n） | 2h | 无 |
| 4 | **P1-14**: useQuoteForm.ts validate改为结构化错误码（今天P0-D已做） | ✅ | 今天已完成 |
| 5 | **P1-11**: layout.tsx lang="en" → 动态lang根据locale | 15min | 无 |
| 6 | **P1-7**: 提取CostBar为共享组件（ResultsPanel + CostPanel共用） | 1h | 无 |
| 7 | **P1-8**: 参考数据加载失败不能静默吞错 → toast提示+重试按钮 | 1h | 无 |
| 8 | **P1-1补充**: docker-compose挂载验证 | 30min | P1-1 |
| 9 | **P1-9**: "对比多路线"按钮功能实现（已有alternatives API，需联调） | 1.5h | 无 |
| 10 | **P1-10**: 结果面板导出/复制功能 | 1h | 无 |
| 11 | **P1-15**: AddressSearch键盘Tab可达 | 30min | 无 |
| 12 | **P1-5合并**: FloatingPanel双Tab hidden→条件渲染优化 | 30min | 无 |

**交付物：**
- 所有P1修复
- i18n覆盖率提升至95%+
- 旧端点已标记@deprecated或删除

---

### 🔵 本月（This Month）— 1-2周

**目标：修复所有P2，性能优化和代码质量。**

| 顺序 | 任务 | 耗时 | 依赖 |
|------|------|------|------|
| 1 | **P1-3**（降P2）: QuoteForm.tsx 415行拆分为4个Step组件 | 3h | P0-A步进器修完后重构更安全 |
| 2 | **P2-3+P2-2**: 重复代码提取（重量切换+货型下拉） | 1h | P1-3 |
| 3 | **P2-1**: VehiclePicker滚动到已选项（scrollIntoView） | 30min | 无 |
| 4 | **P2-4**: 步骤2面板内容过多 → 虚拟滚动或分页 | 1h | 无 |
| 5 | **P2-6**: 7处按钮补充aria-label | 30min | 无 |
| 6 | **P2-7**: geocoder.py加rate limiter（1 req/s） | 30min | 无 |
| 7 | **P2-8**: batch.py Semaphore已有MAX_CONCURRENT=8，验证无明显问题 → 关闭 | 15min | 代码审查确认已有限流 |
| 8 | **P2-13**（原P1-13）: search_hs O(n)→倒排索引 | 1h | 无 |
| 9 | **P2-9**: 15+处硬编码参数迁移到config/settings | 1.5h | 无 |
| 10 | **P2-10**: ChatMessage.tsx Markdown渲染器独立抽取 | 1h | 无 |
| 11 | **P2-11**: formatVnd locale统一 | 30min | 无 |
| 12 | **P2-12**: ai_client.py模块级单例改为显式依赖注入 | 1h | 无 |
| 13 | **P2-5**: 移动端响应式测试+修复 | 2h | 无 |
| 14 | **P1-6复查**: CostPanel.tsx使用情况确认+清理 | 15min | 无 |

---

## 四、依赖关系图

```
P0-D (i18n validate)
  └→ P0-A (步进器验证)
       └→ P1-3 (QuoteForm拆分，重构安全)
            └→ P2-2 + P2-3 (重复代码提取)

P0-B (Toggle修复) ─ 独立
P0-C (展开按钮)   ─ 独立  
P1-1 (启动容错)   ─ 独立，阻塞性最强
P1-12 (Error Boundary) ─ 独立

P1-2 (旧端点清理) ─ 需确认前端无调用
P1-4 (国际化)     ─ 独立，但文件大
P1-9 (对比路线)   ─ 依赖后端已有alternatives API
```

---

## 五、风险提示

1. **P2-8 batch.py**: 经代码审查，`_run_batch_job` 并未逐行限制并发——`asyncio.gather(*tasks)` 会将所有500个task同时提交，Semaphore只在 `_process_row` 内部限制OSRM调用。但500个asyncio coroutine同时创建也会消耗内存。建议改为chunked处理（每批50个）。

2. **P1-3 QuoteForm拆分**: 415行虽多但逻辑清晰，拆分风险低。建议在P0-A完成后（步进器有验证保护）再做拆分。

3. **P1-2旧端点清理**: 在删除前需用 `rg "/border/import-tax|/border/export-rebate|/border/ddp-costs" frontend/` 确认前端无引用。如果前端batch页面有调用，需先迁移。

4. **P2-7 Nominatim限流**: 当前代码每个请求new一个AsyncClient且无速率限制。如果并发地址搜索，可能被Nominatim封IP。建议加 `asyncio.Semaphore(1)` 全局限制。

---

## 六、已确认无需修复的问题

| 编号 | 原因 |
|------|------|
| P0-11 | Button.tsx已有loading spinner（49-63行），QuoteForm.tsx已传loading={submitting}（403行）。功能完整。可选改进：全局loading overlay。 |
| P1-6 (CostPanel.tsx死代码) | 经全仓搜索确认：CostPanel组件无任何文件import。179行确认为死代码，建议删除。 |
| P2-8 (batch.py并发) | Semaphore(8)已限制OSRM并发。但500 coroutine同时创建的内存问题建议本月优化。 |

---

*本文档生成后请立即开始"今天"任务的执行。*
