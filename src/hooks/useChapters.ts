import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { sampleChapters } from '@/lib/data';

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
  const [initialized, setInitialized] = useState(false);

  const fetchChapters = useCallback(async () => {
    const { data, error } = await supabase
      .from('chapters')
      .select('*')
      .order('chapter_number', { ascending: true });

    if (!error && data) {
      setChapters(data.map(c => ({
        id: c.id,
        title: c.title,
        content: c.content,
        chapterNumber: c.chapter_number,
        publishedAt: c.published_at,
        views: c.views,
      })));
    }
    setLoading(false);
    return data;
  }, []);

  // Initialize chapters from sample data if empty
  const initializeChapters = useCallback(async () => {
    if (initialized) return;
    
    const data = await fetchChapters();
    
    if (!data || data.length === 0) {
      // Insert sample chapters
      const chaptersToInsert = sampleChapters.map(c => ({
        chapter_number: c.chapterNumber,
        title: c.title,
        content: c.content,
        published_at: c.publishedAt,
        views: c.views,
      }));

      const { error } = await supabase
        .from('chapters')
        .insert(chaptersToInsert);

      if (!error) {
        await fetchChapters();
      }
    }
    
    setInitialized(true);
  }, [initialized, fetchChapters]);

  useEffect(() => {
    initializeChapters();
  }, [initializeChapters]);

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
