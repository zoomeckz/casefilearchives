import React from "react";
import { Icons } from "@/lib/icons";
import { Chapter } from "@/hooks/useChapters";
import { AuthUser } from "@/hooks/useAuth";
import { ReadingProgressBadge } from "@/components/ReadingProgressBadge";
import { ReadingStats } from "@/components/ReadingStats";
import { BookmarkButton } from "@/components/BookmarkButton";

interface StoriesPageProps {
  chapters: Chapter[];
  setSelectedChapter: (chapter: Chapter) => void;
  setCurrentPage: (page: string) => void;
  user: AuthUser | null;
  isRead: (chapterId: string) => boolean;
  markAsUnread: (chapterId: string) => void;
  readCount: number;
  isBookmarked: (chapterId: string) => boolean;
  toggleBookmark: (chapterId: string) => void;
}

export const StoriesPage: React.FC<StoriesPageProps> = ({
  chapters,
  setSelectedChapter,
  setCurrentPage,
  user,
  isRead,
  markAsUnread,
  readCount,
  isBookmarked,
  toggleBookmark,
}) => (
  <div className="min-h-screen py-8 sm:py-12 px-4 sm:px-6">
    <div className="max-w-2xl mx-auto">
      <h1 className="font-display text-3xl sm:text-4xl text-accent mb-8 text-center">
        Chapters
      </h1>

      {user && (
        <ReadingStats readCount={readCount} totalCount={chapters.length} />
      )}

      <div className="space-y-2">
        {chapters.map((chapter) => {
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

export default StoriesPage;
