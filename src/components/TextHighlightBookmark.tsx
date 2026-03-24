import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthUser } from "@/hooks/useAuth";

interface Highlight {
  id: string;
  highlighted_text: string;
  note: string;
  created_at: string;
}

interface TextHighlightBookmarkProps {
  chapterId: string;
  user: AuthUser | null;
  setShowAuthModal: (show: boolean) => void;
}

export const TextHighlightBookmark: React.FC<TextHighlightBookmarkProps> = ({ chapterId, user, setShowAuthModal }) => {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [showPopup, setShowPopup] = useState(false);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState("");
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("text_highlights")
        .select("*")
        .eq("user_id", user.id)
        .eq("chapter_id", chapterId)
        .order("created_at", { ascending: false });
      if (data) setHighlights(data as Highlight[]);
    };
    fetch();
  }, [user?.id, chapterId]);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setShowPopup(false);
      return;
    }

    const text = selection.toString().trim();
    if (text.length < 2 || text.length > 500) {
      setShowPopup(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    setSelectedText(text);
    setPopupPos({
      x: rect.left + rect.width / 2,
      y: rect.top - 10 + window.scrollY,
    });
    setShowPopup(true);
  }, []);

  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  const handleBookmark = async () => {
    if (!user) {
      setShowAuthModal(true);
      setShowPopup(false);
      return;
    }

    const { data } = await supabase
      .from("text_highlights")
      .insert({ user_id: user.id, chapter_id: chapterId, highlighted_text: selectedText })
      .select()
      .single();

    if (data) {
      setHighlights((prev) => [data as Highlight, ...prev]);
    }

    setShowPopup(false);
    window.getSelection()?.removeAllRanges();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("text_highlights").delete().eq("id", id);
    setHighlights((prev) => prev.filter((h) => h.id !== id));
  };

  return (
    <>
      {/* Floating bookmark button */}
      {showPopup && (
        <div
          className="fixed z-[100] animate-fade-in"
          style={{ left: popupPos.x, top: popupPos.y - window.scrollY, transform: "translate(-50%, -100%)" }}
        >
          <button
            onClick={handleBookmark}
            className="px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded-lg shadow-lg hover:bg-primary/80 transition-colors flex items-center gap-1.5"
          >
            🔖 Bookmark
          </button>
        </div>
      )}

      {/* Highlights panel toggle */}
      {user && highlights.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setShowPanel(!showPanel)}
            className="text-sm text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5"
          >
            🔖 Your Bookmarks ({highlights.length})
            <svg className={`w-3 h-3 transition-transform ${showPanel ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showPanel && (
            <div className="mt-3 space-y-2">
              {highlights.map((h) => (
                <div key={h.id} className="flex items-start gap-2 p-3 bg-primary/5 border border-primary/10 rounded-lg">
                  <span className="text-primary/60 mt-0.5">🔖</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground/80 text-sm italic line-clamp-3">"{h.highlighted_text}"</p>
                    <p className="text-muted-foreground/60 text-xs mt-1">
                      {new Date(h.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(h.id)}
                    className="text-muted-foreground hover:text-destructive text-xs transition-colors flex-shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
};
