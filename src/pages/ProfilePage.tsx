import React, { useState, useEffect } from "react";
import { Icons } from "@/lib/icons";
import { AuthUser } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useReadingProgress } from "@/hooks/useReadingProgress";

interface ProfilePageProps {
  user: AuthUser;
  onLogout: () => void;
  refreshUser: () => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  user,
  onLogout,
  refreshUser,
}) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    name: user?.name || "",
  });
  const { readCount } = useReadingProgress(user);
  const [commentCount, setCommentCount] = useState(0);
  const [postCount, setPostCount] = useState(0);

  // Fetch user stats
  useEffect(() => {
    const fetchStats = async () => {
      if (!user) return;

      // Count comments
      const { count: comments } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      
      // Count forum posts
      const { count: posts } = await supabase
        .from('forum_posts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      setCommentCount(comments || 0);
      setPostCount(posts || 0);
    };

    fetchStats();
  }, [user?.id]);

  const handleSave = async () => {
    setSaving(true);
    
    const { error } = await supabase
      .from('profiles')
      .update({ name: profile.name })
      .eq('user_id', user.id);

    if (!error) {
      refreshUser();
      setEditing(false);
    }
    setSaving(false);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-display text-4xl text-amber-100 mb-2">
          Your Profile
        </h1>
        <p className="text-stone-500 mb-12">
          Manage your account and preferences
        </p>

        <div className="space-y-8">
          {/* Avatar Section */}
          <div className="flex items-start gap-6">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-sky-600 to-maroon-600 flex items-center justify-center">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl text-white font-display">
                    {user.name?.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            </div>
            <div className="flex-1">
              {editing ? (
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) =>
                    setProfile({ ...profile, name: e.target.value })
                  }
                  className="w-full px-0 py-2 bg-transparent border-b border-stone-700 text-2xl text-stone-100 font-display focus:outline-none focus:border-sky-500"
                  placeholder="Your name"
                />
              ) : (
                <h2 className="text-2xl text-stone-100 font-display">
                  {user.name}
                </h2>
              )}
              <p className="text-stone-500 mt-1">{user.email}</p>
              {user.isAdmin && (
                <span className="inline-block mt-2 px-2 py-0.5 bg-sky-600/20 text-sky-400 text-xs rounded">
                  Admin
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4 pt-6 border-t border-stone-800">
            {editing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-sky-800 text-white rounded-lg font-medium transition-colors"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={() => {
                    setProfile({ name: user.name });
                    setEditing(false);
                  }}
                  className="px-6 py-2 text-stone-400 hover:text-stone-200 transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-2 px-6 py-2 text-sky-400 hover:text-sky-300 transition-colors"
              >
                <Icons.Edit />
                Edit Profile
              </button>
            )}

            <button
              onClick={onLogout}
              className="flex items-center gap-2 ml-auto px-6 py-2 text-red-400 hover:text-red-300 transition-colors"
            >
              <Icons.Logout />
              Sign Out
            </button>
          </div>
        </div>

        {/* Reading Stats */}
        <div className="mt-16">
          <h3 className="font-display text-xl text-amber-100 mb-6">
            Your Activity
          </h3>
          <div className="grid grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-3xl font-display text-stone-100">{readCount}</div>
              <div className="text-stone-500 text-sm mt-1">Chapters Read</div>
            </div>
            <div>
              <div className="text-3xl font-display text-stone-100">{commentCount}</div>
              <div className="text-stone-500 text-sm mt-1">Comments</div>
            </div>
            <div>
              <div className="text-3xl font-display text-stone-100">{postCount}</div>
              <div className="text-stone-500 text-sm mt-1">Forum Posts</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
