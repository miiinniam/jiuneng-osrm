# 玖能官网 · 路线母题设计规格

- **日期**：2026-09-19
- **项目**：`D:\01_业务\立三方\货运一站式\OSRM++`（frontend）
- **范围**：官网首页视觉签名元素（**仅设计层**，不含 AI / 地图 查缺补漏）
- **状态**：设计已获批准，待实现

---

## 1. 背景与问题

首页现有 13 个线性图标、11 张实景图、8 处渐变装饰，但**没有任何一个元素能当"记忆点"**——整体读起来是一个干净的通用企业站，与同行无法区分。

同时，`凭祥友谊关 → 河内` 这条干线在文案里反复出现（表单占位符、AI 建议语、示例文本），**却没有任何视觉呈现**。这是品牌最有辨识度的资产，目前只存在于文字里。

### 已验证的事实基础

| 事实 | 数值 | 来源 |
|---|---|---|
| 路线几何可用 | GeoJSON LineString，2108 个坐标点 | `GET /api/v1/route/cost` → `route.geometry.coordinates`，后端已暴露（`backend/app/api/route.py:45,187`） |
| 干线里程 | 173.5972 km | 同上 |
| 干线时长 | 2.4057 h（调整后 2.7666 h） | 同上 |
| 简化后点数 | 159 点（tol=0.0005，压缩 92.5%） | Douglas-Peucker 实测 |
| 地理跨度 | 0.9427° 经 × 0.9561° 纬（**0.99:1，近正方形**） | 实测 |
| 主轴倾角 | 45.6°（西南向对角线） | PCA 实测 |
| 旋转转正后长宽比 | **7.76 : 1**（横向曲线） | 实测 |
| 等比缩放落点 | 目标 1200×200 → 实占 1180×152，**横向撑满** | 实测；1200×120 只占 776px（65%），不可用 |

> **关键约束**：路线地理形状近正方形，**不能**直接塞进扁带。必须先按主轴旋转 45.6° 转正，再做等比缩放（禁止非等比拉伸，否则失去真实形状特征）。

---

## 2. 目标与非目标

### 目标
1. 建立**唯一且抄不走**的视觉签名：同一条真实中越干线以 4 种形态贯穿全站。
2. 让"玖能 = 这条中越干线"形成记忆绑定，区别于通用物流站。
3. 保持现有品牌系统不变（`--navy #001030` / `--blue #0040c0` / `--cyan #2080f8` / `--cyan-on-dark #4da3ff`，IBM Plex Sans，字重 300 排版）。

### 非目标（本次明确不做）
- 不做报价联动（跑完报价后 hero 线变成该次真实路线）——**已评估，列为第二阶段**。
- 不改 AI 功能、不改地图功能（`MiniMap` / `MapView` 的硬编码中文、OSM 署名、配色不一致等问题属于独立规格）。
- 不重构 section 顺序与内容。
- 不引入新依赖（无地图库、无动画库、无几何库）。

---

## 3. 签名元素设计

**签名元素** = `凭祥友谊关 → 河内` 的真实路线，以 4 种形态贯穿全站。

### 3.1 形态一：Hero 干线带

位置：hero 文案区（左文案 / 右三合一工作台）**下方**，全宽，StatsBar **上方**。

- 画布 `viewBox="-190 0 1540 168"`，`preserveAspectRatio="xMidYMid meet"`（**保持形状，禁止拉伸**）。
- **容器必须锁定比例**：`aspect-ratio: 1540 / 168`。这是防变形的关键——若只固定高度而宽度随视口变化，SVG 会被纵向拉伸，路线形状失真。
- **左右各留 190 单位侧栏给端点标签**（实现时新增，原因见下）：
  实测路线在 `x=1080~1100` 处陡降（y 从 22 掉到 136），右端整条竖直方向被占满——
  「终点标签居中于端点」压线 26 处，上下偏移 ±8~14 全部压线，**全宽搜索无任何可用位置**。
  故把路线收进 viewBox 中间（x 7~1153 落在 -190~1350 内），标签放侧栏，
  与路线在**水平方向完全不重叠**，零碰撞。侧栏宽度按最宽语言（英文
  `Pingxiang · Friendship Pass` ≈ 161 单位）留足 190。
- 路线描边：`stroke-width 2.6`，`stroke-linecap/linejoin: round`，线性渐变（`#2080f8 @0.3` → `#4da3ff @0.98` @50% → `#2080f8 @0.38`）。
- 两端点：`r=6`，`fill:#001030`，`stroke:#4da3ff`，`stroke-width:2.8`。**两端处理必须一致**。
- 光点：`r=3.4` 白色实心 + `r=10` `#4da3ff` 光晕（`opacity .2`），沿路径 `animateMotion`，周期 **9s**，`repeatCount="indefinite"`。
- 端点标签：左侧「起点 · 中国 / 凭祥 · 友谊关」，右侧「终点 · 越南 / 河内」。
- **标签必须锚定到端点坐标**（`TRUNK_ROUTE.start` / `.end`），而不是固定在容器顶部——原型效果图里标签浮在端点上约 120px，指向不明（见 §9 缺陷 2）。
- **窄屏（<768px）改用「带下方一行」**：侧栏按比例缩小后 390px 下仅 43px 宽，
  标签被迫折成 3 行 80px 高，而带只有 38px 高（实测超出上下 13.5 / 28.3px）。
  故 <768px 时侧栏标签隐藏，改为带下方一行（起点 / 里程 / 终点三栏），
  里程也随之移出带内（38px 高的带放不下 23px 数字而不压线）。
- 端点贴近带下沿时（768px 右端点 y=83%）标签会溢出容器（实测 3.4px），
  用 `top: clamp(18px, <pct>%, calc(100% - 18px))` 夹住，位置仍锚定端点。
- 中上：大号 `173.6`（`font-size 23px`，`font-weight 300`，`tabular-nums`）+ 副标「km · 中越陆运干线」。

### 3.2 形态二：贯穿 Spine

位置：hero 之后、footer 之前的所有 section 左缘。

- 一条 2px 竖线，`background: #e3ebf5`（浅色）/ `rgba(255,255,255,.14)`（深色底 section）。
- 其上叠加同位置的填充线 `linear-gradient(180deg, #2080f8, #4da3ff)`，高度 = 滚动进度。
- 实现：单一绝对定位元素挂在包裹容器上，**不是每个 section 各画一段**（避免接缝）。

### 3.3 形态三：站点圆点

- 每个 section 起始位置一个 `11×11` 圆点：`background:#fff`，`border:2px solid #2080f8`。
- 已滚过的 section 圆点实心：`background:#2080f8`。
- **不带里程标签、不带阶段命名**（已评估：11 个 section 对 4 个自然运输阶段属强行映射，会显刻意）。

### 3.4 形态四：案例卡微缩角标

- 案例卡（`#cases` section）内，卡片右下角一个 `26×13` 的微缩路线 SVG。
- 描边 `#2080f8`，`stroke-width:1.5`。**与主带同源几何**（来自同一个 `bake-route.ts` 输出），但允许独立简化到约 40 点——26×13 尺寸下与 159 点版本肉眼无差异，而 DOM 体积降为 1/4。
- 旁附小字标签「友谊关 → 河内」（走 i18n）。

---

## 4. 架构与模块划分

按职责拆成 5 个单元，每个可独立理解与测试：

### 4.1 `frontend/src/lib/route/trunkRoute.ts`（纯数据，无依赖）

```ts
export interface TrunkRoute {
  /** 已烘焙的 SVG path（绝对坐标，适配 viewBox 1160×168） */
  path: string;
  /** 起点（友谊关）在 viewBox 内的坐标 */
  start: { x: number; y: number };
  /** 终点（河内）在 viewBox 内的坐标 */
  end: { x: number; y: number };
  /** 干线里程，用于展示；来自 OSRM，不硬编码于组件 */
  distanceKm: number;
  /** 原始几何点数，用于校验与文档 */
  sourcePointCount: number;
  /** 简化后点数 */
  pointCount: number;
}
export const TRUNK_ROUTE: TrunkRoute;
```

- **它做什么**：提供已烘焙好的路线数据。
- **怎么用它**：`import { TRUNK_ROUTE } from '@/lib/route/trunkRoute'`，读 `.path` / `.start` / `.end`。
- **它依赖什么**：无。纯常量，可在服务端与客户端使用。

### 4.2 `frontend/src/components/site/TrunkRouteBand.tsx`（服务端组件）

Hero 干线带。Props：

```ts
interface Props { className?: string }
```

- 渲染 `<svg viewBox="0 0 1160 168">` + 路径 + 端点 + 光点 + 标签。
- 标签文案通过 `t()` 取（组件接收当前语言或使用现有 i18n hook 模式）。
- **无状态、无副作用**，可在服务端渲染。

### 4.3 `frontend/src/components/site/RouteSpine.tsx`（客户端组件）

贯穿 spine + 滚动填充。

```ts
interface Props { children: React.ReactNode }
```

- 包裹 hero 与 footer 之间的所有 section。
- 挂载后注册**单个** rAF 节流的 scroll 监听。
- 进度计算：`progress = clamp((viewportCenter - wrapTop) / wrapHeight, 0, 1)`。
- **不通过 React state 传递进度**（避免每次滚动重渲染整页）——直接写 DOM 节点的 CSS 自定义属性 `--spine-fill`，由 CSS 消费。
- 卸载时移除监听。

### 4.4 `frontend/src/components/site/RouteBadge.tsx`（服务端组件）

案例卡微缩角标，`26×13`。

```ts
interface Props { className?: string }
```

### 4.5 `frontend/scripts/bake-route.ts`（构建时脚本，不进 bundle）

从 API 重新烘焙 `trunkRoute.ts`。

- 调用 `GET /api/v1/route/cost`（起点凭祥友谊关 `21.979744, 106.74761`，终点河内 `21.028501, 105.853875`）。
- 流程：取 geometry → 纬度校正（`× cos(lat)`）→ PCA 求主轴角 → 旋转转正 → 反向（使友谊关在左）→ Douglas-Peucker 简化（`tol=0.0005`）→ 等比缩放进 1160×168 → 输出 TS 常量。
- 输出前打印：原始点数 / 简化点数 / 长宽比 / 实占像素，便于人工确认没变形。

---

## 5. 数据流

```
构建时（一次性，可重跑）
  scripts/bake-route.ts
      → GET /api/v1/route/cost（真实 OSRM geometry）
      → 简化 + 旋转 + 等比缩放
      → 写入 lib/route/trunkRoute.ts（TS 常量）

运行时（零网络请求）
  page.tsx
      → <TrunkRouteBand />          读 TRUNK_ROUTE.path
      → <RouteSpine>                读 TRUNK_ROUTE（圆点/spine）
          └── section × N
      → <RouteBadge />（案例卡）    读 TRUNK_ROUTE.path（同源几何）
```

**关键性质**：运行时**不调用任何 API**。页面加载零额外请求，路线形状不依赖后端可用性，首屏无闪烁。

---

## 6. 错误处理与降级

| 场景 | 行为 |
|---|---|
| `prefers-reduced-motion: reduce` | 光点动画停止；spine 填充固定为 100%（静态实线）；**路线本身始终渲染**——绝不出现"动画失效导致内容消失" |
| JS 未执行 / 爬虫 / 截图工具 | spine 与圆点由 CSS 静态渲染（`--spine-fill` 有 CSS 默认值），路线为纯 SVG 静态内容，**全部可见** |
| 窄屏 < 768px | spine 与圆点隐藏（避免内容内缩挤压）；干线带等比缩小，端点标签允许换行，173.6 副标缩短 |
| 烘焙数据缺失 | 构建期类型检查会失败（`TRUNK_ROUTE` 为必需导出），不会静默出空白 |
| 路线形状异常（点数过少） | `bake-route.ts` 在点数 < 40 时报错退出，不写入 |

---

## 7. 国际化

新增 i18n key（`zh` / `vi` / `en` 三语齐全）：

| key | zh | vi | en |
|---|---|---|---|
| `route.startSub` | 起点 · 中国 | Điểm đi · Trung Quốc | Origin · China |
| `route.startName` | 凭祥 · 友谊关 | Bằng Tường · Hữu Nghị | Pingxiang · Friendship Pass |
| `route.endSub` | 终点 · 越南 | Điểm đến · Việt Nam | Destination · Vietnam |
| `route.endName` | 河内 | Hà Nội | Hanoi |
| `route.distanceCaption` | km · 中越陆运干线 | km · tuyến bộ Trung–Việt | km · China–Vietnam trunk |
| `route.badgeLabel` | 友谊关 → 河内 | Hữu Nghị → Hà Nội | Friendship Pass → Hanoi |

`distanceKm` 数值来自烘焙数据，不写死在文案里。

---

## 8. 可访问性

- 干线带 SVG 标 `aria-hidden="true"`（纯装饰），但**里程数字 173.6 用可读文本节点**，屏幕阅读器可读到。
- 路线不承载唯一信息（所有关键信息在文案里已有等价表述），因此装饰化处理不造成信息丢失。
- spine 与圆点为纯装饰，`aria-hidden="true"`，不进入 tab 序列。
- 对比度：深色底上的标签用 `--cyan-on-dark #4da3ff`（对深蓝 6.4:1，达 WCAG AA），**不用** `--cyan #2080f8`（4.44:1，不达标）。

---

## 9. 效果图复核发现的缺陷（实现时必须修掉）

原型效果图经视觉复核，发现以下问题：

1. **副标被路线划穿**：「km · 中越陆运干线」直接压在路线上，文字与线互相干扰。→ 给副标加底板或增大与路线的垂直间距。
2. **端点标签与圆点脱节**：右侧标签浮在端点上方约 120px，指向不明。
   → **已修**：标签锚定到端点坐标并垂直居中于圆点，CDP 实测 Δy = 0.1px（1440px）/ 0.0px（768px）。
   实现见 §3.1 的侧栏方案（原计划的硬编码 `labelY = 30` 未锚定端点，是本次缺陷的根因）。
3. **单位与数字脱节**：大号 173.6 第一眼读不出单位。→ 单位与数字同行或紧邻。
4. **右端拥挤**：陡降段贴近卡片右缘与 StatsBar 分隔线。→ 增加右侧内边距。
5. **起点标记重复**：空心环与实心点并排，两端处理不一致。→ 统一为单点，光点初始位置与端点重合时不产生视觉重影。

---

## 10. 测试策略

### 单元测试
- `trunkRoute.ts`：`path` 以 `M` 开头、段数 == `pointCount`、`start`/`end` 落在 `0..1160` / `0..168` 内、`pointCount >= 40`。
- `bake-route.ts` 的纯函数（简化、旋转、缩放）：给定已知输入，输出点数与包围盒符合预期。

### 视觉 / 集成测试（CDP，4 个断点）
在 375 / 390 / 768 / 1440 四档验证：
- `scrollWidth === clientWidth`（无横向溢出）。
- 干线带 SVG 存在且 `getBoundingClientRect().width > 0`。
- 路线路径长度 > 0（`getTotalLength()`）。
- 端点标签元素可见（`display !== 'none'` 且尺寸 > 0）。
- `prefers-reduced-motion` 下：路线仍渲染（路径长度 > 0），光点动画不运行。

> 方法学要求：窄视口（< 700px）**必须**走 CDP 读取矩形，禁止用 `--window-size` 截图判断布局（该方式算出的布局宽大于截图宽，会产生假性裁切）。

### i18n 测试
切换 zh / vi / en，断言端点标签与角标文案随语言变化，且无中文残留（vi / en 下）。

---

## 11. 验收标准

1. 首页 hero 在 1440px 下显示完整干线带：真实形状路线 + 两端点 + 光点沿路径移动 + 173.6 km。
2. 路线形状**可辨认**为蜿蜒曲线（非直线、非对称装饰弧），端点分别位于最左与最右。
3. 滚动页面时 spine 填充高度单调增长，滚到底为 100%。
4. 案例卡显示 26×13 微缩角标，形状与主带同源。
5. 375px 下无横向溢出，spine 隐藏，干线带不挤压内容。
6. `prefers-reduced-motion: reduce` 下路线可见、无动画。
7. 三语切换端点标签正确，vi/en 下无中文残留。
8. 运行时零 API 请求（Network 面板确认首页无 `/route/cost` 调用）。
9. `npx tsc --noEmit` 与 `next build --webpack` 通过。

---

## 12. 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 路径 159 段 × 全站多处复用导致 DOM 体积增大 | 首屏 HTML 变大 | 主带完整渲染；spine 与角标用同一 path 的简化版（角标可再简化到 ~40 点，26×13 下肉眼无差异） |
| 深色/浅色 section 交替时 spine 颜色不统一 | 视觉断裂 | spine 颜色按 section 背景切换（深色底用 `rgba(255,255,255,.14)`），在实现时逐段核对 |
| `animateMotion` + `mpath` 在 Safari 的行为差异 | 光点不动或位置错 | 光点动画是**增强**，非信息载体；不动时路线与端点仍完整。实现后在 Safari 实测一次 |
| 烘焙数据与后端真实路线漂移 | 展示里程与实际不符 | `bake-route.ts` 可重跑；`distanceKm` 从烘焙输出读取而非手写 |
| 本机 Turbopack 构建失败（**预存在**） | 无法用 `next build` 验证 | 用 `next build --webpack`；Vercel 侧需另行确认 |

---

## 13. 已排除的方案（决策记录）

| 方案 | 排除理由 |
|---|---|
| 只在 Hero 放一条带 | 签名元素靠**重复**成立；只在首屏出现一次的图滚两屏即被遗忘，达不到记忆点目标 |
| 每个 section 命名成运输阶段（起点→报关→干线→交付） | 11 个 section 对 4 个自然阶段属强行映射，显刻意 |
| 滚动位置映射为里程（0 → 173.6 km） | 里程与内容无真实对应关系，编造假数据 |
| 手绘 stylized 曲线 | 放弃真实几何这一最强论点；形状失去唯一性 |
| 运行时拉取 geometry | 干线路线是常量，无"实时"必要；徒增首屏请求与失败面 |
| 工业材质母题（集装箱瓦楞 / 限高杆条纹） | 任何物流公司都能用，记忆点弱；且与已定稿的细字重排版气质冲突 |
| 数据仪表母题（大号数字阵列） | 与现有 StatsBar 功能重复，且偏"金融仪表盘"气质 |
| 非等比拉伸以适配扁带 | 严重变形，失去真实形状特征（实测 0.99:1 → 8:1 会退化成近直线） |
