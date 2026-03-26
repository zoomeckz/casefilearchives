import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Icons } from '@/lib/icons';
import { RichTextEditor } from '@/components/RichTextEditor';
import { dbFetch } from '@/lib/dbFetch';
import { GlossaryEntry } from '@/lib/data';
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

async function saveDraftById(draft: ChapterDraft, userId: string, token?: string): Promise<string> {
  // Try update first
  const { error: updateErr } = await dbFetch('chapter_drafts', {
    method: 'PATCH',
    filters: `id=eq.${draft.id}`,
    body: { title: draft.title, content: draft.content, chapter_number: draft.chapterNumber },
    token,
  });

  // If no rows matched (new draft), insert
  if (!updateErr) return draft.id;

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
  const [currentDraftId] = useState(() => resumeDraftId || `draft-${Date.now()}`);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [chapterNumber, setChapterNumber] = useState(1);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [draftStatus, setDraftStatus] = useState<string>('');
  const [loadingChapter, setLoadingChapter] = useState(!!editChapterId);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [glossaryMarked, setGlossaryMarked] = useState(false);

  // Load existing chapter for editing
  useEffect(() => {
    if (editChapterId) {
      const loadChapter = async () => {
        const { data } = await dbFetch<any[]>('chapters', {
          select: 'title,content,chapter_number',
          filters: `id=eq.${editChapterId}`,
          token: authToken,
        });
        if (data && data[0]) {
          setTitle(data[0].title);
          setContent(data[0].content);
          setChapterNumber(data[0].chapter_number);
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
        await saveDraftById({ id: currentDraftId, title, content, chapterNumber, lastSaved: new Date().toISOString() }, userId, authToken);
        setDraftStatus(`Draft auto-saved at ${new Date().toLocaleTimeString()}`);
      } catch { /* silent */ }
    }
  }, [title, content, chapterNumber, editChapterId, currentDraftId, userId, authToken]);

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
      await saveDraftById({ id: currentDraftId, title, content, chapterNumber, lastSaved: new Date().toISOString() }, userId, authToken);
      setDraftStatus(`Draft saved at ${new Date().toLocaleTimeString()}`);
      toast.success('Draft saved');
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
      if (editChapterId) {
        // Update existing chapter
        const { error } = await dbFetch('chapters', {
          method: 'PATCH',
          filters: `id=eq.${editChapterId}`,
          body: {
            title: title.trim(),
            content,
            chapter_number: chapterNumber,
          },
          token: authToken,
        });
        if (error) throw new Error(error);
        toast.success('Chapter updated!');
      } else {
        // Create new chapter
        const { error } = await dbFetch('chapters', {
          method: 'POST',
          body: {
            title: title.trim(),
            content,
            chapter_number: chapterNumber,
          },
          token: authToken,
        });
        if (error) throw new Error(error);
        deleteDraft(currentDraftId);
        toast.success('Chapter published!');
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
            onClick={() => {
              // Open preview in new tab
              const previewWindow = window.open('', '_blank');
              if (previewWindow) {
                previewWindow.document.write(`
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <title>Preview: ${title || 'Untitled'}</title>
                    <style>
                      body { font-family: 'Lora', Georgia, serif; background: #0f0d0b; color: #d4cfc8; max-width: 720px; margin: 0 auto; padding: 2rem; line-height: 1.8; }
                      h1 { color: #f0c040; font-size: 2em; margin-bottom: 0.5em; }
                      .meta { color: #888; font-size: 0.9em; margin-bottom: 2em; }
                      p { margin-bottom: 1em; }
                      blockquote { border-left: 3px solid #0ea5e9; padding-left: 1em; color: #888; font-style: italic; }
                      .glossary-term { color: #0ea5e9; border-bottom: 1px dashed rgba(14,165,233,0.5); }
                      img { max-width: 100%; border-radius: 8px; }
                      a { color: #0ea5e9; }
                    </style>
                  </head>
                  <body>
                    <h1>Chapter ${chapterNumber}: ${title || 'Untitled'}</h1>
                    <div class="meta">Preview — Not yet published</div>
                    ${content || '<p>No content yet.</p>'}
                  </body>
                  </html>
                `);
                previewWindow.document.close();
              }
            }}
            className="px-4 py-2 bg-accent/20 hover:bg-accent/30 text-accent rounded-lg text-sm transition-colors"
          >
            Preview
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {publishing ? 'Saving...' : editChapterId ? 'Update Chapter' : 'Publish Chapter'}
          </button>
        </div>
      </div>

      {/* Chapter metadata */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 mb-6">
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
    </div>
  );
};

export default ChapterEditor;
