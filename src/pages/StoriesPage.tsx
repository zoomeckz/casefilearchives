import React from "react";
import { Icons } from "@/lib/icons";
import { Chapter } from "@/hooks/useChapters";
import { AuthUser } from "@/hooks/useAuth";
import { ReadingProgressBadge } from "@/components/ReadingProgressBadge";
import { ReadingStats } from "@/components/ReadingStats";

interface StoriesPageProps {
  chapters: Chapter[];
  setSelectedChapter: (chapter: Chapter) => void;
  setCurrentPage: (page: string) => void;
  user: AuthUser | null;
  isRead: (chapterId: string) => boolean;
  markAsUnread: (chapterId: string) => void;
  readCount: number;
}

export const StoriesPage: React.FC<StoriesPageProps> = ({
  chapters,
  setSelectedChapter,
  setCurrentPage,
  user,
  isRead,
  markAsUnread,
  readCount,
}) => (
  <div className="min-h-screen py-12 px-6">
    <div className="max-w-2xl mx-auto">
      <h1 className="font-display text-4xl text-amber-100 mb-8 text-center">
        Chapters
      </h1>

      {user && (
        <ReadingStats readCount={readCount} totalCount={chapters.length} />
      )}

      <div className="divide-y divide-stone-800/50">
        {chapters.map((chapter) => {
          const chapterIsRead = isRead(chapter.id);
          return (
            <div
              key={chapter.id}
              onClick={() => {
                setSelectedChapter(chapter);
                setCurrentPage("reader");
              }}
              className="group py-8 cursor-pointer text-center"
            >
              <div className="flex items-center justify-center gap-3 mb-1">
                <span className="text-stone-600 text-sm">
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
              </div>
              <h3 className="font-display text-xl text-stone-100 group-hover:text-sky-400 transition-colors">
                {chapter.title}
              </h3>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

export default StoriesPage;
