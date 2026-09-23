import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";

/**
 * Add a new language by:
 *   1. Dropping a translated `xx.json` next to `bg.json` and importing it here.
 *   2. Adding its code to `SUPPORTED_LANGUAGES` and a label to `LANGUAGE_LABELS`.
 *   3. Wiring the resource bag in the `i18n.init` call below.
 * Routes, the language switcher, hreflang tags, the dynamic SEO meta and the
 * sitemap edge function will all pick the new language up automatically.
 *
 * The FIRST entry is always the default language (no URL prefix). Every other
 * language is served at `/<code>/...`.
 */
export const SUPPORTED_LANGUAGES = ["en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = SUPPORTED_LANGUAGES[0];
export const NON_DEFAULT_LANGUAGES: SupportedLanguage[] = SUPPORTED_LANGUAGES.filter(
  (l) => l !== DEFAULT_LANGUAGE,
) as SupportedLanguage[];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
};

/**
 * Country/region flag for each language, rendered as a Unicode regional-
 * indicator emoji so we don't need to ship image assets or an icon library.
 * Notes on choices:
 *   - `en`  → 🇬🇧 (UK English; the project's locale tag is en-US, but a flag
 *     for "English the language" is conventionally the UK flag in switchers).
 *   - `ar`  → 🇸🇦 (Saudi Arabia is the most common stand-in for Arabic since
 *     there is no pan-Arab flag).
 *   - `zh`  → 🇨🇳 (Simplified Chinese mainland).
 * If you add a new language to SUPPORTED_LANGUAGES, add a flag here too —
 * TypeScript will complain otherwise.
 */
export const LANGUAGE_FLAGS: Record<SupportedLanguage, string> = {
  en: "🇬🇧",
};

/** Locale tags used by `Intl` / `Date.toLocaleString` — keep one per supported lang. */
export const LOCALE_TAGS: Record<SupportedLanguage, string> = {
  en: "en-US",
};

/** Reads the URL's first path segment — does NOT touch localStorage on first paint. */
export function detectLanguageFromPath(pathname: string): SupportedLanguage {
  const seg = pathname.split("/").filter(Boolean)[0];
  if (
    seg &&
    seg !== DEFAULT_LANGUAGE &&
    (SUPPORTED_LANGUAGES as readonly string[]).includes(seg)
  ) {
    return seg as SupportedLanguage;
  }
  return DEFAULT_LANGUAGE;
}

/** Strips any non-default language prefix so the existing router stays language-agnostic. */
export function stripLanguagePrefix(pathname: string): string {
  const lang = detectLanguageFromPath(pathname);
  if (lang === DEFAULT_LANGUAGE) return pathname;
  const stripped = pathname.replace(new RegExp(`^/${lang}`), "");
  return stripped || "/";
}

/** Adds a `/<code>/` prefix for non-default language paths; default returns clean path. */
export function withLanguagePrefix(pathname: string, lang: SupportedLanguage): string {
  const clean = stripLanguagePrefix(pathname);
  if (lang === DEFAULT_LANGUAGE) return clean;
  return `/${lang}${clean === "/" ? "" : clean}`;
}

const initialLang =
  typeof window !== "undefined"
    ? detectLanguageFromPath(window.location.pathname)
    : DEFAULT_LANGUAGE;

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: initialLang,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;