import React from "react";
import { FlagIcon } from "@/components/FlagIcon";
import { LANGUAGE_LABELS, type SupportedLanguage } from "@/i18n";

interface Props {
  /** Languages offered as buttons (readers: available only; admin: every supported language). */
  options: SupportedLanguage[];
  /** Languages that actually have text for this story. */
  available: SupportedLanguage[];
  active: SupportedLanguage;
  onChange: (lang: SupportedLanguage) => void;
  /** Admin preview: show languages without a translation (they fall back to English). */
  showMissing?: boolean;
}

/**
 * Per-story language picker. Defaults to the site language when a translation
 * exists, otherwise the English source. Works for any language added to
 * SUPPORTED_LANGUAGES — nothing here is language-specific.
 */
export const StoryLanguageToggle: React.FC<Props> = ({ options, available, active, onChange, showMissing }) => {
  const activeMissing = !available.includes(active);
  return (
    <div className="mt-4">
      <div role="radiogroup" aria-label="Story language" className="inline-flex flex-wrap border border-border">
        {options.map((lang) => {
          const has = available.includes(lang);
          const selected = lang === active;
          return (
            <button
              key={lang}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(lang)}
              title={has ? LANGUAGE_LABELS[lang] : `${LANGUAGE_LABELS[lang]} — not translated yet`}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs uppercase tracking-wider transition-colors ${
                selected
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              } ${!has && showMissing ? "opacity-60" : ""}`}
            >
              <FlagIcon lang={lang} size={16} />
              <span>{lang}</span>
            </button>
          );
        })}
      </div>
      {activeMissing && (
        <p className="mt-2 text-xs text-muted-foreground">
          No {LANGUAGE_LABELS[active]} version yet — readers in that language see the English text.
        </p>
      )}
    </div>
  );
};

export default StoryLanguageToggle;
