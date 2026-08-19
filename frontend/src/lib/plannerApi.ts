/**
 * /api/planner/* 客户端 + mock 回退 (@web-design-01)
 * 契约: freight-planner-unified-design.md §3 / codex-01 v1 契约
 * - parse 字段与 OSRM++ CargoItemInput 逐字段一致
 * - plan 响应 placements 为 cm/kg, 与 Carbox 读模式契约一致 (importPlan 可直接消费)
 * - 后端未就绪时 (fetch 失败) 自动回退 mock, 保证前端可独立联调
 */

export interface PlannerCargoItem {
  name: string;
  count: number;
  length_m: number;
  width_m: number;
  height_m: number;
  weight_kg: number;
  stackable: boolean;
}

export interface PlannerParseResponse {
  cargo_items: PlannerCargoItem[];
  route: { origin: string; destination: string } | null;
  raw_origin: string;
  raw_dest: string;
}

export interface PlannerVehicle {
  model_id: string;
  name: string;
  type: "container" | "van" | "flatbed";
  L_cm: number;
  W_cm: number;
  H_cm: number;
  max_weight_kg: number;
}

export interface PlannerPlacement {
  id: string;
  cargoId: string;
  name: string;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  weight: number;
  color: string;
}

export interface PlannerPlanStats {
  placedCount: number;
  totalQty: number;
  totalWeight: number;
  volumeUtilPct: number;
  overweight: boolean;
  cgX: number;
  cgY: number;
  cgZ: number;
  frontPct: number;
  rearPct: number;
}

export interface PlannerPlanResponse {
  vehicle: PlannerVehicle;
  placements: PlannerPlacement[];
  stats: PlannerPlanStats;
  unplaced: { cargoId: string; name: string; reason: string }[];
}

export interface PlannerQuoteResponse {
  distance_km: number;
  duration_h: number;
  cost_total: number;
  currency: string;
  note: string;
}

export type PlannerStrategy = "balanced" | "volume" | "weight" | "priority";

/* ---------- Carbox 9 车型 (mock 装载 + 换车型下拉) ---------- */
export const CARBOX_VEHICLES: PlannerVehicle[] = [
  { model_id: "40hq", name: "40HQ 集装箱", type: "container", L_cm: 1203, W_cm: 235, H_cm: 269, max_weight_kg: 26500 },
  { model_id: "40gp", name: "40GP 集装箱", type: "container", L_cm: 1203, W_cm: 235, H_cm: 239, max_weight_kg: 26500 },
  { model_id: "20gp", name: "20GP 集装箱", type: "container", L_cm: 590, W_cm: 235, H_cm: 239, max_weight_kg: 21770 },
  { model_id: "13m", name: "13米厢式半挂车", type: "van", L_cm: 1300, W_cm: 235, H_cm: 250, max_weight_kg: 30000 },
  { model_id: "12.5p", name: "12.5米平板车", type: "flatbed", L_cm: 1250, W_cm: 240, H_cm: 250, max_weight_kg: 28000 },
  { model_id: "17.5p", name: "17.5米平板车", type: "flatbed", L_cm: 1750, W_cm: 300, H_cm: 250, max_weight_kg: 30000 },
  { model_id: "9.6m", name: "9.6米厢式货车", type: "van", L_cm: 960, W_cm: 235, H_cm: 245, max_weight_kg: 15000 },
  { model_id: "6.8m", name: "6.8米厢式货车", type: "van", L_cm: 680, W_cm: 235, H_cm: 240, max_weight_kg: 10000 },
  { model_id: "4.2m", name: "4.2米轻卡", type: "van", L_cm: 420, W_cm: 210, H_cm: 210, max_weight_kg: 4000 },
];

/* ---------- API ---------- */
async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function plannerParse(text: string): Promise<PlannerParseResponse> {
  try {
    return await post<PlannerParseResponse>("/api/planner/parse", { text });
  } catch {
    return mockParse(text);
  }
}

export async function plannerPlan(
  cargoItems: PlannerCargoItem[],
  vehicleModelId: string,
  strategy: PlannerStrategy = "balanced",
): Promise<PlannerPlanResponse> {
  try {
    return await post<PlannerPlanResponse>("/api/planner/plan", {
      cargo_items: cargoItems,
      vehicle_model_id: vehicleModelId,
      strategy,
    });
  } catch {
    return mockPlan(cargoItems, vehicleModelId, strategy);
  }
}

export async function plannerQuote(
  cargoItems: PlannerCargoItem[],
  vehicleModelId: string,
  origin: string,
  destination: string,
): Promise<PlannerQuoteResponse> {
  try {
    return await post<PlannerQuoteResponse>("/api/planner/quote", {
      cargo_items: cargoItems,
      vehicle_model_id: vehicleModelId,
      origin,
      destination,
      loading_mode: "full_truck",
    });
  } catch {
    return mockQuote(origin, destination);
  }
}

/* ---------- Mock (确定性 shelf 装载, 40HQ 600件 60×40×40 复现 75.7%) ---------- */
const COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c"];

function totalWeightSoFar(list: PlannerPlacement[]): number {
  return list.reduce((s, p) => s + p.weight, 0);
}

function mockParse(text: string): PlannerParseResponse {
  const hasPallet = /托盘|pallet/i.test(text);
  const hasCarton = /箱|纸箱|carton|thùng/i.test(text);
  const cargo_items: PlannerCargoItem[] = [];
  if (hasPallet) cargo_items.push({ name: "托盘", count: 3, length_m: 1.2, width_m: 0.8, height_m: 1.2, weight_kg: 800, stackable: true });
  if (hasCarton) cargo_items.push({ name: "纸箱", count: 200, length_m: 0.6, width_m: 0.4, height_m: 0.4, weight_kg: 25, stackable: true });
  if (cargo_items.length === 0) {
    cargo_items.push({ name: "纸箱", count: 200, length_m: 0.6, width_m: 0.4, height_m: 0.4, weight_kg: 25, stackable: true });
  }
  const origin = /凭祥|友谊关|youyi|hữu nghị/i.test(text) ? "友谊关" : "中国";
  const dest = /河内|hà nội|hanoi/i.test(text) ? "河内" : "越南";
  return { cargo_items, route: { origin, destination: dest }, raw_origin: origin, raw_dest: dest };
}

function mockPlan(
  cargoItems: PlannerCargoItem[],
  vehicleModelId: string,
  _strategy: PlannerStrategy,
): PlannerPlanResponse {
  const vehicle = CARBOX_VEHICLES.find((v) => v.model_id === vehicleModelId) ?? CARBOX_VEHICLES[0];
  const { L_cm: L, W_cm: W, H_cm: H } = vehicle;
  const placements: PlannerPlacement[] = [];
  const unplaced: PlannerPlanResponse["unplaced"] = [];
  let id = 0;

  // 简化 shelf 装载 (mock): 每类货分配 z 带(并排) → 带内 x 行列 → y 分层; 载重上限截停 (确定性)
  let cursorZ = 0;
  for (const c of cargoItems) {
    const dx = Math.round(c.length_m * 100);
    const dy = Math.round(c.height_m * 100);
    const dz = Math.round(c.width_m * 100);
    const color = COLORS[placements.length % COLORS.length];
    const nx = Math.max(1, Math.floor(L / dx));
    const ny = Math.max(1, Math.floor(H / dy));
    // 该类型需要的 z 带数 (每带 nz=1, 高 nx*ny 个)
    const layersPerBand = nx * ny;
    const bandsNeeded = Math.ceil(c.count / layersPerBand);
    const nzAvail = Math.max(0, Math.floor((W - cursorZ) / dz));
    const bandsAvail = Math.min(bandsNeeded, nzAvail);
    const capacity = bandsAvail * layersPerBand;
    let placed = 0;
    for (let i = 0; i < c.count && placed < capacity; i++) {
      if (totalWeightSoFar(placements) + c.weight_kg > vehicle.max_weight_kg) {
        unplaced.push({ cargoId: c.name, name: c.name, reason: `超出载重 ${vehicle.max_weight_kg / 1000}t` });
        break;
      }
      const xi = i % nx;
      const layer = Math.floor(i / nx);
      const zi = Math.floor(layer / ny);
      const yi = layer % ny;
      if (zi >= bandsAvail) break;
      placements.push({
        id: `m${++id}`,
        cargoId: c.name,
        name: c.name,
        x: xi * dx,
        y: yi * dy,
        z: cursorZ + zi * dz,
        dx,
        dy,
        dz,
        weight: c.weight_kg,
        color,
      });
      placed++;
    }
    if (placed < c.count) {
      unplaced.push({ cargoId: c.name, name: c.name, reason: `超出 ${vehicle.name} 容积` });
    }
    cursorZ += Math.min(bandsNeeded, Math.max(1, nzAvail)) * dz;
  }

  const totalWeight = placements.reduce((s, p) => s + p.weight, 0);
  const volUsed = placements.reduce((s, p) => s + p.dx * p.dy * p.dz, 0);
  const volTotal = L * W * H;
  const placedCount = placements.length;
  const totalQty = cargoItems.reduce((s, c) => s + c.count, 0);
  // 加权质心 (x 向, 简化)
  const cgX = placements.length ? placements.reduce((s, p) => s + p.weight * (p.x + p.dx / 2), 0) / totalWeight : 0;
  const cgY = placements.length ? placements.reduce((s, p) => s + p.weight * (p.y + p.dy / 2), 0) / totalWeight : 0;
  const cgZ = placements.length ? placements.reduce((s, p) => s + p.weight * (p.z + p.dz / 2), 0) / totalWeight : 0;

  return {
    vehicle,
    placements,
    stats: {
      placedCount,
      totalQty,
      totalWeight,
      volumeUtilPct: (volUsed / volTotal) * 100,
      overweight: totalWeight > vehicle.max_weight_kg,
      cgX: Math.round(cgX * 10) / 10,
      cgY: Math.round(cgY * 10) / 10,
      cgZ: Math.round(cgZ * 10) / 10,
      frontPct: 50,
      rearPct: 50,
    },
    unplaced,
  };
}

function mockQuote(origin: string, destination: string): PlannerQuoteResponse {
  // 模拟: 友谊关→河内 ~180km, 整车 ¥8,420 (联调占位, 后端就绪后返回真实 QuoteResponse)
  const km = /河内|hanoi|hà nội/i.test(destination) ? 180 : 900;
  return {
    distance_km: km,
    duration_h: Math.round(km / 40 * 10) / 10,
    cost_total: Math.round(km * 46 + 140),
    currency: "CNY",
    note: "mock 报价（后端 /api/planner/quote 就绪后自动切换真实引擎）",
  };
}
