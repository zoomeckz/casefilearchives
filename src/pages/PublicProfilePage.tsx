import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { ProfileFrame } from "@/components/ProfileFrame";
import { SavedQuotesSection } from "@/components/SavedQuotesSection";
import { dbFetch } from "@/lib/dbFetch";

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

// Same session store useAuth writes — profiles SELECT requires an
// authenticated JWT; anon sessions get zero rows by policy.
function getStoredToken(): string | null {
  try {
    const raw = localStorage.getItem('app-auth-session');
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.access_token) return null;
    if (session.expires_at < Math.floor(Date.now() / 1000) + 60) return null;
    return session.access_token;
  } catch {
    return null;
  }
}

export const PublicProfilePage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [stats, setStats] = useState({ chaptersRead: 0, comments: 0, forumPosts: 0 });
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const fetch = async () => {
      const token = getStoredToken();

      // Signed in: full profile. Anon (or expired token): the public RPC
      // exposes only name, avatar_url and selected_frame.
      let profileData: PublicProfile | null = null;
      if (token) {
        const { data } = await dbFetch<PublicProfile[]>('profiles', {
          select: 'name, bio, avatar_url, instagram, tiktok, website, selected_frame, created_at',
          filters: `user_id=eq.${userId}`,
          token,
        });
        profileData = data?.[0] ?? null;
      }
      if (!profileData) {
        const { data } = await dbFetch<any[]>('rpc/get_public_profiles', {
          method: 'POST',
          body: { _user_ids: [userId] },
        });
        const basic = data?.[0];
        if (basic) {
          profileData = {
            name: basic.name,
            bio: null,
            avatar_url: basic.avatar_url,
            instagram: null,
            tiktok: null,
            website: null,
            selected_frame: basic.selected_frame,
            created_at: '',
          };
        }
      }
      setProfile(profileData);
      setSignedIn(!!token && !!profileData?.created_at);

      const [{ count: comments }, { count: forumPosts }] = await Promise.all([
        dbFetch('comments', { select: 'id', filters: `user_id=eq.${userId}`, head: true }),
        dbFetch('forum_posts', { select: 'id', filters: `user_id=eq.${userId}`, head: true }),
      ]);
      setStats({
        chaptersRead: 0,
        comments: comments || 0,
        forumPosts: forumPosts || 0,
      });
      if (token) {
        const { count: chaptersRead } = await dbFetch('reading_progress', {
          select: 'chapter_id',
          filters: `user_id=eq.${userId}`,
          head: true,
          token,
        });
        setStats((s) => ({ ...s, chaptersRead: chaptersRead || 0 }));
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

  const createdMs = profile.created_at ? Date.parse(profile.created_at) : NaN;
  const memberSince = Number.isNaN(createdMs)
    ? null
    : new Date(createdMs).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen py-8 sm:py-12 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <p className="case-label text-[9px] mb-5">Reader record / public</p>
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 mb-8">
          <ProfileFrame avatarUrl={profile.avatar_url} name={profile.name} frame={profile.selected_frame} size={128} />
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-3xl uppercase text-foreground font-display">{profile.name}</h1>
            {memberSince && <p className="text-muted-foreground text-sm mt-1">Member since {memberSince}</p>}
            {signedIn && profile.bio && <p className="text-foreground/70 mt-3 text-sm">{profile.bio}</p>}
            {signedIn && (profile.instagram || profile.tiktok || profile.website) && (
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

        {/* Activity Stats — Stories Read is only visible signed in; reading
            progress is private, so anon visitors would just see 0. */}
        <div className={`case-file grid ${signedIn ? 'grid-cols-3' : 'grid-cols-2'} gap-4 sm:gap-6 text-center mb-12 p-4 sm:p-6`}>
          {signedIn && (
            <div>
              <div className="text-2xl font-display text-foreground">{stats.chaptersRead}</div>
              <div className="text-muted-foreground text-sm mt-1">Stories Read</div>
            </div>
          )}
          <div>
            <div className="text-2xl font-display text-foreground">{stats.comments}</div>
            <div className="text-muted-foreground text-sm mt-1">Comments</div>
          </div>
          <div>
            <div className="text-2xl font-display text-foreground">{stats.forumPosts}</div>
            <div className="text-muted-foreground text-sm mt-1">Forum Posts</div>
          </div>
        </div>

        {/* Saved Quotes */}
        {userId && <SavedQuotesSection userId={userId} />}
      </div>
    </div>
  );
};

export default PublicProfilePage;
