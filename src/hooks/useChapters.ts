import { useState, useEffect, useCallback, useMemo } from 'react';

export interface Chapter {
  id: string;
  title: string;
  content: string;
  chapterNumber: number;
  publishedAt: string;
  views: number;
  scheduledAt: string | null;
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
  };
}

const CHAPTER_REFRESH_INTERVAL_MS = 30_000;

function isChapterPublished(chapter: Chapter, nowMs: number): boolean {
  const publishedAtMs = Date.parse(chapter.publishedAt);
  const scheduledAtMs = chapter.scheduledAt ? Date.parse(chapter.scheduledAt) : null;

  if (!Number.isNaN(publishedAtMs) && publishedAtMs > nowMs) {
    return false;
  }

  if (scheduledAtMs !== null && !Number.isNaN(scheduledAtMs) && scheduledAtMs > nowMs) {
    return false;
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

    const response = await fetch(buildChaptersUrl(isAdmin), {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
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

  const incrementViews = useCallback(
    async (chapterId: string) => {
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      await fetch(`${url}/rest/v1/rpc/increment_chapter_views`, {
        method: 'POST',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ chapter_id: chapterId }),
      });

      setChapters((prev) =>
        prev.map((c) =>
          c.id === chapterId ? { ...c, views: c.views + 1 } : c
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
    () => chapters.filter((chapter) => isChapterPublished(chapter, nowMs)),
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
