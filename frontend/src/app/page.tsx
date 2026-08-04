"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/LocaleContext";
import QuickQuote from "@/components/site/QuickQuote";
import AIChatSection from "@/components/site/AIChatSection";
import type { Entity } from "@/lib/i18n/types";

/* ── 线性图标（K&N 风格：细线条、克制的瑞士设计语言） ── */
const Icon = ({ children, className = "h-6 w-6" }: { children: React.ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    {children}
  </svg>
);
const TruckIcon = () => (
  <Icon>
    <path d="M3 7h11v10H3z" />
    <path d="M14 10h4l3 3v4h-7z" />
    <circle cx="7" cy="17" r="2" />
    <circle cx="18" cy="17" r="2" />
  </Icon>
);
const FileIcon = () => (
  <Icon>
    <path d="M14 3H6v18h12V7z" />
    <path d="M14 3v4h4" />
    <path d="m9 14 2 2 4-4" />
  </Icon>
);
const GlobeIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15 15 0 0 1 0 20" />
    <path d="M12 2a15 15 0 0 0 0 20" />
  </Icon>
);
const RailIcon = () => (
  <Icon>
    <circle cx="6" cy="19" r="3" />
    <circle cx="18" cy="5" r="3" />
    <path d="M12 19h1a5 5 0 0 0 0-10H9a5 5 0 0 1 0-10h3" />
  </Icon>
);
const BuildingIcon = () => (
  <Icon>
    <path d="M4 21V4h11v17" />
    <path d="M15 9h5v12" />
    <path d="M8 8h3M8 12h3M8 16h3" />
  </Icon>
);
const PowerIcon = () => (
  <Icon>
    <path d="M3 12h4l3 8 4-16 3 8h4" />
  </Icon>
);
const WindIcon = () => (
  <Icon>
    <path d="M3 8h11a3 3 0 1 0-3-3" />
    <path d="M3 16h15a3 3 0 1 1-3 3" />
    <path d="M3 12h7" />
  </Icon>
);
const MailIcon = () => (
  <Icon className="h-5 w-5">
    <path d="M4 4h16v16H4z" />
    <path d="m4 7 8 6 8-6" />
  </Icon>
);
const PhoneIcon = () => (
  <Icon className="h-5 w-5">
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2" />
  </Icon>
);
const PinIcon = () => (
  <Icon className="h-5 w-5">
    <path d="M18 8c0 5-6 10-6 10S6 13 6 8a6 6 0 1 1 12 0" />
    <circle cx="12" cy="8" r="2" />
  </Icon>
);
const ArrowIcon = () => (
  <Icon className="h-4 w-4">
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </Icon>
);

/* ── 数字统计带（K&N 风格：大数字 + 小标签） ── */
function StatsBar() {
  const { t } = useLocale();
  const stats = [
    { value: "02", label: t.site.hero.stats[0].label, sub: "中国·越南双主体" },
    { value: "03", label: t.site.hero.stats[1].label, sub: "工程物流·报关·贸易" },
    { value: "30+", label: t.site.hero.stats[2].label, sub: "特种车·平板·冷链" },
    { value: "2024", label: t.site.hero.stats[3].label, sub: "越南公司登记" },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--teal-500)]/20 bg-[var(--teal-500)]/10 sm:grid-cols-4 lg:grid-cols-4">
      {stats.map((s, i) => (
        <div key={i} className="bg-[#0a1a2e] px-5 py-4 sm:px-6 sm:py-5">
          <p className="text-2xl font-bold tabular-nums tracking-tight text-[var(--teal-400)] sm:text-3xl">{s.value}</p>
          <p className="mt-1 text-sm font-semibold text-white">{s.label}</p>
          <p className="mt-0.5 text-xs text-[var(--brand-100)]/50">{s.sub}</p>
        </div>
      ))}
    </div>
  );
}

function SectionHeading({ eyebrow, title, intro, light }: { eyebrow: string; title: string; intro?: string; light?: boolean }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <div className="flex items-center justify-center gap-2.5">
        <span className="h-px w-8 bg-[var(--teal-500)]" />
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--teal-600)]">{eyebrow}</p>
        <span className="h-px w-8 bg-[var(--teal-500)]" />
      </div>
      <h2 className={`mt-3.5 text-2xl font-bold tracking-tight sm:text-[2rem] ${light ? "text-white" : "text-[var(--brand-900)]"}`}>
        {title}
      </h2>
      {intro && (
        <p className={`mt-3.5 text-[15px] leading-relaxed ${light ? "text-[var(--brand-100)]/65" : "text-[var(--surface-500)]"}`}>
          {intro}
        </p>
      )}
    </div>
  );
}

function EntityCard({ entity }: { entity: Entity }) {
  return (
    <div className="rounded-2xl border border-[var(--surface-200)] bg-white p-7 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center gap-2.5">
        <span className="h-2 w-2 rounded-full bg-[var(--teal-500)]" />
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--surface-400)]">{entity.tag}</p>
      </div>
      <h3 className="mt-3 text-lg font-bold text-[var(--brand-900)]">{entity.name}</h3>
      <dl className="mt-4 space-y-2.5 border-t border-[var(--surface-100)] pt-4">
        {entity.rows.map((row, i) => (
          <div key={i} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
            <dt className="w-32 shrink-0 text-sm text-[var(--surface-400)]">{row.label}</dt>
            <dd className="text-sm font-medium text-[var(--surface-700)]">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function HomePage() {
  const { t } = useLocale();
  const s = t.site;
  const serviceIcons = [TruckIcon, FileIcon, GlobeIcon];
  const solutionIcons = [RailIcon, BuildingIcon, PowerIcon, WindIcon];
  const [activeService, setActiveService] = useState(0);

  return (
    <div className="min-h-screen bg-white">
      {/* ═══════════ HERO — K&N 风格全屏 ═══════════ */}
      <section className="relative overflow-hidden bg-[#0a1a2e]">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[1000px] -translate-x-1/2 rounded-full bg-[#1d4ed8]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-[#08c792]/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-5 pb-14 pt-20 sm:px-8 lg:pb-20 lg:pt-28">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
            {/* 左：文案 */}
            <div>
              {/* 品牌 logo */}
              <img
                src="/assets/logo/logo-horizontal-white.png"
                alt="JIUNENG logistics"
                className="mb-6 h-9 w-auto opacity-90"
              />
              <div className="flex items-center gap-3">
                <span className="h-0.5 w-8 bg-[var(--teal-500)] sm:w-10" />
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--teal-400)] sm:text-xs sm:tracking-[0.22em]">{s.hero.eyebrow}</p>
              </div>
              <h1 className="mt-4 text-3xl font-bold leading-[1.14] tracking-tight text-white sm:mt-5 sm:text-4xl lg:text-[3.2rem]">
                {s.hero.title}
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--brand-100)]/70 sm:mt-6 sm:text-base lg:text-lg">
                {s.hero.lead}
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3 sm:mt-8 sm:gap-3.5">
                <Link
                  href="#quote"
                  className="group inline-flex items-center gap-2 rounded-xl bg-[var(--teal-500)] px-5 py-3 text-sm font-bold text-[#06281f] shadow-lg shadow-[#08c792]/25 transition-all hover:-translate-y-0.5 hover:bg-[var(--teal-400)] sm:px-7 sm:py-3.5"
                >
                  {s.hero.primary}
                  <ArrowIcon />
                </Link>
                <Link
                  href="#services"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:border-white/30 hover:bg-white/10 sm:px-7 sm:py-3.5"
                >
                  {s.hero.secondary}
                </Link>
              </div>

              {/* 能力徽章 */}
              <div className="mt-7 flex flex-wrap gap-2 sm:mt-9 sm:gap-2.5">
                {[s.hero.badge1, s.hero.badge2, s.hero.badge3].map((b, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--teal-500)]/25 bg-[var(--teal-500)]/8 px-3 py-1.5 text-[11px] font-medium text-[var(--teal-300)] sm:px-3.5 sm:text-xs"
                  >
                    <span className="h-1 w-1 rounded-full bg-[var(--teal-500)]" />
                    {b}
                  </span>
                ))}
              </div>
            </div>

            {/* 右：三合一工作台（报价 / AI / 地图） */}
            <div id="quote" className="scroll-mt-24">
              <QuickQuote />
            </div>
            </div>

          {/* 数字统计带 */}
          <div className="mt-14">
            <StatsBar />
          </div>
        </div>
      </section>

      {/* ═══════════ 核心业务 — K&N 风格 tab 化 ═══════════ */}
      <section id="services" className="scroll-mt-16 py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <SectionHeading eyebrow={s.services.eyebrow} title={s.services.title} intro={s.services.intro} />

          {/* Tab 切换 */}
          <div className="mx-auto mt-10 flex max-w-xl items-center justify-center gap-1 rounded-xl bg-[var(--surface-100)] p-1.5">
            {s.services.items.map((item, i) => (
              <button
                key={i}
                onClick={() => setActiveService(i)}
                className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                  activeService === i
                    ? "bg-white text-[var(--brand-700)] shadow-[var(--shadow-sm)]"
                    : "text-[var(--surface-500)] hover:text-[var(--surface-700)]"
                }`}
              >
                {item.title}
              </button>
            ))}
          </div>

          {/* Tab 内容 */}
          <div className="mx-auto mt-8 max-w-5xl overflow-hidden rounded-2xl border border-[var(--surface-200)] bg-white shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-[0.9fr_1.1fr]">
              {/* 图片侧 */}
              <div className="relative h-52 overflow-hidden md:h-auto">
                <img
                  src={`/assets/${["case-04-cross-border-heavy-truck-D0zxHgaL.webp", "case-02-transformer-inspection-C1NrNOUB.webp", "case-03-intermodal-logistics-QTNMgVqT.webp"][activeService] ?? "case-04-cross-border-heavy-truck-D0zxHgaL.webp"}`}
                  alt={s.services.items[activeService].title}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a1a2e]/50 to-transparent md:bg-gradient-to-r" />
                <div className="absolute bottom-4 left-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--teal-500)] text-[#06281f] shadow-lg md:hidden">
                  {(() => {
                    const I = serviceIcons[activeService] ?? TruckIcon;
                    return <I />;
                  })()}
                </div>
              </div>
              {/* 内容侧 */}
              <div className="flex flex-col justify-center p-7 sm:p-9">
                <div className="mb-3 hidden h-12 w-12 items-center justify-center rounded-xl bg-[var(--teal-500)]/10 text-[var(--teal-600)] md:flex">
                  {(() => {
                    const I = serviceIcons[activeService] ?? TruckIcon;
                    return <I />;
                  })()}
                </div>
                <h3 className="text-xl font-bold text-[var(--brand-900)]">
                  {s.services.items[activeService].title}
                </h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-[var(--surface-500)]">
                  {s.services.items[activeService].body}
                </p>
                <ul className="mt-5 flex flex-wrap gap-2.5">
                  {s.services.items[activeService].points.map((p, j) => (
                    <li
                      key={j}
                      className="inline-flex items-center gap-2 rounded-lg bg-[var(--surface-50)] px-3.5 py-2 text-sm font-medium text-[var(--surface-600)]"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--teal-500)]" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ 解决方案（深蓝区） ═══════════ */}
      <section id="solutions" className="scroll-mt-16 bg-[#0a1a2e] py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <SectionHeading eyebrow={s.solutions.eyebrow} title={s.solutions.title} intro={s.solutions.intro} light />
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {s.solutions.items.map((item, i) => {
              const Icon = solutionIcons[i] ?? TruckIcon;
              const solImgs = ["sol-rail.webp", "sol-infra.webp", "sol-power.webp", "sol-tower.webp"];
              return (
                <div
                  key={i}
                  className="group overflow-hidden rounded-2xl border border-white/10 bg-[#0f2b4a]/60 backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-[var(--teal-500)]/40 hover:bg-[#122f52]"
                >
                  <div className="relative h-28 overflow-hidden">
                    <img
                      src={`/assets/${solImgs[i] ?? "sol-tower.webp"}`}
                      alt={item.title}
                      className="h-full w-full object-cover opacity-70 transition-all duration-300 group-hover:scale-105 group-hover:opacity-90"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a1a2e] via-transparent to-transparent" />
                    <div className="absolute bottom-3 left-4 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--teal-500)] text-[#06281f] shadow-lg">
                      <Icon />
                    </div>
                  </div>
                  <div className="p-5">
                    <p className="text-xs font-bold uppercase tracking-widest text-[var(--teal-500)]">
                      {item.sector}
                    </p>
                    <h3 className="mt-1.5 text-base font-bold text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--brand-100)]/60">{item.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════ AI 物流助手 ═══════════ */}
      <AIChatSection />

      {/* ═══════════ 中越协同网络 ═══════════ */}
      <section id="network" className="scroll-mt-16 py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <SectionHeading eyebrow={s.network.eyebrow} title={s.network.title} intro={s.network.intro} />
          {/* 中越口岸横幅图 */}
          <div className="relative mt-12 h-52 overflow-hidden rounded-2xl sm:h-64">
            <img
              src="/assets/case-04-cross-border-heavy-truck-D0zxHgaL.webp"
              alt="中越跨境物流"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0a1a2e]/85 via-[#0a1a2e]/40 to-[#0a1a2e]/85" />
            <div className="absolute inset-0 flex items-center justify-between px-8 sm:px-14">
              <div className="text-center">
                <p className="text-2xl font-bold text-white sm:text-3xl">🇨🇳</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-[var(--brand-100)]/70">China</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold uppercase tracking-[0.25em] text-[var(--teal-400)]">CN — VN</p>
                <p className="mt-1 text-xs text-[var(--brand-100)]/60">跨境运输 · 口岸协同</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white sm:text-3xl">🇻🇳</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-[var(--brand-100)]/70">Vietnam</p>
              </div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {[s.network.china, s.network.vietnam].map((side, i) => (
              <div key={i} className="rounded-2xl border border-[var(--surface-200)] bg-white p-7 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 rounded-full bg-[var(--teal-500)]/10 px-3.5 py-1.5 text-xs font-bold text-[var(--teal-700)]">
                    <PinIcon />
                    {side.flag}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-bold text-[var(--brand-900)]">{side.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--surface-500)]">{side.body}</p>
                <ul className="mt-4 space-y-2">
                  {side.points.map((p, j) => (
                    <li key={j} className="flex items-center gap-2.5 text-sm text-[var(--surface-600)]">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--teal-500)]/15 text-[var(--teal-600)]">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                          <path d="m5 12 5 5 9-10" />
                        </svg>
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-[var(--surface-400)]">{s.network.note}</p>
        </div>
      </section>

      {/* ═══════════ 代表项目 ═══════════ */}
      <section id="cases" className="scroll-mt-16 bg-[var(--surface-50)] py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <SectionHeading eyebrow={s.cases.eyebrow} title={s.cases.title} intro={s.cases.intro} />
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {s.cases.items.map((item, i) => (
              <Link
                key={i}
                href={`/cases/${item.id}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--surface-200)] bg-white shadow-sm transition-all hover:-translate-y-1 hover:border-[var(--teal-500)]/40 hover:shadow-md"
              >
                <div className="relative h-44 overflow-hidden">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0a1a2e]/70 via-transparent to-transparent" />
                  <span className="absolute left-4 top-3 text-xs font-bold uppercase tracking-widest text-white/90 drop-shadow">
                    {item.type}
                  </span>
                  <span className="absolute bottom-3 right-4 text-3xl font-bold text-white/25">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="text-base font-bold text-[var(--brand-900)]">{item.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--surface-500)]">{item.body}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    {item.tags.map((tag, j) => (
                      <span key={j} className="rounded-md bg-[var(--teal-500)]/10 px-2 py-1 text-xs font-medium text-[var(--teal-700)]">
                        {tag}
                      </span>
                    ))}
                    <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[var(--teal-600)] transition-colors group-hover:text-[var(--teal-500)]">
                      查看详情
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <p className="mt-7 text-center text-xs text-[var(--surface-400)]">{s.cases.note}</p>
        </div>
      </section>

      {/* ═══════════ 企业信息 ═══════════ */}
      <section id="company" className="scroll-mt-16 py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <SectionHeading eyebrow={s.company.eyebrow} title={s.company.title} intro={s.company.intro} />
          <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {s.company.entities.map((entity, i) => (
              <EntityCard key={i} entity={entity} />
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ 联系我们 ═══════════ */}
      <section id="contact" className="scroll-mt-16 bg-[#0a1a2e] py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div>
              <div className="flex items-center gap-3">
                <span className="h-0.5 w-10 bg-[var(--teal-500)]" />
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--teal-500)]">
                  {s.contact.eyebrow}
                </p>
              </div>
              <h2 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {s.contact.title}
              </h2>
              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-[var(--brand-100)]/65">
                {s.contact.intro}
              </p>
              <div className="mt-8 space-y-5">
                {s.contact.details.map((d, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--teal-500)]/15 text-[var(--teal-400)]">
                      {i === 0 ? <MailIcon /> : i === 1 ? <PhoneIcon /> : <PinIcon />}
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-100)]/40">
                        {d.label}
                      </p>
                      <p className="mt-1 text-sm font-medium text-white">{d.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0f2b4a]/60 backdrop-blur-sm">
              <div className="relative h-56">
                <img
                  src="/assets/case-01-night-heavy-haul-D7KdM_lM.webp"
                  alt="JIUNENG 大件设备运输"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a1a2e]/80 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-6">
                  <img
                    src="/assets/logo/logo-horizontal-white.png"
                    alt="JIUNENG logistics"
                    className="h-8 w-auto"
                  />
                </div>
              </div>
              <div className="p-6 text-center">
                <Link
                  href="/quote"
                  className="group inline-flex items-center gap-2 rounded-xl bg-[var(--teal-500)] px-8 py-3.5 text-sm font-bold text-[#06281f] shadow-lg shadow-[#08c792]/25 transition-all hover:-translate-y-0.5 hover:bg-[var(--teal-400)]"
                >
                  {s.contact.cta}
                  <ArrowIcon />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ 页脚 ═══════════ */}
      <footer className="border-t border-white/10 bg-[#0a1a2e] py-12">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.2fr_0.8fr_0.8fr_1fr]">
            {/* 品牌 */}
            <div>
              <img
                src="/assets/logo/logo-horizontal-white.png"
                alt="JIUNENG logistics"
                className="h-9 w-auto"
              />
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--brand-100)]/60">
                {s.footer.intro}
              </p>
            </div>
            {/* 官网导航 */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--brand-100)]/40">
                {s.footer.siteTitle}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {[
                  { href: "/#about", label: s.nav.about },
                  { href: "/#services", label: s.nav.services },
                  { href: "/#solutions", label: s.nav.solutions },
                  { href: "/#cases", label: s.nav.cases },
                  { href: "/#contact", label: s.nav.contact },
                ].map((l, i) => (
                  <li key={i}>
                    <Link href={l.href} className="text-sm text-[var(--brand-100)]/70 transition-colors hover:text-[var(--teal-400)]">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {/* 在线工具 */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--brand-100)]/40">
                {s.footer.toolsTitle}
              </h4>
              <ul className="mt-4 space-y-2.5">
                <li>
                  <Link href="/quote" className="text-sm text-[var(--brand-100)]/70 transition-colors hover:text-[var(--teal-400)]">
                    🧮 {s.nav.quote}
                  </Link>
                </li>
                <li>
                  <Link href="/batch" className="text-sm text-[var(--brand-100)]/70 transition-colors hover:text-[var(--teal-400)]">
                    📊 {t.nav.batch}
                  </Link>
                </li>
                <li>
                  <Link href="/#ai-assistant" className="text-sm text-[var(--brand-100)]/70 transition-colors hover:text-[var(--teal-400)]">
                    💬 {s.aiAssistant.eyebrow}
                  </Link>
                </li>
              </ul>
            </div>
            {/* 联系方式 */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--brand-100)]/40">
                {s.footer.contactTitle}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {s.contact.details.map((d, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-[var(--brand-100)]/70">
                    <span className="mt-0.5 text-[var(--teal-400)]">
                      {i === 0 ? "✉" : i === 1 ? "☎" : "📍"}
                    </span>
                    <span>{d.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 sm:flex-row">
            <p className="text-xs text-[var(--brand-100)]/40">{s.footer.rights}</p>
            <p className="text-xs text-[var(--brand-100)]/40">
              JIUNENG INTERNATIONAL COMPANY LIMITED · 0202235124
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
