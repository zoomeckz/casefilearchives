import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AuthUser } from '@/hooks/useAuth';

export interface Achievement {
  id: string;
  key: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  requirement_type: string;
  requirement_count: number;
  frame_style: string | null;
  sort_order: number;
}

export interface UserAchievement {
  achievement_id: string;
  unlocked_at: string;
}

interface UserStats {
  chaptersRead: number;
  comments: number;
  forumPosts: number;
  bookmarks: number;
  totalChapters: number;
  userNumber: number;
}

export function useAchievements(user: AuthUser | null) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [userAchievements, setUserAchievements] = useState<UserAchievement[]>([]);
  const [stats, setStats] = useState<UserStats>({ chaptersRead: 0, comments: 0, forumPosts: 0, bookmarks: 0, totalChapters: 0, userNumber: 999 });
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    const [
      { data: achData },
      { data: userAchData },
      { count: chaptersRead },
      { count: comments },
      { count: forumPosts },
      { count: bookmarks },
      { count: totalChapters },
      { data: profileData },
    ] = await Promise.all([
      supabase.from('achievements').select('*').order('sort_order'),
      supabase.from('user_achievements').select('achievement_id, unlocked_at').eq('user_id', user.id),
      supabase.from('reading_progress').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('comments').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('forum_posts').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('bookmarks').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('chapters').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('selected_frame').eq('user_id', user.id).maybeSingle(),
    ]);

    // Estimate user number by profile count before this user
    const { count: usersBefore } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).lte('created_at', user.id);

    setAchievements((achData as any[]) || []);
    setUserAchievements((userAchData as any[]) || []);
    setSelectedFrame(profileData?.selected_frame || null);
    setStats({
      chaptersRead: chaptersRead || 0,
      comments: comments || 0,
      forumPosts: forumPosts || 0,
      bookmarks: bookmarks || 0,
      totalChapters: totalChapters || 0,
      userNumber: usersBefore || 999,
    });
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const checkAndUnlock = useCallback(async () => {
    if (!user || achievements.length === 0) return;

    const unlockedIds = new Set(userAchievements.map(ua => ua.achievement_id));
    const toUnlock: string[] = [];

    for (const ach of achievements) {
      if (unlockedIds.has(ach.id)) continue;

      let progress = 0;
      switch (ach.requirement_type) {
        case 'chapters_read':
          progress = stats.chaptersRead;
          break;
        case 'comments':
          progress = stats.comments;
          break;
        case 'forum_posts':
          progress = stats.forumPosts;
          break;
        case 'bookmarks':
          progress = stats.bookmarks;
          break;
        case 'community_combined':
          progress = stats.forumPosts + stats.comments;
          break;
        case 'early_user':
          progress = stats.userNumber <= 50 ? 1 : 0;
          break;
        case 'all_activities':
          progress = (stats.chaptersRead >= 3 && stats.comments >= 1 && stats.forumPosts >= 1) ? 1 : 0;
          break;
      }

      if (progress >= ach.requirement_count) {
        toUnlock.push(ach.id);
      }
    }

    if (toUnlock.length > 0) {
      const inserts = toUnlock.map(id => ({ user_id: user.id, achievement_id: id }));
      await supabase.from('user_achievements').insert(inserts);
      await fetchData();
    }
  }, [user, achievements, userAchievements, stats, fetchData]);

  useEffect(() => { checkAndUnlock(); }, [stats]);

  const getProgress = (ach: Achievement): { current: number; max: number } => {
    let current = 0;
    switch (ach.requirement_type) {
      case 'chapters_read': current = stats.chaptersRead; break;
      case 'comments': current = stats.comments; break;
      case 'forum_posts': current = stats.forumPosts; break;
      case 'bookmarks': current = stats.bookmarks; break;
      case 'community_combined': current = stats.forumPosts + stats.comments; break;
      case 'early_user': current = stats.userNumber <= 50 ? 1 : 0; break;
      case 'all_activities': current = (stats.chaptersRead >= 3 && stats.comments >= 1 && stats.forumPosts >= 1) ? 1 : 0; break;
    }
    return { current: Math.min(current, ach.requirement_count), max: ach.requirement_count };
  };

  const selectFrame = async (frame: string | null) => {
    if (!user) return;
    await supabase.from('profiles').update({ selected_frame: frame }).eq('user_id', user.id);
    setSelectedFrame(frame);
  };

  return {
    achievements,
    userAchievements,
    stats,
    selectedFrame,
    loading,
    getProgress,
    selectFrame,
    isUnlocked: (achId: string) => userAchievements.some(ua => ua.achievement_id === achId),
    refresh: fetchData,
  };
}
