"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleContext";

/**
 * /tools/loader — 3D 装载规划工具壳页（一期 iframe 套 AppShell）
 * 静态工具在 frontend/public/tools/loader/index.html（@codex-02 搬运）
 * 互跳契约: ?vehicle=<carbox_id> → loader-adapter 读取并切换车型
 */
function LoaderShell() {
  const { t } = useLocale();
  const sp = useSearchParams();
  const vehicle = sp.get("vehicle") || "";
  const iframeSrc = vehicle
    ? `/tools/loader/index.html?vehicle=${encodeURIComponent(vehicle)}`
    : "/tools/loader/index.html";

  return (
    <div className="min-h-screen bg-[var(--surface-50)] pb-12">
      {/* 页头: 面包屑 + 标题（AppShell 顶栏为绝对定位，预留 pt） */}
      <div className="mx-auto max-w-7xl px-5 pt-20 sm:px-8">
        <nav className="text-xs text-[var(--surface-500)]" aria-label="breadcrumb">
          <Link href="/" className="transition-colors hover:text-[var(--blue)]">
            {t.tools.breadcrumbHome}
          </Link>
          <span className="mx-1.5">/</span>
          <Link href="/" className="transition-colors hover:text-[var(--blue)]">
            {t.tools.breadcrumbTools}
          </Link>
          <span className="mx-1.5">/</span>
          <span className="font-medium text-[var(--blue)]">{t.tools.pageTitle}</span>
        </nav>
        <h1 className="mt-3 text-2xl font-bold text-[var(--navy)]">📦 {t.tools.pageTitle}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--surface-500)]">
          {t.tools.pageSubtitle}
        </p>
      </div>

      {/* iframe 框架: 圆角 + 浏览器条 + 全高工具 */}
      <div className="mx-auto mt-6 max-w-7xl px-5 sm:px-8">
        <div className="overflow-hidden rounded-2xl border border-[var(--surface-200)] bg-white shadow-[0_10px_30px_rgba(0,16,48,0.08)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--surface-200)] bg-[var(--navy)] px-4 py-2.5 text-xs text-white">
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            </div>
            <span className="hidden min-w-0 flex-1 truncate px-2 text-center font-mono text-white/70 sm:block">
              jiuneng.space/tools/loader{vehicle ? `?vehicle=${vehicle}` : ""}
            </span>
            <a
              href={iframeSrc}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 whitespace-nowrap text-[var(--brand-300)] transition-colors hover:text-white"
            >
              {t.tools.openNewWindow} ↗
            </a>
          </div>
          <iframe
            title={t.tools.pageTitle}
            src={iframeSrc}
            className="block h-[900px] w-full border-0 bg-[#101318]"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  );
}

export default function ToolsLoaderPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--surface-50)]" />}>
      <LoaderShell />
    </Suspense>
  );
}
