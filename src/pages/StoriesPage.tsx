import React, { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Icons } from "@/lib/icons";
import { Chapter } from "@/hooks/useChapters";
import { AuthUser } from "@/hooks/useAuth";
import { ReadingProgressBadge } from "@/components/ReadingProgressBadge";
import { ReadingStats } from "@/components/ReadingStats";
import { BookmarkButton } from "@/components/BookmarkButton";
import { dbFetch } from "@/lib/dbFetch";
import {
  LANGUAGE_FLAGS,
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from "@/i18n";

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
  // Map of chapter_id → list of non-English language codes that have a
  // translation row. English is always available (canonical) so we don't
  // render a flag for it — only show flags for *additional* languages.
  const [translationsByChapter, setTranslationsByChapter] = useState<
    Record<string, SupportedLanguage[]>
  >({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await dbFetch<
        { chapter_id: string; language_code: string }[]
      >("chapter_translations", {
        select: "chapter_id,language_code",
      });
      if (cancelled || !Array.isArray(data)) return;
      const map: Record<string, SupportedLanguage[]> = {};
      for (const row of data) {
        if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(row.language_code)) continue;
        const lang = row.language_code as SupportedLanguage;
        if (lang === "en") continue;
        (map[row.chapter_id] ||= []).push(lang);
      }
      setTranslationsByChapter(map);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: "newest", label: t("chapters.sortNewest") },
    { value: "oldest", label: t("chapters.sortOldest") },
    { value: "most-viewed", label: t("chapters.sortMostViewed") },
  ];

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
          {t("chapters.title")}
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
                className="group py-5 px-5 cursor-pointer rounded-lg hover:bg-secondary/30 transition-all duration-200 flex items-start gap-4"
              >
                {/* Cover-art slot — renders a faint placeholder until cover_image_url is populated */}
                <div className="hidden sm:flex shrink-0 w-16 h-20 rounded-md overflow-hidden border border-border/40 bg-stone-900 items-center justify-center">
                  {chapter.coverImageUrl ? (
                    <img
                      src={chapter.coverImageUrl}
                      alt={`Chapter ${chapter.chapterNumber} cover`}
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
                  <span className="text-muted-foreground text-xs uppercase tracking-wider">
                    {t("chapters.chapterLabel")} {chapter.chapterNumber} ·{" "}
                    {new Date(chapter.publishedAt).toLocaleDateString()}
                  </span>
                  {(translationsByChapter[chapter.id] || []).length > 0 && (
                    <span className="inline-flex items-center gap-1" aria-label="Available translations">
                      {translationsByChapter[chapter.id].map((lang) => (
                        <span
                          key={lang}
                          title={LANGUAGE_LABELS[lang]}
                          className="text-sm leading-none"
                        >
                          {LANGUAGE_FLAGS[lang]}
                        </span>
                      ))}
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
                <h3 className="font-display text-xl text-foreground group-hover:text-primary transition-colors">
                  {chapter.title}
                </h3>
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
