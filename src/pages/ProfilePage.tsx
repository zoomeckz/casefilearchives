import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Icons } from "@/lib/icons";
import { AuthUser } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEmailSubscription } from "@/hooks/useEmailSubscription";
import { AvatarCropModal } from "@/components/AvatarCropModal";
import { ReferralSection } from "@/components/ReferralSection";
import { Dossier } from "@/components/profile/Dossier";

interface ProfilePageProps {
  user: AuthUser;
  onLogout: () => void;
  refreshUser: () => void;
  bookmarkCount: number;
}

const input = "w-full px-3 py-2 bg-background border border-border text-foreground focus:outline-none focus:border-primary";

export const ProfilePage: React.FC<ProfilePageProps> = ({ user, onLogout, refreshUser }) => {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState({ name: user?.name || "", bio: "", instagram: "", tiktok: "", website: "" });
  const { isSubscribed, toggleSubscription, loading: subLoading } = useEmailSubscription(user);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("name, bio, instagram, tiktok, website").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfile({
            name: data.name || user.name,
            bio: data.bio || "",
            instagram: data.instagram || "",
            tiktok: data.tiktok || "",
            website: data.website || "",
          });
        }
      });
  }, [user?.id]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setCropFile(file);
    e.target.value = "";
  };

  const handleCroppedUpload = async (blob: Blob) => {
    if (!user) return;
    setCropFile(null);
    const path = `${user.id}/avatar.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, blob, { upsert: true, contentType: "image/jpeg" });

    if (!uploadError) {
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      await supabase.from("profiles").update({ avatar_url: `${publicUrl}?t=${Date.now()}` }).eq("user_id", user.id);
      refreshUser();
      setRefreshKey((k) => k + 1);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    await supabase
      .from("profiles")
      .update({
        name: profile.name,
        bio: profile.bio,
        instagram: profile.instagram,
        tiktok: profile.tiktok,
        website: profile.website,
      })
      .eq("user_id", user.id);
    refreshUser();
    setEditing(false);
    setSaving(false);
    setRefreshKey((k) => k + 1);
  };

  if (!user) return null;

  const avatarAction = (
    <>
      <button
        onClick={() => fileInputRef.current?.click()}
        className="absolute bottom-0 left-0 w-9 h-9 bg-primary rounded-full flex items-center justify-center text-primary-foreground hover:bg-primary/80 transition-colors border-2 border-background"
        aria-label="Change photo"
      >
        <Icons.Camera className="w-4 h-4" />
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
    </>
  );

  const headerActions = (
    <>
      <button onClick={() => setEditing((v) => !v)} className="flex items-center gap-2 px-4 py-2 border border-border hover:border-primary text-sm transition-colors">
        <Icons.Edit /> {editing ? "Close editor" : "Edit file"}
      </button>
      <button onClick={() => navigate(`/user/${user.id}`)} className="px-4 py-2 border border-border hover:border-primary text-sm transition-colors">
        View public file
      </button>
      <button onClick={onLogout} className="flex items-center gap-2 px-4 py-2 text-destructive hover:text-destructive/80 text-sm transition-colors">
        <Icons.Logout /> Sign out
      </button>
    </>
  );

  return (
    <div className="min-h-screen py-8 sm:py-12 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        {editing && (
          <section className="case-file p-6 mb-10 cf-rise">
            <p className="case-label text-[9px] mb-4">Amend personnel file</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="case-label text-[9px] block mb-1">Display name</label>
                <input type="text" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className={input} />
              </div>
              <div className="sm:col-span-2">
                <label className="case-label text-[9px] block mb-1">Statement</label>
                <textarea value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                  className={`${input} resize-y`} rows={4} maxLength={600} placeholder="A few words for your file…" />
              </div>
              <div>
                <label className="case-label text-[9px] block mb-1">Instagram</label>
                <input type="text" value={profile.instagram} onChange={(e) => setProfile({ ...profile, instagram: e.target.value })} className={input} placeholder="@username" />
              </div>
              <div>
                <label className="case-label text-[9px] block mb-1">TikTok</label>
                <input type="text" value={profile.tiktok} onChange={(e) => setProfile({ ...profile, tiktok: e.target.value })} className={input} placeholder="@username" />
              </div>
              <div className="sm:col-span-2">
                <label className="case-label text-[9px] block mb-1">Website</label>
                <input type="text" value={profile.website} onChange={(e) => setProfile({ ...profile, website: e.target.value })} className={input} placeholder="https://…" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-primary hover:bg-primary/85 disabled:opacity-50 text-primary-foreground text-sm">
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button onClick={() => setEditing(false)} className="px-6 py-2 text-muted-foreground hover:text-foreground text-sm">Cancel</button>
            </div>
          </section>
        )}

        <Dossier userId={user.id} editable avatarAction={avatarAction} headerActions={headerActions} refreshKey={refreshKey} />

        {/* Administrative */}
        <section className="mt-14 grid gap-6 lg:grid-cols-2">
          <ReferralSection user={user} />
          <div className="case-file p-6">
            <p className="case-label text-[9px] mb-3">Notifications</p>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h4 className="text-foreground font-medium">New case files</h4>
                <p className="text-muted-foreground text-sm">Email me when a new story is published.</p>
              </div>
              <button
                onClick={toggleSubscription}
                disabled={subLoading}
                className={`px-4 py-2 text-sm transition-colors shrink-0 ${
                  isSubscribed ? "border border-border text-foreground/80 hover:border-foreground/50" : "bg-primary text-primary-foreground hover:bg-primary/85"
                } disabled:opacity-50`}
              >
                {subLoading ? "…" : isSubscribed ? "Subscribed ✓" : "Subscribe"}
              </button>
            </div>
            <p className="case-label text-[8px] mt-4">{user.email}</p>
          </div>
        </section>
      </div>

      {cropFile && (
        <AvatarCropModal imageFile={cropFile} onCrop={handleCroppedUpload} onClose={() => setCropFile(null)} />
      )}
    </div>
  );
};

export default ProfilePage;
