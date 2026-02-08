import React, { useState, useEffect, useRef } from "react";
import { Icons } from "@/lib/icons";
import { AuthUser } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { useEmailSubscription } from "@/hooks/useEmailSubscription";

interface ProfilePageProps {
  user: AuthUser;
  onLogout: () => void;
  refreshUser: () => void;
  bookmarkCount: number;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  user,
  onLogout,
  refreshUser,
  bookmarkCount,
}) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState({
    name: user?.name || "",
    bio: "",
    instagram: "",
    tiktok: "",
    website: "",
  });
  const { readCount } = useReadingProgress(user);
  const { isSubscribed, toggleSubscription, loading: subLoading } = useEmailSubscription(user);
  const [commentCount, setCommentCount] = useState(0);
  const [postCount, setPostCount] = useState(0);

  // Fetch profile data & stats
  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [{ data: profileData }, { count: comments }, { count: posts }] = await Promise.all([
        supabase.from('profiles').select('bio, instagram, tiktok, website').eq('user_id', user.id).maybeSingle(),
        supabase.from('comments').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('forum_posts').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);
      if (profileData) {
        setProfile(p => ({
          ...p,
          bio: profileData.bio || '',
          instagram: profileData.instagram || '',
          tiktok: profileData.tiktok || '',
          website: profileData.website || '',
        }));
      }
      setCommentCount(comments || 0);
      setPostCount(posts || 0);
    };
    fetchData();
  }, [user?.id]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/avatar.${ext}`;
    
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });

    if (!uploadError) {
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('user_id', user.id);
      refreshUser();
    }
    setUploading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    await supabase
      .from('profiles')
      .update({
        name: profile.name,
        bio: profile.bio,
        instagram: profile.instagram,
        tiktok: profile.tiktok,
        website: profile.website,
      })
      .eq('user_id', user.id);
    refreshUser();
    setEditing(false);
    setSaving(false);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-display text-4xl text-accent mb-2">Your Profile</h1>
        <p className="text-muted-foreground mb-12">Manage your account and preferences</p>

        <div className="space-y-8">
          {/* Avatar Section */}
          <div className="flex items-start gap-6">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-primary to-destructive flex items-center justify-center">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl text-primary-foreground font-display">
                    {user.name?.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-0 right-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground hover:bg-primary/80 transition-colors"
              >
                <Icons.Camera className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>
            <div className="flex-1">
              {editing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-muted-foreground text-xs mb-1">Display Name</label>
                    <input
                      type="text"
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-muted-foreground text-xs mb-1">Bio</label>
                    <textarea
                      value={profile.bio}
                      onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                      className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:border-primary resize-none"
                      rows={3}
                      placeholder="Tell us about yourself..."
                    />
                  </div>
                  <div>
                    <label className="block text-muted-foreground text-xs mb-1">Instagram</label>
                    <input
                      type="text"
                      value={profile.instagram}
                      onChange={(e) => setProfile({ ...profile, instagram: e.target.value })}
                      className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
                      placeholder="@username"
                    />
                  </div>
                  <div>
                    <label className="block text-muted-foreground text-xs mb-1">TikTok</label>
                    <input
                      type="text"
                      value={profile.tiktok}
                      onChange={(e) => setProfile({ ...profile, tiktok: e.target.value })}
                      className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
                      placeholder="@username"
                    />
                  </div>
                  <div>
                    <label className="block text-muted-foreground text-xs mb-1">Website</label>
                    <input
                      type="text"
                      value={profile.website}
                      onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                      className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
                      placeholder="https://..."
                    />
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl text-foreground font-display">{user.name}</h2>
                  <p className="text-muted-foreground mt-1">{user.email}</p>
                  {profile.bio && <p className="text-foreground/70 mt-2 text-sm">{profile.bio}</p>}
                  {(profile.instagram || profile.tiktok) && (
                    <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                      {profile.instagram && <span>IG: {profile.instagram}</span>}
                      {profile.tiktok && <span>TT: {profile.tiktok}</span>}
                    </div>
                  )}
                  {user.isAdmin && (
                    <span className="inline-block mt-2 px-2 py-0.5 bg-primary/20 text-primary text-xs rounded">Admin</span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4 pt-6 border-t border-border">
            {editing ? (
              <>
                <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-primary hover:bg-primary/80 disabled:bg-primary/50 text-primary-foreground rounded-lg font-medium transition-colors">
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button onClick={() => setEditing(false)} className="px-6 py-2 text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} className="flex items-center gap-2 px-6 py-2 text-primary hover:text-primary/80 transition-colors">
                <Icons.Edit /> Edit Profile
              </button>
            )}
            <button onClick={onLogout} className="flex items-center gap-2 ml-auto px-6 py-2 text-destructive hover:text-destructive/80 transition-colors">
              <Icons.Logout /> Sign Out
            </button>
          </div>
        </div>

        {/* Email Notifications */}
        <div className="mt-16 p-6 bg-card/30 rounded-xl border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Icons.Mail className="w-5 h-5 text-muted-foreground" />
              <div>
                <h4 className="text-foreground font-medium">New Chapter Notifications</h4>
                <p className="text-muted-foreground text-sm">Get notified when new chapters are published</p>
              </div>
            </div>
            <button
              onClick={toggleSubscription}
              disabled={subLoading}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isSubscribed
                  ? "bg-secondary text-foreground/80 hover:bg-secondary/80"
                  : "bg-primary text-primary-foreground hover:bg-primary/80"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {subLoading ? "..." : isSubscribed ? "Subscribed ✓" : "Subscribe"}
            </button>
          </div>
        </div>

        {/* Activity Stats */}
        <div className="mt-16">
          <h3 className="font-display text-xl text-accent mb-6">Your Activity</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div>
              <div className="text-3xl font-display text-foreground">{readCount}</div>
              <div className="text-muted-foreground text-sm mt-1">Chapters Read</div>
            </div>
            <div>
              <div className="text-3xl font-display text-foreground">{bookmarkCount}</div>
              <div className="text-muted-foreground text-sm mt-1">Bookmarked</div>
            </div>
            <div>
              <div className="text-3xl font-display text-foreground">{commentCount}</div>
              <div className="text-muted-foreground text-sm mt-1">Comments</div>
            </div>
            <div>
              <div className="text-3xl font-display text-foreground">{postCount}</div>
              <div className="text-muted-foreground text-sm mt-1">Forum Posts</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
