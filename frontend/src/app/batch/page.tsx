"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { batchQuote } from "@/lib/api";
import { buildResultsWorkbook, buildTemplateWorkbook, parseBatchWorkbook } from "@/lib/batchExcel";
import { formatVnd } from "@/lib/format";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { Button, Badge, Card } from "@/components/ui";
import type { BatchRowInput, BatchRowResult } from "@/lib/types";

type Filter = "all" | "success" | "failed";
type SortKey = "distance" | "cost" | null;

export default function BatchPage() {
  const { t } = useLocale();
  const cargoTypeLabel = (key: string) => t.labels.cargoType[key] ?? key;
  const loadingModeLabel = (key: string) => t.labels.loadingMode[key] ?? key;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<BatchRowInput[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [results, setResults] = useState<BatchRowResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const downloadTemplate = () => {
    XLSX.writeFile(buildTemplateWorkbook(), "批量报价模板.xlsx");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setResults(null);
    setError(null);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const { rows: parsedRows, errors } = parseBatchWorkbook(workbook);
      setRows(parsedRows);
      setParseErrors(errors);
    } catch {
      setError(t.batch.parseFailed);
      setRows([]);
      setParseErrors([]);
    }
  };

  const handleCompute = async () => {
    if (rows.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const response = await batchQuote(rows);
      setResults(response.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.batch.batchFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!results) return;
    XLSX.writeFile(buildResultsWorkbook(rows, results), "批量报价结果.xlsx");
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((a) => !a);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  let displayedResults = results ?? [];
  if (filter !== "all") {
    displayedResults = displayedResults.filter((r) => (filter === "success" ? r.success : !r.success));
  }
  if (sortKey) {
    displayedResults = [...displayedResults].sort((a, b) => {
      const av = sortKey === "distance" ? (a.quote?.route.distance_km ?? -1) : (a.quote?.breakdown.cost_total ?? -1);
      const bv = sortKey === "distance" ? (b.quote?.route.distance_km ?? -1) : (b.quote?.breakdown.cost_total ?? -1);
      return sortAsc ? av - bv : bv - av;
    });
  }

  const successCount = results?.filter((r) => r.success).length ?? 0;

  return (
    <div className="h-full overflow-y-auto bg-[var(--surface-50)]">
      <div className="mx-auto max-w-7xl p-6 space-y-5">
        {/* Upload & Controls */}
        <Card>
          <h2 className="mb-4 text-base font-bold text-[var(--surface-800)]">{t.batch.title}</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={downloadTemplate}>
              📥 {t.batch.downloadTemplate}
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              📂 {t.batch.chooseFile}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />
            {fileName && (
              <Badge variant="info">
                {t.batch.selectedFile(fileName)}
              </Badge>
            )}
            {rows.length > 0 && (
              <Button variant="primary" loading={loading} onClick={handleCompute}>
                {loading ? t.batch.calculating : t.batch.startCalc(rows.length)}
              </Button>
            )}
          </div>

          {/* Parse errors */}
          {parseErrors.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-[var(--warning-bg)] p-3.5">
              <p className="text-sm font-semibold text-amber-800">⚠️ {t.batch.parseErrorsTitle}</p>
              <ul className="mt-1.5 list-inside list-disc text-sm text-amber-700 space-y-0.5">
                {parseErrors.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )}
          {error && <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </Card>

        {/* Results */}
        {results && (
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Badge variant="info">{t.batch.summary(results.length, successCount, results.length - successCount)}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as Filter)}
                  className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm text-[var(--surface-700)]"
                >
                  <option value="all">{t.batch.filterAll}</option>
                  <option value="success">{t.batch.filterSuccess}</option>
                  <option value="failed">{t.batch.filterFailed}</option>
                </select>
                <Button variant="outline" size="sm" onClick={handleExport}>
                  📤 {t.batch.export}
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-[var(--surface-50)] border-b border-[var(--border)]">
                    <th className="py-2.5 px-3 text-xs font-semibold uppercase text-[var(--surface-400)] tracking-wide">
                      {t.batch.colIndex}
                    </th>
                    <th className="py-2.5 px-3 text-xs font-semibold uppercase text-[var(--surface-400)] tracking-wide">
                      {t.batch.colLoadingMode}
                    </th>
                    <th className="py-2.5 px-3 text-xs font-semibold uppercase text-[var(--surface-400)] tracking-wide">
                      {t.batch.colVehicle}
                    </th>
                    <th className="py-2.5 px-3 text-xs font-semibold uppercase text-[var(--surface-400)] tracking-wide">
                      {t.batch.colCargo}
                    </th>
                    <th
                      className="cursor-pointer py-2.5 px-3 text-xs font-semibold uppercase text-[var(--surface-400)] tracking-wide hover:text-[var(--surface-600)] transition-colors"
                      onClick={() => toggleSort("distance")}
                    >
                      {t.batch.colDistance} {sortKey === "distance" ? (sortAsc ? "↑" : "↓") : ""}
                    </th>
                    <th
                      className="cursor-pointer py-2.5 px-3 text-xs font-semibold uppercase text-[var(--surface-400)] tracking-wide hover:text-[var(--surface-600)] transition-colors"
                      onClick={() => toggleSort("cost")}
                    >
                      {t.batch.colCost} {sortKey === "cost" ? (sortAsc ? "↑" : "↓") : ""}
                    </th>
                    <th className="py-2.5 px-3 text-xs font-semibold uppercase text-[var(--surface-400)] tracking-wide">
                      {t.batch.colStatus}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayedResults.map((r, idx) => {
                    const row = rows[r.row_index];
                    return (
                      <tr
                        key={r.row_index}
                        className={`border-b border-[var(--border)] transition-colors hover:bg-[var(--surface-50)] ${
                          idx % 2 === 0 ? "bg-white" : "bg-[var(--surface-50)]/50"
                        }`}
                      >
                        <td className="py-2.5 px-3 text-[var(--surface-400)]">{r.row_index + 1}</td>
                        <td className="py-2.5 px-3 text-[var(--surface-700)]">{loadingModeLabel(row.loading_mode)}</td>
                        <td className="py-2.5 px-3 text-[var(--surface-700)] font-medium">
                          {r.quote?.breakdown.matched_vehicle_model_name ?? "-"}
                        </td>
                        <td className="py-2.5 px-3 text-[var(--surface-700)]">{cargoTypeLabel(row.cargo_type)}</td>
                        <td className="py-2.5 px-3 text-[var(--surface-700)] font-mono">
                          {r.quote ? `${r.quote.route.distance_km.toFixed(1)} km` : "-"}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[var(--surface-800)]">
                          {r.quote ? formatVnd(r.quote.breakdown.cost_total) : "-"}
                        </td>
                        <td className="py-2.5 px-3">
                          {r.success ? (
                            <Badge variant="success">{t.batch.statusSuccess}</Badge>
                          ) : (
                            <Badge variant="danger" className="cursor-help" title={r.error ?? ""}>
                              {t.batch.statusFailed(r.error ?? "")}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
