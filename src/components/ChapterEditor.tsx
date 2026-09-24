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

  const datePart = value.split('T')[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? `${datePart}T10:00` : value;
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
 * Returns the next cadence slot following the latest already-scheduled chapter.
 */
function getSlotAfterLatestScheduled(takenDates: string[]): string {
  if (!takenDates.length) return getNextAvailableSlot(takenDates);
  const latestIso = [...takenDates].sort().pop()!;
  const latestDate = new Date(`${latestIso}T12:00:00Z`);
  return getNextAvailableSlot(takenDates, latestDate);
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

  // Load existing chapter for editing
  useEffect(() => {
    if (editChapterId) {
      const loadChapter = async () => {
        const { data } = await dbFetch<any[]>('chapters', {
          select: 'title,content,chapter_number,scheduled_at,cover_image_url,is_archived,tags',
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
          if (data[0].scheduled_at) {
            setScheduledAt(normalizeScheduledAt(utcToSwedishDateTimeLocal(data[0].scheduled_at)));
          }
        }
        setLoadingChapter(false);
      };
      loadChapter();
    } else {
      // Load draft or set next chapter number
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
        // Get next chapter number
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
      toast.success('Draft saved');
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

  // Publish chapter
  const handlePublish = async () => {
    if (!title.trim()) {
      toast.error('Please enter a chapter title');
      return;
    }
    if (!content.trim()) {
      toast.error('Please write some content');
      return;
    }
    if (scheduledAt && takenSlots.includes(scheduledAt.slice(0, 10))) {
      toast.error('Another chapter is already scheduled for this date. Use "Next →" to pick a different slot.');
      return;
    }

    setPublishing(true);
    try {
      const normalizedScheduledAt = normalizeScheduledAt(scheduledAt);
      const normalizedContent = normalizeRichTextHtml(content);

      if (normalizedContent !== content) {
        setContent(normalizedContent);
      }

      if (editChapterId) {
        const body: any = {
          title: title.trim(),
          content: normalizedContent,
          chapter_number: chapterNumber,
          scheduled_at: normalizedScheduledAt ? swedishToUTC(normalizedScheduledAt) : null,
          cover_image_url: coverImageUrl,
          ...(isLegacy ? {} : { tags }),
        };
        const { error } = await dbFetch('chapters', {
          method: 'PATCH',
          filters: `id=eq.${editChapterId}`,
          body,
          token: authToken,
        });
        if (error) throw new Error(error);
        toast.success(normalizedScheduledAt ? `${isLegacy ? 'Chapter' : 'Story'} scheduled for ${normalizedScheduledAt.replace('T', ' ')} (Swedish time)` : `${isLegacy ? 'Chapter' : 'Story'} updated!`);
      } else {
        const body: any = {
          title: title.trim(),
          content: normalizedContent,
          chapter_number: chapterNumber,
          scheduled_at: normalizedScheduledAt ? swedishToUTC(normalizedScheduledAt) : null,
          cover_image_url: coverImageUrl,
          is_archived: isLegacy,
          tags: isLegacy ? [] : tags,
        };
        const { error } = await dbFetch('chapters', {
          method: 'POST',
          body,
          token: authToken,
        });
        if (error) throw new Error(error);
        await deleteDraft(draftIdRef.current, authToken);
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
    return <p className="text-muted-foreground p-8">Loading chapter...</p>;
  }

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <a
          href="/admin"
          onClick={(e) => { e.preventDefault(); onBack(); }}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icons.ChevronLeft className="w-4 h-4" />
          Back
        </a>
        <div className="flex items-center gap-3">
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

      {/* Chapter metadata */}
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
        <div>
          <label className="block text-sm text-muted-foreground mb-1">Schedule publication</label>
          <div className="flex items-center gap-2">
            {!scheduledAt ? (
              <button
                onClick={() => setScheduledAt(getSlotAfterLatestScheduled(takenSlots))}
                className="px-4 py-3 bg-accent/20 hover:bg-accent/30 text-accent rounded-lg text-sm font-medium transition-colors"
              >
                Schedule for next slot
              </button>
            ) : (
              <>
                <span className="px-4 py-3 bg-card/50 border border-border rounded-lg text-foreground text-sm">
                  📅 {new Date(scheduledAt.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} — 10:00 🇸🇪
                </span>
                <button
                  onClick={() => {
                    const currentDate = new Date(scheduledAt.slice(0, 10) + 'T12:00:00');
                    const next = getNextAvailableSlot(takenSlots, currentDate);
                    setScheduledAt(next);
                  }}
                  className="px-3 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-xs transition-colors"
                  title="Skip to next available slot"
                >
                  Next →
                </button>
                <button
                  onClick={() => setScheduledAt('')}
                  className="px-2 py-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
                  title="Clear schedule (publish immediately)"
                >
                  ✕
                </button>
              </>
            )}
          </div>
          {scheduledAt && takenSlots.includes(scheduledAt.slice(0, 10)) && (
            <span className="text-xs text-destructive mt-1 block">⚠ Another chapter is already scheduled for this date!</span>
          )}
        </div>
      </div>

      {!isLegacy && (
        <div className="mb-6 p-4 rounded-lg border border-border/60 bg-card/30">
          <TagPicker selected={tags} onChange={setTags} authToken={authToken} />
        </div>
      )}

      {/* Cover image (optional) */}
      <div className="mb-6 p-4 rounded-lg border border-border/60 bg-card/30">
        <ImageUploadField
          kind="cover"
          pathPrefix="chapters/cover"
          label="Cover image (optional · 4:5 portrait, ~800×1000)"
          value={coverImageUrl}
          onChange={setCoverImageUrl}
        />
      </div>

      {/* Glossary terms indicator */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground">
          {Object.keys(glossary).length} glossary terms available
        </span>
        {glossaryMarked && (
          <span className="text-xs text-primary">✓ Terms marked</span>
        )}
      </div>

      {/* Editor */}
      <RichTextEditor
        content={content}
        onChange={setContent}
        glossaryTerms={Object.keys(glossary)}
        onMarkGlossary={handleMarkGlossary}
        searchHighlight={searchHighlight || undefined}
        searchSentence={searchSentence || undefined}
      />

      {/* Word count */}
      <div className="mt-3 text-xs text-muted-foreground">
        {content.replace(/<[^>]*>/g, '').trim().split(/\s+/).filter(Boolean).length} words
      </div>

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
            <article
              className="prose prose-stone dark:prose-invert max-w-none [&_p]:mb-5 [&_p]:text-foreground [&_strong]:text-foreground [&_em]:text-muted-foreground [&_h2]:font-display [&_h2]:text-primary [&_h3]:font-display [&_h3]:text-primary [&_blockquote]:border-l-accent [&_blockquote]:text-muted-foreground [&_blockquote]:italic [&_blockquote]:bg-card/30 [&_blockquote]:rounded-r-lg [&_a]:text-accent"
              dangerouslySetInnerHTML={{ __html: content || '<p>No content yet.</p>' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ChapterEditor;
