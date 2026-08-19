/**
 * OSRM++ 31 车型库 → Carbox 3D 装载 9 车型 互跳映射
 * 来源: 设计文档 website-loader-integration.md §4.4 (@codex-02 基于 31 车型 CSV 实测)
 * 一期近似; 二期原生按车厢类型细分优先修正 flatbed_13m / high_side_18t 两条
 */
export const LOADER_VEHICLE_MAP: Record<string, string> = {
  container_40hc: "40hq",
  container_40ft: "40gp",
  container_20ft: "20gp",
  flatbed_13m: "13m",
  flatbed_12m5: "12.5p",
  flatbed_low_17m5: "17.5p",
  high_side_18t: "9.6m",
  small_box_8t: "6.8m",
  small_box_3t5: "4.2m",
};

/** 映射命中 → Carbox 车型 id; 未命中(高栏/冷链/45尺等) → null, 调用方据此不渲染 CTA */
export function toLoaderVehicle(modelId?: string | null): string | null {
  if (!modelId) return null;
  return LOADER_VEHICLE_MAP[modelId] ?? null;
}
