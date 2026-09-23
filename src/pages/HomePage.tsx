import React from "react";
import { Chapter } from "@/hooks/useChapters";
import { SectionHeader } from "@/components/SectionHeader";
import { useTranslation } from "react-i18next";

interface HomePageProps {
  chapters: Chapter[];
  setCurrentPage: (page: string) => void;
  setSelectedChapter: (chapter: Chapter) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  chapters,
  setCurrentPage,
  setSelectedChapter,
}) => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-20 sm:py-32 px-4 sm:px-6 text-center overflow-hidden bg-stone-950">
        <div className="absolute inset-0 bg-gradient-to-b from-stone-900/50 via-stone-950/80 to-stone-950" />
        <div className="relative max-w-2xl mx-auto z-10">
          <h1
            className="brand-title text-4xl sm:text-5xl md:text-7xl text-accent mb-4 sm:mb-5 tracking-[0.2em]"
            style={{
              WebkitTextStroke: '4px black',
              paintOrder: 'stroke fill',
              textShadow: '0 0 10px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5)',
            }}
          >
            SEDORIUM
            <span className="sr-only"> — a dark fantasy web novel series</span>
          </h1>
          <p
            className="text-foreground/85 max-w-2xl mx-auto leading-snug mb-2 sm:mb-3 italic font-display sm:whitespace-nowrap"
            style={{ fontSize: "clamp(0.85rem, 2.1vw, 1.05rem)" }}
          >
            {t("hero.tagline")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => chapters[0] ? setSelectedChapter(chapters[0]) : setCurrentPage("chapters")}
              className="px-7 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors shadow-lg"
            >
              {t("hero.startReading")} →
            </button>
          </div>
        </div>
      </section>

      {/* Two-column: Latest Chapters + Latest Forum Posts */}
      <section className="py-12 sm:py-20 px-4 sm:px-6 border-t border-border/50">
        <div className="max-w-2xl mx-auto">
          {/* Latest Chapters */}
          <div>
            <SectionHeader align="left">{t("home.latestChapters")}</SectionHeader>

            {chapters.length === 0 ? (
              <p className="text-muted-foreground text-center">No chapters yet.</p>
            ) : (
              <ul className="divide-y divide-border/40">
                {chapters.slice().reverse().slice(0, 8).map((chapter) => {
                  const wordCount = (chapter.content || "").replace(/<[^>]*>/g, "").split(/\s+/).length;
                  const readMin = Math.max(1, Math.ceil(wordCount / 220));
                  return (
                    <li key={chapter.id}>
                      <button
                        onClick={() => setSelectedChapter(chapter)}
                        className="group w-full text-left py-2.5 px-3 rounded-md hover:bg-secondary/30 transition-colors flex items-baseline gap-3"
                      >
                        {/* Cover-art placeholder slot — wired now, art coming later */}
                        {/* TODO(cover-art): render <img src={chapter.coverImageUrl} /> when populated */}
                        <span className="font-display text-xs text-muted-foreground tabular-nums w-10 shrink-0">
                          Ch.{chapter.chapterNumber}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="font-display text-base text-foreground/85 group-hover:text-primary transition-colors block truncate">
                            {chapter.title}
                          </span>
                        </span>
                        <span className="text-muted-foreground text-xs whitespace-nowrap shrink-0">
                          {readMin} {t("home.minRead")}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {chapters.length > 8 && (
              <div className="text-center mt-6">
                <button
                  onClick={() => setCurrentPage("chapters")}
                  className="text-muted-foreground hover:text-primary text-sm transition-colors"
                >
                  {t("home.viewAll")} ({chapters.length}) →
                </button>
              </div>
            )}
          </div>

        </div>
      </section>
    </div>
  );
};

export default HomePage;
