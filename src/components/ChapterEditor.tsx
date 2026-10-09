import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Icons } from '@/lib/icons';
import { RichTextEditor } from '@/components/RichTextEditor';
import { ImageUploadField } from '@/components/ImageUploadField';
import { dbFetch } from '@/lib/dbFetch';
import { GlossaryEntry } from '@/lib/data';
import { swedishToUTC, utcToSwedishDateTimeLocal } from '@/lib/timezone';
import { normalizeRichTextHtml } from '@/lib/contentFormatting';
import { toast } from 'sonner';
import { TagPicker } from '@/components/TagPicker';
import { CollapsiblePanel } from '@/components/Collapsible';
import { FlagIcon } from '@/components/FlagIcon';
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, DEFAULT_LANGUAGE, type SupportedLanguage } from '@/i18n';
import { InteractiveEditor } from '@/components/interactive/InteractiveEditor';
import { InteractiveReader } from '@/components/interactive/InteractiveReader';
import { type InteractiveGraph, emptyGraph, normalizeGraph, validateGraph, removedNodeIds, openingContent } from '@/lib/interactive';

type LangBuffer = { id?: string; title: string; content: string };
type StoryFormat = 'linear' | 'interactive';

// The drafts table only stores title/content, so an unpublished interactive
// case structure is backed up in this browser until it is published.
const IC_BACKUP_KEY = 'ic-editor-backup:new';

interface ChapterEditorProps {
  authToken?: string;
  userId?: string;
  glossary: Record<string, GlossaryEntry>;
  onBack: () => void;
  editChapterId?: string | null;
  resumeDraftId?: string | null;
  searchHighlight?: string | null;
  searchSentence?: string | null;
  /** Create a new chapter in the archived legacy story instead of a standalone story. */
  legacy?: boolean;
}

export interface ChapterDraft {
  id: string;
  title: string;
  content: string;
  chapterNumber: number;
  lastSaved: string;
}

function normalizeScheduledAt(value: string): string {
  if (!value) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T10:00`;
  const m = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}` : value;
}

// Cadence anchor for optional scheduling.
const CADENCE_ANCHOR_ISO = '2026-05-06';
const CADENCE_DAYS = 3;

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextCadenceSlotAfter(after?: Date): string {
  const anchor = new Date(`${CADENCE_ANCHOR_ISO}T12:00:00Z`);
  const target = after ? new Date(after) : new Date();
  const diffDays = Math.floor((target.getTime() - anchor.getTime()) / 86400000);
  // Find smallest k such that anchor + k*CADENCE_DAYS > target (in days)
  const k = Math.max(0, Math.floor(diffDays / CADENCE_DAYS) + 1);
  return addDaysIso(CADENCE_ANCHOR_ISO, k * CADENCE_DAYS);
}

function getNextAvailableSlot(takenDates: string[], after?: Date): string {
  const taken = new Set(takenDates);
  let candidateIso = nextCadenceSlotAfter(after);
  for (let i = 0; i < 400; i++) {
    if (!taken.has(candidateIso)) return `${candidateIso}T10:00`;
    candidateIso = addDaysIso(candidateIso, CADENCE_DAYS);
  }
  return `${candidateIso}T10:00`;
}

/**
 * Returns the next cadence slot following the latest already-scheduled story.
 */
function getSlotAfterLatestScheduled(takenDates: string[]): string {
  if (!takenDates.length) return getNextAvailableSlot(takenDates);
  const latestIso = [...takenDates].sort().pop()!;
  const latestDate = new Date(`${latestIso}T12:00:00Z`);
  return getNextAvailableSlot(takenDates, latestDate);
}

// ── Calendar helpers ──

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Monday-first offset of the 1st of the month. */
function firstWeekdayOffset(year: number, month: number): number {
  return (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
}

function daysInMonthOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ── DB-backed draft helpers ──

export async function getAllDrafts(token?: string): Promise<ChapterDraft[]> {
  const { data } = await dbFetch<any[]>('chapter_drafts', {
    select: 'id,title,content,chapter_number,updated_at',
    order: 'updated_at.desc',
    token,
  });
  return (data || []).map((d: any) => ({
    id: d.id,
    title: d.title,
    content: d.content,
    chapterNumber: d.chapter_number,
    lastSaved: d.updated_at,
  }));
}

async function getDraftById(draftId: string, token?: string): Promise<ChapterDraft | null> {
  const { data } = await dbFetch<any[]>('chapter_drafts', {
    select: 'id,title,content,chapter_number,updated_at',
    filters: `id=eq.${draftId}`,
    token,
  });
  if (!data?.[0]) return null;
  const d = data[0];
  return { id: d.id, title: d.title, content: d.content, chapterNumber: d.chapter_number, lastSaved: d.updated_at };
}

async function upsertDraft(draft: ChapterDraft, userId: string, token?: string): Promise<string> {
  // Check if draft exists
  const { data: existing } = await dbFetch<any[]>('chapter_drafts', {
    select: 'id',
    filters: `id=eq.${draft.id}`,
    token,
  });

  if (existing && existing.length > 0) {
    await dbFetch('chapter_drafts', {
      method: 'PATCH',
      filters: `id=eq.${draft.id}`,
      body: { title: draft.title, content: draft.content, chapter_number: draft.chapterNumber },
      token,
    });
    return draft.id;
  }

  const { data, error } = await dbFetch<any[]>('chapter_drafts', {
    method: 'POST',
    body: { title: draft.title, content: draft.content, chapter_number: draft.chapterNumber, user_id: userId },
    token,
  });
  if (error) throw new Error(error);
  return data?.[0]?.id || draft.id;
}

export async function deleteDraft(draftId: string, token?: string) {
  await dbFetch('chapter_drafts', {
    method: 'DELETE',
    filters: `id=eq.${draftId}`,
    token,
  });
}

export const ChapterEditor: React.FC<ChapterEditorProps> = ({ authToken, userId, glossary, onBack, editChapterId, resumeDraftId, searchHighlight, searchSentence, legacy = false }) => {
  const [isLegacy, setIsLegacy] = useState(legacy);
  const [tags, setTags] = useState<string[]>([]);
  const draftIdRef = useRef<string>(resumeDraftId || '');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [chapterNumber, setChapterNumber] = useState(1);
  const [scheduledAt, setScheduledAt] = useState<string>('');
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [draftStatus, setDraftStatus] = useState<string>('');
  const [loadingChapter, setLoadingChapter] = useState(!!editChapterId);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [glossaryMarked, setGlossaryMarked] = useState(false);
  const [takenSlots, setTakenSlots] = useState<string[]>([]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth()); // 0-based
  // Per-language editing: English lives on the story row, others in chapter_translations.
  const [editLang, setEditLang] = useState<SupportedLanguage>(DEFAULT_LANGUAGE);
  const langBuffers = useRef<Partial<Record<SupportedLanguage, LangBuffer>>>({});
  const [filledLangs, setFilledLangs] = useState<SupportedLanguage[]>([DEFAULT_LANGUAGE]);
  // Interactive Case Files: branching structure stored in chapters.interactive_graph.
  const [storyFormat, setStoryFormat] = useState<StoryFormat>('linear');
  const [graph, setGraph] = useState<InteractiveGraph>(() => emptyGraph());
  const [publishedGraph, setPublishedGraph] = useState<InteractiveGraph | null>(null);
  const [publishedFormat, setPublishedFormat] = useState<StoryFormat>('linear');
  const isInteractive = storyFormat === 'interactive' && !isLegacy;

  const switchEditLang = (next: SupportedLanguage) => {
    if (next === editLang) return;
    langBuffers.current[editLang] = { ...langBuffers.current[editLang], title, content };
    const target = langBuffers.current[next];
    setTitle(target?.title ?? '');
    setContent(target?.content ?? '');
    setEditLang(next);
  };

  const changeStoryFormat = (next: StoryFormat) => {
    if (next === storyFormat) return;
    if (next === 'linear' && publishedFormat === 'interactive' &&
      !window.confirm('This case is published as interactive. Switching to linear hides the branches and readers’ saved routes until you switch back. Continue?')) {
      return;
    }
    if (next === 'interactive') {
      if (editLang !== DEFAULT_LANGUAGE) switchEditLang(DEFAULT_LANGUAGE);
      // Carry already-written prose into the opening section of an empty case.
      const opening = graph.nodes.find((n) => n.id === graph.startNodeId);
      if (opening && !opening.content.replace(/<[^>]*>/g, '').trim() && content.replace(/<[^>]*>/g, '').trim()) {
        setGraph({ ...graph, nodes: graph.nodes.map((n) => (n.id === opening.id ? { ...n, content } : n)) });
      }
    }
    setStoryFormat(next);
  };

  // Load all scheduled slots to prevent double-booking
  useEffect(() => {
    const loadTaken = async () => {
      const { data } = await dbFetch<any[]>('chapters', {
        select: 'id,scheduled_at',
        filters: 'scheduled_at=not.is.null',
        token: authToken,
      });
      const dates = (data || [])
        .filter((c: any) => !editChapterId || c.id !== editChapterId)
        .map((c: any) => {
          const sw = utcToSwedishDateTimeLocal(c.scheduled_at);
          return sw.slice(0, 10);
        })
        .filter(Boolean);
      setTakenSlots(dates);
    };
    loadTaken();
  }, [authToken, editChapterId]);

  // Load existing story or legacy chapter for editing
  useEffect(() => {
    if (editChapterId) {
      const loadChapter = async () => {
        const { data } = await dbFetch<any[]>('chapters', {
          select: 'title,content,chapter_number,scheduled_at,cover_image_url,is_archived,tags,story_format,interactive_graph',
          filters: `id=eq.${editChapterId}`,
          token: authToken,
        });
        if (data && data[0]) {
          setTitle(data[0].title);
          setContent(data[0].content);
          setChapterNumber(data[0].chapter_number);
          setCoverImageUrl(data[0].cover_image_url || null);
          setIsLegacy(data[0].is_archived === true);
          setTags(Array.isArray(data[0].tags) ? data[0].tags : []);
          if (data[0].interactive_graph) {
            const g = normalizeGraph(data[0].interactive_graph);
            setGraph(g);
            setPublishedGraph(g);
          }
          if (data[0].story_format === 'interactive') {
            setStoryFormat('interactive');
            setPublishedFormat('interactive');
          }
          langBuffers.current[DEFAULT_LANGUAGE] = { title: data[0].title, content: data[0].content };
          const { data: tr } = await dbFetch<any[]>('chapter_translations', {
            select: 'id,language_code,title,content',
            filters: `chapter_id=eq.${editChapterId}`,
            token: authToken,
          });
          const filled: SupportedLanguage[] = [DEFAULT_LANGUAGE];
          for (const r of tr || []) {
            if ((SUPPORTED_LANGUAGES as readonly string[]).includes(r.language_code)) {
              langBuffers.current[r.language_code as SupportedLanguage] = { id: r.id, title: r.title, content: r.content };
              filled.push(r.language_code);
            }
          }
          setFilledLangs(filled);
          if (data[0].scheduled_at) {
            setScheduledAt(normalizeScheduledAt(utcToSwedishDateTimeLocal(data[0].scheduled_at)));
          }
        }
        setLoadingChapter(false);
      };
      loadChapter();
    } else {
      // Restore an unpublished interactive case kept in this browser.
      try {
        const backup = localStorage.getItem(IC_BACKUP_KEY);
        if (backup) {
          setGraph(normalizeGraph(JSON.parse(backup)));
          setStoryFormat('interactive');
          toast.info('Restored an unpublished interactive case from this browser.');
        }
      } catch { /* ignore */ }
      // Load a draft or reserve the internal compatibility number.
      const loadDraftOrNext = async () => {
        if (resumeDraftId) {
          const draft = await getDraftById(resumeDraftId, authToken);
          if (draft) {
            setTitle(draft.title);
            setContent(draft.content);
            setChapterNumber(draft.chapterNumber);
            setDraftStatus(`Draft restored from ${new Date(draft.lastSaved).toLocaleTimeString()}`);
            return;
          }
        }
        // The database still requires this internal number, but current stories never display it.
        const { data } = await dbFetch<any[]>('chapters', {
          select: 'chapter_number',
          order: 'chapter_number.desc',
          token: authToken,
        });
        const max = data?.[0]?.chapter_number || 0;
        setChapterNumber(max + 1);
      };
      loadDraftOrNext();
    }
  }, [editChapterId, authToken, resumeDraftId]);

  // Back up an unpublished interactive case structure in this browser.
  useEffect(() => {
    if (editChapterId || !isInteractive) return;
    try { localStorage.setItem(IC_BACKUP_KEY, JSON.stringify(graph)); } catch { /* ignore */ }
  }, [graph, isInteractive, editChapterId]);

  // Auto-save draft every 10 seconds when content changes
  const autoSave = useCallback(async () => {
    if (!editChapterId && (title || content) && userId) {
      try {
        const savedId = await upsertDraft({ id: draftIdRef.current, title, content: normalizeRichTextHtml(content), chapterNumber, lastSaved: new Date().toISOString() }, userId, authToken);
        draftIdRef.current = savedId;
        setDraftStatus(`Draft auto-saved at ${new Date().toLocaleTimeString()}`);
      } catch { /* silent */ }
    }
  }, [title, content, chapterNumber, editChapterId, userId, authToken]);

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(autoSave, 10000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [autoSave]);

  // Save manually
  const handleSaveDraft = async () => {
    if (!userId) return;
    try {
      const normalizedContent = normalizeRichTextHtml(content);
      if (normalizedContent !== content) {
        setContent(normalizedContent);
      }
      const savedId = await upsertDraft({ id: draftIdRef.current, title, content: normalizedContent, chapterNumber, lastSaved: new Date().toISOString() }, userId, authToken);
      draftIdRef.current = savedId;
      toast.success(isInteractive ? 'Draft saved — the case structure is kept in this browser until you publish' : 'Draft saved');
      onBack();
    } catch {
      toast.error('Failed to save draft');
    }
  };

  // Mark glossary terms in content
  const handleMarkGlossary = () => {
    const terms = Object.keys(glossary).sort((a, b) => b.length - a.length);
    let markedContent = content;

    for (const term of terms) {
      // Don't re-wrap already wrapped terms
      const regex = new RegExp(`(?<!<[^>]*)(\\b${term}\\b)(?![^<]*>)`, 'gi');
      markedContent = markedContent.replace(regex, `<span class="glossary-term" data-term="${term}">$1</span>`);
    }

    setContent(markedContent);
    setGlossaryMarked(true);
    toast.success(`Marked ${terms.length} glossary terms`);
  };

  // Publish a story or legacy chapter
  const handlePublish = async () => {
    langBuffers.current[editLang] = { ...langBuffers.current[editLang], title, content };
    const en = editChapterId ? (langBuffers.current[DEFAULT_LANGUAGE] ?? { title, content }) : { title, content };
    if (editChapterId && editLang !== DEFAULT_LANGUAGE && (!en.title.trim() || !en.content.trim())) {
      toast.error('The English version needs a title and text.');
      return;
    }
    if (!en.title.trim()) {
      toast.error(`Please enter a ${isLegacy ? 'chapter' : 'story'} title`);
      return;
    }
    // Interactive cases use the opening route as their searchable/SEO body.
    const storyContent = isInteractive ? openingContent(graph) : en.content;
    if (!storyContent.replace(/<[^>]*>/g, '').trim()) {
      toast.error(isInteractive ? 'The opening section needs some text.' : 'Please write some content');
      return;
    }
    if (isInteractive) {
      const errors = validateGraph(graph).filter((i) => i.level === 'error');
      if (errors.length) {
        toast.error(`Fix ${errors.length} structure error${errors.length === 1 ? '' : 's'} before publishing: ${errors[0].nodeId ? `${errors[0].nodeId}: ` : ''}${errors[0].message}`);
        return;
      }
      const removed = removedNodeIds(publishedGraph, graph);
      if (removed.length && !window.confirm(`These published sections were removed or renamed: ${removed.join(', ')}.\n\nReaders currently positioned on them will be stranded until they are restored. Publish anyway?`)) {
        return;
      }
    }
    // Past dates only make sense for brand-new stories. When editing an
    // already-published story, a past date just means "already live" — the
    // schedule gate is cleared below instead of blocking the update.
    if (!editChapterId && scheduledAt && new Date(swedishToUTC(normalizeScheduledAt(scheduledAt))).getTime() < Date.now()) {
      toast.error('The scheduled time is in the past. Pick a future time or clear it to publish now.');
      return;
    }

    setPublishing(true);
    try {
      let normalizedScheduledAt = normalizeScheduledAt(scheduledAt);
      // Editing an existing story with a past date: clear the schedule gate so
      // the story stays simply published instead of being hidden until a time
      // that has already passed.
      if (editChapterId && normalizedScheduledAt && new Date(swedishToUTC(normalizedScheduledAt)).getTime() < Date.now()) {
        normalizedScheduledAt = '';
      }
      const normalizedContent = normalizeRichTextHtml(storyContent);
      // Switching an interactive case back to linear keeps its graph so it can be restored.
      const formatFields = isLegacy ? {} : {
        story_format: isInteractive ? 'interactive' : 'linear',
        interactive_graph: isInteractive ? graph : (publishedGraph ?? null),
      };

      if (editChapterId) {
        const body: any = {
          title: en.title.trim(),
          content: normalizedContent,
          chapter_number: chapterNumber,
          scheduled_at: normalizedScheduledAt ? swedishToUTC(normalizedScheduledAt) : null,
          cover_image_url: coverImageUrl,
          ...(isLegacy ? {} : { tags }),
          ...formatFields,
        };
        const { error } = await dbFetch('chapters', {
          method: 'PATCH',
          filters: `id=eq.${editChapterId}`,
          body,
          token: authToken,
        });
        if (error) throw new Error(error);
        // Interactive cases are English-only for now; translations apply to linear stories.
        for (const lang of isInteractive ? [] : SUPPORTED_LANGUAGES) {
          if (lang === DEFAULT_LANGUAGE) continue;
          const b = langBuffers.current[lang];
          if (!b || !b.title.trim() || !b.content.replace(/<[^>]*>/g, '').trim()) continue;
          const trBody = { title: b.title.trim(), content: normalizeRichTextHtml(b.content) };
          const res = b.id
            ? await dbFetch('chapter_translations', { method: 'PATCH', filters: `id=eq.${b.id}`, body: { ...trBody, updated_at: new Date().toISOString() }, token: authToken })
            : await dbFetch('chapter_translations', { method: 'POST', body: { ...trBody, chapter_id: editChapterId, language_code: lang }, token: authToken });
          if (res.error) throw new Error(`${LANGUAGE_LABELS[lang]}: ${res.error}`);
        }
        toast.success(normalizedScheduledAt ? `${isLegacy ? 'Chapter' : 'Story'} scheduled for ${normalizedScheduledAt.replace('T', ' ')} (Swedish time)` : `${isLegacy ? 'Chapter' : 'Story'} updated!`);
      } else {
        // Always reserve a fresh internal number at save time — drafts can hold a stale one.
        let insertNumber = chapterNumber;
        if (!isLegacy) {
          const { data: maxRows } = await dbFetch<any[]>('chapters', {
            select: 'chapter_number',
            order: 'chapter_number.desc',
            filters: 'limit=1',
            token: authToken,
          });
          insertNumber = (maxRows?.[0]?.chapter_number || 0) + 1;
        }
        const body: any = {
          title: title.trim(),
          content: normalizedContent,
          chapter_number: insertNumber,
          scheduled_at: normalizedScheduledAt ? swedishToUTC(normalizedScheduledAt) : null,
          cover_image_url: coverImageUrl,
          is_archived: isLegacy,
          tags: isLegacy ? [] : tags,
          ...formatFields,
        };
        const { error } = await dbFetch('chapters', {
          method: 'POST',
          body,
          token: authToken,
        });
        if (error) throw new Error(error);
        await deleteDraft(draftIdRef.current, authToken);
        try { localStorage.removeItem(IC_BACKUP_KEY); } catch { /* ignore */ }
        toast.success(normalizedScheduledAt ? `${isLegacy ? 'Chapter' : 'Story'} scheduled for ${normalizedScheduledAt.replace('T', ' ')} (Swedish time)` : `${isLegacy ? 'Chapter' : 'Story'} published!`);
      }
      onBack();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setPublishing(false);
    }
  };

  if (loadingChapter) {
    return <p className="text-muted-foreground p-8">Loading {isLegacy ? 'chapter' : 'story'}...</p>;
  }

  const wordCount = content.replace(/<[^>]*>/g, '').trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <a
          href="/admin"
          onClick={(e) => { e.preventDefault(); onBack(); }}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icons.ChevronLeft className="w-4 h-4" />
          Back
        </a>
        <div className="flex flex-wrap items-center gap-3">
          {draftStatus && (
            <span className="text-xs text-muted-foreground">{draftStatus}</span>
          )}
          {!editChapterId && (
            <button
              onClick={handleSaveDraft}
              className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm transition-colors"
            >
              Save Draft
            </button>
          )}
          <button
            onClick={() => setShowPreview(true)}
            className="px-4 py-2 bg-accent/20 hover:bg-accent/30 text-accent rounded-lg text-sm transition-colors"
          >
            Preview
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {publishing ? 'Saving...' : `${editChapterId ? 'Update' : scheduledAt ? 'Schedule' : 'Publish'} ${isLegacy ? 'Chapter' : 'Story'}`}
          </button>
        </div>
      </div>

      {/* Story metadata; numbering is shown only for legacy chapters. */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-4 mb-6">
        <div>
          <label className="block text-sm text-muted-foreground mb-1">{isLegacy ? 'Chapter Title' : 'Story Title'}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isLegacy ? "Enter chapter title..." : "Enter story title..."}
            className="w-full px-4 py-3 bg-card/50 border border-border rounded-lg text-foreground text-lg font-display focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        {isLegacy ? (
        <div>
          <label className="block text-sm text-muted-foreground mb-1">Chapter #</label>
          <input
            type="number"
            value={chapterNumber}
            onChange={(e) => setChapterNumber(parseInt(e.target.value) || 1)}
            min={1}
            className="w-24 px-4 py-3 bg-card/50 border border-border rounded-lg text-foreground text-lg text-center focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        ) : <div className="hidden md:block" />}
        <div className="relative">
          <label className="block text-sm text-muted-foreground mb-1">Schedule publication (Swedish time)</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const base = scheduledAt || `${todayIsoDate()}T10:00`;
                setCalYear(parseInt(base.slice(0, 4), 10));
                setCalMonth(parseInt(base.slice(5, 7), 10) - 1);
                setCalendarOpen((v) => !v);
              }}
              className="px-4 py-3 bg-card/50 border border-border rounded-lg text-foreground text-sm text-left focus:outline-none focus:border-primary transition-colors hover:border-primary/60 min-w-[220px]"
            >
              {scheduledAt ? scheduledAt.replace('T', ' ') : 'Pick date & time…'}
            </button>
            {scheduledAt && (
              <button
                type="button"
                onClick={() => setScheduledAt('')}
                className="px-2 py-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
                title="Clear schedule (publish immediately)"
              >
                ✕
              </button>
            )}
          </div>
          <span className="text-xs text-muted-foreground mt-1 block">
            {scheduledAt ? 'Will go live automatically at this time.' : 'Leave empty to publish immediately.'}
          </span>
          {scheduledAt && takenSlots.includes(scheduledAt.slice(0, 10)) && (
            <span className="text-xs text-accent mt-1 block">Note: another {isLegacy ? 'chapter' : 'story'} is also scheduled that day.</span>
          )}

          {calendarOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setCalendarOpen(false)}
                aria-hidden="true"
              />
              <div
                data-lenis-prevent
                className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[280px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-xl md:absolute md:left-auto md:right-0 md:top-full md:mt-2 md:max-h-[calc(100dvh-6rem)] md:w-[280px] md:translate-x-0 md:translate-y-0"
              >
                <div className="flex items-center justify-between mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      const m = calMonth - 1;
                      setCalMonth((m + 12) % 12);
                      if (m < 0) setCalYear((y) => y - 1);
                    }}
                    className="px-2 py-1 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Previous month"
                  >
                    ‹
                  </button>
                  <span className="text-sm font-medium text-foreground">
                    {MONTH_LABELS[calMonth]} {calYear}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const m = calMonth + 1;
                      setCalMonth(m % 12);
                      if (m > 11) setCalYear((y) => y + 1);
                    }}
                    className="px-2 py-1 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Next month"
                  >
                    ›
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {WEEKDAY_LABELS.map((d) => (
                    <span key={d} className="text-center text-[10px] text-muted-foreground py-1">{d}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: firstWeekdayOffset(calYear, calMonth) }).map((_, i) => (
                    <span key={`pad-${i}`} />
                  ))}
                  {Array.from({ length: daysInMonthOf(calYear, calMonth) }).map((_, i) => {
                    const day = i + 1;
                    const iso = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const booked = takenSlots.includes(iso);
                    const selected = scheduledAt.startsWith(iso);
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => {
                          const timePart = scheduledAt.slice(11) || '10:00';
                          setScheduledAt(`${iso}T${timePart}`);
                        }}
                        className={[
                          'h-8 rounded text-sm transition-colors',
                          booked
                            ? 'bg-destructive/25 text-destructive font-semibold hover:bg-destructive/40'
                            : 'text-foreground hover:bg-secondary',
                          selected ? 'ring-2 ring-primary' : '',
                        ].join(' ')}
                        title={booked ? 'A story is already scheduled this day' : undefined}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
                {scheduledAt && (
                  <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Time</label>
                    <input
                      type="time"
                      value={scheduledAt.slice(11, 16) || '10:00'}
                      onChange={(e) => setScheduledAt(`${scheduledAt.slice(0, 10)}T${e.target.value || '10:00'}`)}
                      className="px-2 py-1.5 bg-secondary/50 border border-border rounded text-foreground text-sm focus:outline-none focus:border-primary transition-colors [color-scheme:dark]"
                    />
                    <button
                      type="button"
                      onClick={() => setCalendarOpen(false)}
                      className="ml-auto px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded text-sm transition-colors"
                    >
                      Done
                    </button>
                  </div>
                )}
                <p className="mt-3 text-[11px] text-muted-foreground">
                  <span className="inline-block w-2 h-2 rounded-sm bg-destructive/60 mr-1 align-middle" />
                  Days with a story already scheduled
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Story details: tags, format and cover in one collapsible box. */}
      <CollapsiblePanel
        title="Story details"
        storageKey="chapter-editor:details-open"
        summary={[
          !isLegacy && (tags.length ? tags.join(', ') : 'no tags'),
          !isLegacy && (isInteractive ? 'Interactive Case File' : 'Linear Case File'),
          coverImageUrl ? 'cover set' : 'no cover',
        ].filter(Boolean).join(' · ')}
        className="mb-6"
      >
        <div className="divide-y divide-border/60">
          {!isLegacy && (
            <div className="pb-5">
              <TagPicker selected={tags} onChange={setTags} authToken={authToken} />
            </div>
          )}

          {/* Story format: linear Case File or branching Interactive Case File. */}
          {!isLegacy && (
            <div className="py-5">
              <span className="block text-sm text-muted-foreground mb-2">Story format</span>
              <div className="flex flex-wrap gap-2">
                {([
                  ['linear', 'Linear Case File'],
                  ['interactive', 'Interactive Case File'],
                ] as const).map(([f, label]) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => changeStoryFormat(f)}
                    className={`px-3 py-1.5 border text-sm transition-colors ${
                      storyFormat === f ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {isInteractive
                  ? 'Readers make decisions that change the scenes, options and ending they receive. Registered readers’ choices are locked to their account.'
                  : 'A normal story with no reader decisions.'}
              </p>
            </div>
          )}

          {/* Cover image (optional) */}
          <div className={isLegacy ? '' : 'pt-5'}>
            <ImageUploadField
              kind="cover"
              pathPrefix="chapters/cover"
              label="Cover image (optional · 4:5 portrait, ~800×1000)"
              value={coverImageUrl}
              onChange={setCoverImageUrl}
            />
          </div>
        </div>
      </CollapsiblePanel>

      {/* Glossary tooling belongs only to the connected legacy story. */}
      {isLegacy && <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground">
          {Object.keys(glossary).length} glossary terms available
        </span>
        {glossaryMarked && (
          <span className="text-xs text-primary">✓ Terms marked</span>
        )}
      </div>}

      {editChapterId && !isInteractive && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">Language</span>
          {SUPPORTED_LANGUAGES.map((lang) => {
            const active = lang === editLang;
            const has = filledLangs.includes(lang);
            return (
              <button
                key={lang}
                type="button"
                onClick={() => switchEditLang(lang)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 border text-sm transition-colors ${
                  active ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
                }`}
                title={has ? 'This version exists' : 'Not written yet — readers see English'}
              >
                <FlagIcon lang={lang} size={16} />
                {LANGUAGE_LABELS[lang]}
                {!has && <span className="text-[10px] uppercase opacity-70">new</span>}
              </button>
            );
          })}
          {editLang !== DEFAULT_LANGUAGE && (
            <span className="text-xs text-muted-foreground">Leave empty to show English to these readers.</span>
          )}
        </div>
      )}

      {/* Editor */}
      {isInteractive ? (
        <InteractiveEditor graph={graph} onChange={setGraph} title={title} publishedGraph={publishedFormat === 'interactive' ? publishedGraph : null} />
      ) : (
        <>
          <CollapsiblePanel title="Story text" summary={`${wordCount} words`} storageKey="chapter-editor:text-open">
            <RichTextEditor
              key={editLang}
              content={content}
              onChange={setContent}
              glossaryTerms={isLegacy ? Object.keys(glossary) : []}
              onMarkGlossary={isLegacy ? handleMarkGlossary : undefined}
              searchHighlight={searchHighlight || undefined}
              searchSentence={searchSentence || undefined}
            />

            {/* Word count */}
            <div className="mt-3 text-xs text-muted-foreground">
              {wordCount} words
            </div>
          </CollapsiblePanel>
        </>
      )}

      {/* Inline Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-background/95 backdrop-blur border-b border-border">
            <span className="text-sm text-muted-foreground font-medium">Preview</span>
            <button
              onClick={() => setShowPreview(false)}
              className="px-4 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm transition-colors"
            >
              Close
            </button>
          </div>
          <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-8 sm:py-12" style={{ fontFamily: "'Nunito Sans', sans-serif", lineHeight: 1.9, fontSize: '1.05rem' }}>
            <header className="text-center mb-12">
              <span className="text-accent text-sm font-medium tracking-wider uppercase">{isLegacy ? `Chapter ${chapterNumber}` : tags.join(' · ')}</span>
              <h1 className="font-display text-3xl sm:text-4xl text-primary mt-2 mb-3" style={{ lineHeight: 1.2 }}>{title || 'Untitled'}</h1>
              <div className="text-muted-foreground text-sm px-4 py-2 bg-card/30 rounded-lg inline-block">Preview — Not yet published</div>
            </header>
            {isInteractive ? (
              <InteractiveReader chapterId="preview" title={title || 'Untitled'} graph={graph} user={null} mode="preview" />
            ) : (
              <article
                className="prose prose-stone dark:prose-invert max-w-none [&_p]:mb-5 [&_p]:text-foreground [&_strong]:text-foreground [&_em]:text-muted-foreground [&_h2]:font-display [&_h2]:text-primary [&_h3]:font-display [&_h3]:text-primary [&_blockquote]:border-l-accent [&_blockquote]:text-muted-foreground [&_blockquote]:italic [&_blockquote]:bg-card/30 [&_blockquote]:rounded-r-lg [&_a]:text-accent"
                dangerouslySetInnerHTML={{ __html: content || '<p>No content yet.</p>' }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChapterEditor;
