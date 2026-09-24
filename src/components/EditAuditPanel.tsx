import { useState, useEffect, useCallback } from "react";
import { dbFetch } from "@/lib/dbFetch";
import { toast } from "sonner";
import { Loader2, RotateCcw, FileWarning, CheckCircle2, History } from "lucide-react";

interface AuditEntry {
  id: string;
  chapter_id: string;
  chapter_number: number | null;
  actor_id: string | null;
  action: string;
  anchor_text: string | null;
  anchor_found: boolean;
  migration_id: string | null;
  note: string | null;
  created_at: string;
}

interface SafeReplaceForm {
  chapterId: string;
  anchor: string;
  replacement: string;
  migrationId: string;
  note: string;
}

interface ChapterRow { id: string; chapter_number: number; title: string; is_archived: boolean; }

interface EditAuditPanelProps {
  authToken?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>, token?: string): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token || SUPABASE_KEY}`,
      },
      body: JSON.stringify(args),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { data: null, error: (json?.message as string) || `HTTP ${res.status}` };
    return { data: json as T, error: null };
  } catch (e: any) {
    return { data: null, error: e?.message || "network error" };
  }
}

export const EditAuditPanel = ({ authToken }: EditAuditPanelProps) => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterChapter, setFilterChapter] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [form, setForm] = useState<SafeReplaceForm>({
    chapterId: "",
    anchor: "",
    replacement: "",
    migrationId: "",
    note: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [chapsRes, auditRes] = await Promise.all([
      dbFetch<ChapterRow[]>("chapters", {
        select: "id,chapter_number,title,is_archived",
        order: "published_at.desc",
        token: authToken,
      }),
      dbFetch<AuditEntry[]>("chapter_edit_audit", {
        select: "id,chapter_id,chapter_number,actor_id,action,anchor_text,anchor_found,migration_id,note,created_at",
        order: "created_at.desc",
        filters: "limit=200",
        token: authToken,
      }),
    ]);
    if (chapsRes.data) setChapters(chapsRes.data);
    if (auditRes.data) setEntries(auditRes.data);
    if (auditRes.error) toast.error(`Audit load failed: ${auditRes.error}`);
    setLoading(false);
  }, [authToken]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filtered = filterChapter
    ? entries.filter(e => e.chapter_id === filterChapter)
    : entries;

  const handleSafeReplace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.chapterId || !form.anchor || !form.replacement) {
      toast.error("Story, anchor, and replacement are required");
      return;
    }
    setSubmitting(true);
    const { data, error } = await rpc<{ ok: boolean; reason?: string }>("safe_replace_chapter_content", {
      _chapter_id: form.chapterId,
      _anchor: form.anchor,
      _replacement: form.replacement,
      _migration_id: form.migrationId || null,
      _note: form.note || null,
    }, authToken);
    setSubmitting(false);

    if (error) { toast.error(error); return; }
    if (data && data.ok === false) {
      toast.warning(`Anchor not found — content unchanged. Logged as anchor_miss.`);
    } else {
      toast.success("Replacement applied; previous version snapshotted.");
      setForm(f => ({ ...f, anchor: "", replacement: "", note: "" }));
    }
    loadAll();
  };

  const handleRollback = async (entry: AuditEntry) => {
    const item = chapters.find((chapter) => chapter.id === entry.chapter_id);
    const itemLabel = item?.is_archived ? `chapter ${item.chapter_number}` : `story “${item?.title || 'Untitled'}”`;
    if (!confirm(`Restore ${itemLabel} to the snapshot from ${new Date(entry.created_at).toLocaleString()}?`)) return;
    setBusyId(entry.id);
    const { error } = await rpc("rollback_chapter_to_audit_entry", { _audit_id: entry.id }, authToken);
    setBusyId(null);
    if (error) { toast.error(error); return; }
    toast.success("Content restored.");
    loadAll();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl md:text-3xl text-accent mb-2 flex items-center gap-2">
          <History className="w-6 h-6" /> Edit Audit
        </h1>
        <p className="text-muted-foreground text-sm">
          Every story and legacy chapter edit made here is logged with a snapshot, so you can restore individual changes.
        </p>
      </div>

      <form onSubmit={handleSafeReplace} className="p-4 md:p-6 bg-card/50 rounded-xl border border-border space-y-4">
        <h2 className="font-display text-lg text-foreground">Safe replace</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm text-muted-foreground">
            Story or legacy chapter
            <select
              value={form.chapterId}
              onChange={(e) => setForm(f => ({ ...f, chapterId: e.target.value }))}
              className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-md text-foreground"
            >
              <option value="">— select —</option>
              {chapters.map(c => (
                <option key={c.id} value={c.id}>{c.is_archived ? `Chapter ${c.chapter_number} — ` : ''}{c.title}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-muted-foreground">
            Migration id (optional)
            <input
              type="text"
              value={form.migrationId}
              onChange={(e) => setForm(f => ({ ...f, migrationId: e.target.value }))}
              placeholder="e.g. ch53-rest-stop-v2"
              className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-md text-foreground"
            />
          </label>
        </div>
        <label className="text-sm text-muted-foreground block">
          Anchor (exact text to find — must match a single contiguous span)
          <textarea
            value={form.anchor}
            onChange={(e) => setForm(f => ({ ...f, anchor: e.target.value }))}
            rows={4}
            className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-md text-foreground font-mono text-xs"
          />
        </label>
        <label className="text-sm text-muted-foreground block">
          Replacement
          <textarea
            value={form.replacement}
            onChange={(e) => setForm(f => ({ ...f, replacement: e.target.value }))}
            rows={4}
            className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-md text-foreground font-mono text-xs"
          />
        </label>
        <label className="text-sm text-muted-foreground block">
          Note (optional)
          <input
            type="text"
            value={form.note}
            onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
            className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-md text-foreground"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Apply (auto-rollback if anchor missing)
        </button>
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-display text-lg text-foreground">Recent edits</h2>
          <div className="flex items-center gap-2">
            <select
              value={filterChapter}
              onChange={(e) => setFilterChapter(e.target.value)}
              className="px-3 py-1.5 bg-background border border-border rounded-md text-foreground text-sm"
            >
              <option value="">All stories and legacy chapters</option>
              {chapters.map(c => (
                <option key={c.id} value={c.id}>{c.is_archived ? `Chapter ${c.chapter_number} — ` : ''}{c.title}</option>
              ))}
            </select>
            <button
              onClick={loadAll}
              className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-md text-sm"
            >
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm">No audit entries yet.</p>
        ) : (
          <ul className="space-y-2">
            {filtered.map(entry => {
              const isMiss = entry.action === "anchor_miss" || !entry.anchor_found;
              return (
                <li
                  key={entry.id}
                  className="p-3 md:p-4 bg-card/50 rounded-lg border border-border flex items-start gap-3"
                >
                  <div className={`mt-0.5 ${isMiss ? "text-destructive" : entry.action === "rollback" ? "text-accent" : "text-primary"}`}>
                    {isMiss ? <FileWarning className="w-5 h-5" /> : entry.action === "rollback" ? <RotateCcw className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2 text-sm">
                      <span className="font-medium text-foreground">
                         {(() => {
                           const item = chapters.find((chapter) => chapter.id === entry.chapter_id);
                           return item?.is_archived ? `Ch. ${item.chapter_number}` : item?.title || 'Story';
                         })()}
                      </span>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        {entry.action}
                      </span>
                      {entry.migration_id && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-mono">
                          {entry.migration_id}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </div>
                    {entry.anchor_text && (
                      <p className="text-xs text-muted-foreground mt-1 font-mono line-clamp-2 break-words">
                        anchor: {entry.anchor_text.slice(0, 240)}{entry.anchor_text.length > 240 ? "…" : ""}
                      </p>
                    )}
                    {entry.note && (
                      <p className="text-xs text-muted-foreground italic mt-1">{entry.note}</p>
                    )}
                    {entry.action === "replace" && (
                      <button
                        onClick={() => handleRollback(entry)}
                        disabled={busyId === entry.id}
                        className="mt-2 inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground disabled:opacity-50"
                      >
                        {busyId === entry.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                        Restore previous version
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};