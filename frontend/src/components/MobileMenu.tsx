"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { LOCALES, LOCALE_NAMES } from "@/lib/i18n";

/**
 * 移动端汉堡菜单 — 全屏抽屉：官网锚点 + 工具入口 + 语言切换
 * variant: dark 用于官网首页（深蓝 hero），light 用于工具页（浅色 header）
 */
export default function MobileMenu({ variant = "dark" }: { variant?: "light" | "dark" }) {
  const { t, locale, setLocale } = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // 路由变化时关闭菜单
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // 锁定 body 滚动
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const light = variant === "light";

  const siteItems = [
    { href: "/#about", label: t.site.nav.about },
    { href: "/#services", label: t.site.nav.services },
    { href: "/#solutions", label: t.site.nav.solutions },
    { href: "/#ai-assistant", label: t.site.aiAssistant.eyebrow },
    { href: "/#cases", label: t.site.nav.cases },
    { href: "/#network", label: t.site.nav.network },
    { href: "/#contact", label: t.site.nav.contact },
  ];
  const toolItems = [
    { href: "/quote", label: t.site.nav.quote, icon: "🧮" },
    { href: "/batch", label: t.nav.batch, icon: "📊" },
  ];

  return (
    <>
      {/* 汉堡按钮 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors lg:hidden ${
          light
            ? "border border-[var(--surface-200)] bg-white text-[var(--surface-600)] shadow-sm hover:bg-[var(--surface-50)]"
            : "border border-white/15 bg-white/5 text-white backdrop-blur-sm hover:bg-white/10"
        }`}
        aria-label="打开菜单"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
        </svg>
      </button>

      {/* 抽屉遮罩 + 面板 */}
      {open && (
        <div className="fixed inset-0 z-[1100] lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-0 bottom-0 flex w-[84%] max-w-[340px] flex-col bg-[#0a1a2e] shadow-2xl">
            {/* 头部 */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2">
                <img
                  src="/assets/logo/logo-horizontal-white.png"
                  alt="JIUNENG logistics"
                  className="h-7 w-auto"
                />
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--brand-100)]/60 hover:bg-white/10 hover:text-white"
                aria-label="关闭菜单"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            {/* 菜单项 */}
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--brand-100)]/40">
                官网导航
              </p>
              <nav className="space-y-0.5">
                {siteItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-medium text-[var(--brand-100)]/80 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    {item.label}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-[var(--brand-100)]/30">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </Link>
                ))}
              </nav>

              <p className="px-3 pb-2 pt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--brand-100)]/40">
                在线工具
              </p>
              <nav className="space-y-0.5">
                {toolItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${
                      pathname === item.href
                        ? "bg-[var(--teal-500)]/15 text-[var(--teal-300)]"
                        : "text-white hover:bg-white/5"
                    }`}
                  >
                    <span>{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>

            {/* 底部：语言切换 */}
            <div className="border-t border-white/10 px-5 py-4">
              <p className="pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--brand-100)]/40">
                语言 / Language
              </p>
              <div className="flex gap-1.5">
                {LOCALES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setLocale(code)}
                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                      locale === code
                        ? "bg-[var(--teal-500)] text-[#06281f]"
                        : "bg-white/5 text-[var(--brand-100)]/70 hover:bg-white/10"
                    }`}
                  >
                    {LOCALE_NAMES[code]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
