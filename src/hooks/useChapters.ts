import { useState, useEffect, useCallback } from 'react';

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

export function useChapters(isAdmin = false) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const doFetch = async () => {
      try {
        const url = import.meta.env.VITE_SUPABASE_URL;
        const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        
        const response = await fetch(
          `${url}/rest/v1/chapters?select=*&order=chapter_number.asc`,
          {
            headers: {
              'apikey': key,
              'Authorization': `Bearer ${key}`,
            },
          }
        );

        if (cancelled) return;
        const data = await response.json();

        if (Array.isArray(data)) {
          const now = new Date().toISOString();
          setChapters(
            data
              .filter((c: any) => isAdmin || !c.scheduled_at || c.scheduled_at <= now)
              .map(mapChapter)
          );
        }
      } catch (err) {
        console.error('[useChapters] error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    doFetch();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

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
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const response = await fetch(
      `${url}/rest/v1/chapters?select=*&order=chapter_number.asc`,
      {
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
        },
      }
    );
    const data = await response.json();
    if (Array.isArray(data)) {
      const now = new Date().toISOString();
      setChapters(
        data
          .filter((c: any) => isAdmin || !c.scheduled_at || c.scheduled_at <= now)
          .map(mapChapter)
      );
    }
  }, [isAdmin]);

  return {
    chapters,
    loading,
    refetch,
    incrementViews,
  };
}
