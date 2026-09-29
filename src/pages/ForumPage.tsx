import { storyPath } from "@/lib/slug";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AuthUser } from "@/hooks/useAuth";
import { Chapter } from "@/hooks/useChapters";
import { dbFetch } from "@/lib/dbFetch";
import { FormatToolbar } from "@/components/FormatToolbar";
import { normalizePlainTextFormatting, renderFormattedContent } from "@/lib/contentFormatting";

function renderFormatted(text: string): string {
  return renderFormattedContent(text);
}
export { renderFormatted };

const CATEGORIES = [
  { id: "case-discussion", label: "Case discussion" },
  { id: "theories", label: "Theories" },
  { id: "general", label: "General" },
  { id: "feedback", label: "Feedback" },
];

interface Thread {
  id: string;
  title: string;
  content: string;
  category: string;
  storyId: string | null;
  userId: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  replyCount: number;
}
interface Reply { id: string; content: string; userId: string; createdAt: string; updatedAt: string | null; }

const slugify = (t: string) => t.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);
const threadUrl = (t: { id: string; title: string }) => `/forum/${slugify(t.title)}--${t.id.slice(0, 8)}`;
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

interface ForumPageProps {
  user: AuthUser | null;
  authToken?: string;
  stories: Chapter[];
  setShowAuthModal: (v: boolean) => void;
}

export const ForumPage: React.FC<ForumPageProps> = ({ user, authToken, stories, setShowAuthModal }) => {
  const navigate = useNavigate();
  const { postId } = useParams();
  const [params, setParams] = useSearchParams();
  const caseFilter = params.get("case");
  const catFilter = params.get("cat");

  const [threads, setThreads] = useState<Thread[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("case-discussion");
  const [storyId, setStoryId] = useState<string>("");
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const storyMap = useMemo(() => Object.fromEntries(stories.map((s) => [s.id, s])), [stories]);

  const loadNames = useCallback(async (ids: string[]) => {
    const missing = Array.from(new Set(ids)).filter((id) => id && !names[id]);
    if (!missing.length) return;
    const { data } = await dbFetch<any[]>("public_profiles", { select: "user_id,name", filters: `user_id=in.(${missing.join(",")})` });
    if (data) setNames((p) => ({ ...p, ...Object.fromEntries(data.map((r) => [r.user_id, r.name])) }));
  }, [names]);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    const { data } = await dbFetch<any[]>("forum_posts", {
      select: "id,title,content,category,story_id,user_id,is_pinned,created_at,updated_at,forum_replies(count)",
      filters: "is_archived=eq.false",
      order: "is_pinned.desc.nullslast,created_at.desc",
      token: authToken,
    });
    const list: Thread[] = (data || []).map((r) => ({
      id: r.id, title: r.title, content: r.content, category: r.category, storyId: r.story_id,
      userId: r.user_id, isPinned: !!r.is_pinned, createdAt: r.created_at, updatedAt: r.updated_at,
      replyCount: r.forum_replies?.[0]?.count ?? 0,
    }));
    setThreads(list);
    setLoading(false);
    loadNames(list.map((t) => t.userId));
  }, [authToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadThreads(); }, [loadThreads]);

  const active = useMemo(() => {
    if (!postId) return null;
    const short = postId.split("--").pop() || "";
    return threads.find((t) => t.id.startsWith(short)) || null;
  }, [postId, threads]);

  const loadReplies = useCallback(async (id: string) => {
    const { data } = await dbFetch<any[]>("forum_replies", {
      select: "id,content,user_id,created_at,updated_at", filters: `post_id=eq.${id}`, order: "created_at.asc", token: authToken,
    });
    const list = (data || []).map((r) => ({ id: r.id, content: r.content, userId: r.user_id, createdAt: r.created_at, updatedAt: r.updated_at }));
    setReplies(list);
    loadNames(list.map((r) => r.userId));
  }, [authToken, loadNames]);

  useEffect(() => { if (active) loadReplies(active.id); else setReplies([]); }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = threads.filter((t) => (!caseFilter || t.storyId === caseFilter) && (!catFilter || t.category === catFilter));
  const caseCounts = useMemo(() => {
    const m: Record<string, number> = {};
    threads.forEach((t) => { if (t.storyId) m[t.storyId] = (m[t.storyId] || 0) + 1; });
    return m;
  }, [threads]);

  const setFilter = (key: "case" | "cat", value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (postId) navigate(`/forum?${next.toString()}`); else setParams(next);
  };

  const requireAuth = () => { if (!user || !authToken) { setShowAuthModal(true); return false; } return true; };

  const openComposer = () => {
    if (!requireAuth()) return;
    setStoryId(caseFilter || "");
    setCategory(caseFilter ? "case-discussion" : catFilter || "case-discussion");
    setComposing(true);
    if (postId) navigate("/forum");
  };

  const submitThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth() || !title.trim() || !body.trim()) return;
    setBusy(true);
    const { data, error } = await dbFetch<any[]>("forum_posts", {
      method: "POST", token: authToken,
      body: { title: title.trim(), content: normalizePlainTextFormatting(body), category, story_id: storyId || null, user_id: user!.id },
    });
    setBusy(false);
    if (error || !data?.[0]) return alert("Could not open the thread. Please try again.");
    setTitle(""); setBody(""); setComposing(false);
    await loadThreads();
    navigate(threadUrl(data[0]));
  };

  const submitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth() || !active || !replyText.trim()) return;
    setBusy(true);
    const { error } = await dbFetch("forum_replies", {
      method: "POST", token: authToken,
      body: { post_id: active.id, user_id: user!.id, content: normalizePlainTextFormatting(replyText) },
    });
    setBusy(false);
    if (error) return alert("Could not post your reply.");
    setReplyText("");
    loadReplies(active.id);
    setThreads((p) => p.map((t) => (t.id === active.id ? { ...t, replyCount: t.replyCount + 1 } : t)));
  };

  const canModerate = (ownerId: string) => !!user && (user.id === ownerId || user.isAdmin);

  const deleteThread = async (t: Thread) => {
    if (!confirm("Delete this thread and all replies?")) return;
    await dbFetch("forum_replies", { method: "DELETE", filters: `post_id=eq.${t.id}`, token: authToken });
    await dbFetch("forum_posts", { method: "DELETE", filters: `id=eq.${t.id}`, token: authToken });
    navigate("/forum");
    loadThreads();
  };
  const deleteReply = async (r: Reply) => {
    if (!confirm("Delete this reply?")) return;
    await dbFetch("forum_replies", { method: "DELETE", filters: `id=eq.${r.id}`, token: authToken });
    setReplies((p) => p.filter((x) => x.id !== r.id));
  };
  const togglePin = async (t: Thread) => {
    await dbFetch("forum_posts", { method: "PATCH", filters: `id=eq.${t.id}`, body: { is_pinned: !t.isPinned }, token: authToken });
    loadThreads();
  };

  const catLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label || id;
  const name = (id: string) => names[id] || "Reader";

  const sideBtn = (on: boolean) =>
    `w-full text-left px-3 py-2 border-l-2 text-sm transition-colors ${on ? "border-primary text-foreground bg-secondary" : "border-transparent text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="min-h-screen py-10 sm:py-16 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="border-l-4 border-primary pl-6 mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="case-label text-[9px] mb-2">Open investigations / reader testimony</p>
            <h1 className="font-display text-4xl sm:text-5xl text-foreground uppercase">Case Discussions</h1>
          </div>
          <button onClick={openComposer} className="px-4 py-2 bg-primary text-primary-foreground case-label !text-primary-foreground text-[10px] hover:bg-primary/85">
            + Open a thread
          </button>
        </div>

        <div className="grid lg:grid-cols-[260px_1fr] gap-8">
          <aside className="space-y-6 lg:sticky lg:top-24 self-start" data-lenis-prevent>
            <div className="case-file p-4">
              <p className="case-label text-[9px] mb-3">Filed under</p>
              <button className={sideBtn(!catFilter)} onClick={() => setFilter("cat", null)}>All categories</button>
              {CATEGORIES.map((c) => (
                <button key={c.id} className={sideBtn(catFilter === c.id)} onClick={() => setFilter("cat", c.id)}>{c.label}</button>
              ))}
            </div>
            <div className="case-file p-4">
              <p className="case-label text-[9px] mb-3">By case</p>
              <div className="max-h-80 overflow-y-auto">
                <button className={sideBtn(!caseFilter)} onClick={() => setFilter("case", null)}>All cases</button>
                {stories.map((s) => (
                  <button key={s.id} className={`${sideBtn(caseFilter === s.id)} flex justify-between gap-2`} onClick={() => setFilter("case", s.id)}>
                    <span className="truncate">{s.title}</span>
                    <span className="case-label text-[9px] shrink-0">{caseCounts[s.id] || 0}</span>
                  </button>
                ))}
              </div>
            </div>
            {!user && (
              <div className="case-file p-4 text-sm text-muted-foreground">
                Register to open threads and leave testimony.
                <button onClick={() => setShowAuthModal(true)} className="block mt-3 case-label text-[9px] text-primary">Register / Sign in →</button>
              </div>
            )}
          </aside>

          <section className="min-w-0">
            {composing && !active && (
              <form onSubmit={submitThread} className="case-file p-5 mb-8 space-y-3">
                <p className="case-label text-[9px]">New thread</p>
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="Thread title"
                  className="w-full px-3 py-2 bg-background border border-border text-foreground focus:outline-none focus:border-primary" />
                <div className="grid sm:grid-cols-2 gap-3">
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-3 py-2 bg-background border border-border text-foreground">
                    {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                  <select value={storyId} onChange={(e) => setStoryId(e.target.value)} className="px-3 py-2 bg-background border border-border text-foreground">
                    <option value="">No specific case</option>
                    {stories.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </div>
                <FormatToolbar textareaRef={bodyRef} value={body} onChange={setBody} />
                <textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="What's on your mind?"
                  className="w-full px-3 py-2 bg-background border border-border text-foreground focus:outline-none focus:border-primary resize-y" />
                <div className="flex gap-3">
                  <button disabled={busy || !title.trim() || !body.trim()} className="px-4 py-2 bg-primary text-primary-foreground text-sm disabled:opacity-50">
                    {busy ? "Filing..." : "Post thread"}
                  </button>
                  <button type="button" onClick={() => setComposing(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                </div>
              </form>
            )}

            {active ? (
              <div className="space-y-6">
                <button onClick={() => navigate(-1)} className="case-label text-[9px] hover:text-foreground">← Back to threads</button>
                <article className="case-file p-6">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="case-label text-[9px] border border-border px-2 py-0.5">{catLabel(active.category)}</span>
                    {active.storyId && storyMap[active.storyId] && (
                      <button onClick={() => navigate(storyPath(storyMap[active.storyId!]))}
                        className="case-label text-[9px] border border-primary text-primary px-2 py-0.5">Case: {storyMap[active.storyId].title}</button>
                    )}
                    {active.isPinned && <span className="case-label text-[9px] bg-primary !text-primary-foreground px-2 py-0.5">Pinned</span>}
                  </div>
                  <h2 className="font-display text-3xl text-foreground mb-2">{active.title}</h2>
                  <p className="case-label text-[9px] mb-5">
                    Filed by <button className="text-primary" onClick={() => navigate(`/user/${active.userId}`)}>{name(active.userId)}</button> · {fmt(active.createdAt)}
                  </p>
                  <div className="text-foreground/85 leading-relaxed break-words" dangerouslySetInnerHTML={{ __html: renderFormatted(active.content) }} />
                  {canModerate(active.userId) && (
                    <div className="flex gap-4 mt-5 pt-4 border-t border-border">
                      {user?.isAdmin && <button onClick={() => togglePin(active)} className="case-label text-[9px] hover:text-foreground">{active.isPinned ? "Unpin" : "Pin"}</button>}
                      <button onClick={() => deleteThread(active)} className="case-label text-[9px] hover:text-destructive">Delete</button>
                    </div>
                  )}
                </article>

                <p className="case-label text-[9px]">Testimony ({replies.length})</p>
                <div className="space-y-4">
                  {replies.map((r) => (
                    <div key={r.id} className="border-l-2 border-border pl-4 py-2">
                      <p className="case-label text-[9px] mb-2">
                        <button className="text-primary" onClick={() => navigate(`/user/${r.userId}`)}>{name(r.userId)}</button> · {fmt(r.createdAt)}
                      </p>
                      <div className="text-foreground/80 break-words" dangerouslySetInnerHTML={{ __html: renderFormatted(r.content) }} />
                      {canModerate(r.userId) && (
                        <button onClick={() => deleteReply(r)} className="case-label text-[9px] mt-2 hover:text-destructive">Delete</button>
                      )}
                    </div>
                  ))}
                  {replies.length === 0 && <p className="text-muted-foreground text-sm">No replies yet.</p>}
                </div>

                <form onSubmit={submitReply} className="case-file p-5 space-y-3">
                  <p className="case-label text-[9px]">Add your reply</p>
                  <FormatToolbar textareaRef={replyRef} value={replyText} onChange={setReplyText} />
                  <textarea ref={replyRef} value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={4}
                    onFocus={() => { if (!user) setShowAuthModal(true); }}
                    placeholder={user ? "Write a reply..." : "Sign in to reply"}
                    className="w-full px-3 py-2 bg-background border border-border text-foreground focus:outline-none focus:border-primary resize-y" />
                  <button disabled={busy || !replyText.trim()} className="px-4 py-2 bg-primary text-primary-foreground text-sm disabled:opacity-50">
                    {busy ? "Posting..." : "Post reply"}
                  </button>
                </form>
              </div>
            ) : postId && !loading ? (
              <p className="text-muted-foreground">This thread could not be found.</p>
            ) : (
              <div className="space-y-4">
                {loading && <p className="text-muted-foreground text-sm">Loading threads...</p>}
                {!loading && filtered.length === 0 && (
                  <div className="case-file p-8 text-center text-muted-foreground">No threads here yet. Open the first one.</div>
                )}
                {filtered.map((t) => (
                  <button key={t.id} onClick={() => navigate(threadUrl(t))} className="case-file w-full text-left p-5 hover:border-primary transition-colors block">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      {t.isPinned && <span className="case-label text-[9px] bg-primary !text-primary-foreground px-2 py-0.5">Pinned</span>}
                      <span className="case-label text-[9px] border border-border px-2 py-0.5">{catLabel(t.category)}</span>
                      {t.storyId && storyMap[t.storyId] && (
                        <span className="case-label text-[9px] border border-primary text-primary px-2 py-0.5 truncate max-w-[220px]">{storyMap[t.storyId].title}</span>
                      )}
                    </div>
                    <h3 className="font-display text-xl text-foreground">{t.title}</h3>
                    <p className="case-label text-[9px] mt-2">
                      {name(t.userId)} · {fmt(t.createdAt)} · {t.replyCount} {t.replyCount === 1 ? "reply" : "replies"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default ForumPage;
