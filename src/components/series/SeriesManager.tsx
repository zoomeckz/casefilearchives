import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchSeries, seriesAdmin, uniqueSeriesSlug, type Series } from "@/lib/series";

interface Props {
  /** The story being edited; null while it has not been published yet. */
  chapterId: string | null | undefined;
  authToken?: string;
}

const field = "w-full px-3 py-2 bg-background border border-border text-foreground text-sm focus:outline-none focus:border-primary";
const smallBtn = "px-3 py-1.5 border border-border text-xs hover:border-primary hover:text-primary transition-colors disabled:opacity-40";

/** Admin: put the story into series, set its place, create and edit series. */
export const SeriesManager: React.FC<Props> = ({ chapterId, authToken }) => {
  const [list, setList] = useState<Series[]>([]);
  const [busy, setBusy] = useState(false);
  const [addTo, setAddTo] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const reload = async () => setList(await fetchSeries(true));
  useEffect(() => { void reload(); }, []);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try { await fn(); await reload(); if (ok) toast.success(ok); }
    catch (e: any) { toast.error(e.message || "Could not update the series."); }
    finally { setBusy(false); }
  };

  const memberships = chapterId ? list.filter((s) => s.entries.some((e) => e.chapter_id === chapterId)) : [];
  const others = list.filter((s) => !memberships.includes(s));
  const nextPosition = (s: Series) => (s.entries.reduce((m, e) => Math.max(m, e.position), 0) || 0) + 1;

  const addToSeries = (s: Series) => chapterId && run(() => seriesAdmin.setEntry(authToken, s.id, chapterId!, nextPosition(s)), `Added to “${s.title}”`);

  const createSeries = () => run(async () => {
    const title = newTitle.trim();
    if (!title) return;
    const created = await seriesAdmin.create(authToken, {
      slug: uniqueSeriesSlug(title, list.map((s) => s.slug)),
      title,
      description: newDescription.trim() || null,
    });
    if (created && chapterId) await seriesAdmin.setEntry(authToken, created.id, chapterId, 1);
    setNewTitle("");
    setNewDescription("");
  }, "Series created");

  return (
    <div className="space-y-4">
      <div>
        <span className="block text-sm text-muted-foreground mb-1">Series</span>
        <p className="text-xs text-muted-foreground">Group related files. Readers see “File 2 of 4” and previous / next links, and every series has its own page at /series.</p>
      </div>

      {!chapterId ? (
        <p className="text-xs text-muted-foreground italic">Publish the story first, then add it to a series here.</p>
      ) : (
        <>
          {memberships.length === 0 && <p className="text-xs text-muted-foreground italic">Not in any series.</p>}
          {memberships.map((s) => {
            const entry = s.entries.find((e) => e.chapter_id === chapterId)!;
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-2 border border-border px-3 py-2">
                <span className="text-sm text-foreground flex-1 min-w-[10rem]">{s.title}</span>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Position
                  <input
                    type="number"
                    min={1}
                    defaultValue={entry.position}
                    onBlur={(e) => {
                      const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                      if (v !== entry.position) void run(() => seriesAdmin.setEntry(authToken, s.id, chapterId!, v), "Position saved");
                    }}
                    className={`${field} w-20`}
                  />
                </label>
                <button type="button" disabled={busy} onClick={() => run(() => seriesAdmin.removeEntry(authToken, s.id, chapterId!), "Removed from series")} className={smallBtn}>
                  Remove
                </button>
              </div>
            );
          })}

          {others.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select value={addTo} onChange={(e) => setAddTo(e.target.value)} className={`${field} w-auto flex-1 min-w-[12rem]`}>
                <option value="">Add to an existing series…</option>
                {others.map((s) => <option key={s.id} value={s.id}>{s.title} ({s.entries.length} files)</option>)}
              </select>
              <button
                type="button"
                disabled={busy || !addTo}
                onClick={() => { const s = others.find((x) => x.id === addTo); if (s) { void addToSeries(s); setAddTo(""); } }}
                className={smallBtn}
              >
                Add
              </button>
            </div>
          )}
        </>
      )}

      <details className="border border-border p-3">
        <summary className="cursor-pointer text-xs text-muted-foreground select-none">Create a series{list.length ? " · edit series" : ""}</summary>
        <div className="mt-3 space-y-3">
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Series title" maxLength={120} className={field} />
          <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Short description (optional)" rows={2} maxLength={2000} className={field} />
          <button type="button" disabled={busy || !newTitle.trim()} onClick={createSeries} className={smallBtn}>
            {chapterId ? "Create and add this story" : "Create series"}
          </button>

          {list.length > 0 && (
            <ul className="pt-3 border-t border-border space-y-2">
              {list.map((s) => (
                <li key={s.id} className="text-sm">
                  {editing === s.id ? (
                    <SeriesEditRow
                      s={s}
                      busy={busy}
                      onSave={(patch) => run(() => seriesAdmin.update(authToken, s.id, patch), "Series saved").then(() => setEditing(null))}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex-1 min-w-[10rem]">{s.title} <span className="text-xs text-muted-foreground">/series/{s.slug} · {s.entries.length} files</span></span>
                      <button type="button" onClick={() => setEditing(s.id)} className={smallBtn}>Edit</button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { if (window.confirm(`Delete the series “${s.title}”? The stories themselves are kept.`)) void run(() => seriesAdmin.remove(authToken, s.id), "Series deleted"); }}
                        className={`${smallBtn} hover:border-destructive hover:text-destructive`}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
};

const SeriesEditRow: React.FC<{
  s: Series;
  busy: boolean;
  onSave: (patch: { title: string; description: string | null; sort_order: number }) => void;
  onCancel: () => void;
}> = ({ s, busy, onSave, onCancel }) => {
  const [title, setTitle] = useState(s.title);
  const [description, setDescription] = useState(s.description || "");
  const [order, setOrder] = useState(s.sort_order);
  return (
    <div className="space-y-2 border border-border p-3">
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={field} />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={2000} className={field} />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        Order on the series page
        <input type="number" value={order} onChange={(e) => setOrder(parseInt(e.target.value, 10) || 0)} className={`${field} w-20`} />
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={busy || !title.trim()} onClick={() => onSave({ title: title.trim(), description: description.trim() || null, sort_order: order })} className={smallBtn}>Save</button>
        <button type="button" onClick={onCancel} className={smallBtn}>Cancel</button>
      </div>
    </div>
  );
};

export default SeriesManager;
