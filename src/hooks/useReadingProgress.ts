import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AuthUser } from './useAuth';
import { notifyActivity } from '@/lib/commendations';

export function useReadingProgress(user: AuthUser | null) {
  const [readChapterIds, setReadChapterIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Fetch reading progress when user changes
  useEffect(() => {
    if (!user) {
      setReadChapterIds(new Set());
      return;
    }

    const fetchProgress = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('reading_progress')
        .select('chapter_id')
        .eq('user_id', user.id);

      if (!error && data) {
        setReadChapterIds(new Set(data.map(p => p.chapter_id)));
      }
      setLoading(false);
    };

    fetchProgress();
  }, [user?.id]);

  const markAsRead = useCallback(async (chapterId: string) => {
    if (!user) return;
    
    // Optimistic update
    setReadChapterIds(prev => new Set([...prev, chapterId]));

    const { error } = await supabase
      .from('reading_progress')
      .upsert({
        user_id: user.id,
        chapter_id: chapterId,
      }, {
        onConflict: 'user_id,chapter_id'
      });

    if (error) {
      // Revert on error
      setReadChapterIds(prev => {
        const next = new Set(prev);
        next.delete(chapterId);
        return next;
      });
    } else {
      notifyActivity();
    }
  }, [user?.id]);

  const markAsUnread = useCallback(async (chapterId: string) => {
    if (!user) return;
    
    // Optimistic update
    setReadChapterIds(prev => {
      const next = new Set(prev);
      next.delete(chapterId);
      return next;
    });

    const { error } = await supabase
      .from('reading_progress')
      .delete()
      .eq('user_id', user.id)
      .eq('chapter_id', chapterId);

    if (error) {
      // Revert on error
      setReadChapterIds(prev => new Set([...prev, chapterId]));
    }
  }, [user?.id]);

  const isRead = useCallback((chapterId: string) => {
    return readChapterIds.has(chapterId);
  }, [readChapterIds]);

  return {
    readChapterIds,
    loading,
    markAsRead,
    markAsUnread,
    isRead,
    readCount: readChapterIds.size,
  };
}
