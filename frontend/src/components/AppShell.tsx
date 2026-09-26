"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import MobileMenu from "@/components/MobileMenu";
import AIChatFAB from "@/components/site/AIChatFAB";
import TemplateBar from "@/components/TemplateBar";
import { LocaleProvider } from "@/lib/i18n/LocaleContext";
import type { QuoteFormState } from "@/lib/types";

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
  return (
    <header
      className={`absolute top-0 left-0 right-0 z-[1000] flex items-center justify-between px-4 py-2.5 transition-colors duration-200 ${
        dark
          ? "border-b border-white/10 bg-gradient-to-b from-[#001030]/95 to-[#001030]/70 backdrop-blur-md"
          : "border-b border-[var(--border)]/40 bg-white/90 shadow-sm backdrop-blur-xl"
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
        {/* 语言切换：全端显示（移动端紧凑国旗版，实色高对比） */}
        <div className="block">
          <LanguageSwitcher dark={dark} />
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
  // 2026-09 v0.7 明亮化：官网 hero 改浅色（白雾遮罩 + 深色标题），
  // 全站导航统一走浅色 chrome —— 深色分支保留但不再启用，
  // 若将来 hero 改回深色照片满幅，把 dark 改回 `pathname === "/"` 即可。
  const dark = false;

  return (
    <LocaleProvider>
      <div className="flex h-full flex-col">
        <Header form={form} onLoadTemplate={onLoadTemplate} dark={dark} />
        <div id="main" className="relative flex-1 w-full">{children}</div>
        {/* 移动端 AI 悬浮气泡：仅官网首页（组件自身 lg:hidden，桌面不受影响） */}
        {pathname === "/" && <AIChatFAB />}
      </div>
    </LocaleProvider>
  );
}
