import { useState, useEffect, useCallback, useMemo } from 'react';

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
}

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
  };
}

const CHAPTER_REFRESH_INTERVAL_MS = 30_000;
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

function buildChaptersUrl(isAdmin: boolean): string {
  const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/chapters`);

  url.searchParams.set('select', '*');
  url.searchParams.set('order', 'chapter_number.asc');

  if (!isAdmin) {
    const now = new Date().toISOString();
    url.searchParams.set('published_at', `lte.${now}`);
    url.searchParams.set('or', `(scheduled_at.is.null,scheduled_at.lte.${now})`);
  }

  return url.toString();
}

export function useChapters(isAdmin = false) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const fetchChapters = useCallback(async (): Promise<Chapter[]> => {
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const token = getAuthToken();

    const response = await fetch(buildChaptersUrl(isAdmin), {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch chapters (${response.status})`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      return [];
    }

    return data.map(mapChapter);
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
