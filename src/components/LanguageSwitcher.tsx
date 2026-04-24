import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_LABELS,
  detectLanguageFromPath,
  withLanguagePrefix,
  type SupportedLanguage,
} from "@/i18n";
import { NAV_CHROME_KEYS } from "@/i18n/navKeys";
import { FlagIcon } from "@/components/FlagIcon";

interface Props {
  variant?: "desktop" | "mobile";
}

export const LanguageSwitcher: React.FC<Props> = ({ variant = "desktop" }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const current = detectLanguageFromPath(location.pathname);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const switchTo = (lang: SupportedLanguage) => {
    const next = withLanguagePrefix(location.pathname, lang) + location.search + location.hash;
    setOpen(false);
    navigate(next);
  };

  if (variant === "mobile") {
    return (
      <div className="border-t border-border/40 mt-2 pt-3">
        <p className="text-xs text-muted-foreground/60 uppercase tracking-wider mb-1">
          {t(`nav.${NAV_CHROME_KEYS.language}`)}
        </p>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <button
            key={lang}
            onClick={() => switchTo(lang)}
            className={`flex items-center justify-between w-full text-left py-2 transition-colors ${
              current === lang ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="flex items-center gap-2">
              {/* Inline-SVG flag — renders identically across OSes (no
                  reliance on a colour-emoji font) and never makes a network
                  request. The fixed `w-5` slot keeps labels aligned across
                  scripts (Latin, Cyrillic, Devanagari, Arabic, CJK). */}
              <span aria-hidden="true" className="inline-flex w-5 justify-center">
                <FlagIcon lang={lang} size={18} />
              </span>
              <span>{LANGUAGE_LABELS[lang]}</span>
            </span>
            {current === lang && <Check className="w-4 h-4" />}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t(`nav.${NAV_CHROME_KEYS.language}`)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md flex items-center gap-1.5"
      >
        {/* Active language's flag, drawn as inline SVG so it never falls back
            to a bare country-code glyph on systems without colour-emoji. */}
        <FlagIcon lang={current} size={16} />
        <span className="text-xs uppercase tracking-wider">{current}</span>
      </button>
      <div
        role="listbox"
        className={`absolute top-full right-0 mt-1 w-40 bg-card border border-border rounded-lg shadow-xl overflow-hidden transition-all duration-150 ease-out origin-top-right z-50 ${
          open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"
        }`}
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <button
            key={lang}
            role="option"
            aria-selected={current === lang}
            onClick={() => switchTo(lang)}
            className={`flex items-center justify-between w-full text-left px-3 py-2 text-sm transition-colors ${
              current === lang
                ? "text-primary bg-primary/5"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            }`}
          >
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-flex w-5 justify-center">
                <FlagIcon lang={lang} size={18} />
              </span>
              <span>{LANGUAGE_LABELS[lang]}</span>
            </span>
            {current === lang && <Check className="w-3.5 h-3.5" />}
          </button>
        ))}
      </div>
    </div>
  );
};

export default LanguageSwitcher;