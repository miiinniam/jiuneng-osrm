"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import MobileMenu from "@/components/MobileMenu";
import TemplateBar from "@/components/TemplateBar";
import { LocaleProvider, useLocale } from "@/lib/i18n/LocaleContext";
import type { QuoteFormState, TemplateOut } from "@/lib/types";

function BrandLogo({ dark }: { dark: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="JIUNENG logistics">
      {dark ? (
        <img
          src="/assets/logo/logo-horizontal-white.png"
          alt="JIUNENG logistics"
          className="h-8 w-auto"
        />
      ) : (
        <img
          src="/assets/logo/logo-horizontal.webp"
          alt="JIUNENG logistics"
          className="h-8 w-auto"
        />
      )}
    </Link>
  );
}

function Header({
  form,
  onLoadTemplate,
  dark,
}: {
  form?: QuoteFormState;
  onLoadTemplate?: (config: QuoteFormState) => void;
  dark: boolean;
}) {
  const { t } = useLocale();
  return (
    <header
      className={`absolute top-0 left-0 right-0 z-[1000] flex items-center justify-between px-4 py-2.5 transition-colors duration-200 ${
        dark
          ? "border-b border-white/10 bg-gradient-to-b from-[#0a1a2e]/95 to-[#0a1a2e]/70 backdrop-blur-md"
          : "border-b border-[var(--border)]/40 bg-white/85 shadow-sm backdrop-blur-xl"
      }`}
    >
      <BrandLogo dark={dark} />
      <div className="flex items-center gap-2">
        {/* 桌面导航：≥lg 显示 */}
        <div className="hidden lg:flex lg:items-center lg:gap-2">
          <NavBar variant={dark ? "dark" : "light"} />
        </div>
        {form && onLoadTemplate && (
          <div className="hidden lg:block">
            <TemplateBar form={form} onLoad={onLoadTemplate} compact />
          </div>
        )}
        {/* 语言切换：≥lg 显示；移动端移入汉堡菜单 */}
        <div className="hidden lg:block">
          <LanguageSwitcher />
        </div>
        {/* 移动端汉堡菜单：<lg 显示 */}
        <MobileMenu variant={dark ? "dark" : "light"} />
      </div>
    </header>
  );
}

export default function AppShell({
  children,
  form,
  onLoadTemplate,
}: {
  children: React.ReactNode;
  form?: QuoteFormState;
  onLoadTemplate?: (config: QuoteFormState) => void;
}) {
  const pathname = usePathname();
  // 官网首页 → 深色导航（深蓝 hero）；报价/批量工具 → 浅色导航
  const dark = pathname === "/";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <LocaleProvider>
      <div className="flex h-full flex-col">
        <Header
          form={form}
          onLoadTemplate={onLoadTemplate}
          dark={dark && !scrolled}
        />
        <div className="relative flex-1 w-full">{children}</div>
      </div>
    </LocaleProvider>
  );
}
