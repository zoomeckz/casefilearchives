import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

// Admin → Readers: everyone who registered, when, how active they are, and
// their interactive cases (with a reset for broken attempts).

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const DAY = 86400000;

interface Reader {
  user_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  joined_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  provider: string;
  is_admin: boolean;
  files_read: number;
  comments: number;
  forum_posts: number;
  cases_started: number;
  cases_closed: number;
  commendations: number;
}

interface ReaderCase {
  playthrough_id: string;
  chapter_id: string;
  case_title: string;
  attempt: number;
  status: string;
  current_node: string | null;
  ending_node: string | null;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
  decisions: number;
}

async function rpc<T>(fn: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token || ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || "request_failed");
  return data as T;
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
function ago(iso: string | null) {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - Date.parse(iso)) / DAY);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  return fmtDate(iso);
}

type Sort = "joined" | "active" | "read" | "name";

export const ReadersAdmin: React.FC<{ authToken?: string }> = ({ authToken }) => {
  const [readers, setReaders] = useState<Reader[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("joined");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setReaders(await rpc<Reader[]>("admin_readers", {}, authToken)); }
    catch (e: any) { setError(e.message); }
  }, [authToken]);

  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => {
    const list = readers || [];
    const now = Date.now();
    const within = (iso: string | null, days: number) => !!iso && now - Date.parse(iso) <= days * DAY;
    return {
      total: list.length,
      week: list.filter((r) => within(r.joined_at, 7)).length,
      month: list.filter((r) => within(r.joined_at, 30)).length,
      active: list.filter((r) => within(r.last_sign_in_at, 7)).length,
      unconfirmed: list.filter((r) => !r.email_confirmed).length,
    };
  }, [readers]);

  // Sign-ups per day for the last 30 days.
  const daily = useMemo(() => {
    const days: { key: string; label: string; n: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY);
      days.push({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }), n: 0 });
    }
    const index = new Map(days.map((d, i) => [d.key, i]));
    for (const r of readers || []) {
      const i = index.get(new Date(r.joined_at).toISOString().slice(0, 10));
      if (i != null) days[i].n++;
    }
    return days;
  }, [readers]);
  const maxDaily = Math.max(1, ...daily.map((d) => d.n));

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (readers || []).filter((r) => !q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q));
    const by: Record<Sort, (a: Reader, b: Reader) => number> = {
      joined: (a, b) => b.joined_at.localeCompare(a.joined_at),
      active: (a, b) => (b.last_sign_in_at || "").localeCompare(a.last_sign_in_at || ""),
      read: (a, b) => b.files_read - a.files_read || b.cases_closed - a.cases_closed,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return [...list].sort(by[sort]);
  }, [readers, query, sort]);

  const exportCsv = () => {
    const cols: (keyof Reader)[] = ["name", "email", "joined_at", "last_sign_in_at", "email_confirmed", "provider", "files_read", "comments", "forum_posts", "cases_started", "cases_closed", "commendations"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...visible.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `readers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error) {
    return (
      <div className="p-6 border border-destructive/40 rounded-lg text-sm">
        <p className="text-foreground">Readers could not be loaded.</p>
        <p className="text-muted-foreground mt-1 text-xs">{error === "request_failed" || /admin_readers/.test(error) ? "Apply the latest database migration (20261016090000) first." : error}</p>
      </div>
    );
  }
  if (!readers) return <p className="text-muted-foreground text-sm p-6">Loading readers…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Readers</h2>
          <p className="text-sm text-muted-foreground">Everyone who has registered, newest first.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="px-3 py-1.5 border border-border rounded text-sm hover:border-primary">Refresh</button>
          <button type="button" onClick={exportCsv} className="px-3 py-1.5 border border-border rounded text-sm hover:border-primary">Export CSV</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          ["Registered readers", stats.total],
          ["New this week", stats.week],
          ["New in 30 days", stats.month],
          ["Signed in this week", stats.active],
          ["Email not confirmed", stats.unconfirmed],
        ].map(([label, value]) => (
          <div key={label as string} className="p-4 rounded-lg border border-border bg-card/40">
            <p className="text-2xl font-semibold text-foreground tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="p-4 rounded-lg border border-border bg-card/40">
        <p className="text-sm text-foreground mb-3">Sign-ups, last 30 days</p>
        <div className="flex items-end gap-[3px] h-24" role="img" aria-label="Sign-ups per day for the last 30 days">
          {daily.map((d) => (
            <div key={d.key} className="flex-1 flex flex-col justify-end h-full" title={`${d.label}: ${d.n}`}>
              <div className={`${d.n ? "bg-primary" : "bg-secondary"} rounded-sm`} style={{ height: `${d.n ? Math.max(8, (d.n / maxDaily) * 100) : 4}%` }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>{daily[0].label}</span><span>Today</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or email…"
          className="flex-1 min-w-[12rem] px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:border-primary"
        />
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="px-3 py-2 bg-background border border-border rounded text-sm">
          <option value="joined">Newest first</option>
          <option value="active">Recently signed in</option>
          <option value="read">Most read</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      <p className="text-xs text-muted-foreground">{visible.length} of {readers.length} readers</p>

      <ul className="space-y-2">
        {visible.map((r) => (
          <li key={r.user_id} className="rounded-lg border border-border bg-card/30">
            <button type="button" onClick={() => setOpen(open === r.user_id ? null : r.user_id)} className="w-full text-left p-3 sm:p-4 flex flex-wrap items-center gap-3">
              <span className="w-9 h-9 rounded-full overflow-hidden bg-secondary flex items-center justify-center text-sm shrink-0">
                {r.avatar_url ? <img src={r.avatar_url} alt="" className="w-full h-full object-cover" /> : r.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-foreground font-medium truncate">
                  {r.name}
                  {r.is_admin && <span className="ml-2 text-[10px] uppercase text-primary">admin</span>}
                  {!r.email_confirmed && <span className="ml-2 text-[10px] uppercase text-muted-foreground">unconfirmed</span>}
                </span>
                <span className="block text-xs text-muted-foreground truncate">{r.email} · joined {ago(r.joined_at)} · last seen {ago(r.last_sign_in_at)}</span>
              </span>
              <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
                <span>{r.files_read} read</span>
                <span>{r.cases_closed}/{r.cases_started} cases</span>
                <span>{r.comments} comments</span>
                <span>{r.forum_posts} posts</span>
                <span>{r.commendations} awards</span>
              </span>
            </button>
            {open === r.user_id && <ReaderDetail reader={r} authToken={authToken} />}
          </li>
        ))}
      </ul>
    </div>
  );
};

const ReaderDetail: React.FC<{ reader: Reader; authToken?: string }> = ({ reader, authToken }) => {
  const [cases, setCases] = useState<ReaderCase[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setCases(await rpc<ReaderCase[]>("admin_reader_cases", { _user_id: reader.user_id }, authToken)); }
    catch { setCases([]); }
  }, [reader.user_id, authToken]);
  useEffect(() => { void load(); }, [load]);

  // One row per case; the newest attempt first.
  const byCase = useMemo(() => {
    const map = new Map<string, ReaderCase[]>();
    for (const c of cases || []) map.set(c.chapter_id, [...(map.get(c.chapter_id) || []), c]);
    return [...map.values()];
  }, [cases]);

  const reset = async (chapterId: string, title: string) => {
    if (!window.confirm(`Reset ${reader.name}'s progress in “${title}”? Every attempt, decision and hint for this case is deleted and they start over.`)) return;
    setBusy(chapterId);
    try {
      const n = await rpc<number>("admin_reset_case", { _user_id: reader.user_id, _chapter_id: chapterId }, authToken);
      toast.success(`Reset: ${n} attempt${n === 1 ? "" : "s"} removed`);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Reset failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="border-t border-border p-3 sm:p-4 space-y-4 text-sm">
      <div className="grid sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
        <span>Joined: <span className="text-foreground">{fmtDate(reader.joined_at)}</span></span>
        <span>Last sign-in: <span className="text-foreground">{fmtDate(reader.last_sign_in_at)}</span></span>
        <span>Sign-in method: <span className="text-foreground">{reader.provider}</span></span>
      </div>
      <a href={`/user/${reader.user_id}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Open public profile ↗</a>

      <div>
        <p className="text-foreground font-medium mb-2">Interactive cases</p>
        {!cases ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : byCase.length === 0 ? (
          <p className="text-xs text-muted-foreground">No interactive cases started.</p>
        ) : (
          <ul className="space-y-2">
            {byCase.map((attempts) => {
              const latest = attempts[0];
              return (
                <li key={latest.chapter_id} className="border border-border rounded p-3 flex flex-wrap items-center gap-3">
                  <span className="flex-1 min-w-[12rem]">
                    <span className="block text-foreground">{latest.case_title}</span>
                    <span className="block text-xs text-muted-foreground">
                      Attempt {latest.attempt} · {latest.status === "in_progress" ? `in progress at “${latest.current_node}”` : latest.completed_at ? `closed ${fmtDate(latest.completed_at)} · ending “${latest.ending_node}”` : latest.status}
                      {" · "}{latest.decisions} decision{latest.decisions === 1 ? "" : "s"}
                      {attempts.length > 1 && ` · ${attempts.length} attempts in total`}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busy === latest.chapter_id}
                    onClick={() => reset(latest.chapter_id, latest.case_title)}
                    className="px-3 py-1.5 border border-destructive/50 text-destructive rounded text-xs hover:bg-destructive/10 disabled:opacity-50"
                  >
                    {busy === latest.chapter_id ? "Resetting…" : "Reset progress"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ReadersAdmin;
