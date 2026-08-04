"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleContext";

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="m5 12 5 5 9-10" />
  </svg>
);
const ArrowLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </svg>
);

export default function CaseDetailPage() {
  const params = useParams<{ id: string }>();
  const { t } = useLocale();
  const cases = t.site.cases.items;
  const index = cases.findIndex((c) => c.id === params.id);
  const item = index >= 0 ? cases[index] : null;
  const [activeImg, setActiveImg] = useState(0);

  if (!item) {
    return (
      <div className="min-h-[60vh] bg-white pt-28 pb-20 text-center">
        <p className="text-lg text-[var(--surface-500)]">项目不存在</p>
        <Link href="/#cases" className="mt-4 inline-block text-sm font-semibold text-[var(--teal-600)] hover:underline">
          ← {t.site.cases.back}
        </Link>
      </div>
    );
  }

  const related = cases.filter((c) => c.id !== item.id).slice(0, 2);
  const gallery = item.gallery && item.gallery.length > 0 ? item.gallery : [item.image];

  return (
    <div className="min-h-screen bg-white pt-16">
      {/* ── 顶部返回条 ── */}
      <div className="border-b border-[var(--surface-100)] bg-[var(--surface-50)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 sm:px-8">
          <Link
            href="/#cases"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--surface-500)] transition-colors hover:text-[var(--teal-600)]"
          >
            <ArrowLeft />
            {t.site.cases.back}
          </Link>
          <Link href="/" className="text-sm font-semibold text-[var(--surface-400)] hover:text-[var(--teal-600)]">
            JIUNENG logistics
          </Link>
        </div>
      </div>

      {/* ── 主体 ── */}
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:py-14">
        {/* 标题区 */}
        <div className="max-w-3xl">
          <div className="flex items-center gap-2.5">
            <span className="h-0.5 w-8 bg-[var(--teal-500)]" />
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--teal-600)]">{item.type}</p>
          </div>
          <h1 className="mt-3.5 text-3xl font-bold tracking-tight text-[var(--brand-900)] sm:text-4xl">
            {item.title}
          </h1>
          <div className="mt-4 flex flex-wrap gap-2">
            {item.tags.map((tag, i) => (
              <span key={i} className="rounded-md bg-[var(--teal-500)]/10 px-2.5 py-1 text-xs font-medium text-[var(--teal-700)]">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* 主图 + 画廊 */}
        <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div className="overflow-hidden rounded-2xl border border-[var(--surface-200)] shadow-sm">
            <img
              src={gallery[activeImg]}
              alt={item.title}
              className="h-full max-h-[420px] w-full object-cover"
            />
          </div>
          <div className="grid grid-cols-3 gap-3 lg:grid-cols-1 lg:grid-rows-3">
            {gallery.slice(0, 3).map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveImg(i)}
                className={`overflow-hidden rounded-xl border-2 transition-all ${
                  activeImg === i
                    ? "border-[var(--teal-500)] shadow-md"
                    : "border-[var(--surface-200)] opacity-70 hover:opacity-100"
                }`}
              >
                <img src={img} alt={`${item.title} ${i + 1}`} className="h-24 w-full object-cover lg:h-full" />
              </button>
            ))}
          </div>
        </div>

        {/* 项目概述 + 详情 */}
        <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="text-xl font-bold text-[var(--brand-900)]">项目概述</h2>
            <p className="mt-3.5 text-[15px] leading-relaxed text-[var(--surface-600)]">{item.overview}</p>

            {/* 服务内容 */}
            <h2 className="mt-10 text-xl font-bold text-[var(--brand-900)]">服务内容</h2>
            <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {item.services.map((s, i) => (
                <li key={i} className="flex items-center gap-2.5 rounded-lg bg-[var(--surface-50)] px-3.5 py-2.5 text-sm font-medium text-[var(--surface-700)]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--teal-500)]/15 text-[var(--teal-600)]">
                    <CheckIcon />
                  </span>
                  {s}
                </li>
              ))}
            </ul>

            {/* 成果 */}
            <h2 className="mt-10 text-xl font-bold text-[var(--brand-900)]">项目成果</h2>
            <ul className="mt-4 space-y-2.5">
              {item.results.map((r, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-[var(--surface-600)]">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--teal-500)]" />
                  {r}
                </li>
              ))}
            </ul>
          </div>

          {/* 侧栏：项目信息 */}
          <aside className="h-fit rounded-2xl border border-[var(--surface-200)] bg-[var(--surface-50)] p-6 lg:sticky lg:top-24">
            <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--surface-400)]">项目信息</h3>
            <dl className="mt-4 space-y-4">
              {item.details.map((d, i) => (
                <div key={i} className="border-b border-[var(--surface-200)] pb-3.5 last:border-0 last:pb-0">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--surface-400)]">{d.label}</dt>
                  <dd className="mt-1 text-sm font-medium text-[var(--brand-900)]">{d.value}</dd>
                </div>
              ))}
            </dl>
            <Link
              href="/quote"
              className="mt-6 block rounded-xl bg-[var(--teal-500)] px-4 py-3 text-center text-sm font-bold text-[#06281f] shadow-lg shadow-[#08c792]/20 transition-all hover:bg-[var(--teal-400)]"
            >
              🧮 在线报价 →
            </Link>
          </aside>
        </div>

        {/* 相关项目 */}
        {related.length > 0 && (
          <div className="mt-16 border-t border-[var(--surface-100)] pt-10">
            <h2 className="text-lg font-bold text-[var(--brand-900)]">{t.site.cases.related}</h2>
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              {related.map((rc) => (
                <Link
                  key={rc.id}
                  href={`/cases/${rc.id}`}
                  className="group overflow-hidden rounded-2xl border border-[var(--surface-200)] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="h-40 overflow-hidden">
                    <img
                      src={rc.image}
                      alt={rc.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-[var(--teal-600)]">{rc.type}</p>
                    <h3 className="mt-1.5 text-base font-bold text-[var(--brand-900)]">{rc.title}</h3>
                    <p className="mt-1.5 text-sm text-[var(--surface-500)] line-clamp-2">{rc.body}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
