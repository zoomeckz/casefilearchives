import React, { useEffect, useMemo, useState } from "react";
import { dbFetch } from "@/lib/dbFetch";
import { toast } from "sonner";
import { FlagIcon } from "@/components/FlagIcon";
import {
  NON_DEFAULT_LANGUAGES,
  LANGUAGE_LABELS,
  type SupportedLanguage,
} from "@/i18n";
import { Loader2, X, Check, Trash2, ExternalLink } from "lucide-react";

/**
 * Admin-only modal for managing per-language translations of a single chapter.
 *
 * One row per non-default language (English is the source of truth on `chapters`
 * itself, so we never store an `en` translation). Each row shows whether a
 * translation exists, lets the admin paste/edit `title` + `content` (HTML), and
 * upserts into `chapter_translations` via the same dbFetch REST utility used
 * everywhere else.
 *
 * IMPORTANT for the glossary popups to keep working in translated chapters:
 *   - Keep all proper nouns (character names, place names, magic-system terms)
 *     in their original English Latin spelling. The reader's `<InteractiveContent>`
 *     wraps them with a word-boundary regex against the English term, so any
 *     localised spelling will silently lose its popup.
 *   - Preserve every existing HTML tag if you started from the English source.
 */

interface ChapterTranslationsManagerProps {
  chapterId: string;
  chapterNumber: number;
  englishTitle: string;
  englishContent: string;
  authToken?: string;
  onClose: () => void;
}

interface TranslationRow {
  id?: string;
  language_code: string;
  title: string;
  content: string;
  updated_at?: string;
}

export const ChapterTranslationsManager: React.FC<ChapterTranslationsManagerProps> = ({
  chapterId,
  chapterNumber,
  englishTitle,
  englishContent,
  authToken,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Record<string, TranslationRow>>({});
  const [activeLang, setActiveLang] = useState<SupportedLanguage>(NON_DEFAULT_LANGUAGES[0]);

  // Local edit buffer keeps the textarea snappy without re-fetching on each keystroke.
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [dirty, setDirty] = useState(false);

  // Esc closes the modal — but only when the user isn't mid-edit; otherwise we
  // would risk losing unsaved paste-ins.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !dirty) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, onClose]);

  // Initial fetch of every existing translation row for this chapter.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await dbFetch<TranslationRow[]>("chapter_translations", {
        select: "id,language_code,title,content,updated_at",
        filters: `chapter_id=eq.${chapterId}`,
        token: authToken,
      });
      if (cancelled) return;
      if (error) {
        toast.error(`Failed to load translations: ${error}`);
      }
      const map: Record<string, TranslationRow> = {};
      (data ?? []).forEach((r) => {
        map[r.language_code] = r;
      });
      setRows(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [chapterId, authToken]);

  // When the active language tab changes, hydrate the draft from the saved row.
  useEffect(() => {
    const existing = rows[activeLang];
    setDraftTitle(existing?.title ?? "");
    setDraftContent(existing?.content ?? "");
    setDirty(false);
  }, [activeLang, rows]);

  const existing = rows[activeLang];

  const wordCount = useMemo(
    () => (draftContent ? draftContent.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length : 0),
    [draftContent],
  );
  const englishWordCount = useMemo(
    () => englishContent.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length,
    [englishContent],
  );

  const handleSave = async () => {
    if (!authToken) {
      toast.error("You must be signed in as an admin to save translations.");
      return;
    }
    if (!draftTitle.trim() || !draftContent.trim()) {
      toast.error("Title and content are required.");
      return;
    }
    setSaving(true);
    try {
      if (existing?.id) {
        const { error } = await dbFetch("chapter_translations", {
          method: "PATCH",
          filters: `id=eq.${existing.id}`,
          body: {
            title: draftTitle.trim(),
            content: draftContent,
            updated_at: new Date().toISOString(),
          },
          token: authToken,
        });
        if (error) throw new Error(error);
      } else {
        const { data, error } = await dbFetch<TranslationRow[]>("chapter_translations", {
          method: "POST",
          body: {
            chapter_id: chapterId,
            language_code: activeLang,
            title: draftTitle.trim(),
            content: draftContent,
          },
          token: authToken,
        });
        if (error) throw new Error(error);
        const inserted = Array.isArray(data) ? data[0] : (data as any);
        if (inserted) {
          setRows((r) => ({ ...r, [activeLang]: inserted }));
        }
      }
      // Refresh the row to pick up server-side timestamps when patching.
      const { data: refreshed } = await dbFetch<TranslationRow[]>("chapter_translations", {
        select: "id,language_code,title,content,updated_at",
        filters: `chapter_id=eq.${chapterId}&language_code=eq.${activeLang}`,
        token: authToken,
      });
      const fresh = refreshed?.[0];
      if (fresh) {
        setRows((r) => ({ ...r, [activeLang]: fresh }));
      }
      setDirty(false);
      toast.success(`${LANGUAGE_LABELS[activeLang]} translation saved.`);
    } catch (err: any) {
      toast.error(`Save failed: ${err.message ?? err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existing?.id || !authToken) return;
    if (!confirm(`Delete the ${LANGUAGE_LABELS[activeLang]} translation? Readers will fall back to English.`)) return;
    setSaving(true);
    try {
      const { error } = await dbFetch("chapter_translations", {
        method: "DELETE",
        filters: `id=eq.${existing.id}`,
        token: authToken,
      });
      if (error) throw new Error(error);
      setRows((r) => {
        const next = { ...r };
        delete next[activeLang];
        return next;
      });
      setDraftTitle("");
      setDraftContent("");
      setDirty(false);
      toast.success(`${LANGUAGE_LABELS[activeLang]} translation deleted.`);
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message ?? err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyEnglish = () => {
    setDraftTitle(englishTitle);
    setDraftContent(englishContent);
    setDirty(true);
    toast.message("Loaded English source as a starting point.");
  };

  const handleClose = () => {
    if (dirty && !confirm("You have unsaved changes. Discard them?")) return;
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-2 md:p-6"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-5xl max-h-[95vh] flex flex-col bg-card border border-border rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-lg md:text-xl font-bold text-foreground truncate">
              Translations · Ch. {chapterNumber}
            </h2>
            <p className="text-xs text-muted-foreground truncate">{englishTitle}</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded hover:bg-muted text-muted-foreground"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Language tabs */}
        <div className="px-4 md:px-6 pt-3 border-b border-border overflow-x-auto">
          <div className="flex gap-1 min-w-max pb-2">
            {NON_DEFAULT_LANGUAGES.map((lang) => {
              const has = !!rows[lang];
              const isActive = lang === activeLang;
              return (
                <button
                  key={lang}
                  onClick={() => {
                    if (dirty && !confirm("Discard unsaved changes?")) return;
                    setActiveLang(lang);
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-t text-sm transition-colors ${
                    isActive
                      ? "bg-secondary text-foreground border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <FlagIcon lang={lang} size={16} />
                  <span>{LANGUAGE_LABELS[lang]}</span>
                  {has ? (
                    <Check className="w-3.5 h-3.5 text-primary" aria-label="Translated" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" aria-label="Missing" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading translations…
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  onClick={handleCopyEnglish}
                  className="px-2.5 py-1 rounded bg-secondary hover:bg-secondary/80 text-foreground"
                >
                  Load English source
                </button>
                <a
                  href={`/chapters/${chapterNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-muted/60 hover:bg-muted text-muted-foreground"
                >
                  <ExternalLink className="w-3 h-3" /> Preview English
                </a>
                {existing?.updated_at && (
                  <span className="text-muted-foreground/70">
                    Last saved {new Date(existing.updated_at).toLocaleString()}
                  </span>
                )}
              </div>

              <div className="rounded border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-accent-foreground/90">
                <strong className="text-accent">Tip:</strong> keep proper nouns (Sedorium, Beambreak,
                character & place names) in their English spelling so the glossary popups still trigger on the
                translated chapter.
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Title</label>
                <input
                  type="text"
                  value={draftTitle}
                  onChange={(e) => {
                    setDraftTitle(e.target.value);
                    setDirty(true);
                  }}
                  placeholder={englishTitle}
                  className="w-full px-3 py-2 rounded bg-background border border-border text-foreground"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-muted-foreground">
                    Content (HTML)
                  </label>
                  <span className="text-[10px] text-muted-foreground">
                    {wordCount.toLocaleString()} words · English: {englishWordCount.toLocaleString()}
                  </span>
                </div>
                <textarea
                  value={draftContent}
                  onChange={(e) => {
                    setDraftContent(e.target.value);
                    setDirty(true);
                  }}
                  placeholder="Paste translated HTML here. Keep all <p>, <em>, <strong> tags exactly as in the English source."
                  spellCheck={false}
                  className="w-full min-h-[40vh] px-3 py-2 rounded bg-background border border-border text-foreground font-mono text-xs leading-relaxed"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 px-4 md:px-6 py-3 border-t border-border">
          <div>
            {existing?.id && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-destructive/15 hover:bg-destructive/25 text-destructive disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete this translation
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded bg-secondary hover:bg-secondary/80 text-foreground text-sm"
              disabled={saving}
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading || !dirty}
              className="inline-flex items-center gap-2 px-4 py-2 rounded bg-primary hover:bg-primary/90 text-primary-foreground text-sm disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {existing?.id ? "Update" : "Save"} {LANGUAGE_LABELS[activeLang]}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};