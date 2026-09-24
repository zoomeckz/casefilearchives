import { Check } from "lucide-react";
import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Icons } from "@/lib/icons";
import { Chapter } from "@/hooks/useChapters";
import { AuthUser } from "@/hooks/useAuth";
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
  const { t } = useTranslation();
  const [sort, setSort] = useState<SortOption>("newest");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const allTags = useMemo(() => Array.from(new Set(chapters.flatMap((c) => c.tags))).sort(), [chapters]);

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: "newest", label: t("chapters.sortNewest") },
    { value: "oldest", label: t("chapters.sortOldest") },
    { value: "most-viewed", label: t("chapters.sortMostViewed") },
  ];

  const sorted = useMemo(() => {
    const copy = activeTag ? chapters.filter((c) => c.tags.includes(activeTag)) : [...chapters];
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
  }, [chapters, sort, activeTag]);

  return (
    <div className="min-h-screen py-10 sm:py-16 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="border-l-4 border-primary pl-6 mb-10">
          <p className="case-label text-[9px] mb-2">Declassified index / all active files</p>
          <h1 className="font-display text-4xl sm:text-5xl text-foreground uppercase">
            Story Archive
          </h1>
        </div>

        {user && (
          <ReadingStats readCount={readCount} totalCount={chapters.length} />
        )}

        {/* Sort buttons */}
        <div className="flex items-center gap-2 mb-6 flex-wrap border-b border-border pb-5">
          {sortOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSort(opt.value)}
              className={`px-3 py-1.5 rounded-none case-label text-[9px] border transition-colors ${
                sort === opt.value
                  ? "bg-foreground text-background border-foreground"
                  : "bg-transparent text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {allTags.length > 0 && (
          <div className="flex items-center gap-2 mb-8 flex-wrap">
            <button
              onClick={() => setActiveTag(null)}
              className={`px-3 py-1 rounded-none case-label text-[9px] border transition-colors ${!activeTag ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`px-3 py-1 rounded-none case-label text-[9px] border transition-colors ${activeTag === tag ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-x-6 gap-y-9">
          {sorted.map((chapter) => {
            const chapterIsRead = isRead(chapter.id);
            const chapterIsBookmarked = isBookmarked(chapter.id);
            return (
              <div
                key={chapter.id}
                onClick={() => setSelectedChapter(chapter)}
                className="case-file group relative p-5 cursor-pointer transition-all duration-200 flex items-start gap-4"
              >
                {user && chapterIsRead && (
                  <button
                    type="button"
                    title="Read — click to mark unread"
                    onClick={(e) => { e.stopPropagation(); markAsUnread(chapter.id); }}
                    className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-success text-success-foreground shadow"
                  >
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </button>
                )}
                {/* Cover-art slot — renders a faint placeholder until cover_image_url is populated */}
                <div className="hidden sm:flex shrink-0 w-20 aspect-[4/5] overflow-hidden border border-border bg-secondary items-center justify-center">
                  {chapter.coverImageUrl ? (
                    <img
                      src={chapter.coverImageUrl}
                      alt={`${chapter.title} cover`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span
                      className="text-accent/40 text-xl"
                      style={{ fontFamily: "'Cinzel Decorative', serif" }}
                      aria-hidden="true"
                    >
                      ✦
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <span className="case-label text-[9px]">
                    {chapter.isArchived && <>{t("chapters.chapterLabel")} {chapter.chapterNumber} ·{" "}</>}
                    {new Date(chapter.publishedAt).toLocaleDateString()}
                  </span>
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
                <h3 className="font-display text-xl uppercase text-foreground group-hover:text-primary transition-colors">
                  {chapter.title}
                </h3>
                {chapter.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {chapter.tags.map((tag) => (
                      <button
                        key={tag}
                        onClick={(e) => { e.stopPropagation(); setActiveTag(tag); }}
                        className="px-2 py-0.5 rounded-none case-label text-[8px] border border-border text-muted-foreground hover:text-foreground"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Icons.Eye className="w-3 h-3" /> {chapter.views} {t("chapters.views")}
                  </span>
                  {isAdmin && chapter.scheduledAt && new Date(chapter.scheduledAt) > new Date() && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/20 text-accent text-xs font-semibold border border-accent/30">
                      📅 {t("chapters.releases")} {new Date(chapter.scheduledAt).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })}
                    </span>
                  )}
                </div>
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
