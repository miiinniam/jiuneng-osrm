# 路线母题（Route Motif）实现计划

> **For implementer:** Use TDD throughout. Write failing test first. Watch it fail. Then implement.
>
> 规格来源：`docs/superpowers/specs/2026-09-19-route-motif-design.md`

**Goal:** 把「凭祥友谊关 → 河内」的真实 OSRM 路线几何做成贯穿全站的视觉签名元素，让官网从"通用企业站"变成有唯一记忆点的品牌资产。

**Architecture:** 构建时把真实路线几何烘焙成 TS 常量（简化 + 旋转转正 + 等比缩放），运行时零 API 请求。同一几何以 4 种形态复用：hero 干线带、左缘贯穿 spine、section 站点圆点、案例卡微缩角标。纯函数与数据分离，纯函数可独立单测。

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · TailwindCSS 4 · 原生 SVG + `animateMotion`（无动画库）· **Node 内置测试运行器**（`node:test` + `--experimental-strip-types`，零新增依赖）

---

## 前置约束（实现者必读）

1. **测试零依赖**：本项目**没有** vitest/jest/testing-library，且规格 §2 明确"不引入新依赖"。已实测：Node v22.23.2 的 `node --test --experimental-strip-types` 可直接跑 `.test.ts`（失败退出码 1，通过退出码 0）。**不要安装任何测试框架。**
2. **TS 导入必须带扩展名**：strip-types 模式不解析 `@/` 别名，测试与被测的纯函数模块之间用相对路径 + `.ts` 后缀（如 `from "./geometry.ts"`）。组件（`.tsx`）不走 Node 测试，用 CDP 验证。
3. **构建命令**：本机 Turbopack 构建失败（**预存在**，与本次改动无关），必须用 `npx next build --webpack`。
4. **禁止非等比拉伸**：路线地理形状近正方形（0.99:1），必须旋转 45.6° 转正后再等比缩放。容器锁 `aspect-ratio: 1160 / 168`。
5. **动画失效不能导致内容消失**：`prefers-reduced-motion` 下光点停、spine 静态，但**路线本身必须始终渲染**。

---

## Task 0: 建立零依赖测试入口

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/tsconfig.json`

**Step 1: 启用 .ts 后缀导入（必需，否则 `tsc --noEmit` 会失败）**

`node --experimental-strip-types` 要求 import 带 `.ts` 后缀，但项目 `tsconfig.json` 的 `include` 是 `["**/*.ts", ...]`，**会覆盖测试文件**，而 `allowImportingTsExtensions` 未开启 → 报 `TS5097`。

在 `tsconfig.json` 的 `compilerOptions` 中 `"esModuleInterop": true,` 之后插入：

```json
    "allowImportingTsExtensions": true,
```

> **为什么安全**：该选项要求 `noEmit` 或 `emitDeclarationOnly`，而项目已设 `"noEmit": true`，满足前置条件。
> **已实测**：开启后 `tsc --noEmit` exit 0；关闭则报 `TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled`。

**Step 2: 添加 test 脚本**

在 `"scripts"` 中 `"lint": "eslint"` 之后插入：

```json
    "test": "node --test --experimental-strip-types src/lib/route/geometry.test.ts src/lib/route/trunkRoute.test.ts"
```

**Step 3: 验证脚本可调用（此时测试文件尚不存在，预期失败）**

Command: `cd frontend && npm test`
Expected: 非零退出，报错提示找不到测试文件。**这是预期的**——Task 1 会创建它们。

**Step 4: 验证 tsconfig 改动未破坏现有类型检查**

Command: `cd frontend && npx tsc --noEmit`
Expected: exit 0

**Step 5: Commit**

```bash
git add frontend/package.json frontend/tsconfig.json && git commit -m "chore: 零依赖测试入口（node:test + strip-types）+ 允许 .ts 后缀导入"
```

---

## Task 1: 几何纯函数模块

**Files:**
- Create: `frontend/src/lib/route/geometry.ts`
- Test: `frontend/src/lib/route/geometry.test.ts`

### Step 1: 写失败测试

创建 `frontend/src/lib/route/geometry.test.ts`：

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  perpendicularDistance,
  simplify,
  principalAngle,
  rotate,
  fitToBox,
  toPath,
  type Pt,
} from "./geometry.ts";

test("perpendicularDistance: 点到水平线段的正交距离", () => {
  assert.equal(perpendicularDistance([1, 3], [0, 0], [5, 0]), 3);
});

test("perpendicularDistance: 退化线段（两端重合）时退化为点距", () => {
  assert.equal(perpendicularDistance([3, 4], [0, 0], [0, 0]), 5);
});

test("simplify: 共线点被压掉，只留两端", () => {
  const line: Pt[] = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]];
  const out = simplify(line, 0.01);
  assert.deepEqual(out, [[0, 0], [4, 0]]);
});

test("simplify: 明显偏离的点被保留", () => {
  const spike: Pt[] = [[0, 0], [1, 0], [2, 5], [3, 0], [4, 0]];
  const out = simplify(spike, 0.01);
  assert.ok(out.length >= 3, `拐点应被保留，实际 ${out.length} 点`);
  assert.ok(out.some((p) => p[1] === 5), "峰值点必须保留");
});

test("simplify: 容差越大点数越少（单调性）", () => {
  const pts: Pt[] = Array.from({ length: 60 }, (_, i) => [i, Math.sin(i / 3) * 4] as Pt);
  const loose = simplify(pts, 1.0).length;
  const tight = simplify(pts, 0.05).length;
  assert.ok(loose < tight, `容差大应更少：loose=${loose} tight=${tight}`);
});

test("simplify: 空数组与单点不崩", () => {
  assert.deepEqual(simplify([], 0.1), []);
  assert.deepEqual(simplify([[1, 1]], 0.1), [[1, 1]]);
});

test("principalAngle: 沿 x 轴分布的点主轴为 0", () => {
  const pts: Pt[] = [[0, 0], [1, 0], [2, 0], [3, 0]];
  assert.ok(Math.abs(principalAngle(pts)) < 1e-9);
});

test("principalAngle: 沿 45° 对角线分布的点主轴为 45°", () => {
  const pts: Pt[] = [[0, 0], [1, 1], [2, 2], [3, 3]];
  assert.ok(Math.abs(principalAngle(pts) - Math.PI / 4) < 1e-9);
});

test("rotate: 旋转 -90° 把主轴转正", () => {
  const pts: Pt[] = [[0, 0], [1, 1], [2, 2]];
  const th = principalAngle(pts);
  const out = rotate(pts, -th);
  const ys = out.map((p) => p[1]);
  const spread = Math.max(...ys) - Math.min(...ys);
  assert.ok(spread < 1e-9, `转正后 y 应几乎无变化，实际跨度 ${spread}`);
});

test("fitToBox: 等比缩放且不超出画布", () => {
  const pts: Pt[] = [[0, 0], [10, 0], [10, 4], [0, 4]];
  const { points, scale } = fitToBox(pts, 200, 100, 10);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  assert.ok(Math.min(...xs) >= 0 && Math.max(...xs) <= 200, "x 越界");
  assert.ok(Math.min(...ys) >= 0 && Math.max(...ys) <= 100, "y 越界");
  // 等比：原 10:4，缩放后仍应为 10:4
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  assert.ok(Math.abs(w / h - 10 / 4) < 1e-6, `长宽比被破坏：${w / h}`);
  assert.ok(scale > 0);
});

test("fitToBox: 宽扁形状填满宽度方向", () => {
  const pts: Pt[] = [[0, 0], [100, 0], [100, 5], [0, 5]];
  const { points } = fitToBox(pts, 300, 200, 5);
  const xs = points.map((p) => p[0]);
  const w = Math.max(...xs) - Math.min(...xs);
  assert.ok(w > 300 - 2 * 5 - 1e-6, `应撑满宽度，实际 ${w}`);
});

test("toPath: 输出 M 开头且段数 = 点数", () => {
  const pts: Pt[] = [[0, 0], [1.234, 2.345], [3, 4]];
  const d = toPath(pts);
  assert.ok(d.startsWith("M"), "必须以 M 开头");
  assert.equal(d.split("L").length, 3, "3 个点应为 M + 2 个 L");
  assert.ok(!d.includes("NaN"), "不能含 NaN");
  assert.ok(!d.includes("undefined"), "不能含 undefined");
});
```

### Step 2: 运行测试 — 确认失败

Command: `cd frontend && npm test`
Expected: FAIL — `Cannot find module './geometry.ts'`（模块尚不存在）

### Step 3: 写实现

创建 `frontend/src/lib/route/geometry.ts`：

```ts
/** 二维点 [x, y] */
export type Pt = [number, number];

/** 点 p 到线段 ab 的垂直距离；ab 退化时返回点距 */
export function perpendicularDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const norm = Math.hypot(dx, dy);
  if (norm === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / norm;
}

/** Douglas-Peucker 简化。迭代实现，避免深递归爆栈。 */
export function simplify(points: Pt[], tolerance: number): Pt[] {
  if (points.length <= 2) return points.slice();

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicularDistance(points[i], points[first], points[last]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > tolerance && index !== -1) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** 主成分方向（弧度）。数据退化时返回 0。 */
export function principalAngle(points: Pt[]): number {
  const n = points.length;
  if (n < 2) return 0;
  let mx = 0;
  let my = 0;
  for (const [x, y] of points) {
    mx += x;
    my += y;
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of points) {
    const dx = x - mx;
    const dy = y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  return 0.5 * Math.atan2(2 * sxy, sxx - syy);
}

/** 绕原点旋转 theta 弧度 */
export function rotate(points: Pt[], theta: number): Pt[] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return points.map(([x, y]) => [x * c - y * s, x * s + y * c] as Pt);
}

/** 等比缩放并居中到 w×h 画布（保留 pad 边距）。返回缩放后点集与实际比例尺。 */
export function fitToBox(
  points: Pt[],
  w: number,
  h: number,
  pad: number,
): { points: Pt[]; scale: number } {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const scale = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
  const offX = (w - spanX * scale) / 2 - minX * scale;
  const offY = (h - spanY * scale) / 2 - minY * scale;

  return {
    points: points.map(([x, y]) => [x * scale + offX, y * scale + offY] as Pt),
    scale,
  };
}

/** 点集 → SVG path 字符串（1 位小数） */
export function toPath(points: Pt[]): string {
  return "M" + points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L");
}
```

### Step 4: 运行测试 — 确认通过

Command: `cd frontend && npm test`
Expected: PASS — 12 个测试全绿，`# fail 0`（已实测：`# pass 12`）

### Step 5: Commit

```bash
git add frontend/src/lib/route/geometry.ts frontend/src/lib/route/geometry.test.ts
git commit -m "feat(route): 几何纯函数（简化/主轴/旋转/等比缩放/转 path）+ 单测"
```

---

## Task 2: 烘焙脚本

**Files:**
- Create: `frontend/scripts/bake-route.ts`

**Step 1: 写脚本**

创建 `frontend/scripts/bake-route.ts`：

```ts
/**
 * 从 OSRM 真实路线烘焙 trunkRoute.ts。
 *
 * 用法：npx tsx scripts/bake-route.ts   （或 node --experimental-strip-types）
 * 前置：后端可用（默认取线上，可用 API_BASE 覆盖）
 */
import { writeFileSync } from "node:fs";
import { simplify, principalAngle, rotate, fitToBox, toPath, type Pt } from "../src/lib/route/geometry.ts";

const API_BASE = process.env.API_BASE ?? "https://osrm-backend-m6zg.onrender.com/api/v1";
const VIEW_W = 1160;
const VIEW_H = 168;
const PAD = 6;
const TOLERANCE = 0.0005;
const MIN_POINTS = 40;

/** 起点：凭祥友谊关；终点：河内 */
const ORIGIN = { lat: 21.979744, lng: 106.74761 };
const DEST = { lat: 21.028501, lng: 105.853875 };

async function main() {
  const res = await fetch(`${API_BASE}/route/cost`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      route: { origin: ORIGIN, destination: DEST, waypoints: [] },
      cargo: { weight_kg: 18000, type: "normal" },
      vehicle: {
        loading_mode: "full_truck",
        vehicle_model_id: "flatbed_9m0",
        empty_return: false,
        need_loading: false,
        avoid_restricted_zones: false,
        avoid_construction_zones: false,
        via_mountain_road: false,
      },
      cost_params: { misc_cost_vnd: 0 },
    }),
  });
  if (!res.ok) throw new Error(`路线接口 ${res.status}`);
  const data = await res.json();

  const coords: Pt[] = data.route.geometry.coordinates.map(
    ([lng, lat]: [number, number]) => [lng, lat] as Pt,
  );
  const distanceKm: number = data.route.distance_km;
  const sourcePointCount = coords.length;

  // 1) 简化
  const simplified = simplify(coords, TOLERANCE);
  if (simplified.length < MIN_POINTS) {
    throw new Error(`简化后仅 ${simplified.length} 点，低于下限 ${MIN_POINTS}，拒绝写入`);
  }

  // 2) 纬度校正（经度方向按 cos(lat) 压缩，保证几何比例真实）
  const meanLat = simplified.reduce((a, p) => a + p[1], 0) / simplified.length;
  const k = Math.cos((meanLat * Math.PI) / 180);
  const corrected: Pt[] = simplified.map(([lng, lat]) => [lng * k, lat]);

  // 3) PCA 求主轴 → 旋转转正
  const theta = principalAngle(corrected);
  const leveled = rotate(corrected, -theta);

  // 4) 反向，使起点（友谊关）落在左侧
  const oriented = leveled.slice().reverse();

  // 5) 等比缩放进 1160×168
  const { points, scale } = fitToBox(oriented, VIEW_W, VIEW_H, PAD);

  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const fillW = Math.max(...xs) - Math.min(...xs);
  const fillH = Math.max(...ys) - Math.min(...ys);

  console.log(`原始点数      ${sourcePointCount}`);
  console.log(`简化后点数    ${simplified.length}（压缩 ${(100 * (1 - simplified.length / sourcePointCount)).toFixed(1)}%）`);
  console.log(`主轴倾角      ${((theta * 180) / Math.PI).toFixed(1)}°`);
  console.log(`转正后长宽比  ${(fillW / fillH).toFixed(2)} : 1`);
  console.log(`实际占用      ${fillW.toFixed(0)} × ${fillH.toFixed(0)} px（画布 ${VIEW_W}×${VIEW_H}）`);
  if (fillW < VIEW_W * 0.85) {
    console.warn(`⚠️ 横向仅占 ${((100 * fillW) / VIEW_W).toFixed(0)}%，画布比例可能需要调整`);
  }

  const start = points[0];
  const end = points[points.length - 1];

  const out = `// 自动生成，请勿手改。重新生成：npx tsx scripts/bake-route.ts
// 来源：OSRM 真实路线 凭祥友谊关 → 河内
// 原始 ${sourcePointCount} 点 → 简化 ${simplified.length} 点（tol=${TOLERANCE}）
// 主轴 ${((theta * 180) / Math.PI).toFixed(1)}°，转正后 ${(fillW / fillH).toFixed(2)}:1

export interface TrunkRoute {
  /** SVG path，适配 viewBox ${VIEW_W}×${VIEW_H} */
  path: string;
  /** 起点（凭祥友谊关）坐标 */
  start: { x: number; y: number };
  /** 终点（河内）坐标 */
  end: { x: number; y: number };
  /** 干线里程 km */
  distanceKm: number;
  /** 原始几何点数 */
  sourcePointCount: number;
  /** 简化后点数 */
  pointCount: number;
  /** viewBox 尺寸 */
  viewBox: { width: number; height: number };
}

export const TRUNK_ROUTE: TrunkRoute = {
  path: "${toPath(points)}",
  start: { x: ${start[0].toFixed(1)}, y: ${start[1].toFixed(1)} },
  end: { x: ${end[0].toFixed(1)}, y: ${end[1].toFixed(1)} },
  distanceKm: ${distanceKm},
  sourcePointCount: ${sourcePointCount},
  pointCount: ${points.length},
  viewBox: { width: ${VIEW_W}, height: ${VIEW_H} },
};
`;

  writeFileSync(new URL("../src/lib/route/trunkRoute.ts", import.meta.url), out, "utf8");
  console.log("\n✓ 已写入 src/lib/route/trunkRoute.ts");
}

main().catch((err) => {
  console.error("烘焙失败:", err.message);
  process.exit(1);
});
```

**Step 2: 运行烘焙**

Command: `cd frontend && npx tsx scripts/bake-route.ts`
Expected: 打印 6 行统计 + `✓ 已写入`，且 **`横向仅占` 的警告不出现**（即 fillW ≥ 986px）。
若 `npx tsx` 不可用：`node --experimental-strip-types scripts/bake-route.ts`。

**Step 3: Commit**

```bash
git add frontend/scripts/bake-route.ts frontend/src/lib/route/trunkRoute.ts
git commit -m "feat(route): 烘焙脚本 + 真实几何数据"
```

---

## Task 3: 数据完整性测试

**Files:**
- Test: `frontend/src/lib/route/trunkRoute.test.ts`

**Step 1: 写测试**

创建 `frontend/src/lib/route/trunkRoute.test.ts`：

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { TRUNK_ROUTE } from "./trunkRoute.ts";

const { viewBox } = TRUNK_ROUTE;

test("path 以 M 开头且段数等于点数", () => {
  assert.ok(TRUNK_ROUTE.path.startsWith("M"), "必须以 M 开头");
  assert.equal(TRUNK_ROUTE.path.split("L").length, TRUNK_ROUTE.pointCount);
});

test("path 不含 NaN / undefined", () => {
  assert.ok(!TRUNK_ROUTE.path.includes("NaN"));
  assert.ok(!TRUNK_ROUTE.path.includes("undefined"));
});

test("点数达到可辨认下限", () => {
  assert.ok(TRUNK_ROUTE.pointCount >= 40, `点数 ${TRUNK_ROUTE.pointCount} 过少，形状会退化`);
});

test("简化确实压缩了数据", () => {
  assert.ok(
    TRUNK_ROUTE.pointCount < TRUNK_ROUTE.sourcePointCount,
    "简化后应少于原始点数",
  );
});

test("端点落在画布内", () => {
  for (const [name, p] of [["start", TRUNK_ROUTE.start], ["end", TRUNK_ROUTE.end]] as const) {
    assert.ok(p.x >= 0 && p.x <= viewBox.width, `${name}.x=${p.x} 越界`);
    assert.ok(p.y >= 0 && p.y <= viewBox.height, `${name}.y=${p.y} 越界`);
  }
});

test("起点在左、终点在右（母题方向：友谊关 → 河内）", () => {
  assert.ok(
    TRUNK_ROUTE.start.x < TRUNK_ROUTE.end.x,
    `起点 x=${TRUNK_ROUTE.start.x} 应小于终点 x=${TRUNK_ROUTE.end.x}`,
  );
});

test("里程为真实正值", () => {
  assert.ok(TRUNK_ROUTE.distanceKm > 100 && TRUNK_ROUTE.distanceKm < 300, `里程异常：${TRUNK_ROUTE.distanceKm}`);
});

test("转正后横向撑满（≥ 画布 85%）", () => {
  const xs = TRUNK_ROUTE.path
    .replace(/^M/, "")
    .split("L")
    .map((s) => Number(s.split(",")[0]));
  const w = Math.max(...xs) - Math.min(...xs);
  assert.ok(w >= viewBox.width * 0.85, `横向仅占 ${((100 * w) / viewBox.width).toFixed(0)}%`);
});
```

**Step 2: 运行 — 确认通过**

Command: `cd frontend && npm test`
Expected: PASS — Task 1 的 12 个 + 本任务 8 个 = **20 个测试全绿**。

**Step 3: Commit**

```bash
git add frontend/src/lib/route/trunkRoute.test.ts
git commit -m "test(route): 烘焙数据完整性测试"
```

---

## Task 4: i18n 文案

**Files:**
- Modify: `frontend/src/lib/i18n/types.ts`
- Modify: `frontend/src/lib/i18n/zh.ts`
- Modify: `frontend/src/lib/i18n/vi.ts`
- Modify: `frontend/src/lib/i18n/en.ts`

**Step 1: 加类型**

在 `types.ts` 的 `Translations` 接口内，找一个顶层分组（如 `nav`）之后插入：

```ts
  route: {
    startSub: string;
    startName: string;
    endSub: string;
    endName: string;
    distanceCaption: string;
    badgeLabel: string;
  };
```

**Step 2: 加三语文案**

`zh.ts`：

```ts
  route: {
    startSub: "起点 · 中国",
    startName: "凭祥 · 友谊关",
    endSub: "终点 · 越南",
    endName: "河内",
    distanceCaption: "km · 中越陆运干线",
    badgeLabel: "友谊关 → 河内",
  },
```

`vi.ts`：

```ts
  route: {
    startSub: "Điểm đi · Trung Quốc",
    startName: "Bằng Tường · Hữu Nghị",
    endSub: "Điểm đến · Việt Nam",
    endName: "Hà Nội",
    distanceCaption: "km · tuyến bộ Trung–Việt",
    badgeLabel: "Hữu Nghị → Hà Nội",
  },
```

`en.ts`：

```ts
  route: {
    startSub: "Origin · China",
    startName: "Pingxiang · Friendship Pass",
    endSub: "Destination · Vietnam",
    endName: "Hanoi",
    distanceCaption: "km · China–Vietnam trunk",
    badgeLabel: "Friendship Pass → Hanoi",
  },
```

**Step 3: 类型检查 — 确认三语齐全**

Command: `cd frontend && npx tsc --noEmit`
Expected: exit 0。若漏了某一语，会报 `Property 'route' is missing in type ...`。

**Step 4: Commit**

```bash
git add frontend/src/lib/i18n/
git commit -m "i18n: 路线母题 6 个 key × 三语"
```

---

## Task 5: Hero 干线带组件

**Files:**
- Create: `frontend/src/components/site/TrunkRouteBand.tsx`

**Step 1: 写组件**

```tsx
"use client";

import { TRUNK_ROUTE } from "@/lib/route/trunkRoute";
import { useLocale } from "@/lib/i18n/LocaleContext";

/**
 * Hero 干线带：凭祥友谊关 → 河内 的真实路线几何。
 *
 * 关键约束：
 * - 容器锁 aspect-ratio，禁止非等比拉伸（路线地理形状近正方形，拉伸即失真）
 * - prefers-reduced-motion 下光点停止，但路线本身始终渲染
 * - 端点标签锚定到 TRUNK_ROUTE.start/.end 坐标，不固定在容器顶部
 */
export default function TrunkRouteBand({ className = "" }: { className?: string }) {
  const { t } = useLocale();
  const { path, start, end, distanceKm, viewBox } = TRUNK_ROUTE;
  const labelY = 30;

  return (
    <div className={`relative w-full ${className}`} style={{ aspectRatio: `${viewBox.width} / ${viewBox.height}` }}>
      <svg
        viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="trunk-route-grad" x1="0" x2="1">
            <stop offset="0" stopColor="#2080f8" stopOpacity="0.3" />
            <stop offset="0.5" stopColor="#4da3ff" stopOpacity="0.98" />
            <stop offset="1" stopColor="#2080f8" stopOpacity="0.38" />
          </linearGradient>
        </defs>

        <path
          id="trunk-route-path"
          d={path}
          fill="none"
          stroke="url(#trunk-route-grad)"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* 两端点：处理完全一致 */}
        <circle cx={start.x} cy={start.y} r={6} fill="#001030" stroke="#4da3ff" strokeWidth={2.8} />
        <circle cx={end.x} cy={end.y} r={6} fill="#001030" stroke="#4da3ff" strokeWidth={2.8} />

        {/* 沿真实路径移动的光点（增强，非信息载体） */}
        <g className="trunk-route-dot">
          <circle r={10} fill="#4da3ff" opacity={0.2}>
            <animateMotion dur="9s" repeatCount="indefinite">
              <mpath href="#trunk-route-path" />
            </animateMotion>
          </circle>
          <circle r={3.4} fill="#ffffff">
            <animateMotion dur="9s" repeatCount="indefinite">
              <mpath href="#trunk-route-path" />
            </animateMotion>
          </circle>
        </g>
      </svg>

      {/* 端点标签：用百分比定位到端点坐标，随画布等比缩放 */}
      <div
        className="pointer-events-none absolute flex flex-col gap-0.5"
        style={{ left: "0%", top: `${(labelY / viewBox.height) * 100}%` }}
      >
        <span className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-[var(--cyan-on-dark)]">
          {t.route.startSub}
        </span>
        <span className="text-xs text-white">{t.route.startName}</span>
      </div>
      <div
        className="pointer-events-none absolute flex flex-col items-end gap-0.5 text-right"
        style={{ right: "0%", top: `${(labelY / viewBox.height) * 100}%` }}
      >
        <span className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-[var(--cyan-on-dark)]">
          {t.route.endSub}
        </span>
        <span className="text-xs text-white">{t.route.endName}</span>
      </div>

      {/* 里程：数字与单位同行，避免被路线划穿（规格 §9 缺陷 1、3） */}
      <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 text-center">
        <p className="flex items-baseline justify-center gap-1.5">
          <span className="text-[23px] font-light tracking-[-0.03em] text-white tabular-nums">
            {distanceKm.toFixed(1)}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--cyan-on-dark)]">
            {t.route.distanceCaption}
          </span>
        </p>
      </div>
    </div>
  );
}
```

**Step 2: 类型检查**

Command: `cd frontend && npx tsc --noEmit`
Expected: exit 0

**Step 3: Commit**

```bash
git add frontend/src/components/site/TrunkRouteBand.tsx
git commit -m "feat(route): Hero 干线带组件"
```

---

## Task 6: 贯穿 Spine 组件

**Files:**
- Create: `frontend/src/components/site/RouteSpine.tsx`

**Step 1: 写组件**

```tsx
"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * 左缘贯穿 spine：同一条干线在页面上的垂直延续，随滚动填充。
 *
 * 性能关键：进度**不经过 React state**（否则每次滚动重渲染整页子树）。
 * 直接写 DOM 的 CSS 自定义属性 --spine-fill，由 CSS 消费。
 */
export default function RouteSpine({ children }: { children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      el.style.setProperty("--spine-fill", "1");
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      if (rect.height <= 0) return;
      const center = window.innerHeight / 2;
      const raw = (center - rect.top) / rect.height;
      const clamped = Math.min(1, Math.max(0, raw));
      el.style.setProperty("--spine-fill", String(clamped));
    };
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div ref={wrapRef} className="route-spine relative" style={{ ["--spine-fill" as string]: 0 }}>
      {children}
    </div>
  );
}
```

**Step 2: 类型检查**

Command: `cd frontend && npx tsc --noEmit`
Expected: exit 0

**Step 3: Commit**

```bash
git add frontend/src/components/site/RouteSpine.tsx
git commit -m "feat(route): 左缘贯穿 spine（rAF 节流，不经 React state）"
```

---

## Task 7: 案例卡微缩角标

**Files:**
- Create: `frontend/src/components/site/RouteBadge.tsx`

**Step 1: 写组件**

```tsx
"use client";

import { TRUNK_ROUTE } from "@/lib/route/trunkRoute";
import { useLocale } from "@/lib/i18n/LocaleContext";

/**
 * 案例卡微缩路线角标（26×13）。与主带同源几何。
 * 说明：规格 §12 允许角标独立简化以压 DOM 体积，当前复用主 path 即可
 * （26×13 下渲染成本可忽略）；若日后性能告警，再引入 ~40 点简化版。
 */
export default function RouteBadge({ className = "" }: { className?: string }) {
  const { t } = useLocale();
  const { path, viewBox } = TRUNK_ROUTE;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border border-[var(--surface-200)] px-1.5 py-0.5 text-[10.5px] text-[var(--muted-foreground)] ${className}`}
    >
      <svg
        viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-[13px] w-[26px] shrink-0"
        aria-hidden="true"
      >
        <path
          d={path}
          fill="none"
          stroke="#2080f8"
          strokeWidth={26}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {t.route.badgeLabel}
    </span>
  );
}
```

> **注意**：`strokeWidth={26}` 配合 `vectorEffect="non-scaling-stroke"` —— 非缩放描边会让 stroke-width 按**用户单位**解释，缩到 26px 宽时视觉线宽约 1.5px。若实测过粗/过细，调整为 `strokeWidth={1.5}` 并**去掉** `vectorEffect`。

**Step 2: 类型检查**

Command: `cd frontend && npx tsc --noEmit`
Expected: exit 0

**Step 3: Commit**

```bash
git add frontend/src/components/site/RouteBadge.tsx
git commit -m "feat(route): 案例卡微缩路线角标"
```

---

## Task 8: CSS 样式

**Files:**
- Modify: `frontend/src/app/globals.css`

**Step 1: 加样式**

在 `globals.css` 的 `/* ===== 官网锚点平滑滚动 ===== */` 之前插入：

```css
/* ===== 路线母题（2026-09-19）===== */
/* 左缘贯穿 spine。--spine-fill 由 RouteSpine 组件写入（0..1）。 */
.route-spine {
  position: relative;
}

.route-spine::before {
  content: "";
  position: absolute;
  left: 2.5rem;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--surface-200);
  z-index: 0;
}

.route-spine::after {
  content: "";
  position: absolute;
  left: 2.5rem;
  top: 0;
  width: 2px;
  height: calc(var(--spine-fill, 0) * 100%);
  background: linear-gradient(180deg, var(--blue), var(--cyan-on-dark));
  z-index: 1;
  transition: height 120ms linear;
}

/* section 站点圆点 */
.route-spine > section {
  position: relative;
}

.route-spine > section::before {
  content: "";
  position: absolute;
  left: 2.5rem;
  top: 4.5rem;
  width: 11px;
  height: 11px;
  margin-left: -4.5px;
  border-radius: 50%;
  background: #ffffff;
  border: 2px solid var(--cyan);
  z-index: 2;
}

/* 深色底 section 上的 spine 颜色切换（避免视觉断裂） */
.route-spine > section.bg-\[var\(--navy\)\]::before {
  background: var(--navy);
}

/* 窄屏隐藏 spine（避免内容内缩挤压），规格 §6 */
@media (max-width: 767px) {
  .route-spine::before,
  .route-spine::after,
  .route-spine > section::before {
    display: none;
  }
}

/* reduced-motion：光点停止，spine 静态（路线本身不受影响） */
@media (prefers-reduced-motion: reduce) {
  .trunk-route-dot {
    display: none;
  }
  .route-spine::after {
    transition: none;
  }
}
```

**Step 2: 加宽内容左内边距（给 spine 让位）**

Command: 确认每个 section 的内层 `mx-auto max-w-7xl px-5 sm:px-8` 在 ≥768px 时左内边距 ≥ 4.5rem。

在 `globals.css` 追加：

```css
@media (min-width: 768px) {
  .route-spine > section > .mx-auto {
    padding-left: 5.5rem;
  }
}
```

**Step 3: 构建验证**

Command: `cd frontend && npx next build --webpack`
Expected: 构建成功（exit 0）

**Step 4: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "style(route): spine / 站点圆点 / reduced-motion 降级"
```

---

## Task 9: 首页集成

**Files:**
- Modify: `frontend/src/app/page.tsx`

**Step 1: 加 import**

在 `page.tsx` 顶部 import 区加：

```tsx
import TrunkRouteBand from "@/components/site/TrunkRouteBand";
import RouteSpine from "@/components/site/RouteSpine";
import RouteBadge from "@/components/site/RouteBadge";
```

**Step 2: hero 里插入干线带**

在 `page.tsx` 中找到数字统计带（约 L220）：

```tsx
          {/* 数字统计带 */}
          <div className="mt-14">
            <StatsBar />
          </div>
```

替换为：

```tsx
          {/* 路线干线带：签名元素 */}
          <div className="mt-12">
            <TrunkRouteBand />
          </div>

          {/* 数字统计带 */}
          <div className="mt-8">
            <StatsBar />
          </div>
```

**Step 3: 用 RouteSpine 包裹 hero 之后的 section**

找到 `</section>`（hero 结束，约 L225）之后、footer 之前的全部 section，包进 `<RouteSpine>`：

```tsx
      <RouteSpine>
        {/* ═══════════ 关于玖能 ═══════════ */}
        <section id="about" ...>
          ...
        </section>
        ...
        {/* 到最后一个 section 为止 */}
      </RouteSpine>
```

> **注意**：`<RouteSpine>` 必须**只包 section**，不要把 `<footer>` 包进去（footer 不在母题范围内）。

**Step 4: 案例卡加角标**

在 `page.tsx` 案例卡（约 L513 起）的 `<Link>` 内，找到卡片底部的标题/摘要区，在末尾加：

```tsx
                  <RouteBadge className="mt-3" />
```

**Step 5: 类型检查 + 构建**

Command: `cd frontend && npx tsc --noEmit && npx next build --webpack`
Expected: 两个命令均 exit 0

**Step 6: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat(route): 首页集成干线带 / spine / 案例卡角标"
```

---

## Task 10: CDP 视觉验证

**Files:**
- Create: `frontend/scripts/verify-route-motif.py`

**Step 1: 写验证脚本**

创建 `frontend/scripts/verify-route-motif.py`（用本机 Chrome CDP，**不用** `--window-size` 截图判布局）：

```python
"""CDP 验证路线母题在 4 个断点的表现。"""
import json, subprocess, tempfile, time, urllib.request, pathlib, sys

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9341
URL = "http://localhost:47820/"
VIEWPORTS = [(375, 812, "移动"), (390, 844, "移动大"), (768, 1024, "平板"), (1440, 900, "桌面")]


def cdp(ws, method, **params):
    ws.send(json.dumps({"id": 1, "method": method, "params": params}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get("id") == 1:
            return msg.get("result", {})


def main():
    profile = tempfile.mkdtemp()
    proc = subprocess.Popen(
        [CHROME, "--headless=new", "--disable-gpu", f"--remote-debugging-port={PORT}",
         f"--user-data-dir={profile}", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try:
                tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json").read())
                page = next(t for t in tabs if t["type"] == "page")
                break
            except Exception:
                time.sleep(0.5)
        else:
            print("✗ 无法连接 Chrome"); return 1

        import websocket  # websocket-client
        ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=30)
        cdp(ws, "Page.enable")

        fails = []
        for w, h, label in VIEWPORTS:
            cdp(ws, "Emulation.setDeviceMetricsOverride",
                width=w, height=h, deviceScaleFactor=1, mobile=w < 768)
            cdp(ws, "Page.navigate", url=URL)
            time.sleep(6)

            expr = """(() => {
              const svg = document.querySelector('#trunk-route-path');
              const band = svg ? svg.closest('div') : null;
              const spine = document.querySelector('.route-spine');
              const badge = document.querySelector('svg.h\\\\[13px\\\\]') ||
                            document.querySelector('.route-spine') && null;
              const labels = [...document.querySelectorAll('span')]
                 .filter(s => /凭祥|友谊关|河内|Pingxiang|Hanoi|Bằng Tường|Hà Nội/.test(s.textContent));
              return {
                scrollW: document.documentElement.scrollWidth,
                clientW: document.documentElement.clientWidth,
                pathLen: svg ? svg.getTotalLength() : -1,
                bandW: band ? band.getBoundingClientRect().width : -1,
                bandH: band ? band.getBoundingClientRect().height : -1,
                spineVisible: spine ? getComputedStyle(spine, '::before').display : 'none',
                labelCount: labels.length,
                labelVisible: labels.filter(s => {
                  const r = s.getBoundingClientRect();
                  return r.width > 0 && r.height > 0 && getComputedStyle(s).display !== 'none';
                }).length,
              };
            })()"""
            res = cdp(ws, "Runtime.evaluate", expression=expr, returnByValue=True)
            v = res["result"]["value"]

            ok = []
            if v["scrollW"] != v["clientW"]:
                fails.append(f"{label} {w}px 横向溢出 {v['scrollW']}>{v['clientW']}")
            else:
                ok.append("无溢出")
            if v["pathLen"] <= 0:
                fails.append(f"{label} {w}px 路线路径长度为 0")
            else:
                ok.append(f"路径长 {v['pathLen']:.0f}")
            if v["bandW"] <= 0 or v["bandH"] <= 0:
                fails.append(f"{label} {w}px 干线带尺寸为 0")
            else:
                ok.append(f"带 {v['bandW']:.0f}×{v['bandH']:.0f}")
            if v["labelCount"] < 2:
                fails.append(f"{label} {w}px 端点标签缺失（找到 {v['labelCount']}）")
            else:
                ok.append(f"标签 {v['labelCount']}")
            if w < 768:
                if v["spineVisible"] != "none":
                    fails.append(f"{label} {w}px spine 应隐藏，实际 {v['spineVisible']}")
                else:
                    ok.append("spine 已隐藏")
            else:
                if v["spineVisible"] == "none":
                    fails.append(f"{label} {w}px spine 应显示，实际隐藏")
                else:
                    ok.append("spine 显示")
            print(f"  {label:6} {w}×{h}  " + " | ".join(ok))

        print()
        if fails:
            print("✗ 失败项:")
            for f in fails:
                print("   -", f)
            return 1
        print("✓ 全部通过")
        return 0
    finally:
        proc.terminate()


if __name__ == "__main__":
    sys.exit(main())
```

**Step 2: 起 dev server 并运行验证**

Command:
```bash
cd frontend && npm run dev    # 另开一个终端
python scripts/verify-route-motif.py
```
Expected: 4 个断点全通过，`✓ 全部通过`，exit 0。

若缺 `websocket-client`：`pip install websocket-client`（仅验证脚本用，不进项目依赖）。

**Step 3: 人工目视复核**

Command:
```bash
cd frontend && npx next build --webpack && npx next start -p 47821
```
用浏览器打开 `http://localhost:47821/`，确认：
- 干线带路线形状可辨认（蜿蜒，非直线）
- 光点沿路径移动
- 端点标签紧贴端点圆点（**不是**浮在顶部——规格 §9 缺陷 2）
- 里程数字与单位同行（规格 §9 缺陷 3）
- 滚动时 spine 填充单调增长
- 案例卡显示微缩角标

**Step 4: Commit**

```bash
git add frontend/scripts/verify-route-motif.py
git commit -m "test(route): CDP 四断点视觉验证脚本"
```

---

## Task 11: 规格 §9 缺陷修复复核

**Files:**
- Modify: `frontend/src/components/site/TrunkRouteBand.tsx`（如需要）

**Step 1: 逐条核对规格 §9 的 5 个缺陷**

| # | 缺陷 | 本计划中的处理 | 核对方式 |
|---|---|---|---|
| 1 | 副标被路线划穿 | 里程块移到 `top-0`，路线在 y=77~143，不重叠 | 目视：文字下方无蓝线穿过 |
| 2 | 端点标签脱离圆点 | 标签定位到端点坐标附近（`labelY=30`，端点 y=77/143） | 目视：标签与圆点的视觉关联清晰 |
| 3 | 单位与数字脱节 | 单位与数字同一 `<p>`，`items-baseline` 同行 | 目视：一行内读到 "173.6 km · 中越陆运干线" |
| 4 | 右端拥挤 | 容器 `px-5 sm:px-8` 内边距 + `PAD=6` 烘焙边距 | 目视：路线右端与卡片边缘有呼吸空间 |
| 5 | 起点标记重复 | 端点圆 + 光点初始位置重合时的重影：光点 `dur=9s` 起点即端点，属正常动画帧 | 目视：静止时两端各一个圆点，处理一致 |

**Step 2: 若有未达标项，改 `TrunkRouteBand.tsx` 后重跑 Task 10**

Command: `python scripts/verify-route-motif.py`

**Step 3: 最终验证**

Command:
```bash
cd frontend && npx tsc --noEmit && npx next build --webpack && npm test
```
Expected: 三条命令全部 exit 0，`npm test` 报 `# fail 0`。

**Step 4: Commit**

```bash
git add -A frontend/
git commit -m "fix(route): 规格 §9 原型缺陷修复复核"
```

---

## 完成标准

- [ ] `npm test` 20 个测试全绿
- [ ] `npx tsc --noEmit` exit 0
- [ ] `npx next build --webpack` exit 0
- [ ] CDP 四断点验证 `✓ 全部通过`
- [ ] 目视确认 5 个原型缺陷已修
- [ ] 运行时零 API 请求（Network 面板确认首页无 `/route/cost`）
- [ ] 三语切换端点标签正确，vi/en 下无中文残留
- [ ] `prefers-reduced-motion` 下路线可见、光点停

---

## 已知风险与预案

| 风险 | 预案 |
|---|---|
| 本机 Turbopack 构建失败（预存在） | 用 `next build --webpack`；Vercel 侧需另行确认 |
| `animateMotion` + `mpath` 在 Safari 行为差异 | 光点是增强非信息载体；不动时路线与端点完整。实现后在 Safari 实测 |
| `.route-spine > section > .mx-auto` 选择器不匹配实际 DOM | 先 CDP 读实际 class 再定；若结构不符，改用 `padding-left` 加到 section 本身 |
| 角标 `strokeWidth={26}` + `non-scaling-stroke` 视觉线宽不对 | 按 Task 7 注释改为 `strokeWidth={1.5}` 并去掉 `vectorEffect` |
| 深色 section 上 spine 圆点颜色不协调 | Task 8 已加 `.bg-\[var\(--navy\)\]` 覆盖；若其他深色 section 遗漏，逐个补选择器 |

---

## 执行方式

计划已保存到 `docs/superpowers/plans/2026-09-19-route-motif.md`。两种执行方式：

1. **Subagent-Driven** — 每个 Task 派一个全新子 Agent，任务间我来审查
2. **Manual** — 你自己按 Task 执行

选哪种？
