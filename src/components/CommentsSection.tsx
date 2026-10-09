import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useComments } from "@/hooks/useComments";
import { AuthUser } from "@/hooks/useAuth";
import { FormatToolbar } from "@/components/FormatToolbar";
import { renderFormatted } from "@/pages/ForumPage";
import { ReaderTitle } from "@/components/commendations/ReaderTitle";
import { notifyActivity } from "@/lib/commendations";

interface CommentsSectionProps {
  chapterId: string;
  user: AuthUser | null;
  setShowAuthModal: (show: boolean) => void;
}

export const CommentsSection: React.FC<CommentsSectionProps> = ({
  chapterId,
  user,
  setShowAuthModal,
}) => {
  const navigate = useNavigate();
  const { comments, addComment, updateComment, deleteComment, loading } = useComments(chapterId);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (newComment.trim() && !submitting) {
      setSubmitting(true);
      await addComment(newComment, user);
      notifyActivity();
      setNewComment("");
      setSubmitting(false);
    }
  };

  const handleEdit = (comment: { id: string; content: string }) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editContent.trim()) return;
    await updateComment(editingId, editContent);
    setEditingId(null);
    setEditContent("");
  };

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-display text-accent">
        Comments ({comments.length})
      </h3>

      <form onSubmit={handleSubmit} className="space-y-2">
        <FormatToolbar textareaRef={textareaRef} value={newComment} onChange={setNewComment} />
        <textarea
          ref={textareaRef}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={user ? "Share your thoughts..." : "Sign in to comment"}
          className="w-full px-4 py-3 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
          rows={3}
          disabled={!user || submitting}
        />
        <button
          type="submit"
          disabled={!user || !newComment.trim() || submitting}
          className="px-6 py-2 bg-primary hover:bg-primary/80 disabled:bg-secondary disabled:cursor-not-allowed text-primary-foreground rounded-lg font-medium transition-colors"
        >
          {submitting ? "Posting..." : "Post Comment"}
        </button>
      </form>

      <div className="space-y-6">
        {loading ? (
          <p className="text-muted-foreground text-center py-8">Loading comments...</p>
        ) : (
          <>
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="py-4 border-b border-border/30 last:border-0"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center text-primary-foreground text-sm font-medium">
                    {comment.author?.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-primary cursor-pointer hover:underline" onClick={() => navigate(`/user/${comment.authorId}`)}>{comment.author}</span>
                  <ReaderTitle userId={comment.authorId} />
                  <span className="text-muted-foreground text-sm">
                    {new Date(comment.createdAt).toLocaleDateString()}
                  </span>
                  {comment.isEdited && (
                    <span className="text-muted-foreground/50 text-xs italic">(edited)</span>
                  )}
                </div>

                {editingId === comment.id ? (
                  <div className="pl-11 space-y-2">
                    <FormatToolbar textareaRef={editTextareaRef} value={editContent} onChange={setEditContent} />
                    <textarea
                      ref={editTextareaRef}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full px-4 py-3 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:border-primary resize-none"
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <button onClick={handleSaveEdit}
                        className="px-4 py-1.5 bg-primary hover:bg-primary/80 text-primary-foreground rounded-lg text-sm font-medium transition-colors">
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)}
                        className="px-4 py-1.5 text-muted-foreground hover:text-foreground text-sm transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pl-11">
                    <div className="text-foreground/70 break-words" dangerouslySetInnerHTML={{ __html: renderFormatted(comment.content) }} />
                    {user?.id === comment.authorId && (
                      <div className="flex gap-3 mt-1">
                        <button onClick={() => handleEdit(comment)}
                          className="text-muted-foreground hover:text-foreground text-xs transition-colors">
                          ✏️ Edit
                        </button>
                        <button onClick={() => { if (confirm('Delete this comment?')) deleteComment(comment.id); }}
                          className="text-muted-foreground hover:text-destructive text-xs transition-colors">
                          🗑️ Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {comments.length === 0 && (
              <p className="text-muted-foreground text-center py-8">
                No comments yet. Be the first to share your thoughts!
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CommentsSection;
