import { Check } from "lucide-react";
import React, { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
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
  // Case Files (linear) and Interactive Case Files are kept apart; ?type=interactive opens the second.
  const [params, setParams] = useSearchParams();
  const format: "linear" | "interactive" = params.get("type") === "interactive" ? "interactive" : "linear";
  const setFormat = (f: "linear" | "interactive") => {
    const next = new URLSearchParams(params);
    if (f === "interactive") next.set("type", "interactive"); else next.delete("type");
    setParams(next, { replace: true });
    setActiveTag(null);
  };
  const counts = useMemo(() => ({
    linear: chapters.filter((c) => c.storyFormat !== "interactive").length,
    interactive: chapters.filter((c) => c.storyFormat === "interactive").length,
  }), [chapters]);
  const inFormat = useMemo(
    () => chapters.filter((c) => (format === "interactive" ? c.storyFormat === "interactive" : c.storyFormat !== "interactive")),
    [chapters, format],
  );
  const allTags = useMemo(() => Array.from(new Set(inFormat.flatMap((c) => c.tags))).sort(), [inFormat]);

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: "newest", label: t("chapters.sortNewest") },
    { value: "oldest", label: t("chapters.sortOldest") },
    { value: "most-viewed", label: t("chapters.sortMostViewed") },
  ];

  const sorted = useMemo(() => {
    const copy = activeTag ? inFormat.filter((c) => c.tags.includes(activeTag)) : [...inFormat];
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
  }, [inFormat, sort, activeTag]);

  return (
    <div className="min-h-screen py-10 sm:py-16 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="border-l-4 border-primary pl-6 mb-10">
          <p className="case-label text-[9px] mb-2">{t("caseFiles.declassified")}</p>
          <h1 className="font-display text-4xl sm:text-5xl text-foreground uppercase">
            {t("caseFiles.storyArchive")}
          </h1>
        </div>

        {user && (
          <ReadingStats readCount={readCount} totalCount={chapters.length} />
        )}

        {/* Case Files | Interactive Case Files */}
        <div role="tablist" aria-label="Story type" className="grid grid-cols-2 gap-0 mb-8 border border-border">
          {([
            ["linear", t("caseFiles.tabLinear", { defaultValue: "Case Files" }), t("caseFiles.tabLinearHint", { defaultValue: "Read from start to finish" })],
            ["interactive", t("caseFiles.tabInteractive", { defaultValue: "Interactive Case Files" }), t("caseFiles.tabInteractiveHint", { defaultValue: "Your decisions decide the outcome" })],
          ] as const).map(([f, label, hint]) => (
            <button
              key={f}
              role="tab"
              aria-selected={format === f}
              onClick={() => setFormat(f)}
              className={`text-left px-4 sm:px-5 py-3 sm:py-4 transition-colors border-l first:border-l-0 border-border ${
                format === f ? "bg-primary/10 text-foreground shadow-[inset_0_-3px_0_hsl(var(--primary))]" : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
              }`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-display text-lg sm:text-xl uppercase">{label}</span>
                <span className="case-label text-[9px] tabular-nums">{counts[f]}</span>
              </span>
              <span className="block text-xs text-muted-foreground mt-0.5">{hint}</span>
            </button>
          ))}
        </div>

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

        {sorted.length === 0 && (
          <div className="case-file p-8 text-center text-muted-foreground">
            {format === "interactive"
              ? t("caseFiles.noInteractive", { defaultValue: "No interactive case files have been opened yet." })
              : t("caseFiles.noLinear", { defaultValue: "No case files yet." })}
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
                {chapter.storyFormat === "interactive" && (
                  <span className="inline-block mb-1 case-label text-[8px] !text-primary border border-primary/60 px-1.5 py-0.5">
                    {t("caseFiles.interactiveBadge", { defaultValue: "Interactive" })}
                  </span>
                )}
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
