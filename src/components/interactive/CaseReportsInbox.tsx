import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { collectNotebook, findNode, normalizeGraph, type Decision, type InteractiveGraph } from "@/lib/interactive";
import { storyPath } from "@/lib/slug";
import { CaseReport } from "@/components/interactive/CaseReport";

// Admin → Case reports. Every written conclusion readers file at the end of an
// interactive case lands here. The archivist can answer each one; the reader
// sees the answer on the case and gets a notification (ic_admin_feedback).

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FEEDBACK_MAX = 4000;

type StatusFilter = "open" | "answered" | "all";

interface ReportRow {
  playthrough_id: string;
  chapter_id: string;
  case_title: string;
  reader_id: string;
  reader_name: string;
  attempt: number;
  ending_node: string | null;
  completed_at: string | null;
  final_answer: string;
  answered_at: string | null;
  admin_feedback: string | null;
  feedback_at: string | null;
  variables: Record<string, string>;
  visited: string[];
  decisions: Decision[];
}

interface CaseMeta { graph: InteractiveGraph; path: string }

async function rpc<T>(fn: string, body: unknown, token?: string): Promise<T> {
  if (!token) throw new Error("Sign in again to load case reports.");
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || "Request failed");
  return data as T;
}

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";

const FeedbackForm: React.FC<{ row: ReportRow; meta?: CaseMeta; token?: string; onSaved: (text: string, at: string) => void }> = ({ row, meta, token, onSaved }) => {
  const [editing, setEditing] = useState(!row.admin_feedback);
  const [text, setText] = useState(row.admin_feedback || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const clean = text.trim();
    if (!clean) return;
    setSaving(true);
    try {
      const res = await rpc<{ feedback_at: string }>("ic_admin_feedback", {
        _playthrough_id: row.playthrough_id, _feedback: clean, _link: meta?.path ?? null,
      }, token);
      onSaved(clean, res?.feedback_at || new Date().toISOString());
      setEditing(false);
      toast.success(`Response sent to ${row.reader_name}`);
    } catch (e: any) {
      toast.error(e.message || "The response could not be sent.");
    } finally { setSaving(false); }
  };

  if (!editing && row.admin_feedback) {
    return (
      <div className="border border-border border-l-4 border-l-accent bg-card/40 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="case-label text-[9px] !text-accent">Your response · {fmt(row.feedback_at)}</p>
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-primary hover:underline">Edit response</button>
        </div>
        <p className="mt-2 text-sm text-foreground/90 whitespace-pre-line break-words">{row.admin_feedback}</p>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={`fb-${row.playthrough_id}`} className="block text-xs text-muted-foreground mb-1">
        {row.admin_feedback ? "Revise your response (the reader is notified again)" : "Your response to this reader"}
      </label>
      <textarea
        id={`fb-${row.playthrough_id}`}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, FEEDBACK_MAX))}
        rows={4}
        placeholder="What they got right, what they missed, what to look at next time…"
        className="w-full px-3 py-2 bg-card/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary resize-y"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
        <span className="case-label text-[9px] tabular-nums">{text.length}/{FEEDBACK_MAX}</span>
        <div className="flex gap-2">
          {row.admin_feedback && (
            <button type="button" onClick={() => { setText(row.admin_feedback || ""); setEditing(false); }} className="px-3 py-1.5 border border-border rounded text-xs">Cancel</button>
          )}
          <button type="button" onClick={save} disabled={!text.trim() || saving}
            className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs disabled:opacity-50">
            {saving ? "Sending…" : row.admin_feedback ? "Update response" : "Send response"}
          </button>
        </div>
      </div>
    </div>
  );
};

export const CaseReportsInbox: React.FC<{ authToken?: string }> = ({ authToken }) => {
  const [status, setStatus] = useState<StatusFilter>("open");
  const [caseFilter, setCaseFilter] = useState("");
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [cases, setCases] = useState<Record<string, CaseMeta>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null); setError(null);
    try {
      const data = await rpc<ReportRow[]>("ic_admin_reports", { _status: status }, authToken);
      const list = Array.isArray(data) ? data : [];
      const ids = [...new Set(list.map((r) => r.chapter_id))];
      const metas: Record<string, CaseMeta> = {};
      if (ids.length) {
        const res = await fetch(
          `${SUPA_URL}/rest/v1/chapters?select=id,title,chapter_number,is_archived,interactive_graph&id=in.(${ids.join(",")})`,
          { headers: { apikey: ANON, Authorization: `Bearer ${authToken}` } },
        );
        const chapters = res.ok ? await res.json() : [];
        for (const c of chapters) {
          metas[c.id] = {
            graph: normalizeGraph(c.interactive_graph),
            path: storyPath({ title: c.title, chapterNumber: c.chapter_number, isArchived: c.is_archived }),
          };
        }
      }
      setCases(metas);
      setRows(list);
    } catch (e: any) {
      setError(e.message || "Case reports could not be loaded.");
      setRows([]);
    }
  }, [status, authToken]);

  useEffect(() => { void load(); }, [load]);

  const caseOptions = useMemo(() => {
    const m = new Map<string, string>();
    (rows || []).forEach((r) => m.set(r.chapter_id, r.case_title));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const shown = (rows || []).filter((r) => !caseFilter || r.chapter_id === caseFilter);

  const markSaved = (id: string, text: string, at: string) => {
    setRows((prev) => (prev || []).map((r) => (r.playthrough_id === id ? { ...r, admin_feedback: text, feedback_at: at } : r)));
  };

  const filterBtn = (v: StatusFilter, l: string) => (
    <button key={v} type="button" onClick={() => setStatus(v)} aria-pressed={status === v}
      className={`px-3 py-1.5 text-xs border rounded transition-colors ${status === v ? "border-primary text-primary bg-primary/10" : "border-border hover:border-primary/60"}`}>
      {l}
    </button>
  );

  return (
    <div>
      <h1 className="font-display text-2xl md:text-3xl text-accent mb-2">Case reports</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
        Every conclusion readers file at the end of an interactive case. Your response appears on their case and they are notified. Readers never see the true solution.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        {filterBtn("open", "Awaiting response")}
        {filterBtn("answered", "Answered")}
        {filterBtn("all", "All")}
        <select value={caseFilter} onChange={(e) => setCaseFilter(e.target.value)} aria-label="Filter by case"
          className="ml-auto px-3 py-1.5 bg-card/50 border border-border rounded text-xs text-foreground [color-scheme:dark]">
          <option value="">All cases</option>
          {caseOptions.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
        </select>
        <button type="button" onClick={() => void load()} className="px-3 py-1.5 text-xs border border-border rounded hover:border-primary/60">Refresh</button>
      </div>

      {error && <p className="text-sm text-destructive mb-4">{error}</p>}
      {rows === null && <p className="case-label text-[9px]">Retrieving reports…</p>}
      {rows !== null && shown.length === 0 && !error && (
        <p className="text-sm text-muted-foreground border border-dashed border-border rounded-lg p-6">
          {status === "open" ? "No reports are waiting for a response." : "No reports here yet. They appear when readers file a conclusion at the end of a case."}
        </p>
      )}

      <ol className="space-y-5">
        {shown.map((r) => {
          const meta = cases[r.chapter_id];
          const ending = meta ? findNode(meta.graph, r.ending_node) : undefined;
          const notebook = meta ? collectNotebook(meta.graph, r.visited || []) : [];
          const vars = Object.entries(r.variables || {}).sort(([a], [b]) => a.localeCompare(b));
          return (
            <li key={r.playthrough_id} className="border border-border rounded-lg bg-card/30 p-4 sm:p-5 space-y-4 min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-lg uppercase text-foreground break-words">{r.case_title}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.reader_name} · attempt {r.attempt}{ending?.endingTitle ? ` · outcome: ${ending.endingTitle}` : ""}
                  </p>
                </div>
                <span className={`case-label text-[9px] ${r.admin_feedback ? "" : "!text-primary"}`}>
                  {r.admin_feedback ? "Answered" : "Awaiting response"} · filed {fmt(r.answered_at)}
                </span>
              </div>

              <blockquote className="border-l-4 border-primary pl-4 italic text-foreground/90 whitespace-pre-line break-words">{r.final_answer}</blockquote>

              <details className="text-sm">
                <summary className="cursor-pointer text-xs text-muted-foreground select-none">
                  Their route: {r.decisions?.length || 0} decisions · {notebook.length} notebook entries
                </summary>
                <div className="mt-4 grid gap-6 md:grid-cols-2">
                  <div className="min-w-0">
                    {meta ? <CaseReport graph={meta.graph} decisions={r.decisions || []} attempt={r.attempt} completedAt={r.completed_at} />
                      : <p className="text-xs text-muted-foreground">This case’s structure could not be loaded.</p>}
                  </div>
                  <div className="min-w-0 space-y-4">
                    <div>
                      <p className="case-label text-[9px] mb-2">Notebook</p>
                      {notebook.length === 0 ? <p className="text-xs text-muted-foreground">Nothing collected.</p> : (
                        <ul className="space-y-1.5">
                          {notebook.map((e, i) => (
                            <li key={i} className="text-xs text-foreground/90">
                              <span className={`case-label text-[8px] mr-1 ${e.kind === "evidence" ? "!text-primary" : ""}`}>{e.kind === "evidence" ? "Evidence" : "Note"}</span>
                              {e.text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="case-label text-[9px] mb-2">Hidden variables at the end</p>
                      {vars.length === 0 ? <p className="text-xs text-muted-foreground">None set.</p> : (
                        <div className="overflow-x-auto">
                          <table className="text-xs font-mono tabular-nums">
                            <tbody>
                              {vars.map(([k, v]) => (
                                <tr key={k}><td className="pr-4 text-muted-foreground">{k}</td><td className="text-foreground">{String(v)}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </details>

              <FeedbackForm row={r} meta={meta} token={authToken} onSaved={(text, at) => markSaved(r.playthrough_id, text, at)} />
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default CaseReportsInbox;
