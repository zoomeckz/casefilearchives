import React, { useState, useMemo } from "react";
import { Icons } from "@/lib/icons";
import { Chapter } from "@/hooks/useChapters";
import { AuthUser } from "@/hooks/useAuth";
import { ReadingProgressBadge } from "@/components/ReadingProgressBadge";
import { ReadingStats } from "@/components/ReadingStats";
import { BookmarkButton } from "@/components/BookmarkButton";

type SortOption = "newest" | "oldest" | "most-viewed" | "most-read";

interface StoriesPageProps {
  chapters: Chapter[];
  setSelectedChapter: (chapter: Chapter) => void;
  setCurrentPage: (page: string) => void;
  user: AuthUser | null;
  isAdmin?: boolean;
  isRead: (chapterId: string) => boolean;
  markAsUnread: (chapterId: string) => void;
  readCount: number;
  isBookmarked: (chapterId: string) => boolean;
  toggleBookmark: (chapterId: string) => void;
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "most-viewed", label: "Most Viewed" },
];

export const StoriesPage: React.FC<StoriesPageProps> = ({
  chapters,
  setSelectedChapter,
  setCurrentPage,
  user,
  isAdmin = false,
  isRead,
  markAsUnread,
  readCount,
  isBookmarked,
  toggleBookmark,
}) => {
  const [sort, setSort] = useState<SortOption>("newest");

  const sorted = useMemo(() => {
    const copy = [...chapters];
    switch (sort) {
      case "newest":
        return copy.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      case "oldest":
        return copy.sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
      case "most-viewed":
        return copy.sort((a, b) => b.views - a.views);
      default:
        return copy;
    }
  }, [chapters, sort]);

  return (
    <div className="min-h-screen py-8 sm:py-12 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-display text-3xl sm:text-4xl text-accent mb-8 text-center">
          Chapters
        </h1>

        {user && (
          <ReadingStats readCount={readCount} totalCount={chapters.length} />
        )}

        {/* Sort buttons */}
        <div className="flex items-center justify-center gap-2 mb-6 flex-wrap">
          {sortOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSort(opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                sort === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {sorted.map((chapter) => {
            const chapterIsRead = isRead(chapter.id);
            const chapterIsBookmarked = isBookmarked(chapter.id);
            return (
              <div
                key={chapter.id}
                onClick={() => setSelectedChapter(chapter)}
                className="group py-6 px-6 cursor-pointer rounded-lg hover:bg-secondary/30 transition-all duration-200"
              >
                <div className="flex items-center justify-center gap-3 mb-2 flex-wrap">
                  <span className="text-muted-foreground text-xs uppercase tracking-wider">
                    Chapter {chapter.chapterNumber} ·{" "}
                    {new Date(chapter.publishedAt).toLocaleDateString()}
                  </span>
                  {chapter.scheduledAt && new Date(chapter.scheduledAt) > new Date() && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/20 text-accent text-xs font-semibold border border-accent/30">
                      📅 Scheduled · {new Date(chapter.scheduledAt).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })}
                    </span>
                  )}
                  {user && chapterIsRead && (
                    <ReadingProgressBadge
                      isRead={chapterIsRead}
                      onClick={(e) => {
                        e.stopPropagation();
                        markAsUnread(chapter.id);
                      }}
                    />
                  )}
                  {user && (
                    <BookmarkButton
                      isBookmarked={chapterIsBookmarked}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleBookmark(chapter.id);
                      }}
                      size="sm"
                    />
                  )}
                </div>
                <h3 className="font-display text-xl text-foreground group-hover:text-primary transition-colors text-center">
                  {chapter.title}
                </h3>
                <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Icons.Eye className="w-3 h-3" /> {chapter.views} views
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default StoriesPage;
