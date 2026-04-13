import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AuthUser } from "@/hooks/useAuth";
import { ProfileFrame } from "@/components/ProfileFrame";
import { FormatToolbar } from "@/components/FormatToolbar";
import { renderFormatted } from "@/pages/ForumPage";
import { normalizePlainTextFormatting } from "@/lib/contentFormatting";

interface Theory {
  id: string;
  title: string;
  content: string;
  status: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  userFrame: string | null;
  createdAt: string;
  votes: number;
  userVote: number;
}

interface TheoriesPageProps {
  user: AuthUser | null;
  setShowAuthModal: (show: boolean) => void;
}

export const TheoriesPage: React.FC<TheoriesPageProps> = ({ user, setShowAuthModal }) => {
  const navigate = useNavigate();
  const [theories, setTheories] = useState<Theory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "confirmed" | "debunked">("all");
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const fetch = async () => {
      const { data: theoriesData } = await supabase.from("theories").select("*").order("created_at", { ascending: false });
      if (!theoriesData) { setLoading(false); return; }

      const userIds = [...new Set(theoriesData.map(t => t.user_id))];
      const profilePromises = userIds.map(uid =>
        supabase.from("profiles").select("user_id, name, avatar_url, selected_frame").eq("user_id", uid).maybeSingle()
      );
      const profiles = await Promise.all(profilePromises);
      const profileMap: Record<string, any> = {};
      profiles.forEach(r => { if (r.data) profileMap[r.data.user_id] = r.data; });

      const { data: votes } = await supabase.from("theory_votes").select("theory_id, user_id, vote");
      const voteTotals: Record<string, number> = {};
      const userVotes: Record<string, number> = {};
      for (const v of votes || []) {
        voteTotals[v.theory_id] = (voteTotals[v.theory_id] || 0) + v.vote;
        if (user && v.user_id === user.id) userVotes[v.theory_id] = v.vote;
      }

      setTheories(theoriesData.map(t => ({
        id: t.id,
        title: t.title,
        content: t.content,
        status: t.status,
        userId: t.user_id,
        userName: profileMap[t.user_id]?.name || "Anonymous",
        userAvatar: profileMap[t.user_id]?.avatar_url || null,
        userFrame: profileMap[t.user_id]?.selected_frame || null,
        createdAt: t.created_at,
        votes: voteTotals[t.id] || 0,
        userVote: userVotes[t.id] || 0,
      })));
      setLoading(false);
    };
    fetch();
  }, [user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { setShowAuthModal(true); return; }
    if (!newTitle.trim() || !newContent.trim()) return;

    const normalizedContent = normalizePlainTextFormatting(newContent);

    const { data } = await supabase.from("theories").insert({
      user_id: user.id, title: newTitle, content: normalizedContent,
    }).select().single();

    if (data) {
      setTheories(prev => [{
        id: data.id, title: data.title, content: normalizedContent, status: "pending",
        userId: user.id, userName: user.name, userAvatar: user.avatarUrl || null,
        userFrame: null, createdAt: data.created_at, votes: 0, userVote: 0,
      }, ...prev]);
      setNewTitle("");
      setNewContent("");
      setShowNew(false);
    }
  };

  const handleVote = async (theoryId: string, vote: number) => {
    if (!user) { setShowAuthModal(true); return; }
    const theory = theories.find(t => t.id === theoryId);
    if (!theory) return;

    if (theory.userVote === vote) {
      // Remove vote
      await supabase.from("theory_votes").delete().eq("theory_id", theoryId).eq("user_id", user.id);
      setTheories(prev => prev.map(t => t.id === theoryId ? { ...t, votes: t.votes - vote, userVote: 0 } : t));
    } else {
      // Upsert vote
      if (theory.userVote !== 0) {
        await supabase.from("theory_votes").delete().eq("theory_id", theoryId).eq("user_id", user.id);
      }
      await supabase.from("theory_votes").insert({ theory_id: theoryId, user_id: user.id, vote });
      setTheories(prev => prev.map(t => t.id === theoryId ? { ...t, votes: t.votes - t.userVote + vote, userVote: vote } : t));
    }
  };

  const filtered = filter === "all" ? theories : theories.filter(t => t.status === filter);
  const statusIcon = (s: string) => s === "confirmed" ? "✅" : s === "debunked" ? "❌" : "🤔";
  const statusLabel = (s: string) => s === "confirmed" ? "Confirmed!" : s === "debunked" ? "Debunked" : "Pending";

  return (
    <div className="min-h-screen py-8 sm:py-12 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl text-accent mb-2">🔮 Theories</h1>
            <p className="text-muted-foreground">Share your predictions and vote on others</p>
          </div>
          <button
            onClick={() => user ? setShowNew(true) : setShowAuthModal(true)}
            className="text-primary hover:text-primary/80 transition-colors self-start"
          >
            + New Theory
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          {(["all", "pending", "confirmed", "debunked"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "All" : `${statusIcon(f)} ${statusLabel(f)}`}
            </button>
          ))}
        </div>

        {showNew && (
          <form onSubmit={handleSubmit} className="mb-8 p-6 bg-card/30 rounded-xl border border-border space-y-4">
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Your theory title..."
              className="w-full px-4 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
            />
            <FormatToolbar textareaRef={contentRef} value={newContent} onChange={setNewContent} />
            <textarea
              ref={contentRef}
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder="Explain your theory..."
              className="w-full px-4 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:border-primary resize-none"
              rows={4}
            />
            <div className="flex gap-3">
              <button type="submit" className="px-6 py-2 bg-primary hover:bg-primary/80 text-primary-foreground rounded-lg font-medium transition-colors">
                Submit Theory
              </button>
              <button type="button" onClick={() => setShowNew(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-muted-foreground text-center py-12">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No theories yet. Be the first to share yours!</p>
        ) : (
          <div className="space-y-4">
            {filtered.map(theory => (
              <div key={theory.id} className="p-5 bg-card/30 rounded-xl border border-border">
                <div className="flex gap-3">
                  {/* Vote buttons */}
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <button
                      onClick={() => handleVote(theory.id, 1)}
                      className={`text-lg transition-colors ${theory.userVote === 1 ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      ▲
                    </button>
                    <span className={`text-sm font-medium ${theory.votes > 0 ? "text-primary" : theory.votes < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {theory.votes}
                    </span>
                    <button
                      onClick={() => handleVote(theory.id, -1)}
                      className={`text-lg transition-colors ${theory.userVote === -1 ? "text-destructive" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      ▼
                    </button>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground">
                        {statusIcon(theory.status)} {statusLabel(theory.status)}
                      </span>
                    </div>
                    <h3 className="text-lg font-display text-foreground mb-2">{theory.title}</h3>
                    <div className="text-foreground/70 text-sm break-words mb-3" dangerouslySetInnerHTML={{ __html: renderFormatted(theory.content) }} />
                    <div
                      className="flex items-center gap-2 cursor-pointer"
                      onClick={() => navigate(`/user/${theory.userId}`)}
                    >
                      <ProfileFrame avatarUrl={theory.userAvatar} name={theory.userName} frame={theory.userFrame} size={24} />
                      <span className="text-primary text-xs hover:underline">{theory.userName}</span>
                      <span className="text-muted-foreground text-xs">· {new Date(theory.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TheoriesPage;
