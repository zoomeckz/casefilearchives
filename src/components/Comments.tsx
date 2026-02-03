import React, { useState } from "react";
import { Icons } from "@/lib/icons";
import { Comment, generateId, User } from "@/lib/data";

interface CommentsProps {
  comments: Comment[];
  onAddComment: (comment: Comment) => void;
  user: User | null;
  setShowAuthModal: (show: boolean) => void;
}

export const Comments: React.FC<CommentsProps> = ({
  comments,
  onAddComment,
  user,
  setShowAuthModal,
}) => {
  const [newComment, setNewComment] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (newComment.trim()) {
      onAddComment({
        id: generateId(),
        content: newComment,
        author: user.name,
        authorId: user.id,
        createdAt: new Date().toISOString(),
      });
      setNewComment("");
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-display text-amber-100">
        Comments ({comments.length})
      </h3>

      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={user ? "Share your thoughts..." : "Sign in to comment"}
          className="w-full px-4 py-3 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder:text-stone-500 focus:outline-none focus:border-sky-500 resize-none"
          rows={3}
          disabled={!user}
        />
        <button
          type="submit"
          disabled={!user || !newComment.trim()}
          className="px-6 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-stone-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
        >
          Post Comment
        </button>
      </form>

      <div className="space-y-6">
        {comments.map((comment) => (
          <div
            key={comment.id}
            className="py-4 border-b border-stone-800/50 last:border-0"
          >
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

        {comments.length === 0 && (
          <p className="text-stone-500 text-center py-8">
            No comments yet. Be the first to share your thoughts!
          </p>
        )}
      </div>
    </div>
  );
};

export default Comments;
