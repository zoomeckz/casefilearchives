import React, { useState, useEffect } from "react";
import { Icons } from "@/lib/icons";
import { AuthUser } from "@/hooks/useAuth";
import { dbFetch } from "@/lib/dbFetch";
import { forumCategories } from "@/lib/data";

function renderFormatted(text: string): string {
  let html = text
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Image URLs on their own line: ![alt](url)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="max-w-full rounded-lg my-2" />')
    // Links: [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline">$1</a>');
  return html;
}

interface ForumPost {
  id: string;
  title: string;
  content: string;
  category: string;
  author: string;
  authorId: string;
  replies: number;
  createdAt: string;
  isPinned: boolean;
}

interface ForumReply {
  id: string;
  content: string;
  author: string;
  authorId: string;
  createdAt: string;
}

interface ForumPageProps {
  user: AuthUser | null;
  setShowAuthModal: (show: boolean) => void;
}

export const ForumPage: React.FC<ForumPageProps> = ({
  user,
  setShowAuthModal,
}) => {
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

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const { data: postsData } = await dbFetch<any[]>('forum_posts', {
          select: 'id,title,content,category,created_at,user_id,is_pinned',
          order: 'is_pinned.desc,created_at.desc',
        });

        if (!postsData) { setLoading(false); return; }

        const userIds = [...new Set(postsData.map(p => p.user_id))];
        const profilePromises = userIds.map(uid =>
          dbFetch<any[]>('profiles', { select: 'user_id,name', filters: `user_id=eq.${uid}` })
        );
        const profileResults = await Promise.all(profilePromises);
        const profileMap: Record<string, string> = {};
        profileResults.forEach(r => {
          if (r.data && r.data[0]) {
            profileMap[r.data[0].user_id] = r.data[0].name;
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
          author: profileMap[post.user_id] || 'Anonymous',
          authorId: post.user_id,
          replies: replyCounts[i].count || 0,
          createdAt: post.created_at,
          isPinned: post.is_pinned || false,
        }));

        setPosts(mappedPosts);
      } catch (err) {
        console.error('Forum fetch error:', err);
      }
      setLoading(false);
    };
    fetchPosts();
  }, []);

  useEffect(() => {
    if (!selectedPost) { setReplies([]); return; }
    const fetchReplies = async () => {
      const { data: repliesData } = await dbFetch<any[]>('forum_replies', {
        select: 'id,content,created_at,user_id',
        filters: `post_id=eq.${selectedPost.id}`,
        order: 'created_at.asc',
      });

      if (!repliesData) return;

      const userIds = [...new Set(repliesData.map(r => r.user_id))];
      const profilePromises = userIds.map(uid =>
        dbFetch<any[]>('profiles', { select: 'user_id,name', filters: `user_id=eq.${uid}` })
      );
      const profileResults = await Promise.all(profilePromises);
      const profileMap: Record<string, string> = {};
      profileResults.forEach(r => {
        if (r.data && r.data[0]) {
          profileMap[r.data[0].user_id] = r.data[0].name;
        }
      });

      setReplies(repliesData.map(r => ({
        id: r.id,
        content: r.content,
        author: profileMap[r.user_id] || 'Anonymous',
        authorId: r.user_id,
        createdAt: r.created_at,
      })));
    };
    fetchReplies();
  }, [selectedPost?.id]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPost.title || !newPost.content) return;
    if (!user) { setShowAuthModal(true); return; }

    const { data } = await dbFetch<any[]>('forum_posts', {
      method: 'POST',
      body: { title: newPost.title, content: newPost.content, category: newPost.category, user_id: user.id },
    });

    if (data && data[0]) {
      setPosts([{
        id: data[0].id, title: data[0].title, content: data[0].content, category: data[0].category,
        author: user.name, authorId: data[0].user_id, replies: 0, createdAt: data[0].created_at,
        isPinned: false,
      }, ...posts]);
      setNewPost({ title: "", content: "", category: "General" });
      setShowNewPost(false);
    }
  };

  const handleEditPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPost || !editContent.title || !editContent.content) return;

    await dbFetch('forum_posts', {
      method: 'PATCH',
      filters: `id=eq.${editingPost.id}`,
      body: { title: editContent.title, content: editContent.content, category: editContent.category },
    });

    const updated = { ...editingPost, ...editContent };
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
    if (selectedPost?.id === post.id) setSelectedPost(null);
  };

  const handleAddReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !replyContent.trim() || !selectedPost) return;

    const { data } = await dbFetch<any[]>('forum_replies', {
      method: 'POST',
      body: { post_id: selectedPost.id, user_id: user.id, content: replyContent },
    });

    if (data && data[0]) {
      setReplies([...replies, {
        id: data[0].id, content: data[0].content, author: user.name,
        authorId: data[0].user_id, createdAt: data[0].created_at,
      }]);
      setSelectedPost({ ...selectedPost, replies: selectedPost.replies + 1 });
      setPosts(posts.map(p => p.id === selectedPost.id ? { ...p, replies: p.replies + 1 } : p));
      setReplyContent("");
    }
  };

  const canEdit = (post: ForumPost) => user?.isAdmin || user?.id === post.authorId;

  const filteredPosts = selectedCategory
    ? posts.filter(p => p.category === selectedCategory)
    : posts;

  const formatHelp = "**bold** *italic* ![alt](image-url) [link](url)";

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
              <p className="text-muted-foreground/60 text-xs mb-1">Formatting: {formatHelp}</p>
              <textarea value={editContent.content} onChange={(e) => setEditContent({ ...editContent, content: e.target.value })}
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
      <div className="min-h-screen py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <button onClick={() => setSelectedPost(null)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8">
            <Icons.ChevronLeft /> Back to forum
          </button>
          <div className="mb-12">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">{selectedPost.category}</span>
                {selectedPost.isPinned && <span className="text-xs px-2 py-0.5 bg-accent/10 text-accent rounded">📌 Pinned</span>}
              </div>
              {canEdit(selectedPost) && (
                <div className="flex items-center gap-2">
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
            <h1 className="font-display text-3xl text-accent mt-2 mb-4">{selectedPost.title}</h1>
            <p className="text-muted-foreground text-sm mb-6">
              by <span className="text-foreground">{selectedPost.author}</span> · {new Date(selectedPost.createdAt).toLocaleDateString()}
            </p>
            <div className="text-foreground/80 leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: renderFormatted(selectedPost.content) }} />
          </div>
          <h3 className="text-xl font-display text-accent mb-6">Replies ({replies.length})</h3>
          <form onSubmit={handleAddReply} className="mb-8">
            <p className="text-muted-foreground/60 text-xs mb-1">Formatting: {formatHelp}</p>
            <textarea value={replyContent} onChange={(e) => setReplyContent(e.target.value)}
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
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center text-primary-foreground text-sm font-medium">
                    {reply.author?.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-foreground">{reply.author}</span>
                  <span className="text-muted-foreground text-sm">{new Date(reply.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="text-foreground/70 pl-11 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: renderFormatted(reply.content) }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-4xl text-accent mb-2">Forum</h1>
            <p className="text-muted-foreground">Discuss theories and connect with fellow readers</p>
          </div>
          <button onClick={() => (user ? setShowNewPost(true) : setShowAuthModal(true))}
            className="text-primary hover:text-primary/80 transition-colors">+ New Post</button>
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
                <p className="text-muted-foreground/60 text-xs mb-1">Formatting: {formatHelp}</p>
                <textarea value={newPost.content} onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
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
              <div key={post.id} onClick={() => setSelectedPost(post)}
                className={`group py-5 px-5 cursor-pointer rounded-lg hover:bg-secondary/30 transition-colors ${post.isPinned ? 'border border-accent/20 bg-accent/5' : ''}`}
              >
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  {post.isPinned && <span className="text-accent">📌</span>}
                  <span>{post.category}</span>
                  <span>·</span>
                  <span>{post.replies} replies</span>
                </div>
                <h3 className="text-lg text-foreground group-hover:text-primary transition-colors">{post.title}</h3>
                <p className="text-muted-foreground text-sm mt-1 line-clamp-2" dangerouslySetInnerHTML={{ __html: renderFormatted(post.content) }} />
                <p className="text-muted-foreground/60 text-xs mt-2">
                  by {post.author} · {new Date(post.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ForumPage;
