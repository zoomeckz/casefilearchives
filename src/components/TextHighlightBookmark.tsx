import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AuthUser } from "@/hooks/useAuth";

interface Highlight {
  id: string;
  highlighted_text: string;
  note: string;
  created_at: string;
  chapter_id: string;
}

interface TextHighlightBookmarkProps {
  chapterId: string;
  chapterNumber?: number;
  user: AuthUser | null;
  setShowAuthModal: (show: boolean) => void;
}

function jumpToText(text: string) {
  // Try to find the text in the article content and scroll to it
  const article = document.querySelector("article");
  if (!article) return;

  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  const searchText = text.slice(0, 80).toLowerCase();

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.textContent && node.textContent.toLowerCase().includes(searchText)) {
      const el = node.parentElement;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Briefly highlight
        const orig = el.style.backgroundColor;
        el.style.backgroundColor = "hsl(var(--primary) / 0.2)";
        el.style.transition = "background-color 0.3s";
        setTimeout(() => {
          el.style.backgroundColor = orig;
        }, 2000);
        return;
      }
    }
  }
}

export const TextHighlightBookmark: React.FC<TextHighlightBookmarkProps> = ({ chapterId, chapterNumber, user, setShowAuthModal }) => {
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
    // Small delay to let click events on buttons fire first
    setTimeout(() => {
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

      // Check if selection is inside the article
      const range = selection.getRangeAt(0);
      const article = document.querySelector("article");
      if (!article || !article.contains(range.commonAncestorContainer)) {
        setShowPopup(false);
        return;
      }

      const rect = range.getBoundingClientRect();

      setSelectedText(text);
      setPopupPos({
        x: rect.left + rect.width / 2,
        y: rect.top - 10 + window.scrollY,
      });
      setShowPopup(true);
    }, 10);
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

  const handleSaveQuote = async () => {
    if (!user) {
      setShowAuthModal(true);
      setShowPopup(false);
      return;
    }

    await supabase
      .from("saved_quotes")
      .insert({ user_id: user.id, chapter_id: chapterId, quote_text: selectedText });

    setShowPopup(false);
    window.getSelection()?.removeAllRanges();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("text_highlights").delete().eq("id", id);
    setHighlights((prev) => prev.filter((h) => h.id !== id));
  };

  return (
    <>
      {/* Floating buttons */}
      {showPopup && (
        <div
          className="fixed z-[100] animate-fade-in"
          style={{ left: popupPos.x, top: popupPos.y - window.scrollY, transform: "translate(-50%, -100%)" }}
        >
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg shadow-xl p-1">
            <button
              onClick={handleBookmark}
              className="px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/80 transition-colors flex items-center gap-1.5"
            >
              🔖 Bookmark
            </button>
            <button
              onClick={handleSaveQuote}
              className="px-3 py-1.5 bg-accent/20 text-accent text-sm rounded-md hover:bg-accent/30 transition-colors flex items-center gap-1.5"
            >
              ✨ Save Quote
            </button>
          </div>
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
                <div key={h.id} className="flex items-start gap-2 p-3 bg-primary/5 border border-primary/10 rounded-lg group">
                  <button
                    onClick={() => jumpToText(h.highlighted_text)}
                    className="text-primary/60 mt-0.5 hover:text-primary transition-colors"
                    title="Jump to this passage"
                  >
                    🔖
                  </button>
                  <button
                    onClick={() => jumpToText(h.highlighted_text)}
                    className="flex-1 min-w-0 text-left hover:bg-primary/5 rounded p-1 -m-1 transition-colors"
                  >
                    <p className="text-foreground/80 text-sm italic line-clamp-3">"{h.highlighted_text}"</p>
                    <p className="text-muted-foreground/60 text-xs mt-1">
                      {new Date(h.created_at).toLocaleDateString()}
                    </p>
                  </button>
                  <button
                    onClick={() => handleDelete(h.id)}
                    className="text-muted-foreground hover:text-destructive text-xs transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
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
