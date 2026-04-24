import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dbFetch } from "@/lib/dbFetch";
import { toast } from "sonner";
import { FlagIcon } from "@/components/FlagIcon";
import {
  NON_DEFAULT_LANGUAGES,
  LANGUAGE_LABELS,
  type SupportedLanguage,
} from "@/i18n";
import {
  Loader2,
  X,
  Check,
  Trash2,
  ExternalLink,
  AlertTriangle,
  Copy,
  Eraser,
  CornerDownLeft,
  Save,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

/**
 * Admin-only modal for managing per-language translations of a single chapter.
 *
 * Workflow we optimise for:
 *   1. Pick a language from the sidebar (status badges show coverage at a glance).
 *   2. Edit the chapter paragraph-by-paragraph next to the English source so the
 *      admin never has to scroll an opaque HTML blob to find what's missing.
 *   3. Save with Cmd/Ctrl+S; jump between languages with Alt+ArrowUp/Down.
 *
 * Storage model is unchanged: one row per (chapter_id, language_code) in
 * `chapter_translations` with the full assembled HTML in `content`.
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

interface ChapterMeta {
  updated_at?: string;
}

/**
 * Split the English source into editable paragraph chunks while keeping the
 * surrounding HTML so we can re-assemble identically on save.
 *
 * We treat each top-level <p>...</p> as one chunk; if there are zero <p> tags
 * we fall back to splitting on blank lines so plain-text drafts still work.
 *
 * Each chunk has:
 *   - `id`     stable index used as the React key
 *   - `outer`  the original HTML, used to re-emit on save (e.g. <p class="x">)
 *   - `open`   opening tag (or "" for plain text)
 *   - `close`  closing tag (or "" for plain text)
 *   - `text`   the inner text/HTML the admin will see and translate
 */
type Chunk = { id: number; outer: string; open: string; close: string; text: string };

const PARAGRAPH_RE = /<p\b[^>]*>[\s\S]*?<\/p>/gi;

function parseParagraphs(html: string): Chunk[] {
  const matches = html.match(PARAGRAPH_RE);
  if (matches && matches.length > 0) {
    return matches.map((outer, idx) => {
      const openMatch = outer.match(/^<p\b[^>]*>/i);
      const open = openMatch ? openMatch[0] : "<p>";
      const close = "</p>";
      const text = outer.slice(open.length, outer.length - close.length).trim();
      return { id: idx, outer, open, close, text };
    });
  }
  // Plain-text fallback: split on blank lines.
  return html
    .split(/\n{2,}/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text, idx) => ({ id: idx, outer: text, open: "", close: "", text }));
}

/** Strip tags + collapse whitespace for word counting and "same-as-source" checks. */
function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function wordCount(html: string): number {
  const t = plainText(html);
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
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
  const [chapterMeta, setChapterMeta] = useState<ChapterMeta | null>(null);
  const [activeLang, setActiveLang] = useState<SupportedLanguage>(NON_DEFAULT_LANGUAGES[0]);
  // Toggle between the structured paragraph editor and the raw-HTML escape hatch.
  const [rawMode, setRawMode] = useState(false);

  // English source decomposed once per chapter open — single source of truth for
  // the side-by-side editor and for re-assembly on save.
  const englishChunks = useMemo(() => parseParagraphs(englishContent), [englishContent]);

  // Editable buffers
  const [draftTitle, setDraftTitle] = useState("");
  const [draftParas, setDraftParas] = useState<string[]>([]);
  const [draftRaw, setDraftRaw] = useState("");
  const [dirty, setDirty] = useState(false);

  // Save callback ref so the keyboard listener doesn't capture stale closures.
  const handleSaveRef = useRef<() => void>(() => {});

  // ----- data load -----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: tData, error: tErr }, { data: cData }] = await Promise.all([
        dbFetch<TranslationRow[]>("chapter_translations", {
          select: "id,language_code,title,content,updated_at",
          filters: `chapter_id=eq.${chapterId}`,
          token: authToken,
        }),
        dbFetch<ChapterMeta[]>("chapters", {
          select: "updated_at",
          filters: `id=eq.${chapterId}`,
          token: authToken,
        }),
      ]);
      if (cancelled) return;
      if (tErr) toast.error(`Failed to load translations: ${tErr}`);
      const map: Record<string, TranslationRow> = {};
      (tData ?? []).forEach((r) => (map[r.language_code] = r));
      setRows(map);
      setChapterMeta(cData?.[0] ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [chapterId, authToken]);

  // ----- hydrate drafts when language changes or row data refreshes -----
  useEffect(() => {
    const existing = rows[activeLang];
    setDraftTitle(existing?.title ?? "");
    const sourceContent = existing?.content ?? "";
    setDraftRaw(sourceContent);
    if (sourceContent) {
      const parsed = parseParagraphs(sourceContent);
      // Align translation paragraphs to English chunks by index. If counts match
      // we get a clean side-by-side; otherwise extra translation paragraphs get
      // appended to the last slot so nothing is silently dropped.
      const aligned: string[] = englishChunks.map((_, i) => parsed[i]?.text ?? "");
      if (parsed.length > englishChunks.length) {
        const tail = parsed
          .slice(englishChunks.length)
          .map((c) => c.text)
          .join("\n\n");
        aligned[aligned.length - 1] = [aligned[aligned.length - 1], tail]
          .filter(Boolean)
          .join("\n\n");
      }
      setDraftParas(aligned);
    } else {
      setDraftParas(englishChunks.map(() => ""));
    }
    setDirty(false);
  }, [activeLang, rows, englishChunks]);

  const existing = rows[activeLang];

  // Re-assemble paragraph buffers into the same HTML shape as the English source
  // so glossary-term regexes and the reader's prose styles stay intact.
  const assembleContent = useCallback((): string => {
    return englishChunks
      .map((chunk, i) => {
        const text = (draftParas[i] ?? "").trim();
        if (!text) return "";
        return `${chunk.open}${text}${chunk.close}`;
      })
      .filter(Boolean)
      .join("\n\n");
  }, [englishChunks, draftParas]);

  const currentContent = rawMode ? draftRaw : assembleContent();

  // ----- coverage stats per language for the sidebar -----
  const languageStatus = useMemo(() => {
    return NON_DEFAULT_LANGUAGES.map((lang) => {
      const row = rows[lang];
      if (!row) return { lang, state: "missing" as const, filled: 0, total: englishChunks.length };
      const parsed = parseParagraphs(row.content);
      const filled = parsed.filter((p) => plainText(p.text).length > 0).length;
      const outdated =
        chapterMeta?.updated_at && row.updated_at
          ? new Date(row.updated_at).getTime() < new Date(chapterMeta.updated_at).getTime() - 60_000
          : false;
      const state: "complete" | "partial" | "outdated" = outdated
        ? "outdated"
        : filled >= englishChunks.length
          ? "complete"
          : "partial";
      return { lang, state, filled, total: englishChunks.length, outdated };
    });
  }, [rows, englishChunks, chapterMeta]);

  const enWords = useMemo(() => wordCount(englishContent), [englishContent]);
  const trWords = useMemo(() => wordCount(currentContent), [currentContent]);

  // ----- handlers -----
  const handleSave = useCallback(async () => {
    if (!authToken) {
      toast.error("You must be signed in as an admin to save translations.");
      return;
    }
    const finalContent = currentContent;
    if (!draftTitle.trim() || !plainText(finalContent)) {
      toast.error("Title and at least one translated paragraph are required.");
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
            content: finalContent,
            updated_at: new Date().toISOString(),
          },
          token: authToken,
        });
        if (error) throw new Error(error);
      } else {
        const { error } = await dbFetch<TranslationRow[]>("chapter_translations", {
          method: "POST",
          body: {
            chapter_id: chapterId,
            language_code: activeLang,
            title: draftTitle.trim(),
            content: finalContent,
          },
          token: authToken,
        });
        if (error) throw new Error(error);
      }
      // Always refresh from server to pick up timestamps + canonical id.
      const { data: refreshed } = await dbFetch<TranslationRow[]>("chapter_translations", {
        select: "id,language_code,title,content,updated_at",
        filters: `chapter_id=eq.${chapterId}&language_code=eq.${activeLang}`,
        token: authToken,
      });
      const fresh = refreshed?.[0];
      if (fresh) setRows((r) => ({ ...r, [activeLang]: fresh }));
      setDirty(false);
      toast.success(`${LANGUAGE_LABELS[activeLang]} translation saved.`);
    } catch (err: any) {
      toast.error(`Save failed: ${err.message ?? err}`);
    } finally {
      setSaving(false);
    }
  }, [authToken, currentContent, draftTitle, existing?.id, chapterId, activeLang]);

  // Keep the ref pointing at the latest save fn for the global key handler.
  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  // Global shortcuts: Esc closes (only when clean), Cmd/Ctrl+S saves,
  // Alt+Up/Down jumps between languages.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !dirty) {
        onClose();
        return;
      }
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSaveRef.current();
        return;
      }
      if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        if (dirty && !confirm("Discard unsaved changes?")) return;
        const idx = NON_DEFAULT_LANGUAGES.indexOf(activeLang);
        const next =
          e.key === "ArrowDown"
            ? NON_DEFAULT_LANGUAGES[(idx + 1) % NON_DEFAULT_LANGUAGES.length]
            : NON_DEFAULT_LANGUAGES[(idx - 1 + NON_DEFAULT_LANGUAGES.length) % NON_DEFAULT_LANGUAGES.length];
        setActiveLang(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, onClose, activeLang]);

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
      setDraftParas(englishChunks.map(() => ""));
      setDraftRaw("");
      setDirty(false);
      toast.success(`${LANGUAGE_LABELS[activeLang]} translation deleted.`);
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message ?? err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (dirty && !confirm("You have unsaved changes. Discard them?")) return;
    onClose();
  };

  const handleCopyAllEnglish = () => {
    setDraftTitle(englishTitle);
    setDraftParas(englishChunks.map((c) => c.text));
    setDraftRaw(englishContent);
    setDirty(true);
    toast.message("Loaded English source — translate paragraph by paragraph.");
  };

  const handleClearAll = () => {
    if (!confirm("Clear all paragraphs for this language?")) return;
    setDraftParas(englishChunks.map(() => ""));
    setDraftRaw("");
    setDirty(true);
  };

  const updateParagraph = (idx: number, value: string) => {
    setDraftParas((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
    setDirty(true);
  };

  const fillFromEnglish = (idx: number) => {
    updateParagraph(idx, englishChunks[idx].text);
  };

  const outdatedHere =
    chapterMeta?.updated_at && existing?.updated_at
      ? new Date(existing.updated_at).getTime() < new Date(chapterMeta.updated_at).getTime() - 60_000
      : false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-2 md:p-6"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-7xl h-[95vh] flex flex-col bg-card border border-border rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-lg md:text-xl font-bold text-foreground truncate">
              Translations · Ch. {chapterNumber}
            </h2>
            <p className="text-xs text-muted-foreground truncate">{englishTitle}</p>
          </div>
          <div className="hidden md:flex items-center gap-2 text-[11px] text-muted-foreground">
            <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted/40">⌘/Ctrl+S</kbd>
            <span>save</span>
            <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted/40">Alt+↑↓</kbd>
            <span>language</span>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded hover:bg-muted text-muted-foreground"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — sidebar + editor */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* Language sidebar */}
          <aside className="md:w-60 shrink-0 border-b md:border-b-0 md:border-r border-border bg-muted/20 overflow-y-auto">
            <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              Languages
            </div>
            <ul className="px-2 pb-3 space-y-0.5">
              {languageStatus.map(({ lang, state, filled, total }) => {
                const isActive = lang === activeLang;
                const dot =
                  state === "complete"
                    ? "bg-primary"
                    : state === "partial"
                      ? "bg-amber-500"
                      : state === "outdated"
                        ? "bg-orange-500"
                        : "bg-muted-foreground/40";
                return (
                  <li key={lang}>
                    <button
                      onClick={() => {
                        if (dirty && !confirm("Discard unsaved changes?")) return;
                        setActiveLang(lang);
                      }}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors ${
                        isActive
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      <FlagIcon lang={lang} size={16} />
                      <span className="flex-1 truncate">{LANGUAGE_LABELS[lang]}</span>
                      {state === "outdated" && (
                        <AlertTriangle
                          className="w-3.5 h-3.5 text-orange-500"
                          aria-label="Source updated since this translation"
                        />
                      )}
                      <span className={`w-2 h-2 rounded-full ${dot}`} aria-hidden />
                      <span className="text-[10px] tabular-nums text-muted-foreground/80">
                        {filled}/{total}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Editor */}
          <section className="flex-1 min-w-0 flex flex-col">
            {loading ? (
              <div className="p-6 flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading translations…
              </div>
            ) : (
              <>
                {/* Toolbar */}
                <div className="px-4 md:px-6 py-2 border-b border-border flex flex-wrap items-center gap-2 text-xs">
                  <button
                    onClick={handleCopyAllEnglish}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-secondary hover:bg-secondary/80 text-foreground"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy all English
                  </button>
                  <button
                    onClick={handleClearAll}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-muted/60 hover:bg-muted text-muted-foreground"
                  >
                    <Eraser className="w-3.5 h-3.5" /> Clear all
                  </button>
                  <button
                    onClick={() => setRawMode((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded ${
                      rawMode
                        ? "bg-primary/15 text-primary"
                        : "bg-muted/60 hover:bg-muted text-muted-foreground"
                    }`}
                    title="Edit the raw HTML directly — useful when paragraph alignment doesn't fit"
                  >
                    {rawMode ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {rawMode ? "Paragraph editor" : "Raw HTML"}
                  </button>
                  <a
                    href={`/chapters/${chapterNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded bg-muted/40 hover:bg-muted text-muted-foreground"
                  >
                    <ExternalLink className="w-3 h-3" /> Preview English
                  </a>
                  <span className="text-muted-foreground/80 tabular-nums">
                    {trWords.toLocaleString()}/{enWords.toLocaleString()} words
                  </span>
                </div>

                {/* Status banner */}
                {(outdatedHere || existing?.updated_at) && (
                  <div
                    className={`px-4 md:px-6 py-2 text-xs flex items-center gap-2 border-b border-border ${
                      outdatedHere
                        ? "bg-orange-500/10 text-orange-600 dark:text-orange-300"
                        : "bg-muted/30 text-muted-foreground"
                    }`}
                  >
                    {outdatedHere ? (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5" />
                        English source was updated after this translation was last saved
                        {chapterMeta?.updated_at && (
                          <> ({new Date(chapterMeta.updated_at).toLocaleString()}).</>
                        )}{" "}
                        Review the highlighted paragraphs.
                      </>
                    ) : existing?.updated_at ? (
                      <>Last saved {new Date(existing.updated_at).toLocaleString()}.</>
                    ) : null}
                  </div>
                )}

                {/* Title */}
                <div className="px-4 md:px-6 py-3 border-b border-border space-y-2">
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                        English title
                      </label>
                      <div className="px-3 py-2 rounded bg-muted/30 text-sm text-muted-foreground">
                        {englishTitle}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                        {LANGUAGE_LABELS[activeLang]} title
                      </label>
                      <input
                        type="text"
                        value={draftTitle}
                        onChange={(e) => {
                          setDraftTitle(e.target.value);
                          setDirty(true);
                        }}
                        placeholder={englishTitle}
                        className="w-full px-3 py-2 rounded bg-background border border-border text-foreground text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Paragraph editor / raw HTML */}
                <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-3">
                  {rawMode ? (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                        Raw HTML for {LANGUAGE_LABELS[activeLang]}
                      </div>
                      <textarea
                        value={draftRaw}
                        onChange={(e) => {
                          setDraftRaw(e.target.value);
                          setDirty(true);
                        }}
                        spellCheck={false}
                        className="w-full min-h-[60vh] px-3 py-2 rounded bg-background border border-border text-foreground font-mono text-xs leading-relaxed"
                      />
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Edits here override the paragraph editor on save. Switching back to the paragraph
                        view re-parses what you typed.
                      </p>
                    </div>
                  ) : (
                    <ol className="space-y-3">
                      {englishChunks.map((chunk, idx) => {
                        const trText = draftParas[idx] ?? "";
                        const trEmpty = !plainText(trText);
                        const sameAsEnglish =
                          !trEmpty && plainText(trText) === plainText(chunk.text);
                        return (
                          <li
                            key={chunk.id}
                            className={`grid md:grid-cols-2 gap-2 rounded border p-2 ${
                              trEmpty
                                ? "border-amber-500/30 bg-amber-500/5"
                                : sameAsEnglish
                                  ? "border-orange-500/30 bg-orange-500/5"
                                  : "border-border bg-background/40"
                            }`}
                          >
                            <div className="text-sm leading-relaxed text-muted-foreground">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                                  ¶ {idx + 1} · English
                                </span>
                                <button
                                  type="button"
                                  onClick={() => fillFromEnglish(idx)}
                                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted/60 hover:bg-muted text-muted-foreground"
                                  title="Copy this paragraph to the translation column"
                                >
                                  <CornerDownLeft className="w-3 h-3" /> copy ↦
                                </button>
                              </div>
                              <div
                                className="prose prose-sm max-w-none prose-p:my-0 text-foreground/80"
                                // English is admin-authored content; safe to render.
                                dangerouslySetInnerHTML={{ __html: chunk.text }}
                              />
                            </div>
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                                  {LANGUAGE_LABELS[activeLang]}
                                </span>
                                <span
                                  className={`text-[10px] ${
                                    trEmpty
                                      ? "text-amber-600 dark:text-amber-400"
                                      : sameAsEnglish
                                        ? "text-orange-600 dark:text-orange-400"
                                        : "text-primary"
                                  }`}
                                >
                                  {trEmpty
                                    ? "missing"
                                    : sameAsEnglish
                                      ? "same as source"
                                      : (
                                          <span className="inline-flex items-center gap-1">
                                            <Check className="w-3 h-3" /> filled
                                          </span>
                                        )}
                                </span>
                              </div>
                              <textarea
                                value={trText}
                                onChange={(e) => updateParagraph(idx, e.target.value)}
                                spellCheck
                                rows={Math.max(3, Math.min(12, Math.ceil(chunk.text.length / 80)))}
                                placeholder="Translation…"
                                className="w-full px-3 py-2 rounded bg-background border border-border text-foreground text-sm leading-relaxed"
                              />
                            </div>
                          </li>
                        );
                      })}
                      {englishChunks.length === 0 && (
                        <li className="text-sm text-muted-foreground">
                          The English source has no paragraphs to align against — switch to{" "}
                          <strong>Raw HTML</strong> to author this translation.
                        </li>
                      )}
                    </ol>
                  )}
                </div>
              </>
            )}
          </section>
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
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {existing?.id ? "Update" : "Save"} {LANGUAGE_LABELS[activeLang]}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
