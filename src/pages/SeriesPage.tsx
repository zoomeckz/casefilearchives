import React from "react";
import { Link, useParams } from "react-router-dom";
import { Check, FileText } from "lucide-react";
import type { Chapter } from "@/hooks/useChapters";
import type { AuthUser } from "@/hooks/useAuth";
import { useSeries } from "@/lib/series";
import "@/components/commendations/commendations.css";

interface Props {
  chapters: Chapter[];
  user: AuthUser | null;
  isRead: (id: string) => boolean;
  onOpen: (c: Chapter) => void;
}

const readMinutes = (html: string) => Math.max(1, Math.ceil((html || "").replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length / 220));

/** /series lists every series; /series/:slug shows one series' files in order. */
export const SeriesPage: React.FC<Props> = ({ chapters, user, isRead, onOpen }) => {
  const { slug } = useParams<{ slug?: string }>();
  const list = useSeries();
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const filesOf = (entries: { chapter_id: string }[]) => entries.map((e) => byId.get(e.chapter_id)).filter(Boolean) as Chapter[];

  if (!list) return <p className="case-label text-[10px] text-center py-24">Retrieving series…</p>;

  if (slug) {
    const s = list.find((x) => x.slug === slug);
    if (!s) {
      return (
        <div className="min-h-screen py-24 px-6 text-center">
          <p className="case-label text-[10px] mb-3">Series</p>
          <h1 className="font-display text-3xl uppercase text-foreground mb-6">Series not found</h1>
          <Link to="/series" className="case-label text-[10px] hover:!text-primary">All series →</Link>
        </div>
      );
    }
    const files = filesOf(s.entries);
    const readCount = user ? files.filter((f) => isRead(f.id)).length : 0;
    return (
      <div className="min-h-screen py-10 sm:py-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <Link to="/series" className="case-label text-[9px] hover:text-foreground">← All series</Link>
          <header className="border-l-4 border-primary pl-6 mt-6 mb-10">
            <p className="case-label text-[9px] mb-2">Series · {files.length} {files.length === 1 ? "file" : "files"}</p>
            <h1 className="font-display text-4xl sm:text-5xl text-foreground uppercase">{s.title}</h1>
            {s.description && <p className="text-muted-foreground mt-3 max-w-2xl whitespace-pre-line">{s.description}</p>}
            {user && files.length > 0 && (
              <div className="mt-5 max-w-sm">
                <div className="h-1.5 bg-secondary overflow-hidden"><div className="h-full bg-primary cf-fill" style={{ width: `${(readCount / files.length) * 100}%` }} /></div>
                <p className="case-label text-[8px] mt-1">{readCount} of {files.length} read</p>
              </div>
            )}
          </header>
          {files.length === 0 ? (
            <p className="text-muted-foreground">No published files in this series yet.</p>
          ) : (
            <ol className="space-y-4">
              {files.map((f, i) => {
                const done = user && isRead(f.id);
                return (
                  <li key={f.id} className="cf-rise" style={{ animationDelay: `${i * 60}ms` }}>
                    <button type="button" onClick={() => onOpen(f)} className="case-file w-full text-left p-5 flex items-center gap-5 group hover:border-primary transition-colors">
                      <span className="font-display text-3xl text-muted-foreground w-10 shrink-0 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-xl text-foreground group-hover:text-primary transition-colors">{f.title}</span>
                        <span className="case-label text-[9px] mt-1 block">
                          {f.storyFormat === "interactive" ? "Interactive" : `${readMinutes(f.content)} min`}{f.tags.length ? ` · ${f.tags.slice(0, 2).join(" · ")}` : ""}
                        </span>
                      </span>
                      {done && <span className="flex items-center gap-1 case-label text-[9px] !text-primary shrink-0"><Check className="w-3 h-3" /> Read</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    );
  }

  const visible = list.filter((s) => filesOf(s.entries).length > 0);
  return (
    <div className="min-h-screen py-10 sm:py-16 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <header className="border-l-4 border-primary pl-6 mb-10">
          <p className="case-label text-[9px] mb-2">Connected files</p>
          <h1 className="font-display text-4xl sm:text-5xl text-foreground uppercase">Series</h1>
        </header>
        {visible.length === 0 ? (
          <p className="text-muted-foreground">No series on file yet.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((s, i) => {
              const files = filesOf(s.entries);
              const readCount = user ? files.filter((f) => isRead(f.id)).length : 0;
              const cover = s.cover_image_url || files.find((f) => f.coverImageUrl)?.coverImageUrl || null;
              return (
                <Link key={s.id} to={`/series/${s.slug}`} className="case-file p-5 flex flex-col group hover:border-primary transition-colors cf-rise" style={{ animationDelay: `${i * 70}ms` }}>
                  {cover ? (
                    <img src={cover} alt="" loading="lazy" className="w-full aspect-[16/9] object-cover grayscale group-hover:grayscale-0 transition-all duration-500 mb-4" />
                  ) : (
                    <span className="w-full aspect-[16/9] bg-secondary flex items-center justify-center mb-4 text-muted-foreground"><FileText className="w-8 h-8" /></span>
                  )}
                  <span className="case-label text-[9px]">{files.length} {files.length === 1 ? "file" : "files"}{user && readCount ? ` · ${readCount} read` : ""}</span>
                  <span className="font-display text-2xl text-foreground group-hover:text-primary transition-colors mt-1">{s.title}</span>
                  {s.description && <span className="text-sm text-muted-foreground mt-2 line-clamp-3">{s.description}</span>}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SeriesPage;
