import React, { useState, useEffect, useRef } from "react";
import { ProfileFrame } from "@/components/ProfileFrame";
import { useNavigate, useParams } from "react-router-dom";
import { Icons } from "@/lib/icons";
import { MessageCircle } from "lucide-react";
import { AuthUser } from "@/hooks/useAuth";
import { dbFetch } from "@/lib/dbFetch";
import { supabase } from "@/integrations/supabase/client";
import { forumCategories } from "@/lib/data";
import { FormatToolbar } from "@/components/FormatToolbar";
import { normalizePlainTextFormatting, renderFormattedContent } from "@/lib/contentFormatting";

function renderFormatted(text: string): string {
  return renderFormattedContent(text);
}

export { renderFormatted };

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // remove emojis/special chars
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

function postUrl(post: { id: string; title: string }): string {
  return `/forum/${slugify(post.title)}--${post.id.slice(0, 8)}`;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  return new Date(iso).toLocaleDateString();
}

function parsePostId(param: string | undefined, posts: { id: string; title: string }[]): string | null {
  if (!param) return null;
  // Extract short ID after last "--"
  const parts = param.split('--');
  const shortId = parts[parts.length - 1];
  if (shortId) {
    const match = posts.find(p => p.id.startsWith(shortId));
    if (match) return match.id;
  }
  // Fallback: try as full UUID
  const direct = posts.find(p => p.id === param);
  return direct?.id || null;
}
const SITE_AUTHOR_ID = '64ff6be9-cdcb-4690-8857-0adbbe5e7574';

const AuthorBadge = () => (
  <span className="text-amber-400 text-[10px] tracking-widest uppercase" style={{ fontFamily: "'Cinzel Decorative', serif" }}>
    Author
  </span>
);

interface ForumPost {
  id: string;
  title: string;
  content: string;
  category: string;
  author: string;
  authorId: string;
  authorAvatar: string | null;
  authorFrame: string | null;
  replies: number;
  createdAt: string;
  isPinned: boolean;
  isEdited: boolean;
}

interface ForumReply {
  id: string;
  content: string;
  author: string;
  authorId: string;
  authorBio: string;
  authorAvatar: string | null;
  authorFrame: string | null;
  createdAt: string;
  isEdited: boolean;
}

interface ForumPageProps {
  user: AuthUser | null;
  setShowAuthModal: (show: boolean) => void;
}

export const ForumPage: React.FC<ForumPageProps> = ({
  user,
  setShowAuthModal,
}) => {
  const navigate = useNavigate();
  const { postId } = useParams<{ postId?: string }>();
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<ForumPost | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [showNewPost, setShowNewPost] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [newPost, setNewPost] = useState({ title: "", content: "", category: "General" });
  const [replyContent, setReplyContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingPost, setEditingPost] = useState<ForumPost | null>(null);
  const [editContent, setEditContent] = useState({ title: "", content: "", category: "" });

  const newPostRef = useRef<HTMLTextAreaElement>(null);
  const editPostRef = useRef<HTMLTextAreaElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const editReplyRef = useRef<HTMLTextAreaElement>(null);

  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editReplyContent, setEditReplyContent] = useState("");

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const { data: postsData } = await dbFetch<any[]>('forum_posts', {
          select: 'id,title,content,category,created_at,updated_at,user_id,is_pinned',
          order: 'is_pinned.desc,created_at.desc',
        });

        if (!postsData) { setLoading(false); return; }

        const userIds = [...new Set(postsData.map(p => p.user_id))];
        const profilePromises = userIds.map(uid =>
          dbFetch<any[]>('profiles', { select: 'user_id,name,avatar_url,selected_frame', filters: `user_id=eq.${uid}` })
        );
        const profileResults = await Promise.all(profilePromises);
        const profileMap: Record<string, { name: string; avatar: string | null; frame: string | null }> = {};
        profileResults.forEach(r => {
          if (r.data && r.data[0]) {
            profileMap[r.data[0].user_id] = { name: r.data[0].name, avatar: r.data[0].avatar_url, frame: r.data[0].selected_frame };
          }
        });

        const replyCountPromises = postsData.map(post =>
          dbFetch('forum_replies', { filters: `post_id=eq.${post.id}`, head: true })
        );
        const replyCounts = await Promise.all(replyCountPromises);

        const mappedPosts: ForumPost[] = postsData.map((post, i) => ({
          id: post.id,
          title: post.title,
          content: post.content,
          category: post.category,
          author: profileMap[post.user_id]?.name || 'Anonymous',
          authorId: post.user_id,
          authorAvatar: profileMap[post.user_id]?.avatar || null,
          authorFrame: profileMap[post.user_id]?.frame || null,
          replies: replyCounts[i].count || 0,
          createdAt: post.created_at,
          isPinned: post.is_pinned || false,
          isEdited: !!(post.updated_at && post.updated_at !== post.created_at),
        }));

        setPosts(mappedPosts);
      } catch (err) {
        console.error('Forum fetch error:', err);
      }
      setLoading(false);
    };
    fetchPosts();
  }, []);

  // Resolve post from URL param
  useEffect(() => {
    if (postId && posts.length > 0) {
      const resolvedId = parsePostId(postId, posts);
      const post = resolvedId ? posts.find(p => p.id === resolvedId) : null;
      if (post) {
        setSelectedPost(post);
        // Redirect old-format URLs (raw UUIDs) to new slug URLs
        const expectedSlug = `${slugify(post.title)}--${post.id.slice(0, 8)}`;
        if (postId !== expectedSlug) {
          navigate(postUrl(post), { replace: true });
        }
      }
    } else if (!postId) {
      setSelectedPost(null);
    }
  }, [postId, posts, navigate]);

  useEffect(() => {
    if (!selectedPost) { setReplies([]); return; }
    const fetchReplies = async () => {
      const { data: repliesData } = await dbFetch<any[]>('forum_replies', {
        select: 'id,content,created_at,updated_at,user_id',
        filters: `post_id=eq.${selectedPost.id}`,
        order: 'created_at.asc',
      });

      if (!repliesData) return;

      const userIds = [...new Set(repliesData.map(r => r.user_id))];
      const profilePromises = userIds.map(uid =>
          dbFetch<any[]>('profiles', { select: 'user_id,name,bio,avatar_url,selected_frame', filters: `user_id=eq.${uid}` })
        );
        const profileResults = await Promise.all(profilePromises);
        const profileMap: Record<string, { name: string; bio: string; avatar: string | null; frame: string | null }> = {};
        profileResults.forEach(r => {
          if (r.data && r.data[0]) {
            profileMap[r.data[0].user_id] = { name: r.data[0].name, bio: r.data[0].bio || '', avatar: r.data[0].avatar_url, frame: r.data[0].selected_frame };
          }
        });

      setReplies(repliesData.map(r => ({
        id: r.id,
        content: r.content,
        author: profileMap[r.user_id]?.name || 'Anonymous',
        authorId: r.user_id,
        authorBio: profileMap[r.user_id]?.bio || '',
        authorAvatar: profileMap[r.user_id]?.avatar || null,
        authorFrame: profileMap[r.user_id]?.frame || null,
        createdAt: r.created_at,
        isEdited: !!(r.updated_at && r.updated_at !== r.created_at),
      })));
    };
    fetchReplies();
  }, [selectedPost?.id]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPost.title || !newPost.content) return;
    if (!user) { setShowAuthModal(true); return; }

    const normalizedContent = normalizePlainTextFormatting(newPost.content);

    const { data } = await dbFetch<any[]>('forum_posts', {
      method: 'POST',
      body: { title: newPost.title, content: normalizedContent, category: newPost.category, user_id: user.id },
    });

    if (data && data[0]) {
      setPosts([{
        id: data[0].id, title: data[0].title, content: normalizedContent, category: data[0].category,
        author: user.name, authorId: data[0].user_id, authorAvatar: user.avatarUrl || null, authorFrame: null,
        replies: 0, createdAt: data[0].created_at, isPinned: false, isEdited: false,
      }, ...posts]);
      setNewPost({ title: "", content: "", category: "General" });
      setShowNewPost(false);
    }
  };

  const handleEditPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPost || !editContent.title || !editContent.content) return;

    const normalizedContent = normalizePlainTextFormatting(editContent.content);

    await dbFetch('forum_posts', {
      method: 'PATCH',
      filters: `id=eq.${editingPost.id}`,
      body: { title: editContent.title, content: normalizedContent, category: editContent.category },
    });

    const updated = { ...editingPost, ...editContent, content: normalizedContent, isEdited: true };
    setPosts(posts.map(p => p.id === editingPost.id ? updated : p));
    if (selectedPost?.id === editingPost.id) {
      setSelectedPost(updated);
    }
    setEditingPost(null);
  };

  const handleTogglePin = async (post: ForumPost) => {
    const newPinned = !post.isPinned;
    await dbFetch('forum_posts', {
      method: 'PATCH',
      filters: `id=eq.${post.id}`,
      body: { is_pinned: newPinned },
    });
    const updated = { ...post, isPinned: newPinned };
    setPosts(posts.map(p => p.id === post.id ? updated : p));
    if (selectedPost?.id === post.id) setSelectedPost(updated);
  };

  const handleDeletePost = async (post: ForumPost) => {
    if (!confirm('Delete this post and all its replies?')) return;
    await dbFetch('forum_replies', { method: 'DELETE', filters: `post_id=eq.${post.id}` });
    await dbFetch('forum_posts', { method: 'DELETE', filters: `id=eq.${post.id}` });
    setPosts(posts.filter(p => p.id !== post.id));
    if (selectedPost?.id === post.id) navigate('/forum');
  };

  const handleAddReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !replyContent.trim() || !selectedPost) return;

    const normalizedContent = normalizePlainTextFormatting(replyContent);

    const { data } = await dbFetch<any[]>('forum_replies', {
      method: 'POST',
      body: { post_id: selectedPost.id, user_id: user.id, content: normalizedContent },
    });

    if (data && data[0]) {
      setReplies([...replies, {
        id: data[0].id, content: normalizedContent, author: user.name,
        authorId: data[0].user_id, authorBio: '', authorAvatar: user.avatarUrl || null, authorFrame: null, createdAt: data[0].created_at, isEdited: false,
      }]);
      setSelectedPost({ ...selectedPost, replies: selectedPost.replies + 1 });
      setPosts(posts.map(p => p.id === selectedPost.id ? { ...p, replies: p.replies + 1 } : p));
      setReplyContent("");

      // Notify the post author (if not replying to own post)
      if (selectedPost.authorId !== user.id) {
        const slug = `${slugify(selectedPost.title)}--${selectedPost.id.slice(0, 8)}`;
        await supabase.from("notifications").insert({
          user_id: selectedPost.authorId,
          type: "reply",
          title: `${user.name} replied to "${selectedPost.title}"`,
          message: normalizedContent.slice(0, 100),
          link: `/forum/${slug}`,
        });
      }
    }
  };

  const canEdit = (post: ForumPost) => user?.isAdmin || user?.id === post.authorId;

  const handleEditReply = async () => {
    if (!editingReplyId || !editReplyContent.trim()) return;
    const now = new Date().toISOString();
    const normalizedContent = normalizePlainTextFormatting(editReplyContent);
    await dbFetch('forum_replies', {
      method: 'PATCH',
      filters: `id=eq.${editingReplyId}`,
      body: { content: normalizedContent, updated_at: now },
    });
    setReplies(replies.map(r => r.id === editingReplyId ? { ...r, content: normalizedContent, isEdited: true } : r));
    setEditingReplyId(null);
    setEditReplyContent("");
  };

  const filteredPosts = selectedCategory
    ? posts.filter(p => p.category === selectedCategory)
    : posts;

  if (loading) {
    return (
      <div className="min-h-screen py-12 px-6 flex items-center justify-center">
        <p className="text-muted-foreground">Loading forum...</p>
      </div>
    );
  }

  // Edit post modal
  if (editingPost) {
    return (
      <div className="min-h-screen py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <button onClick={() => setEditingPost(null)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8">
            <Icons.ChevronLeft /> Cancel editing
          </button>
          <h2 className="font-display text-2xl text-accent mb-6">Edit Post</h2>
          <form onSubmit={handleEditPost} className="space-y-6">
            <div>
              <label className="block text-muted-foreground text-sm mb-2">Category</label>
              <select value={editContent.category} onChange={(e) => setEditContent({ ...editContent, category: e.target.value })}
                className="w-full px-4 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:border-primary">
                {forumCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-muted-foreground text-sm mb-2">Title</label>
              <input type="text" value={editContent.title} onChange={(e) => setEditContent({ ...editContent, title: e.target.value })}
                className="w-full px-4 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-muted-foreground text-sm mb-2">Content</label>
              <FormatToolbar textareaRef={editPostRef} value={editContent.content} onChange={(v) => setEditContent({ ...editContent, content: v })} />
              <textarea ref={editPostRef} value={editContent.content} onChange={(e) => setEditContent({ ...editContent, content: e.target.value })}
                className="w-full px-4 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:border-primary resize-none font-mono text-sm" rows={12} />
            </div>
            <div className="border border-border rounded-lg p-4 bg-secondary/30">
              <p className="text-muted-foreground text-xs mb-2">Preview:</p>
              <div className="text-foreground/80 leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: renderFormatted(editContent.content) }} />
            </div>
            <div className="flex gap-4">
              <button type="submit" className="px-6 py-2 bg-primary hover:bg-primary/80 text-primary-foreground rounded-lg font-medium transition-colors">Save Changes</button>
              <button type="button" onClick={() => setEditingPost(null)} className="text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (selectedPost) {
    return (
      <div className="min-h-screen py-8 sm:py-12 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <button onClick={() => navigate('/forum')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 sm:mb-8">
            <Icons.ChevronLeft /> Back to forum
          </button>
          <div className="mb-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">{selectedPost.category}</span>
                {selectedPost.isPinned && <span className="text-xs px-2 py-0.5 bg-accent/10 text-accent rounded">📌 Pinned</span>}
              </div>
              {canEdit(selectedPost) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => { setEditingPost(selectedPost); setEditContent({ title: selectedPost.title, content: selectedPost.content, category: selectedPost.category }); }}
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors">✏️ Edit</button>
                  {user?.isAdmin && (
                    <button onClick={() => handleTogglePin(selectedPost)}
                      className="text-muted-foreground hover:text-foreground text-sm transition-colors">
                      {selectedPost.isPinned ? '📌 Unpin' : '📌 Pin'}
                    </button>
                  )}
                  <button onClick={() => handleDeletePost(selectedPost)}
                    className="text-muted-foreground hover:text-destructive text-sm transition-colors">🗑️ Delete</button>
                </div>
              )}
            </div>
            <h1 className="font-display text-2xl sm:text-3xl text-accent mb-4">{selectedPost.title}</h1>
            <div className="flex items-center gap-3 mb-6 cursor-pointer" onClick={() => navigate(`/user/${selectedPost.authorId}`)}>
              <ProfileFrame avatarUrl={selectedPost.authorAvatar} name={selectedPost.author} frame={selectedPost.authorFrame} size={48} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-primary font-medium hover:underline">{selectedPost.author}</span>
                  {selectedPost.authorId === SITE_AUTHOR_ID && <AuthorBadge />}
                </div>
                <p className="text-muted-foreground text-xs">
                  {new Date(selectedPost.createdAt).toLocaleDateString()}
                  {selectedPost.isEdited && <span className="text-muted-foreground/50 italic ml-1">(edited)</span>}
                </p>
              </div>
            </div>
            <div className="text-foreground/80 leading-relaxed break-words" dangerouslySetInnerHTML={{ __html: renderFormatted(selectedPost.content) }} />
          </div>
          <h3 className="text-xl font-display text-accent mb-6">Replies ({replies.length})</h3>
          <form onSubmit={handleAddReply} className="mb-8">
            <FormatToolbar textareaRef={replyRef} value={replyContent} onChange={setReplyContent} />
            <textarea ref={replyRef} value={replyContent} onChange={(e) => setReplyContent(e.target.value)}
              placeholder={user ? "Add your reply..." : "Sign in to reply"}
              className="w-full px-4 py-3 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
              rows={3} disabled={!user}
            />
            <button type="submit" disabled={!user || !replyContent.trim()}
              className="mt-3 px-6 py-2 bg-primary hover:bg-primary/80 disabled:bg-secondary disabled:cursor-not-allowed text-primary-foreground rounded-lg font-medium transition-colors">
              Post Reply
            </button>
          </form>
          <div className="divide-y divide-border/50">
            {replies.map((reply) => (
              <div key={reply.id} className="py-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 cursor-pointer" onClick={() => navigate(`/user/${reply.authorId}`)}>
                    <ProfileFrame avatarUrl={reply.authorAvatar} name={reply.author} frame={reply.authorFrame} size={40} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-primary cursor-pointer hover:underline font-medium" onClick={() => navigate(`/user/${reply.authorId}`)}>{reply.author}</span>
                      {reply.authorId === SITE_AUTHOR_ID && <AuthorBadge />}
                      <span className="text-muted-foreground text-sm">{new Date(reply.createdAt).toLocaleDateString()}</span>
                      {reply.isEdited && <span className="text-muted-foreground/50 text-xs italic">(edited)</span>}
                    </div>
                    {editingReplyId === reply.id ? (
                      <div className="space-y-2">
                        <FormatToolbar textareaRef={editReplyRef} value={editReplyContent} onChange={setEditReplyContent} />
                        <textarea ref={editReplyRef} value={editReplyContent} onChange={(e) => setEditReplyContent(e.target.value)}
                          className="w-full px-4 py-3 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:border-primary resize-none" rows={3} />
                        <div className="flex gap-2">
                          <button onClick={handleEditReply} className="px-4 py-1.5 bg-primary hover:bg-primary/80 text-primary-foreground rounded-lg text-sm font-medium transition-colors">Save</button>
                          <button onClick={() => setEditingReplyId(null)} className="px-4 py-1.5 text-muted-foreground hover:text-foreground text-sm transition-colors">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-foreground/70 break-words" dangerouslySetInnerHTML={{ __html: renderFormatted(reply.content) }} />
                        <div className="flex gap-3 mt-1">
                          {user && (
                            <button onClick={() => {
                              const quoted = `> **${reply.author}** wrote:\n> ${reply.content.split('\n').join('\n> ')}\n\n`;
                              setReplyContent(prev => quoted + prev);
                              replyRef.current?.focus();
                            }}
                              className="text-muted-foreground hover:text-primary text-xs transition-colors">💬 Quote</button>
                          )}
                          {(user?.id === reply.authorId || user?.isAdmin) && (
                            <>
                              <button onClick={() => { setEditingReplyId(reply.id); setEditReplyContent(reply.content); }}
                                className="text-muted-foreground hover:text-foreground text-xs transition-colors">✏️ Edit</button>
                              <button onClick={() => {
                                if (confirm('Delete this reply?')) {
                                  dbFetch('forum_replies', { method: 'DELETE', filters: `id=eq.${reply.id}` }).then(() => {
                                    setReplies(replies.filter(r => r.id !== reply.id));
                                    if (selectedPost) {
                                      const updated = { ...selectedPost, replies: selectedPost.replies - 1 };
                                      setSelectedPost(updated);
                                      setPosts(posts.map(p => p.id === selectedPost.id ? updated : p));
                                    }
                                  });
                                }
                              }}
                                className="text-muted-foreground hover:text-destructive text-xs transition-colors">🗑️ Delete</button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                    {reply.authorBio && editingReplyId !== reply.id && (
                      <div className="mt-3 pt-2 border-t border-border/30">
                        <p className="text-muted-foreground/60 text-xs italic line-clamp-2">{reply.authorBio}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 sm:py-12 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl text-accent mb-2">Forum</h1>
            <p className="text-muted-foreground">Discuss theories and connect with fellow readers</p>
          </div>
          <button onClick={() => (user ? setShowNewPost(true) : setShowAuthModal(true))}
            className="text-primary hover:text-primary/80 transition-colors self-start sm:self-auto">+ New Post</button>
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${!selectedCategory ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
          >
            All
          </button>
          {forumCategories.map(cat => (
            <button key={cat} onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${selectedCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
            >{cat}</button>
          ))}
        </div>

        {showNewPost && (
          <div className="mb-12 py-8 border-b border-border/50 animate-fade-in">
            <h3 className="text-xl font-display text-accent mb-6">Create New Post</h3>
            <form onSubmit={handleCreatePost} className="space-y-6">
              <div>
                <label className="block text-muted-foreground text-sm mb-2">Category</label>
                <select value={newPost.category} onChange={(e) => setNewPost({ ...newPost, category: e.target.value })}
                  className="w-full px-4 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:border-primary">
                  {forumCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-muted-foreground text-sm mb-2">Title</label>
                <input type="text" value={newPost.title} onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                  className="w-full px-4 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:border-primary" placeholder="Enter post title" />
              </div>
              <div>
                <label className="block text-muted-foreground text-sm mb-2">Content</label>
                <FormatToolbar textareaRef={newPostRef} value={newPost.content} onChange={(v) => setNewPost({ ...newPost, content: v })} />
                <textarea ref={newPostRef} value={newPost.content} onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                  className="w-full px-4 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:border-primary resize-none font-mono text-sm" rows={6} placeholder="What's on your mind?" />
              </div>
              <div className="flex gap-4">
                <button type="submit" className="text-primary hover:text-primary/80 transition-colors">Post →</button>
                <button type="button" onClick={() => setShowNewPost(false)} className="text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              </div>
            </form>
          </div>
        )}

        <div className="space-y-1">
          {filteredPosts.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">No discussions yet. Be the first to start one!</p>
          ) : (
            filteredPosts.map((post) => (
              <div key={post.id} onClick={() => navigate(postUrl(post))}
                className={`group py-5 px-5 cursor-pointer rounded-lg hover:bg-secondary/30 transition-colors flex gap-4 items-start ${post.isPinned ? 'border border-accent/20 bg-accent/5' : ''}`}
              >
                <div
                  className="shrink-0 mt-0.5"
                  onClick={(e) => { e.stopPropagation(); navigate(`/user/${post.authorId}`); }}
                >
                  <ProfileFrame
                    avatarUrl={post.authorAvatar}
                    name={post.author}
                    frame={post.authorFrame}
                    size={40}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1 flex-wrap">
                    {post.isPinned && <span className="text-accent">📌</span>}
                    <span className="px-1.5 py-0.5 rounded bg-secondary/50 text-foreground/70">{post.category}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" />
                      {post.replies} {post.replies === 1 ? 'reply' : 'replies'}
                    </span>
                  </div>
                  <h3 className="text-lg text-foreground group-hover:text-primary transition-colors truncate">{post.title}</h3>
                  <p className="text-muted-foreground text-sm mt-1 line-clamp-2" dangerouslySetInnerHTML={{ __html: renderFormatted(post.content) }} />
                  <p className="text-muted-foreground/60 text-xs mt-2">
                    by <span className="text-primary/80 cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); navigate(`/user/${post.authorId}`); }}>{post.author}</span> · {formatRelativeTime(post.createdAt)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ForumPage;
