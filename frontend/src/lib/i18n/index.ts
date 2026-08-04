import { en } from "./en";
import { vi } from "./vi";
import { zh } from "./zh";
import type { Locale, Translations } from "./types";

export type { Locale, Translations };

export const TRANSLATIONS: Record<Locale, Translations> = { zh, vi, en };

export const LOCALE_NAMES: Record<Locale, string> = {
  zh: "中文",
  vi: "Tiếng Việt",
  en: "English",
};

export const LOCALES: Locale[] = ["zh", "vi", "en"];
