import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AuthUser } from './useAuth';
import type { Chapter } from './useChapters';

export function usePageTracking(
  user: AuthUser | null,
  currentPage: string,
  selectedChapter: Chapter | null
) {
  const startTime = useRef(Date.now());
  const lastPage = useRef(currentPage);
  const lastChapterId = useRef(selectedChapter?.id);

  useEffect(() => {
    // Track previous page duration
    const elapsed = Math.round((Date.now() - startTime.current) / 1000);
    if (elapsed > 1 && lastPage.current) {
      supabase.from('page_views').insert({
        user_id: user?.id || null,
        chapter_id: lastChapterId.current || null,
        page: lastPage.current,
        duration_seconds: elapsed,
      }).then(() => {});
    }

    startTime.current = Date.now();
    lastPage.current = currentPage;
    lastChapterId.current = selectedChapter?.id || null;

    // Track on unmount / page leave
    return () => {
      const dur = Math.round((Date.now() - startTime.current) / 1000);
      if (dur > 1) {
        // Use sendBeacon for page unload
        const payload = {
          user_id: user?.id || null,
          chapter_id: selectedChapter?.id || null,
          page: currentPage,
          duration_seconds: dur,
        };
        // Fire and forget
        supabase.from('page_views').insert(payload).then(() => {});
      }
    };
  }, [currentPage, selectedChapter?.id]);
}
