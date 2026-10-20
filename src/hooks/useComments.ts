import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AuthUser } from './useAuth';
import { normalizePlainTextFormatting } from '@/lib/contentFormatting';

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
        user_id
      `)
      .eq('chapter_id', chapterId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      // Comments have no database link to profiles, so names come from the public profile list.
      const ids = [...new Set(data.map(c => c.user_id))];
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: people } = await (supabase as any)
          .rpc('get_public_profiles')
          .select('user_id,name')
          .in('user_id', ids);
        for (const p of (people || []) as { user_id: string; name: string }[]) names.set(p.user_id, p.name);
      }
      setComments(data.map(c => ({
        id: c.id,
        content: c.content,
        author: names.get(c.user_id) || 'Anonymous',
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

    const normalizedContent = normalizePlainTextFormatting(content);

    const { data, error } = await supabase
      .from('comments')
      .insert({
        chapter_id: chapterId,
        user_id: user.id,
        content: normalizedContent,
      })
      .select()
      .single();

    if (!error && data) {
      setComments(prev => [...prev, {
        id: data.id,
        content: normalizedContent,
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
    const normalizedContent = normalizePlainTextFormatting(newContent);
    const { error } = await supabase
      .from('comments')
      .update({ content: normalizedContent, updated_at: now })
      .eq('id', commentId);

    if (!error) {
      setComments(prev => prev.map(c =>
        c.id === commentId ? { ...c, content: normalizedContent, updatedAt: now, isEdited: true } : c
      ));
    }
  }, []);

  const deleteComment = useCallback(async (commentId: string) => {
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId);

    if (!error) {
      setComments(prev => prev.filter(c => c.id !== commentId));
    }
  }, []);

  return {
    comments,
    loading,
    addComment,
    updateComment,
    deleteComment,
    refetch: fetchComments,
  };
}
