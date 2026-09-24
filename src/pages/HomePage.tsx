import React from "react";
import { Chapter } from "@/hooks/useChapters";
import { useTranslation } from "react-i18next";
import { ArrowRight, Clock, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      <section className="border-b border-border px-4 sm:px-6 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto border-l-4 border-primary pl-6 sm:pl-10 py-4">
          <p className="case-label text-[10px] mb-6">Classification: Independent Fiction / Access: Public</p>
          <h1 className="brand-title text-6xl sm:text-8xl md:text-9xl text-foreground leading-none mb-5">
            CASE FILE
          </h1>
          <p className="case-label text-xs sm:text-sm text-foreground/65 max-w-2xl">
            {t("hero.tagline")}
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-5">
            <Button
              onClick={() => chapters[0] ? setSelectedChapter(chapters[0]) : setCurrentPage("chapters")}
              size="lg"
              className="rounded-none uppercase tracking-widest"
            >
              {t("hero.startReading")} <ArrowRight />
            </Button>
            <span className="case-label text-[10px]">{chapters.length} active files / updated continuously</span>
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between border-b border-border pb-4 mb-10">
            <div>
              <p className="case-label text-[10px] mb-2">Evidence archive</p>
              <h2 className="font-display text-2xl sm:text-3xl text-foreground uppercase">Latest Case Files</h2>
            </div>
            <button onClick={() => setCurrentPage("chapters")} className="case-label text-[10px] hover:text-primary">View archive →</button>
          </div>

            {chapters.length === 0 ? (
              <p className="text-muted-foreground">No active files yet.</p>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
                {chapters.slice().reverse().slice(0, 6).map((chapter) => {
                  const wordCount = (chapter.content || "").replace(/<[^>]*>/g, "").split(/\s+/).length;
                  const readMin = Math.max(1, Math.ceil(wordCount / 220));
                  return (
                    <article key={chapter.id} className="case-file group p-5 flex flex-col min-h-[310px]">
                      <button
                        onClick={() => setSelectedChapter(chapter)}
                        className="w-full h-full text-left flex flex-col"
                      >
                        <span className="flex items-center justify-between w-full case-label text-[9px] mb-4">
                          <span>Case File</span>
                          <span>{new Date(chapter.publishedAt).toLocaleDateString()}</span>
                        </span>
                        {chapter.coverImageUrl ? (
                          <img src={chapter.coverImageUrl} alt="" className="w-full aspect-[16/9] object-cover grayscale group-hover:grayscale-0 transition-all duration-500 mb-5" loading="lazy" />
                        ) : (
                          <span className="w-full aspect-[16/9] bg-secondary flex items-center justify-center mb-5 text-muted-foreground"><FileText className="w-8 h-8" /></span>
                        )}
                        <span className="font-display text-xl text-foreground group-hover:text-primary transition-colors block mb-4">{chapter.title}</span>
                        <span className="mt-auto flex items-center justify-between w-full border-t border-border pt-4">
                          <span className="flex flex-wrap gap-1.5">{chapter.tags.slice(0, 2).map(tag => <span key={tag} className="case-label text-[8px] border border-border px-1.5 py-1">{tag}</span>)}</span>
                          <span className="case-label text-[9px] flex items-center gap-1"><Clock className="w-3 h-3" /> {readMin}m</span>
                        </span>
                      </button>
                    </article>
                  );
                })}
              </div>
            )}

            {chapters.length > 8 && (
              <div className="text-center mt-10">
                <button
                  onClick={() => setCurrentPage("chapters")}
                  className="case-label text-[10px] hover:text-primary transition-colors"
                >
                  {t("home.viewAll")} ({chapters.length}) →
                </button>
              </div>
            )}
        </div>
      </section>
    </div>
  );
};

export default HomePage;
