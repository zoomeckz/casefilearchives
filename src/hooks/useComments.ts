import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AuthUser } from './useAuth';

export interface Comment {
  id: string;
  content: string;
  author: string;
  authorId: string;
  createdAt: string;
}

export function useComments(chapterId: string | undefined) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchComments = useCallback(async () => {
    if (!chapterId) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from('comments')
      .select(`
        id,
        content,
        created_at,
        user_id,
        profiles!inner(name)
      `)
      .eq('chapter_id', chapterId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setComments(data.map(c => ({
        id: c.id,
        content: c.content,
        author: (c.profiles as any)?.name || 'Anonymous',
        authorId: c.user_id,
        createdAt: c.created_at,
      })));
    }
    setLoading(false);
  }, [chapterId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const addComment = useCallback(async (content: string, user: AuthUser) => {
    if (!chapterId || !user) return;

    const { data, error } = await supabase
      .from('comments')
      .insert({
        chapter_id: chapterId,
        user_id: user.id,
        content,
      })
      .select()
      .single();

    if (!error && data) {
      // Add to local state
      setComments(prev => [...prev, {
        id: data.id,
        content: data.content,
        author: user.name,
        authorId: data.user_id,
        createdAt: data.created_at,
      }]);
    }
  }, [chapterId]);

  return {
    comments,
    loading,
    addComment,
    refetch: fetchComments,
  };
}
