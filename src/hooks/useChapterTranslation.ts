import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { dbFetch } from "@/lib/dbFetch";
import {
  DEFAULT_LANGUAGE,
  type SupportedLanguage,
  SUPPORTED_LANGUAGES,
} from "@/i18n";

/**
 * Loads all available translations for a single chapter and exposes:
 *   - `available`: which languages actually have a translation row for it,
 *     so the reader can render a toggle that only offers real choices
 *     (showing 8 flags when 5 of them 404 would be confusing).
 *   - `active`: the language currently being shown — defaults to the i18n
 *     site language if a translation exists, otherwise falls back to the
 *     default language (English source). The user can override it locally
 *     without changing the whole site language.
 *   - `title` / `content`: ready-to-render strings, already swapped to the
 *     chosen translation when one is selected.
 *
 * The English source lives on the `chapters` row itself — it never appears
 * in `chapter_translations`, so we surface it as a synthetic entry keyed by
 * `DEFAULT_LANGUAGE` to keep the toggle uniform.
 */
interface ChapterLike {
  id: string;
  title: string;
  content: string;
}

interface TranslationRow {
  language_code: string;
  title: string;
  content: string;
}

export function useChapterTranslation(chapter: ChapterLike | null) {
  const { i18n } = useTranslation();
  const siteLang = (i18n.language as SupportedLanguage) || DEFAULT_LANGUAGE;

  const [rows, setRows] = useState<TranslationRow[]>([]);
  const [override, setOverride] = useState<SupportedLanguage | null>(null);

  // Reset the per-chapter override whenever the chapter changes — otherwise
 // navigating prev/next would keep an old language selection that may not
 // exist for the new chapter.
  useEffect(() => {
    setOverride(null);
    setRows([]);
    if (!chapter?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await dbFetch<TranslationRow[]>("chapter_translations", {
        select: "language_code,title,content",
        filters: `chapter_id=eq.${chapter.id}`,
      });
      if (!cancelled && Array.isArray(data)) setRows(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [chapter?.id]);

  const translatedLangs = rows
    .map((r) => r.language_code as SupportedLanguage)
    .filter((l) => (SUPPORTED_LANGUAGES as readonly string[]).includes(l));

  // Always include the source language (English) as a selectable option
 // since the canonical text lives on the chapter row.
  const available: SupportedLanguage[] = Array.from(
    new Set<SupportedLanguage>([DEFAULT_LANGUAGE, ...translatedLangs]),
  );

  // Resolve the active language: explicit user override wins; otherwise
 // mirror the site language if it has a translation; else English.
  const active: SupportedLanguage = override
    ? override
    : available.includes(siteLang)
      ? siteLang
      : DEFAULT_LANGUAGE;

  const row = rows.find((r) => r.language_code === active);
  const title = row?.title?.trim() || chapter?.title || "";
  const content = row?.content?.trim() || chapter?.content || "";
  const isTranslated = active !== DEFAULT_LANGUAGE && Boolean(row);

  return {
    available,
    active,
    setActive: (lang: SupportedLanguage) => setOverride(lang),
    title,
    content,
    isTranslated,
  };
}
