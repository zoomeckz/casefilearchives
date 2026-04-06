import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Icons } from '@/lib/icons';
import { RichTextEditor } from '@/components/RichTextEditor';
import { dbFetch } from '@/lib/dbFetch';
import { GlossaryEntry } from '@/lib/data';
import { swedishToUTC, utcToSwedishDateTimeLocal } from '@/lib/timezone';
import { toast } from 'sonner';

interface ChapterEditorProps {
  authToken?: string;
  userId?: string;
  glossary: Record<string, GlossaryEntry>;
  onBack: () => void;
  editChapterId?: string | null;
  resumeDraftId?: string | null;
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

function getNextFriday(after: Date = new Date()): Date {
  const d = new Date(after);
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
  return d;
}

function getNextAvailableFriday(takenDates: string[]): string {
  const taken = new Set(takenDates);
  let candidate = getNextFriday();
  for (let i = 0; i < 200; i++) {
    const iso = candidate.toISOString().slice(0, 10);
    if (!taken.has(iso)) return `${iso}T10:00`;
    candidate = getNextFriday(candidate);
  }
  return `${candidate.toISOString().slice(0, 10)}T10:00`;
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

export const ChapterEditor: React.FC<ChapterEditorProps> = ({ authToken, userId, glossary, onBack, editChapterId, resumeDraftId }) => {
  const draftIdRef = useRef<string>(resumeDraftId || '');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [chapterNumber, setChapterNumber] = useState(1);
  const [scheduledAt, setScheduledAt] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [draftStatus, setDraftStatus] = useState<string>('');
  const [loadingChapter, setLoadingChapter] = useState(!!editChapterId);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [glossaryMarked, setGlossaryMarked] = useState(false);
  const [takenFridays, setTakenFridays] = useState<string[]>([]);

  // Load all scheduled Fridays to prevent double-booking
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
      setTakenFridays(dates);
    };
    loadTaken();
  }, [authToken, editChapterId]);

  // Load existing chapter for editing
  useEffect(() => {
    if (editChapterId) {
      const loadChapter = async () => {
        const { data } = await dbFetch<any[]>('chapters', {
          select: 'title,content,chapter_number,scheduled_at',
          filters: `id=eq.${editChapterId}`,
          token: authToken,
        });
        if (data && data[0]) {
          setTitle(data[0].title);
          setContent(data[0].content);
          setChapterNumber(data[0].chapter_number);
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
        const savedId = await upsertDraft({ id: draftIdRef.current, title, content, chapterNumber, lastSaved: new Date().toISOString() }, userId, authToken);
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
      const savedId = await upsertDraft({ id: draftIdRef.current, title, content, chapterNumber, lastSaved: new Date().toISOString() }, userId, authToken);
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

    setPublishing(true);
    try {
      const normalizedScheduledAt = normalizeScheduledAt(scheduledAt);

      if (editChapterId) {
        const body: any = {
          title: title.trim(),
          content,
          chapter_number: chapterNumber,
          scheduled_at: normalizedScheduledAt ? swedishToUTC(normalizedScheduledAt) : null,
        };
        const { error } = await dbFetch('chapters', {
          method: 'PATCH',
          filters: `id=eq.${editChapterId}`,
          body,
          token: authToken,
        });
        if (error) throw new Error(error);
        toast.success(normalizedScheduledAt ? `Chapter scheduled for ${normalizedScheduledAt.replace('T', ' ')} (Swedish time)` : 'Chapter updated!');
      } else {
        const body: any = {
          title: title.trim(),
          content,
          chapter_number: chapterNumber,
          scheduled_at: normalizedScheduledAt ? swedishToUTC(normalizedScheduledAt) : null,
        };
        const { error } = await dbFetch('chapters', {
          method: 'POST',
          body,
          token: authToken,
        });
        if (error) throw new Error(error);
        await deleteDraft(draftIdRef.current, authToken);
        toast.success(normalizedScheduledAt ? `Chapter scheduled for ${normalizedScheduledAt.replace('T', ' ')} (Swedish time)` : 'Chapter published!');
      }
      onBack();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save chapter');
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
          Back to Chapters
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
            {publishing ? 'Saving...' : editChapterId ? 'Update Chapter' : scheduledAt ? 'Schedule Chapter' : 'Publish Chapter'}
          </button>
        </div>
      </div>

      {/* Chapter metadata */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-4 mb-6">
        <div>
          <label className="block text-sm text-muted-foreground mb-1">Chapter Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter chapter title..."
            className="w-full px-4 py-3 bg-card/50 border border-border rounded-lg text-foreground text-lg font-display focus:outline-none focus:border-primary transition-colors"
          />
        </div>
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
        <div>
          <label className="block text-sm text-muted-foreground mb-1">Schedule (Fridays 10:00 🇸🇪)</label>
          <div className="flex items-center gap-2">
            {!scheduledAt ? (
              <button
                onClick={() => setScheduledAt(getNextAvailableFriday(takenFridays))}
                className="px-4 py-3 bg-accent/20 hover:bg-accent/30 text-accent rounded-lg text-sm font-medium transition-colors"
              >
                Schedule for next Friday
              </button>
            ) : (
              <>
                <span className="px-4 py-3 bg-card/50 border border-border rounded-lg text-foreground text-sm">
                  📅 {new Date(scheduledAt.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} — 10:00 🇸🇪
                </span>
                <button
                  onClick={() => {
                    const current = new Date(scheduledAt.slice(0, 10) + 'T12:00:00');
                    const next = getNextAvailableFriday([...takenFridays, scheduledAt.slice(0, 10)]);
                    setScheduledAt(next);
                  }}
                  className="px-3 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-xs transition-colors"
                  title="Skip to next available Friday"
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
          {scheduledAt && takenFridays.includes(scheduledAt.slice(0, 10)) && (
            <span className="text-xs text-destructive mt-1 block">⚠ Another chapter is already scheduled for this date!</span>
          )}
        </div>
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
              <span className="text-accent text-sm font-medium tracking-wider uppercase">Chapter {chapterNumber}</span>
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
