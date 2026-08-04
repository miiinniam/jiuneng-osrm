"use client";

import { LOCALES, LOCALE_NAMES } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n/LocaleContext";

const FLAGS: Record<string, string> = {
  zh: "🇨🇳",
  vi: "🇻🇳",
  en: "🇬🇧",
};

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="flex gap-0.5 rounded-lg bg-[var(--surface-100)] p-1">
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all duration-150 ${
            locale === code
              ? "bg-white text-[var(--surface-800)] shadow-[var(--shadow-sm)]"
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
