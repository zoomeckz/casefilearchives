import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

export interface Chapter {
  id: string;
  title: string;
  content: string;
  chapterNumber: number;
  publishedAt: string;
  views: number;
  scheduledAt: string | null;
  /** Cover art URL — currently always null until artwork is generated. */
  coverImageUrl: string | null;
  isArchived: boolean;
  tags: string[];
  storyFormat: 'linear' | 'interactive' | 'dispatch';
  /** Dispatch chapters: the dispatch (story told in chapters) they belong to, and their chapter number. */
  dispatchId: string | null;
  dispatchPart: number | null;
  dispatchSlug: string | null;
  dispatchTitle: string | null;
}

// The chapter list is downloaded on every page, so it leaves out the
// interactive case structure (every branch and ending). The reader page loads
// one case's structure only when that case is opened (useCaseGraph).
// Polls only fetch the list; story text (the heavy part) is downloaded once and
// then only for stories that are new or were edited since (updated_at changed).
const LIST_COLUMNS = 'id,title,chapter_number,published_at,views,scheduled_at,cover_image_url,is_archived,tags,story_format,updated_at';
// The dispatch columns exist once the dispatches migration has run; until then the
// list is fetched without them so the site keeps working.
const DISPATCH_COLUMNS = ',dispatch_id,dispatch_part,dispatch:dispatches(slug,title)';
let withDispatchColumns = true;
const listColumns = () => LIST_COLUMNS + (withDispatchColumns ? DISPATCH_COLUMNS : '');

function mapChapter(c: any): Chapter {
  return {
    id: c.id,
    title: c.title,
    content: c.content,
    chapterNumber: c.chapter_number,
    publishedAt: c.published_at,
    views: c.views,
    scheduledAt: c.scheduled_at || null,
    coverImageUrl: c.cover_image_url || null,
    isArchived: c.is_archived === true,
    tags: Array.isArray(c.tags) ? c.tags : [],
    storyFormat: c.story_format === 'interactive' ? 'interactive' : c.story_format === 'dispatch' ? 'dispatch' : 'linear',
    dispatchId: c.dispatch_id ?? null,
    dispatchPart: c.dispatch_part ?? null,
    dispatchSlug: c.dispatch?.slug ?? null,
    dispatchTitle: c.dispatch?.title ?? null,
  };
}

const CHAPTER_REFRESH_INTERVAL_MS = 60_000;
const PUBLISH_TICK_INTERVAL_MS = 60_000;

// Reads the current admin session token (if any) so RLS lets us fetch
// scheduled/future chapters in addition to live ones. Falls back to the
// anon key when no session is present.
function getAuthToken(): string {
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  try {
    const raw = localStorage.getItem('app-auth-session');
    if (!raw) return key;
    const session = JSON.parse(raw);
    return session?.access_token || key;
  } catch {
    return key;
  }
}

function isChapterPublished(chapter: Chapter, nowMs: number): boolean {
  // Defense-in-depth: a chapter is "published" only when BOTH
  //   - it has a valid published_at that has already passed, AND
  //   - it has no future scheduled_at gate.
  // If published_at is missing or unparseable, treat the chapter as unreleased
  // rather than silently leaking it onto the home page.
  const publishedAtMs = Date.parse(chapter.publishedAt);
  if (Number.isNaN(publishedAtMs) || publishedAtMs > nowMs) {
    return false;
  }

  if (chapter.scheduledAt) {
    const scheduledAtMs = Date.parse(chapter.scheduledAt);
    // Unparseable scheduled_at on a row that bothered to set one is suspicious;
    // hide it until the data is fixed.
    if (Number.isNaN(scheduledAtMs) || scheduledAtMs > nowMs) {
      return false;
    }
  }

  return true;
}

function buildChaptersUrl(isAdmin: boolean, withContent = true): string {
  const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/chapters`);

  url.searchParams.set('select', withContent ? `${listColumns()},content` : listColumns());
  url.searchParams.set('order', 'chapter_number.asc');

  if (!isAdmin) {
    const now = new Date().toISOString();
    url.searchParams.set('published_at', `lte.${now}`);
    url.searchParams.set('or', `(scheduled_at.is.null,scheduled_at.lte.${now})`);
  }

  return url.toString();
}

/** One interactive case's structure, fetched only while that case is open. */
export function useCaseGraph(chapterId: string | null | undefined, enabled: boolean) {
  const [state, setState] = useState<{ id: string | null; graph: any | null; failed: boolean }>({ id: null, graph: null, failed: false });

  useEffect(() => {
    if (!enabled || !chapterId) return;
    let cancelled = false;
    setState({ id: chapterId, graph: null, failed: false });
    const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/chapters`);
    url.searchParams.set('select', 'interactive_graph');
    url.searchParams.set('id', `eq.${chapterId}`);
    fetch(url.toString(), {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${getAuthToken()}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((rows) => { if (!cancelled) setState({ id: chapterId, graph: rows?.[0]?.interactive_graph ?? null, failed: !rows?.[0]?.interactive_graph }); })
      .catch(() => { if (!cancelled) setState({ id: chapterId, graph: null, failed: true }); });
    return () => { cancelled = true; };
  }, [chapterId, enabled]);

  const current = state.id === chapterId;
  return { graph: current ? state.graph : null, loading: enabled && !!chapterId && (!current || (!state.graph && !state.failed)), failed: current && state.failed };
}

export function useChapters(isAdmin = false) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Story text by id, with the updated_at it was fetched at.
  const contentCache = useRef(new Map<string, { updatedAt: string; content: string }>());

  const fetchChapters = useCallback(async (): Promise<Chapter[]> => {
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const token = getAuthToken();

    const first = contentCache.current.size === 0;
    const response = await fetch(buildChaptersUrl(isAdmin, first), {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 400 && withDispatchColumns) {
        withDispatchColumns = false;
        return fetchChapters();
      }
      throw new Error(`Failed to fetch chapters (${response.status})`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      return [];
    }

    const cache = contentCache.current;
    if (first) {
      for (const c of data) cache.set(c.id, { updatedAt: c.updated_at || '', content: c.content || '' });
    } else {
      const stale = data.filter((c: any) => cache.get(c.id)?.updatedAt !== (c.updated_at || ''));
      if (stale.length) {
        const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/chapters`);
        url.searchParams.set('select', 'id,content,updated_at');
        url.searchParams.set('id', `in.(${stale.map((c: any) => c.id).join(',')})`);
        const res = await fetch(url.toString(), { headers: { apikey: key, Authorization: `Bearer ${token}` } });
        if (res.ok) {
          for (const row of await res.json()) cache.set(row.id, { updatedAt: row.updated_at || '', content: row.content || '' });
        }
      }
    }
    return data.map((c: any) => ({ ...mapChapter(c), content: cache.get(c.id)?.content ?? '' }));
  }, [isAdmin]);

  useEffect(() => {
    let cancelled = false;

    const syncChapters = async () => {
      try {
        const nextNowMs = Date.now();
        const nextChapters = await fetchChapters();

        if (cancelled) return;

        setNowMs(nextNowMs);
        setChapters(nextChapters);
      } catch (err) {
        console.error('[useChapters] error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const refreshInterval = window.setInterval(syncChapters, CHAPTER_REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncChapters();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    void syncChapters();

    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchChapters]);

  // Light-weight clock tick so that scheduled-at gates flip on time even
  // between full chapter re-fetches. Avoids "next chapter is live but won't
  // appear until the next 30-second poll" gaps.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), PUBLISH_TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const incrementViews = useCallback(
    async (chapterId: string) => {
      if (!chapterId) return;
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      await fetch(`${url}/functions/v1/track-chapter-view`, {
        method: 'POST',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ chapterId }),
      });

      setChapters((prev) =>
        prev.map((c) =>
          c.id === chapterId ? { ...c, views: c.views } : c
        )
      );
    },
    []
  );

  const refetch = useCallback(async () => {
    const nextNowMs = Date.now();
    const nextChapters = await fetchChapters();

    setNowMs(nextNowMs);
    setChapters(nextChapters);
  }, [fetchChapters]);

  const publishedChapters = useMemo(
    () => chapters.filter((chapter) => !chapter.isArchived && isChapterPublished(chapter, nowMs)),
    [chapters, nowMs]
  );

  return {
    chapters,
    publishedChapters,
    loading,
    refetch,
    incrementViews,
  };
}
