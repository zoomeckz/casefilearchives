import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Icons } from "@/lib/icons";
import { supabase } from "@/integrations/supabase/client";
import { ProfileFrame } from "@/components/ProfileFrame";
import { SavedQuotesSection } from "@/components/SavedQuotesSection";

interface PublicProfile {
  name: string;
  bio: string | null;
  avatar_url: string | null;
  instagram: string | null;
  tiktok: string | null;
  website: string | null;
  selected_frame: string | null;
  created_at: string;
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  frame_style: string | null;
}

export const PublicProfilePage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [stats, setStats] = useState({ chaptersRead: 0, comments: 0, forumPosts: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const fetch = async () => {
      const [
        { data: profileData },
        { data: userAchData },
        { count: chaptersRead },
        { count: comments },
        { count: forumPosts },
      ] = await Promise.all([
        supabase.from('profiles').select('name, bio, avatar_url, instagram, tiktok, website, selected_frame, created_at').eq('user_id', userId).maybeSingle(),
        supabase.from('user_achievements').select('achievement_id').eq('user_id', userId),
        supabase.from('reading_progress').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('comments').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('forum_posts').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      ]);

      setProfile(profileData as PublicProfile | null);
      setStats({
        chaptersRead: chaptersRead || 0,
        comments: comments || 0,
        forumPosts: forumPosts || 0,
      });

      if (userAchData && userAchData.length > 0) {
        const achIds = userAchData.map((ua: any) => ua.achievement_id);
        const { data: achData } = await supabase.from('achievements').select('id, title, description, icon, category, frame_style').in('id', achIds).order('sort_order');
        setAchievements((achData as Achievement[]) || []);
      }

      setLoading(false);
    };
    fetch();
  }, [userId]);

  if (loading) {
    return (
      <div className="min-h-screen py-12 px-6 flex items-center justify-center">
        <p className="text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen py-12 px-6 flex items-center justify-center">
        <p className="text-muted-foreground">User not found</p>
      </div>
    );
  }

  const memberSince = new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen py-8 sm:py-12 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <p className="case-label text-[9px] mb-5">Reader record / public</p>
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 mb-8">
          <ProfileFrame avatarUrl={profile.avatar_url} name={profile.name} frame={profile.selected_frame} size={128} />
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-3xl uppercase text-foreground font-display">{profile.name}</h1>
            <p className="text-muted-foreground text-sm mt-1">Member since {memberSince}</p>
            {profile.bio && <p className="text-foreground/70 mt-3 text-sm">{profile.bio}</p>}
            {(profile.instagram || profile.tiktok || profile.website) && (
              <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
                {profile.instagram && <span>📸 {profile.instagram}</span>}
                {profile.tiktok && <span>🎵 {profile.tiktok}</span>}
                {profile.website && (
                  <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    🔗 {profile.website}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Activity Stats */}
        <div className="case-file grid grid-cols-3 gap-4 sm:gap-6 text-center mb-12 p-4 sm:p-6">
          <div>
            <div className="text-2xl font-display text-foreground">{stats.chaptersRead}</div>
            <div className="text-muted-foreground text-sm mt-1">Stories Read</div>
          </div>
          <div>
            <div className="text-2xl font-display text-foreground">{stats.comments}</div>
            <div className="text-muted-foreground text-sm mt-1">Comments</div>
          </div>
          <div>
            <div className="text-2xl font-display text-foreground">{stats.forumPosts}</div>
            <div className="text-muted-foreground text-sm mt-1">Forum Posts</div>
          </div>
        </div>

        {/* Achievements */}
        {false && achievements.length > 0 && (
          <section>
            <h2 className="font-display text-xl text-accent mb-4">Achievements ({achievements.length})</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {achievements.map(ach => (
                <div key={ach.id} className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-xl">
                  <span className="text-2xl">{ach.icon}</span>
                  <div>
                    <h4 className="text-foreground font-medium text-sm">{ach.title}</h4>
                    <p className="text-muted-foreground text-xs">{ach.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {false && achievements.length === 0 && (
          <p className="text-muted-foreground text-center py-8">No achievements yet</p>
        )}

        {/* Saved Quotes */}
        {userId && <SavedQuotesSection userId={userId} />}
      </div>
    </div>
  );
};

export default PublicProfilePage;
