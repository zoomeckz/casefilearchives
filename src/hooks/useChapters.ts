import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Chapter {
  id: string;
  title: string;
  content: string;
  chapterNumber: number;
  publishedAt: string;
  views: number;
}

export function useChapters() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChapters = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('chapters')
        .select('*')
        .order('chapter_number', { ascending: true });

      if (error) {
        console.error('Failed to fetch chapters:', error);
      }

      if (data && data.length > 0) {
        setChapters(data.map(c => ({
          id: c.id,
          title: c.title,
          content: c.content,
          chapterNumber: c.chapter_number,
          publishedAt: c.published_at,
          views: c.views,
        })));
      }
    } catch (err) {
      console.error('Error fetching chapters:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChapters();
  }, [fetchChapters]);

  const incrementViews = useCallback(async (chapterId: string) => {
    const chapter = chapters.find(c => c.id === chapterId);
    if (!chapter) return;

    await supabase
      .from('chapters')
      .update({ views: chapter.views + 1 })
      .eq('id', chapterId);

    setChapters(prev => prev.map(c =>
      c.id === chapterId ? { ...c, views: c.views + 1 } : c
    ));
  }, [chapters]);

  return {
    chapters,
    loading,
    refetch: fetchChapters,
    incrementViews,
  };
}
