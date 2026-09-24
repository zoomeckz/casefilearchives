import React, { useState, useCallback } from "react";
import { dbFetch } from "@/lib/dbFetch";
import { Input } from "@/components/ui/input";
import { Search, Loader2, FileEdit, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface ContentSearchProps {
  authToken?: string;
  onEditChapter: (chapterId: string, searchTerm: string, sentence: string) => void;
}

interface SearchResult {
  chapterId: string;
  chapterTitle: string;
  publishedAt: string;
  sentence: string;
  matchIndex: number;
}

function extractSentences(html: string, query: string): { sentence: string; matchIndex: number }[] {
  const div = document.createElement("div");
  div.innerHTML = html;
  const text = div.textContent || "";

  // Split into sentences (rough but effective)
  const sentences = text.split(/(?<=[.!?…])\s+|(?<=\n)\s*/g).filter(Boolean);
  const lowerQuery = query.toLowerCase();
  const results: { sentence: string; matchIndex: number }[] = [];

  sentences.forEach((sentence) => {
    const idx = sentence.toLowerCase().indexOf(lowerQuery);
    if (idx !== -1) {
      results.push({ sentence: sentence.trim(), matchIndex: idx });
    }
  });

  return results;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  let idx = lowerText.indexOf(lowerQuery);
  while (idx !== -1) {
    if (idx > lastEnd) parts.push(text.slice(lastEnd, idx));
    parts.push(
      <mark key={idx} className="bg-primary/30 text-primary font-semibold rounded px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
    );
    lastEnd = idx + query.length;
    idx = lowerText.indexOf(lowerQuery, lastEnd);
  }
  if (lastEnd < text.length) parts.push(text.slice(lastEnd));

  return <>{parts}</>;
}

export const ContentSearch: React.FC<ContentSearchProps> = ({ authToken, onEditChapter }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      toast.error("Enter a search term");
      return;
    }

    setSearching(true);
    setHasSearched(true);

    try {
      const { data, error } = await dbFetch<any[]>("chapters", {
        select: "id,chapter_number,title,content,published_at,is_archived",
        filters: "is_archived=eq.false",
        order: "published_at.desc",
        token: authToken,
      });

      if (error || !data) {
        toast.error("Failed to fetch stories");
        setResults([]);
        setSearching(false);
        return;
      }

      const allResults: SearchResult[] = [];

      data.forEach((chapter) => {
        const matches = extractSentences(chapter.content, trimmed);
        matches.forEach((m) => {
          allResults.push({
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            publishedAt: chapter.published_at,
            sentence: m.sentence,
            matchIndex: m.matchIndex,
          });
        });
      });

      setResults(allResults);
    } catch {
      toast.error("Search failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query, authToken]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div>
      <h1 className="font-display text-2xl md:text-3xl text-accent mb-2">Content Search</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Search for any word or phrase across all published stories.
      </p>

      <div className="flex items-center gap-2 mb-6">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search for a word or phrase…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-9 h-10"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors text-sm disabled:opacity-50"
        >
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Search
        </button>
      </div>

      {hasSearched && !searching && (
        <p className="text-sm text-muted-foreground mb-4">
          {results.length} result{results.length !== 1 ? "s" : ""} found
          {results.length > 0 && (
            <span>
              {" "}across{" "}
              {new Set(results.map((r) => r.chapterId)).size} stor
              {new Set(results.map((r) => r.chapterId)).size !== 1 ? "ies" : "y"}
            </span>
          )}
        </p>
      )}

      {searching && (
        <div className="flex items-center gap-3 text-muted-foreground py-8">
          <Loader2 className="w-5 h-5 animate-spin" />
          Searching all stories…
        </div>
      )}

      {!searching && results.length > 0 && (
        <div className="space-y-3">
          {results.map((result, i) => (
            <div
              key={`${result.chapterId}-${i}`}
              className="p-4 bg-card/50 rounded-lg border border-border/50 group"
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-xs font-medium text-accent">
                  {result.chapterTitle} · {new Date(result.publishedAt).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <a
                    href={`/chapters/${encodeURIComponent(result.chapterTitle)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1 bg-accent/20 hover:bg-accent/30 text-accent rounded text-xs transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View
                  </a>
                  <button
                    onClick={() => onEditChapter(result.chapterId, query.trim(), result.sentence)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-primary/20 hover:bg-primary/30 text-primary rounded text-xs transition-colors"
                  >
                    <FileEdit className="w-3 h-3" />
                    Edit Story
                  </button>
                </div>
              </div>
              <p className="text-sm text-foreground leading-relaxed">
                {highlightMatch(result.sentence, query.trim())}
              </p>
            </div>
          ))}
        </div>
      )}

      {hasSearched && !searching && results.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No matches found for "{query}"</p>
          <p className="text-xs mt-1">Try a different word or phrase</p>
        </div>
      )}
    </div>
  );
};

export default ContentSearch;
