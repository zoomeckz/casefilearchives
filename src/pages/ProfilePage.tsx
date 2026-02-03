import React, { useState } from "react";
import { Icons } from "@/lib/icons";
import { User } from "@/lib/data";

interface ProfilePageProps {
  user: User;
  setUser: (user: User) => void;
  onLogout: () => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  user,
  setUser,
  onLogout,
}) => {
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState({
    name: user?.name || "",
    bio: user?.bio || "",
    location: user?.location || "",
    website: user?.website || "",
    favoriteCharacter: user?.favoriteCharacter || "",
    avatar: user?.avatar || null,
  });

  const handleSave = () => {
    setUser({ ...user, ...profile });
    setEditing(false);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfile({ ...profile, avatar: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
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
                {profile.avatar ? (
                  <img
                    src={profile.avatar}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl text-white font-display">
                    {user.name?.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              {editing && (
                <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                  <Icons.Camera className="text-white" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </label>
              )}
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
              <p className="text-stone-600 text-sm mt-1">
                Member since {new Date().toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Bio */}
          <div>
            <label className="text-stone-400 text-sm">About you</label>
            {editing ? (
              <textarea
                value={profile.bio}
                onChange={(e) =>
                  setProfile({ ...profile, bio: e.target.value })
                }
                placeholder="Tell us about yourself..."
                className="w-full mt-2 px-0 py-2 bg-transparent border-b border-stone-700 text-stone-200 focus:outline-none focus:border-sky-500 resize-none"
                rows={3}
              />
            ) : (
              <p className="text-stone-300 mt-2">
                {profile.bio || "No bio yet."}
              </p>
            )}
          </div>

          {/* Location */}
          <div>
            <label className="text-stone-400 text-sm">Location</label>
            {editing ? (
              <input
                type="text"
                value={profile.location}
                onChange={(e) =>
                  setProfile({ ...profile, location: e.target.value })
                }
                placeholder="Where are you from?"
                className="w-full mt-2 px-0 py-2 bg-transparent border-b border-stone-700 text-stone-200 focus:outline-none focus:border-sky-500"
              />
            ) : (
              <p className="text-stone-300 mt-2">
                {profile.location || "Not specified"}
              </p>
            )}
          </div>

          {/* Website */}
          <div>
            <label className="text-stone-400 text-sm">Website</label>
            {editing ? (
              <input
                type="url"
                value={profile.website}
                onChange={(e) =>
                  setProfile({ ...profile, website: e.target.value })
                }
                placeholder="https://..."
                className="w-full mt-2 px-0 py-2 bg-transparent border-b border-stone-700 text-stone-200 focus:outline-none focus:border-sky-500"
              />
            ) : (
              <p className="text-stone-300 mt-2">
                {profile.website ? (
                  <a
                    href={profile.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-400 hover:text-sky-300"
                  >
                    {profile.website}
                  </a>
                ) : (
                  "Not specified"
                )}
              </p>
            )}
          </div>

          {/* Favorite Character */}
          <div>
            <label className="text-stone-400 text-sm">
              Favorite Character
            </label>
            {editing ? (
              <input
                type="text"
                value={profile.favoriteCharacter}
                onChange={(e) =>
                  setProfile({ ...profile, favoriteCharacter: e.target.value })
                }
                placeholder="Who's your favorite?"
                className="w-full mt-2 px-0 py-2 bg-transparent border-b border-stone-700 text-stone-200 focus:outline-none focus:border-sky-500"
              />
            ) : (
              <p className="text-stone-300 mt-2">
                {profile.favoriteCharacter || "Not specified"}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4 pt-6 border-t border-stone-800">
            {editing ? (
              <>
                <button
                  onClick={handleSave}
                  className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-medium transition-colors"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => {
                    setProfile({
                      name: user?.name || "",
                      bio: user?.bio || "",
                      location: user?.location || "",
                      website: user?.website || "",
                      favoriteCharacter: user?.favoriteCharacter || "",
                      avatar: user?.avatar || null,
                    });
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
              <div className="text-3xl font-display text-stone-100">0</div>
              <div className="text-stone-500 text-sm mt-1">Chapters Read</div>
            </div>
            <div>
              <div className="text-3xl font-display text-stone-100">0</div>
              <div className="text-stone-500 text-sm mt-1">Comments</div>
            </div>
            <div>
              <div className="text-3xl font-display text-stone-100">0</div>
              <div className="text-stone-500 text-sm mt-1">Forum Posts</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
