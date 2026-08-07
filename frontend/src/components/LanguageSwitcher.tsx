"use client";

import { LOCALES, LOCALE_NAMES } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n/LocaleContext";

const FLAGS: Record<string, string> = {
  zh: "🇨🇳",
  vi: "🇻🇳",
  en: "🇬🇧",
};

export default function LanguageSwitcher({ dark = false }: { dark?: boolean }) {
  const { locale, setLocale } = useLocale();

  return (
    <div
      className={`flex gap-0.5 rounded-lg p-1 ${
        dark
          ? // 实色深蓝底 + 强边框：深色 header 上禁止半透明气泡（会与滚动背景文字叠加）
            "border border-white/30 bg-[#16345c] shadow-md shadow-black/20"
          : "bg-[var(--surface-100)]"
      }`}
    >
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all duration-150 ${
            locale === code
              ? dark
                ? "bg-[var(--teal-500)] text-[#06281f] shadow-[var(--shadow-sm)]"
                : "bg-white text-[var(--surface-800)] shadow-[var(--shadow-sm)]"
              : dark
                ? "text-white hover:bg-white/20"
                : "text-[var(--surface-400)] hover:text-[var(--surface-600)]"
          }`}
          title={LOCALE_NAMES[code]}
        >
          <span className="text-sm leading-none">{FLAGS[code]}</span>
          <span className="hidden sm:inline">{code.toUpperCase()}</span>
        </button>
      ))}
    </div>
  );
}
