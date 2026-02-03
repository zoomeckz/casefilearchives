import React, { useState } from "react";
import { Icons } from "@/lib/icons";
import { ForumPost, User, generateId, forumCategories } from "@/lib/data";

interface ForumPageProps {
  posts: ForumPost[];
  setPosts: (posts: ForumPost[]) => void;
  user: User | null;
  setShowAuthModal: (show: boolean) => void;
}

export const ForumPage: React.FC<ForumPageProps> = ({
  posts,
  setPosts,
  user,
  setShowAuthModal,
}) => {
  const [selectedPost, setSelectedPost] = useState<ForumPost | null>(null);
  const [showNewPost, setShowNewPost] = useState(false);
  const [newPost, setNewPost] = useState({
    title: "",
    content: "",
    category: "General",
  });
  const [replyContent, setReplyContent] = useState("");

  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPost.title || !newPost.content) return;

    if (!user) {
      setShowAuthModal(true);
      return;
    }

    const post: ForumPost = {
      id: generateId(),
      ...newPost,
      author: user.name,
      authorId: user.id,
      replies: 0,
      comments: [],
      createdAt: new Date().toISOString(),
    };

    setPosts([post, ...posts]);
    setNewPost({ title: "", content: "", category: "General" });
    setShowNewPost(false);
  };

  const handleAddReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !replyContent.trim() || !selectedPost) return;

    const updatedPosts = posts.map((p) => {
      if (p.id === selectedPost.id) {
        return {
          ...p,
          replies: p.replies + 1,
          comments: [
            ...(p.comments || []),
            {
              id: generateId(),
              content: replyContent,
              author: user.name,
              authorId: user.id,
              createdAt: new Date().toISOString(),
            },
          ],
        };
      }
      return p;
    });

    setPosts(updatedPosts);
    setSelectedPost(updatedPosts.find((p) => p.id === selectedPost.id) || null);
    setReplyContent("");
  };

  if (selectedPost) {
    return (
      <div className="min-h-screen py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => setSelectedPost(null)}
            className="flex items-center gap-2 text-stone-400 hover:text-stone-200 mb-8"
          >
            <Icons.ChevronLeft />
            Back to forum
          </button>

          <div className="mb-12">
            <span className="text-stone-500 text-sm">{selectedPost.category}</span>
            <h1 className="font-display text-3xl text-amber-100 mt-2 mb-4">
              {selectedPost.title}
            </h1>
            <p className="text-stone-500 text-sm mb-6">
              by <span className="text-stone-300">{selectedPost.author}</span> ·{" "}
              {new Date(selectedPost.createdAt).toLocaleDateString()}
            </p>
            <p className="text-stone-300 leading-relaxed">
              {selectedPost.content}
            </p>
          </div>

          <h3 className="text-xl font-display text-amber-100 mb-6">
            Replies ({selectedPost.comments?.length || 0})
          </h3>

          <form onSubmit={handleAddReply} className="mb-8">
            <textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder={user ? "Add your reply..." : "Sign in to reply"}
              className="w-full px-4 py-3 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder:text-stone-500 focus:outline-none focus:border-sky-500 resize-none"
              rows={3}
              disabled={!user}
            />
            <button
              type="submit"
              disabled={!user || !replyContent.trim()}
              className="mt-3 px-6 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-stone-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              Post Reply
            </button>
          </form>

          <div className="divide-y divide-stone-800/50">
            {(selectedPost.comments || []).map((comment) => (
              <div key={comment.id} className="py-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-600 to-indigo-600 flex items-center justify-center text-white text-sm font-medium">
                    {comment.author?.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-stone-200">{comment.author}</span>
                  <span className="text-stone-600 text-sm">
                    {new Date(comment.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-stone-400 pl-11">{comment.content}</p>
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
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="font-display text-4xl text-amber-100 mb-2">Forum</h1>
            <p className="text-stone-500">
              Discuss theories and connect with fellow readers
            </p>
          </div>
          <button
            onClick={() => (user ? setShowNewPost(true) : setShowAuthModal(true))}
            className="text-sky-400 hover:text-sky-300 transition-colors"
          >
            + New Post
          </button>
        </div>

        {showNewPost && (
          <div className="mb-12 py-8 border-b border-stone-800/50 animate-fade-in">
            <h3 className="text-xl font-display text-amber-100 mb-6">
              Create New Post
            </h3>
            <form onSubmit={handleCreatePost} className="space-y-6">
              <div>
                <label className="block text-stone-400 text-sm mb-2">
                  Category
                </label>
                <select
                  value={newPost.category}
                  onChange={(e) =>
                    setNewPost({ ...newPost, category: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-sky-500"
                >
                  {forumCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-stone-400 text-sm mb-2">
                  Title
                </label>
                <input
                  type="text"
                  value={newPost.title}
                  onChange={(e) =>
                    setNewPost({ ...newPost, title: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-sky-500"
                  placeholder="Enter post title"
                />
              </div>
              <div>
                <label className="block text-stone-400 text-sm mb-2">
                  Content
                </label>
                <textarea
                  value={newPost.content}
                  onChange={(e) =>
                    setNewPost({ ...newPost, content: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-sky-500 resize-none"
                  rows={4}
                  placeholder="What's on your mind?"
                />
              </div>
              <div className="flex gap-4">
                <button
                  type="submit"
                  className="text-sky-400 hover:text-sky-300 transition-colors"
                >
                  Post →
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewPost(false)}
                  className="text-stone-500 hover:text-stone-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Posts list */}
        <div className="divide-y divide-stone-800/50">
          {posts.length === 0 ? (
            <p className="text-stone-500 text-center py-12">
              No discussions yet. Be the first to start one!
            </p>
          ) : (
            posts.map((post) => (
              <div
                key={post.id}
                onClick={() => setSelectedPost(post)}
                className="group py-6 cursor-pointer hover:bg-stone-900/30 -mx-6 px-6 transition-colors"
              >
                <span className="text-stone-500 text-sm">
                  {post.category} · {post.replies} replies
                </span>
                <h3 className="text-lg text-stone-100 group-hover:text-sky-400 transition-colors mt-1">
                  {post.title}
                </h3>
                <p className="text-stone-400 text-sm mt-2 line-clamp-2">
                  {post.content}
                </p>
                <p className="text-stone-500 text-sm mt-2">
                  by {post.author} ·{" "}
                  {new Date(post.createdAt).toLocaleDateString()}
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
