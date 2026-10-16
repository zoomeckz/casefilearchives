import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { Check, ScrollText } from "lucide-react";
import { Chapter } from "@/hooks/useChapters";
import type { AuthUser } from "@/hooks/useAuth";
import { DISPATCH_STATUS_LABEL, useDispatches, type Dispatch } from "@/lib/dispatches";
import { NoIndex } from "@/hooks/useDynamicSeo";

// Dispatches: stories told in chapters. /dispatches lists them; /dispatches/<slug>
// shows one with its chapters in order.

interface Props {
  chapters: Chapter[];
  slug: string | null;
  user: AuthUser | null;
  isRead: (chapterId: string) => boolean;
  onOpen: (chapter: Chapter) => void;
}

const minutes = (html: string) => Math.max(1, Math.ceil((html || "").replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length / 220));

function chaptersOf(chapters: Chapter[], id: string) {
  return chapters.filter((c) => c.storyFormat === "dispatch" && c.dispatchId === id).sort((a, b) => (a.dispatchPart ?? 0) - (b.dispatchPart ?? 0));
}

const Cover: React.FC<{ d: Dispatch; className?: string }> = ({ d, className = "" }) =>
  d.cover_image_url ? (
    <img src={d.cover_image_url} alt="" loading="lazy" className={`object-cover ${className}`} />
  ) : (
    <span className={`flex items-center justify-center bg-secondary text-muted-foreground ${className}`}><ScrollText className="w-8 h-8" /></span>
  );

export const DispatchesPage: React.FC<Props> = ({ chapters, slug, user, isRead, onOpen }) => {
  const dispatches = useDispatches();
  const visible = useMemo(() => (dispatches || []).filter((d) => chaptersOf(chapters, d.id).length > 0), [dispatches, chapters]);

  if (!dispatches) return <div className="min-h-screen" />;

  if (slug) {
    const d = dispatches.find((x) => x.slug === slug);
    const list = d ? chaptersOf(chapters, d.id) : [];
    if (!d || !list.length) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 py-24">
          <NoIndex title="Dispatch not found — Case Files" />
          <p className="case-label text-[10px] mb-3">DISPATCHES</p>
          <h1 className="font-display text-3xl uppercase text-foreground mb-6">This dispatch could not be found</h1>
          <Link to="/dispatches" className="px-6 py-2 border border-border text-muted-foreground hover:text-primary hover:border-primary text-xs uppercase tracking-wider">All dispatches</Link>
        </div>
      );
    }
    const firstUnread = user ? list.find((c) => !isRead(c.id)) : undefined;
    const next = firstUnread ?? list[0];
    return (
      <div className="min-h-screen py-10 sm:py-16 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <Link to="/dispatches" className="case-label text-[9px] hover:!text-primary">← All dispatches</Link>
          <header className="mt-6 mb-10 grid sm:grid-cols-[10rem_1fr] gap-6 items-start">
            <Cover d={d} className="w-40 aspect-[3/4] border border-border" />
            <div className="border-l-4 border-primary pl-6">
              <p className="case-label text-[9px] mb-2">Dispatches · {DISPATCH_STATUS_LABEL[d.status]} · {list.length} {list.length === 1 ? "chapter" : "chapters"}</p>
              <h1 className="font-display text-4xl sm:text-5xl uppercase text-foreground">{d.title}</h1>
              {d.description && <p className="text-foreground/80 mt-4 max-w-prose">{d.description}</p>}
              <button type="button" onClick={() => onOpen(next)} className="mt-6 px-5 py-2.5 bg-primary text-primary-foreground text-xs uppercase tracking-widest hover:bg-primary/90">
                {firstUnread && firstUnread !== list[0] ? `Continue · Chapter ${firstUnread.dispatchPart}` : "Start reading"} →
              </button>
            </div>
          </header>

          <ol className="border-t border-border">
            {list.map((c) => {
              const read = !!user && isRead(c.id);
              return (
                <li key={c.id} className="border-b border-border">
                  <button type="button" onClick={() => onOpen(c)} className="w-full text-left py-4 flex items-center gap-4 group">
                    <span className="case-label text-[10px] w-20 shrink-0">Chapter {c.dispatchPart}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-display text-lg uppercase text-foreground group-hover:text-primary transition-colors truncate">{c.title}</span>
                      <span className="block text-xs text-muted-foreground">{new Date(c.publishedAt).toLocaleDateString()} · ~{minutes(c.content)} min</span>
                    </span>
                    {read && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success text-success-foreground" title="Read"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-10 sm:py-16 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="border-l-4 border-primary pl-6 mb-10">
          <p className="case-label text-[9px] mb-2">Serialised · one chapter at a time</p>
          <h1 className="font-display text-4xl sm:text-5xl text-foreground uppercase">Dispatches</h1>
          <p className="text-muted-foreground mt-3 max-w-prose">Longer stories, told in chapters. New chapters arrive as they are written.</p>
        </div>

        {visible.length === 0 ? (
          <div className="case-file p-8 text-center text-muted-foreground">No dispatches yet.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-x-6 gap-y-9">
            {visible.map((d) => {
              const list = chaptersOf(chapters, d.id);
              const latest = list[list.length - 1];
              return (
                <Link key={d.id} to={`/dispatches/${d.slug}`} className="case-file group p-5 flex gap-5 items-start">
                  <Cover d={d} className="hidden sm:flex w-24 aspect-[3/4] border border-border shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="case-label text-[9px] block mb-2">{DISPATCH_STATUS_LABEL[d.status]} · {list.length} {list.length === 1 ? "chapter" : "chapters"}</span>
                    <span className="block font-display text-2xl uppercase text-foreground group-hover:text-primary transition-colors">{d.title}</span>
                    {d.description && <span className="block text-sm text-muted-foreground mt-2 line-clamp-3">{d.description}</span>}
                    {latest && <span className="block case-label text-[9px] mt-4">Latest: Chapter {latest.dispatchPart} · {latest.title}</span>}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

/** Home page strip: the newest dispatch chapters. */
export const DispatchesTeaser: React.FC<{ chapters: Chapter[]; onOpen: (c: Chapter) => void }> = ({ chapters, onOpen }) => {
  const dispatches = useDispatches();
  const latest = useMemo(
    () => chapters.filter((c) => c.storyFormat === "dispatch" && c.dispatchId).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 3),
    [chapters],
  );
  if (!latest.length || !dispatches) return null;
  return (
    <section className="py-14 sm:py-20 px-4 sm:px-6 border-t border-border">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between border-b border-border pb-4 mb-10">
          <div>
            <p className="case-label text-[10px] mb-2">Serialised</p>
            <h2 className="font-display text-2xl sm:text-3xl text-foreground uppercase">Dispatches</h2>
          </div>
          <Link to="/dispatches" className="case-label text-[10px] hover:text-primary">All dispatches →</Link>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {latest.map((c) => {
            const d = dispatches.find((x) => x.id === c.dispatchId);
            return (
              <button key={c.id} type="button" onClick={() => onOpen(c)} className="case-file group p-5 text-left">
                <span className="case-label text-[9px] block mb-3">{d?.title ?? "Dispatch"} · Chapter {c.dispatchPart}</span>
                <span className="block font-display text-xl text-foreground group-hover:text-primary transition-colors">{c.title}</span>
                <span className="block text-xs text-muted-foreground mt-3">{new Date(c.publishedAt).toLocaleDateString()} · ~{minutes(c.content)} min</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default DispatchesPage;
