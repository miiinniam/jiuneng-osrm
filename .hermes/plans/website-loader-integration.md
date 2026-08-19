# 玖能官网整合 3D 装载工具 — 设计文档

> 版本: v1.0 · 2026-08-19 · 团队: @codex-01(拍板) @codex-02(搬运/adapter) @web-design-01(视觉) @codex-03(文档/验收)
> 状态: 已拍板（一期 iframe + 二期原生）

## 1. 背景与目标

用户需求：官网升级，把 **Carbox go 3D 货车装载规划工具** 与 **OSRM++ 报价工具** 统一融入玖能公司官网（jiuneng.space）。

- 项目根: `D:\01_业务\立三方\OSRM\OSRM++\`（2026-08 已迁移，旧路径 `D:\01_业务\玖能\OSRM` 已清空）
- Carbox: `D:\01_业务\立三方\Carbox go\carbox\`（独立静态工具）

## 2. 现状盘点（已核实）

| | OSRM++ | Carbox go |
|---|---|---|
| 技术 | Next.js 16 + FastAPI + 公共 OSRM + Leaflet | 纯静态: index.html + js/data.js, packer.js, ui.js, scene3d.js, main.js（THREE.js r128 + SheetJS 全 CDN） |
| 功能 | 官网 9 区块(三语) / `/quote` 4步报价 / `/batch` 批量 / `/cases/[id]` / AI 聊天(SSE) / 31 车型库 | 9 车型+自定义 / 货物 CRUD / 自动装载 4 策略 / 3D 拖拽(推挤/沉降/对齐) / 统计(装载率/重心/轴载/超重) / CSV 导入导出 / 撤销重做 / localStorage |
| 关键约束 | 三语 i18n 契约（types.ts + zh/vi/en 同步） | **数据层是确定性 AABB 内核**（CSV/统计/自动装载依赖）——绝不能动 |

## 3. 方案（@codex-01 已拍板）

- **一期（本次交付）**: iframe 嵌入 —— Carbox 原样搬进 `frontend/public/tools/loader/`，`/tools/loader` 页 iframe 套 AppShell 壳 + 官网首页「在线工具」双卡区块 + 互跳参数 adapter。
- **二期（后置）**: 原生 React 移植 —— 三语 UI、设计系统 token 化、车型库与后端 31 车型打通、`qty`/货物明细联动。

## 4. 一期落地明细

### 4.1 路由与页面
```
/tools/loader      → src/app/tools/loader/page.tsx（新）：AppShell 壳 + iframe（min-height ~900px）+ 壳层三语标题/返回条
/ 首页              → 核心业务下方新增「在线工具」区块：🚚 运费报价(→/quote) + 📦 3D 装载规划(→/tools/loader) 双卡
导航 NavBar         → 工具入口加 /tools/loader
```

### 4.2 静态搬运（@codex-02）
Carbox 整目录原样复制到 `frontend/public/tools/loader/`：
- `index.html` + `js/`（5 文件）+ `设计计划.md`（可不搬）+ `车头间隙预览.png`（可不搬）
- CDN 依赖（THREE.js/SheetJS）线上可用，无需本地化
- localStorage key 已命名空间化（`cargoPlanner.*`），与 jiuneng.space 全站 origin 隔离无冲突

### 4.3 互跳参数契约（一期）
- URL 契约: `/tools/loader?vehicle=<carbox_id>&qty=<n>`；`qty` 一期忽略（无货物明细无意义，二期接真实件明细）
- adapter（Carbox 内新增一小段静态 JS，读 `location.search`）:
  `URLSearchParams` 读 `vehicle=` → 查映射表 → 命中: `Planner.setTruck(id)`；未命中: 保持默认
- 一期只透传车型 id，**不透传尺寸**（Carbox 用自带预设内尺寸；OSRM++ 是外尺寸，口径不同）
- /quote 结果页「去 3D 装柜」CTA：按映射**条件渲染**（@web-design-01）——命中→品牌蓝实心按钮；未命中→不出现（避免死链）

### 4.4 映射表（OSRM++ model_id → Carbox id；@codex-02 基于 31 车型 CSV 实测）

| OSRM++ (31 库) | Carbox (9 车型) | 依据 |
|---|---|---|
| `container_40hc` | `40hq` | 40尺高柜 12.2m/28t 直配 |
| `container_40ft` | `40gp` | 40尺 12.2m 直配 |
| `container_20ft` | `20gp` | 20尺 6.1m 直配 |
| `flatbed_13m` | `13m` | ⚠️ 近似：13米厢式半挂 ≈ 平板 |
| `flatbed_12m5` | `12.5p` | 12.5米平板 直配 |
| `flatbed_low_17m5` | `17.5p` | 17.5m×3.0m，Carbox W=300 吻合 |
| `high_side_18t` | `9.6m` | ⚠️ 近似：9.6米同长，载重 18t vs 15t |
| `small_box_8t` | `6.8m` | 6.5m 尺寸最近（载重 8t<10t） |
| `small_box_3t5` | `4.2m` | 4.2m 同长 |

**无对应项**（高栏 5-25t / 冷链 40-50ft / 低平板 9.6-16m / 45尺）：CTA 不出现。
**⚠️ 两条最大近似点（二期原生优先修正）**：`flatbed_13m→13m`、`high_side_18t→9.6m`。一期接受，仅车型近似，装载内尺寸仍用 Carbox 预设。

### 4.5 视觉层设计（@web-design-01 出稿后回填）
- 工具页壳：AppShell 深蓝顶栏承接，iframe 内 Carbox 深色工程风一期原样可接受
- 首页双卡区块：品牌 token（navy `#001030` + 信号青 `#2080f8`），与现有 9 区块语言一致
- 条件渲染 CTA：命中映射→`?vehicle=` 跳转；未命中→不出现
- 二期 token 映射规范（深色工程风 → navy/brand-blue 体系）待补

## 5. 落地顺序（@codex-01 确认）

1. **基线 commit**（前置依赖，@codex-02 触发）：当前工作区 9 个未提交改动先入基线，避免与搬运混在一起
   ```bash
   cd "D:/01_业务/立三方/OSRM/OSRM++" && git add -A && git commit -m "baseline: 官网整合 3D 装载工具前工作区快照"
   ```
2. 静态搬运 Carbox → `frontend/public/tools/loader/` + adapter
3. 壳与双卡视觉稿（@web-design-01）→ 实现
4. iframe 接线（/tools/loader 页 + 导航 + 首页区块）
5. 实测：三车型 + 互跳

## 6. 验收清单

- [ ] 映射命中：`?vehicle=40hq` / `13m` / `17.5p` 等 → Carbox 车型正确切换（40HQ 1203×235×269）
- [ ] 映射未命中：报价结果 CTA 不出现
- [ ] 首页双卡区块渲染 + 导航入口；壳层三语正常
- [ ] iframe 高度 min-height 900px，无滚动穿透问题
- [ ] 回归：Carbox 推挤 9 场景 + 40HQ 600 件 ≈75.7% 基线（数据层零触碰）
- [ ] OSRM++ 原有链路：/quote /batch /cases AI 全绿
- [ ] 部署：`cd frontend && vercel --prod --yes`（GitHub 集成未连接，push 不触发部署）

## 7. 二期展望（后置，待拍板）

- 原生 React 移植 Carbox：三语 UI、设计系统 token 化
- 车型库与后端 31 车型打通（替换 9 预设）；优先修正 13m/9.6m 两条近似
- `qty`/货物明细联动：装载结果 ↔ 报价表单双向（`?vehicle=&items=`）
- 移动端适配（一期 iframe 移动端体验弱）
