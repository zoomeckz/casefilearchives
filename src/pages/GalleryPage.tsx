import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AuthUser } from "@/hooks/useAuth";
import { ProfileFrame } from "@/components/ProfileFrame";

interface FanArt {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  userFrame: string | null;
  createdAt: string;
  likes: number;
  userLiked: boolean;
}

interface GalleryPageProps {
  user: AuthUser | null;
  setShowAuthModal: (show: boolean) => void;
}

export const GalleryPage: React.FC<GalleryPageProps> = ({ user, setShowAuthModal }) => {
  const navigate = useNavigate();
  const [artworks, setArtworks] = useState<FanArt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedArt, setSelectedArt] = useState<FanArt | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const { data: artData } = await supabase.from("fan_art").select("*").order("created_at", { ascending: false });
      if (!artData) { setLoading(false); return; }

      const userIds = [...new Set(artData.map(a => a.user_id))];
      const profilePromises = userIds.map(uid =>
        supabase.from("profiles").select("user_id, name, avatar_url, selected_frame").eq("user_id", uid).maybeSingle()
      );
      const profiles = await Promise.all(profilePromises);
      const profileMap: Record<string, any> = {};
      profiles.forEach(r => { if (r.data) profileMap[r.data.user_id] = r.data; });

      const { data: votes } = await supabase.from("fan_art_votes").select("fan_art_id, user_id");
      const likeCounts: Record<string, number> = {};
      const userLikes = new Set<string>();
      for (const v of votes || []) {
        likeCounts[v.fan_art_id] = (likeCounts[v.fan_art_id] || 0) + 1;
        if (user && v.user_id === user.id) userLikes.add(v.fan_art_id);
      }

      setArtworks(artData.map(a => ({
        id: a.id,
        title: a.title,
        description: a.description || "",
        imageUrl: a.image_url,
        userId: a.user_id,
        userName: profileMap[a.user_id]?.name || "Anonymous",
        userAvatar: profileMap[a.user_id]?.avatar_url || null,
        userFrame: profileMap[a.user_id]?.selected_frame || null,
        createdAt: a.created_at,
        likes: likeCounts[a.id] || 0,
        userLiked: userLikes.has(a.id),
      })));
      setLoading(false);
    };
    fetch();
  }, [user?.id]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedFile || !newTitle.trim()) return;
    setUploading(true);

    const ext = selectedFile.name.split(".").pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("fan-art").upload(path, selectedFile);

    if (uploadErr) { setUploading(false); return; }

    const { data: { publicUrl } } = supabase.storage.from("fan-art").getPublicUrl(path);

    const { data } = await supabase.from("fan_art").insert({
      user_id: user.id, title: newTitle, description: newDesc, image_url: publicUrl,
    }).select().single();

    if (data) {
      setArtworks(prev => [{
        id: data.id, title: data.title, description: data.description || "",
        imageUrl: data.image_url, userId: user.id, userName: user.name,
        userAvatar: user.avatarUrl || null, userFrame: null,
        createdAt: data.created_at, likes: 0, userLiked: false,
      }, ...prev]);
    }

    setNewTitle("");
    setNewDesc("");
    setSelectedFile(null);
    setShowUpload(false);
    setUploading(false);
  };

  const toggleLike = async (artId: string) => {
    if (!user) { setShowAuthModal(true); return; }
    const art = artworks.find(a => a.id === artId);
    if (!art) return;

    if (art.userLiked) {
      await supabase.from("fan_art_votes").delete().eq("fan_art_id", artId).eq("user_id", user.id);
      setArtworks(prev => prev.map(a => a.id === artId ? { ...a, likes: a.likes - 1, userLiked: false } : a));
    } else {
      await supabase.from("fan_art_votes").insert({ fan_art_id: artId, user_id: user.id });
      setArtworks(prev => prev.map(a => a.id === artId ? { ...a, likes: a.likes + 1, userLiked: true } : a));
    }
  };

  return (
    <div className="min-h-screen py-8 sm:py-12 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl text-accent mb-2">🎨 Fan Art Gallery</h1>
            <p className="text-muted-foreground">Share your art and vote for your favorites</p>
          </div>
          <button
            onClick={() => user ? setShowUpload(true) : setShowAuthModal(true)}
            className="text-primary hover:text-primary/80 transition-colors self-start"
          >
            + Upload Art
          </button>
        </div>

        {showUpload && (
          <form onSubmit={handleUpload} className="mb-8 p-6 bg-card/30 rounded-xl border border-border space-y-4">
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Title..."
              className="w-full px-4 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
            />
            <textarea
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Description (optional)..."
              className="w-full px-4 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:border-primary resize-none"
              rows={2}
            />
            <div>
              <input ref={fileRef} type="file" accept="image/*" onChange={e => setSelectedFile(e.target.files?.[0] || null)} className="hidden" />
              <button type="button" onClick={() => fileRef.current?.click()} className="px-4 py-2 bg-secondary border border-border rounded-lg text-foreground hover:border-primary transition-colors">
                {selectedFile ? selectedFile.name : "Choose Image"}
              </button>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={uploading || !selectedFile || !newTitle.trim()}
                className="px-6 py-2 bg-primary hover:bg-primary/80 disabled:bg-secondary text-primary-foreground rounded-lg font-medium transition-colors">
                {uploading ? "Uploading..." : "Upload"}
              </button>
              <button type="button" onClick={() => setShowUpload(false)} className="text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-muted-foreground text-center py-12">Loading gallery...</p>
        ) : artworks.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No fan art yet. Be the first to share!</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {artworks.map(art => (
              <div key={art.id} className="bg-card/30 rounded-xl border border-border overflow-hidden group">
                <div className="aspect-square overflow-hidden cursor-pointer" onClick={() => setSelectedArt(art)}>
                  <img src={art.imageUrl} alt={art.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                </div>
                <div className="p-4">
                  <h3 className="font-display text-foreground mb-1">{art.title}</h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate(`/user/${art.userId}`)}>
                      <ProfileFrame avatarUrl={art.userAvatar} name={art.userName} frame={art.userFrame} size={20} />
                      <span className="text-primary text-xs hover:underline">{art.userName}</span>
                    </div>
                    <button
                      onClick={() => toggleLike(art.id)}
                      className={`flex items-center gap-1 text-sm transition-colors ${art.userLiked ? "text-destructive" : "text-muted-foreground hover:text-destructive"}`}
                    >
                      {art.userLiked ? "❤️" : "🤍"} {art.likes}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Lightbox */}
        {selectedArt && (
          <div className="fixed inset-0 z-50 bg-background/90 flex items-center justify-center p-4" onClick={() => setSelectedArt(null)}>
            <div className="max-w-4xl max-h-[90vh] relative" onClick={e => e.stopPropagation()}>
              <button onClick={() => setSelectedArt(null)} className="absolute -top-10 right-0 text-muted-foreground hover:text-foreground text-2xl">✕</button>
              <img src={selectedArt.imageUrl} alt={selectedArt.title} className="max-w-full max-h-[80vh] object-contain rounded-lg" />
              <div className="mt-4 flex items-center justify-between">
                <div>
                  <h3 className="font-display text-xl text-foreground">{selectedArt.title}</h3>
                  {selectedArt.description && <p className="text-muted-foreground text-sm mt-1">{selectedArt.description}</p>}
                </div>
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setSelectedArt(null); navigate(`/user/${selectedArt.userId}`); }}>
                  <ProfileFrame avatarUrl={selectedArt.userAvatar} name={selectedArt.userName} frame={selectedArt.userFrame} size={32} />
                  <span className="text-primary hover:underline">{selectedArt.userName}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GalleryPage;
