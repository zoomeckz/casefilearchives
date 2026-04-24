import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import bg from "./locales/bg.json";

export const SUPPORTED_LANGUAGES = ["en", "bg"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  bg: "Български",
};

/** Reads `/bg/...` from the URL — does NOT touch localStorage on first paint. */
export function detectLanguageFromPath(pathname: string): SupportedLanguage {
  const seg = pathname.split("/").filter(Boolean)[0];
  if (seg && (SUPPORTED_LANGUAGES as readonly string[]).includes(seg)) {
    return seg as SupportedLanguage;
  }
  return "en";
}

/** Strips `/bg` prefix from a path so the existing router stays language-agnostic. */
export function stripLanguagePrefix(pathname: string): string {
  const lang = detectLanguageFromPath(pathname);
  if (lang === "en") return pathname;
  const stripped = pathname.replace(new RegExp(`^/${lang}`), "");
  return stripped || "/";
}

/** Adds `/bg` prefix for non-English language paths. */
export function withLanguagePrefix(pathname: string, lang: SupportedLanguage): string {
  const clean = stripLanguagePrefix(pathname);
  if (lang === "en") return clean;
  return `/${lang}${clean === "/" ? "" : clean}`;
}

const initialLang =
  typeof window !== "undefined"
    ? detectLanguageFromPath(window.location.pathname)
    : "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    bg: { translation: bg },
  },
  lng: initialLang,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;