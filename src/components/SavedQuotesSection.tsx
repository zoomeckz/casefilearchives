import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface SavedQuote {
  id: string;
  quote_text: string;
  chapter_id: string;
  chapter_number?: number;
  chapter_title?: string;
  created_at: string;
}

interface SavedQuotesSectionProps {
  userId: string;
  isOwner?: boolean;
}

export const SavedQuotesSection: React.FC<SavedQuotesSectionProps> = ({ userId, isOwner = false }) => {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<SavedQuote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("saved_quotes")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (data && data.length > 0) {
        // Fetch chapter info for each unique chapter_id
        const chapterIds = [...new Set(data.map((q: any) => q.chapter_id))];
        const { data: chapters } = await supabase
          .from("chapters")
          .select("id, chapter_number, title")
          .in("id", chapterIds);

        const chapterMap: Record<string, { chapter_number: number; title: string }> = {};
        if (chapters) {
          for (const ch of chapters) {
            chapterMap[ch.id] = { chapter_number: ch.chapter_number, title: ch.title };
          }
        }

        setQuotes(data.map((q: any) => ({
          ...q,
          chapter_number: chapterMap[q.chapter_id]?.chapter_number,
          chapter_title: chapterMap[q.chapter_id]?.title,
        })));
      }
      setLoading(false);
    };
    fetch();
  }, [userId]);

  const handleDelete = async (id: string) => {
    await supabase.from("saved_quotes").delete().eq("id", id);
    setQuotes((prev) => prev.filter((q) => q.id !== id));
  };

  if (loading) return null;
  if (quotes.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="font-display text-xl text-accent mb-4">✨ Favorite Quotes ({quotes.length})</h3>
      <div className="space-y-3">
        {quotes.map((quote) => (
          <div key={quote.id} className="p-4 bg-card/30 rounded-xl border border-border group">
            <blockquote className="text-foreground/80 italic leading-relaxed">
              "{quote.quote_text}"
            </blockquote>
            <div className="flex items-center justify-between mt-3">
              <button
                onClick={() => quote.chapter_number && navigate(`/chapters/${quote.chapter_number}`)}
                className="text-primary/70 text-xs hover:text-primary transition-colors"
              >
                {quote.chapter_title ? `Chapter ${quote.chapter_number}: ${quote.chapter_title}` : "View chapter"}
              </button>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground/50 text-xs">
                  {new Date(quote.created_at).toLocaleDateString()}
                </span>
                {isOwner && (
                  <button
                    onClick={() => handleDelete(quote.id)}
                    className="text-muted-foreground hover:text-destructive text-xs transition-colors opacity-0 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
