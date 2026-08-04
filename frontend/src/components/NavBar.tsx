"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleContext";

/**
 * 统一导航：官网锚点（回到首页 sections）+ 工具路由（/quote /batch）
 * variant: dark 用于官网首页（深蓝 hero 上），light 用于工具页
 */
export default function NavBar({ variant = "light" }: { variant?: "light" | "dark" }) {
  const pathname = usePathname();
  const { t } = useLocale();

  const siteItems = [
    { href: "/#about", label: t.site.nav.about },
    { href: "/#services", label: t.site.nav.services },
    { href: "/#solutions", label: t.site.nav.solutions },
    { href: "/#ai-assistant", label: t.site.aiAssistant.eyebrow },
    { href: "/#cases", label: t.site.nav.cases },
    { href: "/#contact", label: t.site.nav.contact },
  ];
  const toolItems = [
    { href: "/quote", label: t.site.nav.quote, icon: "🧮" },
    { href: "/batch", label: t.nav.batch, icon: "📊" },
  ];

  const dark = variant === "dark";

  return (
    <nav className="flex items-center gap-1">
      {/* 官网锚点导航（桌面） */}
      <div className={`hidden items-center gap-0.5 lg:flex ${dark ? "" : "rounded-lg bg-[var(--surface-100)] p-1"}`}>
        {siteItems.map((item) => {
          const active = pathname === "/" && typeof window !== "undefined" && window.location.hash === item.href.slice(1);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
                dark
                  ? active
                    ? "text-white"
                    : "text-[var(--brand-100)]/70 hover:text-[var(--teal-400)]"
                  : active
                    ? "bg-white text-[var(--brand-700)] shadow-[var(--shadow-sm)]"
                    : "text-[var(--surface-500)] hover:bg-white/50 hover:text-[var(--surface-700)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* 工具导航 */}
      <div className={`flex items-center gap-1 ${dark ? "" : "rounded-lg bg-[var(--surface-100)] p-1"}`}>
        {toolItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
                dark
                  ? active
                    ? "bg-[var(--teal-500)]/20 text-[var(--teal-300)]"
                    : "text-[var(--brand-100)]/70 hover:text-[var(--teal-400)]"
                  : active
                    ? "bg-white text-[var(--brand-700)] shadow-[var(--shadow-sm)]"
                    : "text-[var(--surface-500)] hover:bg-white/50 hover:text-[var(--surface-700)]"
              }`}
            >
              <span className="text-sm">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
