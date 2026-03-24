import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AuthUser } from './useAuth';

export interface Comment {
  id: string;
  content: string;
  author: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  isEdited: boolean;
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
        updated_at,
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
        updatedAt: c.updated_at || c.created_at,
        isEdited: !!(c.updated_at && c.updated_at !== c.created_at),
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
      setComments(prev => [...prev, {
        id: data.id,
        content: data.content,
        author: user.name,
        authorId: data.user_id,
        createdAt: data.created_at,
        updatedAt: data.created_at,
        isEdited: false,
      }]);
    }
  }, [chapterId]);

  const updateComment = useCallback(async (commentId: string, newContent: string) => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('comments')
      .update({ content: newContent, updated_at: now })
      .eq('id', commentId);

    if (!error) {
      setComments(prev => prev.map(c =>
        c.id === commentId ? { ...c, content: newContent, updatedAt: now, isEdited: true } : c
      ));
    }
  }, []);

  return {
    comments,
    loading,
    addComment,
    updateComment,
    refetch: fetchComments,
  };
}
