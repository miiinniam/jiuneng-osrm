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
