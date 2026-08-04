import * as XLSX from "xlsx";
import type { BatchRowInput, BatchRowResult } from "./types";

// Excel 列头 <-> BatchRowInput 字段名的映射，批量模板下载、批量结果导出都用这一份。
const COLUMNS: { header: string; key: keyof BatchRowInput; required: boolean }[] = [
  { header: "起点纬度", key: "origin_lat", required: true },
  { header: "起点经度", key: "origin_lng", required: true },
  { header: "终点纬度", key: "dest_lat", required: true },
  { header: "终点经度", key: "dest_lng", required: true },
  { header: "货物重量kg", key: "weight_kg", required: true },
  { header: "货物体积m3", key: "volume_m3", required: false },
  { header: "货物类型", key: "cargo_type", required: false },
  { header: "运输模式", key: "loading_mode", required: true },
  { header: "车型ID", key: "vehicle_model_id", required: false },
  { header: "空车返回", key: "empty_return", required: false },
  { header: "需要装卸", key: "need_loading", required: false },
  { header: "绕开禁限行", key: "avoid_restricted_zones", required: false },
  { header: "绕开施工封闭", key: "avoid_construction_zones", required: false },
  { header: "上坡山区附加费", key: "via_mountain_road", required: false },
  { header: "货值VND", key: "cargo_value_vnd", required: false },
  { header: "油价VND", key: "fuel_price_vnd", required: false },
  { header: "工资VND", key: "wage_hourly_vnd", required: false },
  { header: "路桥费率VND每km", key: "toll_rate_vnd_per_km", required: false },
  { header: "其他费用VND", key: "misc_cost_vnd", required: false },
];

const CARGO_TYPE_OPTIONS = "normal / cold_chain / hazardous / oversized / other";
const LOADING_MODE_OPTIONS = "consolidated（拼货，自动匹配车型）/ full_truck（整车，需指定车型ID）";

function parseBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const s = String(value ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "是" || s === "yes";
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function buildTemplateWorkbook(): XLSX.WorkBook {
  const exampleRow: Record<string, string | number> = {
    起点纬度: 10.8231,
    起点经度: 106.6297,
    终点纬度: 21.0285,
    终点经度: 105.8044,
    货物重量kg: 15000,
    货物体积m3: 30,
    货物类型: "normal",
    运输模式: "full_truck",
    车型ID: "high_side_10t",
    空车返回: "否",
    需要装卸: "是",
    绕开禁限行: "否",
    绕开施工封闭: "否",
    上坡山区附加费: "否",
    货值VND: 500000000,
    油价VND: "",
    工资VND: "",
    路桥费率VND每km: "",
    其他费用VND: "",
  };
  const dataSheet = XLSX.utils.json_to_sheet([exampleRow], { header: COLUMNS.map((c) => c.header) });

  const helpSheet = XLSX.utils.aoa_to_sheet([
    ["列名", "说明"],
    ["起点/终点纬度经度", "十进制度数，如 10.8231 / 106.6297"],
    ["货物重量kg", "必填，单位公斤"],
    ["货物体积m3", "运输模式=consolidated（拼货）时必填，用来匹配车型运力；整车模式选填仅作参考"],
    ["货物类型", `可选，不填默认 normal。可选值：${CARGO_TYPE_OPTIONS}`],
    ["运输模式", `必填。可选值：${LOADING_MODE_OPTIONS}`],
    [
      "车型ID",
      "运输模式=full_truck（整车）时必填，拼货模式忽略此列。" +
        "请参考系统内车辆型号库，或调用 GET /reference/vehicle-models 查看当前可用车型列表",
    ],
    ["空车返回/需要装卸", "填 是/否 或 TRUE/FALSE，不填默认否"],
    [
      "绕开禁限行/绕开施工封闭/上坡山区附加费",
      "填 是/否 或 TRUE/FALSE，不填默认否；本地地图数据无法自动判断这类路况，需人工勾选",
    ],
    ["货值VND/油价VND/工资VND/路桥费率VND每km/其他费用VND", "均为可选，不填则使用系统默认值"],
  ]);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, dataSheet, "批量报价");
  XLSX.utils.book_append_sheet(workbook, helpSheet, "填写说明");
  return workbook;
}

export interface ParsedBatch {
  rows: BatchRowInput[];
  errors: string[];
}

export function parseBatchWorkbook(workbook: XLSX.WorkBook): ParsedBatch {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const rows: BatchRowInput[] = [];
  const errors: string[] = [];

  raw.forEach((record, index) => {
    const rowNumber = index + 2; // 第1行是表头
    const missing = COLUMNS.filter((c) => c.required && String(record[c.header] ?? "").trim() === "");
    if (missing.length > 0) {
      errors.push(`第 ${rowNumber} 行缺少必填列：${missing.map((c) => c.header).join("、")}`);
      return;
    }

    const loadingMode = String(record["运输模式"] || "").trim();
    if (loadingMode !== "consolidated" && loadingMode !== "full_truck") {
      errors.push(`第 ${rowNumber} 行"运输模式"必须是 consolidated 或 full_truck，实际是「${loadingMode}」`);
      return;
    }
    // 条件必填校验：跟后端 schemas.py 的 model_validator 呼应，这里提前拦，
    // 避免"一行没填对，整批都要等后端逐行返回错误才知道"
    if (loadingMode === "full_truck" && String(record["车型ID"] || "").trim() === "") {
      errors.push(`第 ${rowNumber} 行：运输模式=full_truck（整车）必须填写车型ID`);
      return;
    }
    if (loadingMode === "consolidated" && String(record["货物体积m3"] || "").trim() === "") {
      errors.push(`第 ${rowNumber} 行：运输模式=consolidated（拼货）必须填写货物体积m3`);
      return;
    }

    rows.push({
      origin_lat: Number(record["起点纬度"]),
      origin_lng: Number(record["起点经度"]),
      dest_lat: Number(record["终点纬度"]),
      dest_lng: Number(record["终点经度"]),
      weight_kg: Number(record["货物重量kg"]),
      volume_m3: parseOptionalNumber(record["货物体积m3"]),
      cargo_type: String(record["货物类型"] || "normal"),
      loading_mode: loadingMode,
      vehicle_model_id: String(record["车型ID"] || "").trim() || undefined,
      empty_return: parseBool(record["空车返回"]),
      need_loading: parseBool(record["需要装卸"]),
      avoid_restricted_zones: parseBool(record["绕开禁限行"]),
      avoid_construction_zones: parseBool(record["绕开施工封闭"]),
      via_mountain_road: parseBool(record["上坡山区附加费"]),
      cargo_value_vnd: parseOptionalNumber(record["货值VND"]),
      fuel_price_vnd: parseOptionalNumber(record["油价VND"]),
      wage_hourly_vnd: parseOptionalNumber(record["工资VND"]),
      toll_rate_vnd_per_km: parseOptionalNumber(record["路桥费率VND每km"]),
      misc_cost_vnd: parseOptionalNumber(record["其他费用VND"]) ?? 0,
    });
  });

  return { rows, errors };
}

export function buildResultsWorkbook(rows: BatchRowInput[], results: BatchRowResult[]): XLSX.WorkBook {
  const data = results.map((r) => {
    const row = rows[r.row_index];
    return {
      序号: r.row_index + 1,
      起点: `${row.origin_lat}, ${row.origin_lng}`,
      终点: `${row.dest_lat}, ${row.dest_lng}`,
      运输模式: row.loading_mode,
      匹配车型: r.quote?.breakdown.matched_vehicle_model_name ?? "",
      货物重量kg: row.weight_kg,
      状态: r.success ? "成功" : "失败",
      距离km: r.quote?.route.distance_km ?? "",
      总费用VND: r.quote?.breakdown.cost_total ?? "",
      每公里成本VND: r.quote?.breakdown.cost_per_km ?? "",
      错误信息: r.error ?? "",
    };
  });

  const sheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "批量结果");
  return workbook;
}
