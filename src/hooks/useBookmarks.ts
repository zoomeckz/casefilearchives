 import { useState, useEffect, useCallback } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import type { AuthUser } from './useAuth';
 
 export function useBookmarks(user: AuthUser | null) {
   const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
   const [loading, setLoading] = useState(false);
 
   // Fetch bookmarks when user changes
   useEffect(() => {
     if (!user) {
       setBookmarkedIds(new Set());
       return;
     }
 
     const fetchBookmarks = async () => {
       setLoading(true);
       const { data, error } = await supabase
         .from('bookmarks')
         .select('chapter_id')
         .eq('user_id', user.id);
 
       if (!error && data) {
         setBookmarkedIds(new Set(data.map(b => b.chapter_id)));
       }
       setLoading(false);
     };
 
     fetchBookmarks();
   }, [user?.id]);
 
   const addBookmark = useCallback(async (chapterId: string) => {
     if (!user) return;
     
     // Optimistic update
     setBookmarkedIds(prev => new Set([...prev, chapterId]));
 
     const { error } = await supabase
       .from('bookmarks')
       .insert({
         user_id: user.id,
         chapter_id: chapterId,
       });
 
     if (error) {
       // Revert on error
       setBookmarkedIds(prev => {
         const next = new Set(prev);
         next.delete(chapterId);
         return next;
       });
     }
   }, [user?.id]);
 
   const removeBookmark = useCallback(async (chapterId: string) => {
     if (!user) return;
     
     // Optimistic update
     setBookmarkedIds(prev => {
       const next = new Set(prev);
       next.delete(chapterId);
       return next;
     });
 
     const { error } = await supabase
       .from('bookmarks')
       .delete()
       .eq('user_id', user.id)
       .eq('chapter_id', chapterId);
 
     if (error) {
       // Revert on error
       setBookmarkedIds(prev => new Set([...prev, chapterId]));
     }
   }, [user?.id]);
 
   const toggleBookmark = useCallback(async (chapterId: string) => {
     if (bookmarkedIds.has(chapterId)) {
       await removeBookmark(chapterId);
     } else {
       await addBookmark(chapterId);
     }
   }, [bookmarkedIds, addBookmark, removeBookmark]);
 
   const isBookmarked = useCallback((chapterId: string) => {
     return bookmarkedIds.has(chapterId);
   }, [bookmarkedIds]);
 
   return {
     bookmarkedIds,
     loading,
     addBookmark,
     removeBookmark,
     toggleBookmark,
     isBookmarked,
     bookmarkCount: bookmarkedIds.size,
   };
 }