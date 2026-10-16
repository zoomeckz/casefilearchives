import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DISPATCH_STATUS_LABEL, dispatchAdmin, fetchDispatches, uniqueDispatchSlug, type Dispatch, type DispatchStatus } from "@/lib/dispatches";

// Admin → Dispatches: create and edit dispatches (stories told in chapters) and
// open their chapters in the story editor.

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface ChapterRow { id: string; title: string; dispatch_id: string; dispatch_part: number | null; published_at: string; scheduled_at: string | null }

interface Props {
  authToken?: string;
  onEditChapter: (chapterId: string) => void;
  onNewChapter: (dispatchId: string, part: number) => void;
}

const field = "w-full min-w-0 px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:border-primary";
const btn = "px-3 py-1.5 border border-border rounded text-xs hover:border-primary disabled:opacity-50";
const primary = "px-3 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/85 disabled:opacity-50";

export const DispatchesAdmin: React.FC<Props> = ({ authToken, onEditChapter, onNewChapter }) => {
  const [list, setList] = useState<Dispatch[] | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const load = useCallback(async () => {
    try {
      setList(await fetchDispatches(true));
      const res = await fetch(`${SUPA_URL}/rest/v1/chapters?select=id,title,dispatch_id,dispatch_part,published_at,scheduled_at&story_format=eq.dispatch&order=dispatch_part.asc`, {
        headers: { apikey: ANON, Authorization: `Bearer ${authToken || ANON}` },
      });
      if (!res.ok) throw new Error("request_failed");
      setChapters(await res.json());
    } catch {
      setError("Apply the latest database migration (20261019090000) first.");
    }
  }, [authToken]);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    const title = newTitle.trim();
    if (!title) return;
    try {
      await dispatchAdmin.create({ title, slug: uniqueDispatchSlug(title, (list || []).map((d) => d.slug)), sort_order: (list || []).length });
      setNewTitle("");
      toast.success("Dispatch created");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Could not create the dispatch");
    }
  };

  if (error) return <div className="p-6 border border-destructive/40 rounded-lg text-sm text-foreground">{error}</div>;
  if (!list) return <p className="text-muted-foreground text-sm p-6">Loading…</p>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Dispatches</h2>
        <p className="text-sm text-muted-foreground">Stories told in chapters. They have their own page (/dispatches) and never mix with Case Files or Interactive Case Files.</p>
      </div>

      <div className="flex gap-2">
        <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void create(); }} placeholder="Title of a new dispatch" className={field} />
        <button type="button" onClick={create} disabled={!newTitle.trim()} className={`${primary} shrink-0`}>Create dispatch</button>
      </div>

      {list.length === 0 && <p className="text-sm text-muted-foreground">No dispatches yet.</p>}

      {list.map((d) => (
        <DispatchCard key={d.id} d={d} chapters={chapters.filter((c) => c.dispatch_id === d.id)} onSaved={load} onEditChapter={onEditChapter} onNewChapter={onNewChapter} />
      ))}
    </div>
  );
};

const DispatchCard: React.FC<{
  d: Dispatch;
  chapters: ChapterRow[];
  onSaved: () => Promise<void>;
  onEditChapter: (id: string) => void;
  onNewChapter: (dispatchId: string, part: number) => void;
}> = ({ d, chapters, onSaved, onEditChapter, onNewChapter }) => {
  const [form, setForm] = useState({ title: d.title, slug: d.slug, description: d.description || "", cover_image_url: d.cover_image_url || "", status: d.status });
  const [busy, setBusy] = useState(false);
  useEffect(() => { setForm({ title: d.title, slug: d.slug, description: d.description || "", cover_image_url: d.cover_image_url || "", status: d.status }); }, [d]);

  const dirty = form.title !== d.title || form.slug !== d.slug || form.description !== (d.description || "") || form.cover_image_url !== (d.cover_image_url || "") || form.status !== d.status;
  const nextPart = Math.max(0, ...chapters.map((c) => c.dispatch_part || 0)) + 1;

  const save = async () => {
    setBusy(true);
    try {
      await dispatchAdmin.update(d.id, {
        title: form.title.trim() || d.title,
        slug: form.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || d.slug,
        description: form.description.trim() || null,
        cover_image_url: form.cover_image_url.trim() || null,
        status: form.status,
      });
      toast.success("Dispatch saved");
      await onSaved();
    } catch (e: any) {
      toast.error(/duplicate key/.test(e?.message || "") ? "Another dispatch already uses that address." : e?.message || "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete the dispatch "${d.title}"? Its ${chapters.length} chapter(s) stay, but no longer belong to a dispatch.`)) return;
    try {
      await dispatchAdmin.remove(d.id);
      toast.success("Dispatch deleted");
      await onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Could not delete");
    }
  };

  return (
    <section className="p-4 sm:p-5 rounded-lg border border-border bg-card/40 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-muted-foreground">Title</span>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={field} />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">Address: /dispatches/…</span>
          <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className={`${field} font-mono`} />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs text-muted-foreground">Description (shown on the dispatch page)</span>
          <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={field} />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">Cover image address (optional)</span>
          <input value={form.cover_image_url} onChange={(e) => setForm({ ...form, cover_image_url: e.target.value })} className={field} placeholder="https://…" />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">Status</span>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as DispatchStatus })} className={field}>
            {(Object.keys(DISPATCH_STATUS_LABEL) as DispatchStatus[]).map((s) => <option key={s} value={s}>{DISPATCH_STATUS_LABEL[s]}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={!dirty || busy} className={primary}>{busy ? "Saving…" : "Save"}</button>
        <a href={`/dispatches/${d.slug}`} target="_blank" rel="noreferrer" className={btn}>Open page ↗</a>
        <button type="button" onClick={remove} className={`${btn} text-destructive`}>Delete</button>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-sm font-medium text-foreground">Chapters</p>
          <button type="button" onClick={() => onNewChapter(d.id, nextPart)} className={primary}>+ Chapter {nextPart}</button>
        </div>
        {chapters.length === 0 ? (
          <p className="text-xs text-muted-foreground">No chapters yet.</p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded">
            {chapters.map((c) => {
              const scheduled = c.scheduled_at && Date.parse(c.scheduled_at) > Date.now();
              return (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="case-label text-[9px] w-20 shrink-0">Chapter {c.dispatch_part ?? "?"}</span>
                  <span className="flex-1 min-w-0 truncate text-foreground">{c.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{scheduled ? `Scheduled ${new Date(c.scheduled_at!).toLocaleDateString()}` : new Date(c.published_at).toLocaleDateString()}</span>
                  <button type="button" onClick={() => onEditChapter(c.id)} className={btn}>Edit</button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};

export default DispatchesAdmin;
