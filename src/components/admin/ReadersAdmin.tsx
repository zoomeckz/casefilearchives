import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { dbAuthEmail } from "@/lib/dbFetch";

// Admin → Readers.
//   Overview: how many readers there are, who is new, sign-ups per day.
//   Manage readers: every account, with name/email edits, email confirmation,
//   password reset, suspension, progress resets, awards and account deletion.

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

interface ReaderDetailData {
  user_id: string;
  email: string;
  name: string;
  bio: string | null;
  joined_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  provider: string;
  banned_until: string | null;
  name_changed_at: string | null;
  is_admin: boolean;
  commendations: { key: string; unlocked_at: string }[];
}

interface CatalogueEntry { key: string; title: string; category: string; points: number }

// The award catalogue is the same for every reader: load it once per visit.
let catalogueCache: Promise<CatalogueEntry[]> | null = null;
const loadCatalogue = () =>
  (catalogueCache ??= fetch(`${SUPA_URL}/rest/v1/commendations?select=key,title,category,points&order=sort_order`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })
    .then((r) => (r.ok ? r.json() : []))
    .then((rows) => (Array.isArray(rows) ? rows : []))
    .catch(() => { catalogueCache = null; return []; }));

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

const ERRORS: Record<string, string> = {
  name_taken: "That username is already taken.",
  email_taken: "Another account already uses that email address.",
  invalid_email: "That email address doesn't look right.",
  cannot_delete_admin: "Admin accounts can't be deleted here.",
  cannot_suspend_admin: "Admin accounts can't be suspended.",
  admin_only: "Only admins can do this.",
  not_found: "This account no longer exists.",
};
const explain = (e: any) => ERRORS[e?.message] || (/duplicate key/i.test(e?.message || "") ? ERRORS.name_taken : e?.message || "Something went wrong.");

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
function ago(iso: string | null) {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - Date.parse(iso)) / DAY);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  return fmtDate(iso);
}
const suspended = (iso: string | null) => !!iso && Date.parse(iso) > Date.now();

type Sort = "joined" | "active" | "read" | "name";
type Mode = "overview" | "manage";

function useReaders(authToken?: string) {
  const [readers, setReaders] = useState<Reader[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try { setReaders(await rpc<Reader[]>("admin_readers", {}, authToken)); }
    catch (e: any) { setError(e.message); }
  }, [authToken]);
  useEffect(() => { void load(); }, [load]);
  return { readers, error, load };
}

const Avatar: React.FC<{ r: { avatar_url?: string | null; name: string } }> = ({ r }) => (
  <span className="w-9 h-9 rounded-full overflow-hidden bg-secondary flex items-center justify-center text-sm shrink-0">
    {r.avatar_url ? <img src={r.avatar_url} alt="" className="w-full h-full object-cover" /> : r.name.charAt(0).toUpperCase()}
  </span>
);

const btn = "px-3 py-1.5 border border-border rounded text-xs hover:border-primary disabled:opacity-50";
const dangerBtn = "px-3 py-1.5 border border-destructive/50 text-destructive rounded text-xs hover:bg-destructive/10 disabled:opacity-50";
const inputCls = "w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:border-primary";

export const ReadersAdmin: React.FC<{ authToken?: string; mode?: Mode; onManage?: (userId?: string) => void }> = ({ authToken, mode = "overview", onManage }) => {
  const { readers, error, load } = useReaders(authToken);

  if (error) {
    return (
      <div className="p-6 border border-destructive/40 rounded-lg text-sm">
        <p className="text-foreground">Readers could not be loaded.</p>
        <p className="text-muted-foreground mt-1 text-xs">{error === "request_failed" || /admin_reader/.test(error) ? "Apply the latest database migrations first." : error}</p>
      </div>
    );
  }
  if (!readers) return <p className="text-muted-foreground text-sm p-6">Loading readers…</p>;

  return mode === "manage"
    ? <ManageReaders readers={readers} authToken={authToken} reload={load} />
    : <Overview readers={readers} reload={load} onManage={onManage} />;
};

// ── Overview ─────────────────────────────────────────────────────────────────

const Overview: React.FC<{ readers: Reader[]; reload: () => void; onManage?: (userId?: string) => void }> = ({ readers, reload, onManage }) => {
  const stats = useMemo(() => {
    const now = Date.now();
    const within = (iso: string | null, days: number) => !!iso && now - Date.parse(iso) <= days * DAY;
    return {
      total: readers.length,
      week: readers.filter((r) => within(r.joined_at, 7)).length,
      month: readers.filter((r) => within(r.joined_at, 30)).length,
      active: readers.filter((r) => within(r.last_sign_in_at, 7)).length,
      unconfirmed: readers.filter((r) => !r.email_confirmed).length,
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
    for (const r of readers) {
      const i = index.get(new Date(r.joined_at).toISOString().slice(0, 10));
      if (i != null) days[i].n++;
    }
    return days;
  }, [readers]);
  const maxDaily = Math.max(1, ...daily.map((d) => d.n));
  const newest = useMemo(() => [...readers].sort((a, b) => b.joined_at.localeCompare(a.joined_at)).slice(0, 8), [readers]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Readers</h2>
          <p className="text-sm text-muted-foreground">Who has registered and how active they are.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={reload} className={btn}>Refresh</button>
          {onManage && <button type="button" onClick={() => onManage()} className={btn}>Manage readers →</button>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {([
          ["Registered readers", stats.total],
          ["New this week", stats.week],
          ["New in 30 days", stats.month],
          ["Signed in this week", stats.active],
          ["Email not confirmed", stats.unconfirmed],
        ] as [string, number][]).map(([label, value]) => (
          <div key={label} className="p-4 rounded-lg border border-border bg-card/40">
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

      <div className="p-4 rounded-lg border border-border bg-card/40">
        <p className="text-sm text-foreground mb-3">Newest readers</p>
        <ul className="divide-y divide-border">
          {newest.map((r) => (
            <li key={r.user_id}>
              <button type="button" onClick={() => onManage?.(r.user_id)} className="w-full text-left py-2.5 flex items-center gap-3 hover:text-primary">
                <Avatar r={r} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-foreground truncate">
                    {r.name}
                    {!r.email_confirmed && <span className="ml-2 text-[10px] uppercase text-muted-foreground">unconfirmed</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground truncate">{r.email}</span>
                </span>
                <span className="text-xs text-muted-foreground shrink-0">{ago(r.joined_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// ── Manage readers ───────────────────────────────────────────────────────────

const ManageReaders: React.FC<{ readers: Reader[]; authToken?: string; reload: () => Promise<void> | void }> = ({ readers, authToken, reload }) => {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("joined");
  const [open, setOpen] = useState<string | null>(() => new URLSearchParams(window.location.search).get("reader"));
  // Opened from the overview: bring that reader into view.
  useEffect(() => {
    if (open) document.getElementById(`reader-${open}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = readers.filter((r) => !q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q));
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Manage readers</h2>
          <p className="text-sm text-muted-foreground">Open a reader to edit their account, progress and awards.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void reload()} className={btn}>Refresh</button>
          <button type="button" onClick={exportCsv} className={btn}>Export CSV</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email…" className={`${inputCls} flex-1 min-w-[12rem] w-auto`} />
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
          <li key={r.user_id} id={`reader-${r.user_id}`} className={`rounded-lg border bg-card/30 ${open === r.user_id ? "border-primary/60" : "border-border"}`}>
            <button type="button" onClick={() => setOpen(open === r.user_id ? null : r.user_id)} className="w-full text-left p-3 sm:p-4 flex flex-wrap items-center gap-3">
              <Avatar r={r} />
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
            {open === r.user_id && (
              <ReaderEditor userId={r.user_id} authToken={authToken} onChanged={() => void reload()} onDeleted={() => { setOpen(null); void reload(); }} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode; tone?: "danger" }> = ({ title, children, tone }) => (
  <div className={`rounded border p-3 sm:p-4 ${tone === "danger" ? "border-destructive/40" : "border-border"}`}>
    <p className={`text-sm font-medium mb-3 ${tone === "danger" ? "text-destructive" : "text-foreground"}`}>{title}</p>
    {children}
  </div>
);

const ReaderEditor: React.FC<{ userId: string; authToken?: string; onChanged: () => void; onDeleted: () => void }> = ({ userId, authToken, onChanged, onDeleted }) => {
  const [d, setD] = useState<ReaderDetailData | null>(null);
  const [cases, setCases] = useState<ReaderCase[] | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueEntry[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Refills the name/email fields only on load and after saving them, so other actions keep unsaved edits.
  const apply = (next: ReaderDetailData, resetFields = false) => {
    setD(next);
    if (resetFields) { setName(next.name || ""); setEmail(next.email || ""); }
  };

  const loadCases = useCallback(async () => {
    try { setCases(await rpc<ReaderCase[]>("admin_reader_cases", { _user_id: userId }, authToken)); }
    catch { setCases([]); }
  }, [userId, authToken]);

  useEffect(() => {
    let cancelled = false;
    rpc<ReaderDetailData>("admin_reader_detail", { _user_id: userId }, authToken)
      .then((x) => { if (!cancelled) apply(x, true); })
      .catch((e) => { if (!cancelled) setLoadError(explain(e)); });
    void loadCases();
    void loadCatalogue().then((rows) => { if (!cancelled) setCatalogue(rows); });
    return () => { cancelled = true; };
  }, [userId, authToken, loadCases]);

  // Runs an admin call, shows the outcome and refreshes the list.
  const run = async (key: string, fn: () => Promise<ReaderDetailData | void>, success: string) => {
    setBusy(key);
    try {
      const next = await fn();
      if (next) apply(next, key === "name" || key === "email");
      toast.success(success);
      // A password-reset email changes nothing in the list.
      if (key !== "reset-pw") onChanged();
    } catch (e: any) {
      toast.error(explain(e));
    } finally {
      setBusy(null);
    }
  };

  const byCase = useMemo(() => {
    const map = new Map<string, ReaderCase[]>();
    for (const c of cases || []) map.set(c.chapter_id, [...(map.get(c.chapter_id) || []), c]);
    return [...map.values()];
  }, [cases]);

  if (loadError) return <p className="border-t border-border p-4 text-sm text-destructive">{loadError}</p>;
  if (!d) return <p className="border-t border-border p-4 text-sm text-muted-foreground">Loading…</p>;

  const owned = new Map(d.commendations.map((c) => [c.key, c.unlocked_at]));
  const isSuspended = suspended(d.banned_until);
  const cooldownUntil = d.name_changed_at ? Date.parse(d.name_changed_at) + 30 * DAY : 0;

  return (
    <div className="border-t border-border p-3 sm:p-4 space-y-4 text-sm">
      <div className="grid sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
        <span>Joined: <span className="text-foreground">{fmtDate(d.joined_at)}</span></span>
        <span>Last sign-in: <span className="text-foreground">{fmtDate(d.last_sign_in_at)}</span></span>
        <span>Sign-in method: <span className="text-foreground">{d.provider}</span></span>
        <span>Status: <span className={isSuspended ? "text-destructive" : "text-foreground"}>{isSuspended ? `suspended until ${fmtDate(d.banned_until)}` : "active"}</span></span>
      </div>
      <a href={`/user/${d.user_id}`} target="_blank" rel="noreferrer" className="inline-block text-xs text-primary hover:underline">Open public profile ↗</a>

      <Section title="Account">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Username</label>
            <div className="flex gap-2">
              <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className={inputCls} />
              <button type="button" className={btn} disabled={busy === "name" || !name.trim() || name.trim() === d.name}
                onClick={() => run("name", () => rpc("admin_update_reader", { _user_id: userId, _name: name }, authToken), "Username changed")}>
                Save
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {cooldownUntil > Date.now() ? `The reader can rename themselves again on ${fmtDate(new Date(cooldownUntil).toISOString())}.` : "The reader can rename themselves now."}
            </p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Email</label>
            <div className="flex gap-2">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
              <button type="button" className={btn} disabled={busy === "email" || !email.trim() || email.trim().toLowerCase() === d.email}
                onClick={() => {
                  if (!window.confirm(`Change ${d.name}'s sign-in email to ${email.trim()}? They sign in with the new address from now on.`)) return;
                  void run("email", () => rpc("admin_update_reader", { _user_id: userId, _email: email }, authToken), "Email changed");
                }}>
                Save
              </button>
            </div>
            {d.provider !== "email" && <p className="text-[11px] text-muted-foreground mt-1">This reader signs in with {d.provider}; their {d.provider} account decides the address they use.</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {!d.email_confirmed && (
            <button type="button" className={btn} disabled={!!busy}
              onClick={() => run("confirm", () => rpc("admin_reader_action", { _user_id: userId, _action: "confirm_email" }, authToken), "Email marked as confirmed")}>
              Mark email confirmed
            </button>
          )}
          {d.provider === "email" && (
            <button type="button" className={btn} disabled={!!busy}
              onClick={() => {
                if (!window.confirm(`Email a password-reset link to ${d.email}?`)) return;
                void run("reset-pw", async () => { const { error } = await dbAuthEmail("recover", d.email); if (error) throw new Error(error); }, "Password-reset email sent");
              }}>
              Send password reset
            </button>
          )}
          {cooldownUntil > Date.now() && (
            <button type="button" className={btn} disabled={!!busy}
              onClick={() => run("cooldown", () => rpc("admin_reader_action", { _user_id: userId, _action: "reset_name_cooldown" }, authToken), "They can rename themselves again")}>
              Allow a rename now
            </button>
          )}
        </div>
      </Section>

      <Section title="Interactive cases">
        {!cases ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : byCase.length === 0 ? (
          <p className="text-xs text-muted-foreground">No interactive cases started.</p>
        ) : (
          <>
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
                    <button type="button" className={dangerBtn} disabled={!!busy}
                      onClick={() => {
                        if (!window.confirm(`Reset ${d.name}'s progress in “${latest.case_title}”? Every attempt, decision and hint for this case is deleted and they start over.`)) return;
                        void run(`case-${latest.chapter_id}`, async () => {
                          await rpc("admin_reset_case", { _user_id: userId, _chapter_id: latest.chapter_id }, authToken);
                          await loadCases();
                        }, "Case progress reset");
                      }}>
                      {busy === `case-${latest.chapter_id}` ? "Resetting…" : "Reset progress"}
                    </button>
                  </li>
                );
              })}
            </ul>
            {byCase.length > 1 && (
              <button type="button" className={`${dangerBtn} mt-3`} disabled={!!busy}
                onClick={() => {
                  if (!window.confirm(`Reset ${d.name}'s progress in ALL interactive cases?`)) return;
                  void run("cases-all", async () => {
                    await rpc("admin_reader_action", { _user_id: userId, _action: "reset_all_cases" }, authToken);
                    await loadCases();
                  }, "All case progress reset");
                }}>
                Reset all cases
              </button>
            )}
          </>
        )}
      </Section>

      <Section title={`Awards (${owned.size})`}>
        {catalogue.length === 0 ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (
          <>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {catalogue.map((c) => {
                const has = owned.has(c.key);
                return (
                  <li key={c.key}>
                    <label className={`flex items-start gap-2 border rounded px-3 py-2 cursor-pointer ${has ? "border-primary/60 bg-primary/5" : "border-border"}`}>
                      <input type="checkbox" className="mt-0.5" checked={has} disabled={!!busy}
                        onChange={() => run(`award-${c.key}`, () => rpc("admin_set_commendation", { _user_id: userId, _key: c.key, _granted: !has }, authToken), has ? `Removed “${c.title}”` : `Awarded “${c.title}”`)} />
                      <span className="min-w-0">
                        <span className="block text-foreground text-xs">{c.title}</span>
                        <span className="block text-[10px] text-muted-foreground">{c.category} · {c.points} pts{has ? ` · since ${fmtDate(owned.get(c.key) || null)}` : ""}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-muted-foreground mt-2">Awards the reader has earned (reading, cases, comments…) come back the next time their awards are checked. Awards you grant stay.</p>
          </>
        )}
      </Section>

      {!d.is_admin && (
        <Section title="Suspend or delete" tone="danger">
          <div className="flex flex-wrap gap-2">
            {isSuspended ? (
              <button type="button" className={btn} disabled={!!busy}
                onClick={() => run("unsuspend", () => rpc("admin_reader_action", { _user_id: userId, _action: "unsuspend" }, authToken), "Suspension lifted")}>
                Lift suspension
              </button>
            ) : (
              ([[7, "Suspend 7 days"], [30, "Suspend 30 days"], [36500, "Suspend permanently"]] as [number, string][]).map(([days, label]) => (
                <button key={days} type="button" className={dangerBtn} disabled={!!busy}
                  onClick={() => {
                    if (!window.confirm(`${label}: ${d.name} is signed out and can't sign in until the suspension ends or you lift it.`)) return;
                    void run("suspend", () => rpc("admin_reader_action", { _user_id: userId, _action: "suspend", _days: days }, authToken), "Reader suspended");
                  }}>
                  {label}
                </button>
              ))
            )}
            <button type="button" className={dangerBtn} disabled={!!busy}
              onClick={async () => {
                const typed = window.prompt(`Delete ${d.name}'s account permanently? Their comments, posts, progress and awards are removed too. This can't be undone.\n\nType the username to confirm:`);
                if (typed == null) return;
                if (typed.trim() !== d.name) { toast.error("The username didn't match. Nothing was deleted."); return; }
                setBusy("delete");
                try {
                  const res = await rpc<{ kept: string[] }>("admin_delete_reader", { _user_id: userId }, authToken);
                  toast.success(res?.kept?.length ? `Account deleted (some rows kept in: ${res.kept.join(", ")})` : "Account deleted");
                  onDeleted();
                } catch (e: any) {
                  toast.error(explain(e));
                } finally {
                  setBusy(null);
                }
              }}>
              {busy === "delete" ? "Deleting…" : "Delete account"}
            </button>
          </div>
        </Section>
      )}
    </div>
  );
};

export default ReadersAdmin;
