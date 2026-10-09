import React, { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeGraph, findNode, type InteractiveGraph } from "@/lib/interactive";
import { buildCaseMap, pathEdges, ENDING_COLORS } from "@/lib/caseMap";
import { CaseMap } from "@/components/interactive/CaseMap";
import type { IcEventRow } from "@/lib/icTracking";

// Admin → Case analytics. Built from the reading events every reader sends
// (see lib/icTracking.ts): what they saw, how long they thought, what they
// picked, what they found, where they left and when they came back.

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type Range = "7" | "30" | "90" | "all";
interface CaseOption { key: string; title: string; graph: InteractiveGraph | null; test?: boolean }

interface Pick { node: string; option: string; ms: number; total: number; timeout: boolean; at: number; attempt: number; session: string }
interface Leave { node: string | null; at: number; away: number | null; session: string }
interface Reader {
  key: string;
  userId: string | null;
  name: string;
  sessions: Set<string>;
  first: number;
  last: number;
  events: IcEventRow[];
  picks: Pick[];
  views: { node: string; at: number; attempt: number }[];
  endings: { node: string; at: number; attempt: number }[];
  leaves: Leave[];
  cancels: { node: string; option: string }[];
  answered: number;
}

const fmtMs = (ms: number | null | undefined) => {
  if (ms == null || !Number.isFinite(ms)) return "n/a";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)} min ${Math.round(s % 60)} s`;
  const h = m / 60;
  if (h < 48) return `${Math.floor(h)} h ${Math.round(m % 60)} min`;
  return `${Math.round(h / 24)} days`;
};
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "0%");
const when = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

async function get<T>(path: string, token?: string): Promise<T> {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: { apikey: ANON, Authorization: `Bearer ${token || ANON}` } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
  return data as T;
}

const Card: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div className="border border-border rounded-lg bg-card/40 p-4">
    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="font-display text-2xl text-foreground mt-1 tabular-nums">{value}</p>
    {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
  </div>
);

/** One thin horizontal bar with its label and value (single series: one hue). */
const Bar: React.FC<{ label: React.ReactNode; value: number; max: number; right: React.ReactNode; color?: string; title?: string }> = ({ label, value, max, right, color, title }) => (
  <div className="grid grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-3 py-1" title={title}>
    <span className="text-xs text-foreground truncate">{label}</span>
    <span className="h-2 rounded-full bg-secondary/60 overflow-hidden">
      <span className="block h-full rounded-full" style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%`, background: color || "hsl(var(--primary))" }} />
    </span>
    <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{right}</span>
  </div>
);

const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }> = ({ title, hint, children, right }) => (
  <section className="border border-border/60 rounded-lg bg-card/30 p-4 sm:p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
      <div>
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      {right}
    </div>
    {children}
  </section>
);

export const CaseAnalytics: React.FC<{ authToken?: string }> = ({ authToken }) => {
  const [cases, setCases] = useState<CaseOption[] | null>(null);
  const [caseKey, setCaseKey] = useState("");
  const [range, setRange] = useState<Range>("30");
  const [events, setEvents] = useState<IcEventRow[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [selNode, setSelNode] = useState<string | null>(null);
  const [selReader, setSelReader] = useState<string | null>(null);
  const [selAttempt, setSelAttempt] = useState<number | null>(null);
  const [testGraphs, setTestGraphs] = useState<Record<string, InteractiveGraph | null>>({});

  // Interactive cases (+ tester links that have been read).
  useEffect(() => {
    (async () => {
      try {
        const chapters = await get<any[]>("chapters?select=id,title,interactive_graph,story_format,published_at&story_format=eq.interactive&order=published_at.desc", authToken);
        const list: CaseOption[] = chapters.map((c) => ({ key: c.id, title: c.title, graph: c.interactive_graph ? normalizeGraph(c.interactive_graph) : null }));
        try {
          const tests = await get<{ case_key: string }[]>("interactive_events?select=case_key&case_key=like.test:*&kind=eq.open&order=created_at.desc&limit=2000", authToken);
          for (const k of [...new Set(tests.map((t) => t.case_key))]) list.push({ key: k, title: `Test link ${k.slice(5, 13)}`, graph: null, test: true });
        } catch { /* table may not exist yet */ }
        setCases(list);
        setCaseKey((k) => k || list[0]?.key || "");
      } catch (e: any) { setError(e.message); setCases([]); }
    })();
  }, [authToken]);

  const current = cases?.find((c) => c.key === caseKey) || null;

  // Tester links: the graph lives in the snapshot file.
  useEffect(() => {
    if (!current?.test || current.key in testGraphs) return;
    const id = current.key.slice(5);
    fetch(`${SUPA_URL}/storage/v1/object/public/images/test-cases/${id}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setTestGraphs((m) => ({ ...m, [current.key]: j?.graph ? normalizeGraph(j.graph) : null })))
      .catch(() => setTestGraphs((m) => ({ ...m, [current.key]: null })));
  }, [current, testGraphs]);
  const graph = current?.test ? testGraphs[current.key] ?? null : current?.graph ?? null;

  const load = useCallback(async () => {
    if (!caseKey) return;
    setEvents(null); setError(null); setSelNode(null); setSelReader(null);
    try {
      const since = range === "all" ? "" : `&client_ts=gte.${new Date(Date.now() - Number(range) * 86400_000).toISOString()}`;
      const all: IcEventRow[] = [];
      for (let offset = 0; offset < 100_000; offset += 5000) {
        const page = await get<IcEventRow[]>(`interactive_events?select=*&case_key=eq.${encodeURIComponent(caseKey)}${since}&order=client_ts.asc&limit=5000&offset=${offset}`, authToken);
        all.push(...page);
        if (page.length < 5000) break;
      }
      setEvents(all);
      const ids = [...new Set(all.map((e) => e.user_id).filter(Boolean))] as string[];
      if (ids.length) {
        try {
          const rows = await get<{ user_id: string; name: string }[]>(`rpc/get_public_profiles?select=user_id,name&user_id=in.(${ids.join(",")})`, authToken);
          setNames(Object.fromEntries(rows.map((r) => [r.user_id, r.name])));
        } catch { /* names are optional */ }
      }
    } catch (e: any) {
      setError(/interactive_events/.test(e.message) ? "Reading analytics are not switched on in the database yet. Run the pending SQL (interactive_events) and refresh." : e.message);
      setEvents([]);
    }
  }, [caseKey, range, authToken]);
  useEffect(() => { void load(); }, [load]);

  const layout = useMemo(() => (graph ? buildCaseMap(graph) : null), [graph]);

  // ── Per reader ──
  const readers = useMemo(() => {
    const m = new Map<string, Reader>();
    for (const e of events || []) {
      const key = e.user_id || `guest:${e.device_id}`;
      const t = Date.parse(e.client_ts || e.created_at || "") || 0;
      let r = m.get(key);
      if (!r) {
        r = { key, userId: e.user_id, name: "", sessions: new Set(), first: t, last: t, events: [], picks: [], views: [], endings: [], leaves: [], cancels: [], answered: 0 };
        m.set(key, r);
      }
      r.sessions.add(e.session_id);
      r.first = Math.min(r.first, t);
      r.last = Math.max(r.last, t);
      r.events.push(e);
      const attempt = e.attempt || 1;
      if (e.kind === "view" && e.node_id) r.views.push({ node: e.node_id, at: t, attempt });
      if ((e.kind === "choose" || e.kind === "timeout") && e.node_id && e.option_id) {
        r.picks.push({ node: e.node_id, option: e.option_id, ms: e.ms || 0, total: Number((e.meta as any)?.total_ms) || e.ms || 0, timeout: e.kind === "timeout", at: t, attempt, session: e.session_id });
      }
      if (e.kind === "ending" && e.node_id) r.endings.push({ node: e.node_id, at: t, attempt });
      if (e.kind === "confirm_cancel" && e.node_id && e.option_id) r.cancels.push({ node: e.node_id, option: e.option_id });
      if (e.kind === "answer") r.answered++;
      if (e.kind === "hidden" || e.kind === "close") r.leaves.push({ node: e.node_id, at: t, away: null, session: e.session_id });
      if (e.kind === "visible" && r.leaves.length) {
        const last = r.leaves[r.leaves.length - 1];
        if (last.away == null && last.session === e.session_id) last.away = e.ms ?? t - last.at;
      }
    }
    // A reader who closed the page and opened it again later: that gap counts as time away too.
    for (const r of m.values()) {
      const opens = r.events.filter((e) => e.kind === "open");
      for (const o of opens.slice(1)) {
        const t = Date.parse(o.client_ts);
        const prev = [...r.leaves].reverse().find((l) => l.at <= t && l.away == null && l.session !== o.session_id);
        if (prev) prev.away = t - prev.at;
      }
      r.name = r.userId ? names[r.userId] || "Registered reader" : `Guest ${r.key.slice(6, 12)}`;
    }
    return [...m.values()].sort((a, b) => b.last - a.last);
  }, [events, names]);

  // ── Aggregates ──
  const stats = useMemo(() => {
    const started = readers.filter((r) => r.views.length || r.picks.length);
    const finished = readers.filter((r) => r.endings.length);
    const activeTotals = readers.filter((r) => r.endings.length).map((r) => {
      const firstEnd = r.endings[0];
      return r.picks.filter((p) => p.attempt === firstEnd.attempt).reduce((a, p) => a + p.ms, 0);
    });
    const wallTotals = finished.map((r) => r.endings[0].at - r.first);
    const returned = readers.filter((r) => r.sessions.size > 1 || r.leaves.some((l) => (l.away || 0) > 60_000));
    const aways = readers.flatMap((r) => r.leaves.map((l) => l.away).filter((x): x is number => x != null));
    const neverBack = readers.filter((r) => !r.endings.length && r.leaves.length && r.leaves[r.leaves.length - 1].away == null);

    const nodeViews: Record<string, Set<string>> = {};
    const nodePicks: Record<string, Pick[]> = {};
    const nodeCancels: Record<string, number> = {};
    const nodeLeaves: Record<string, number[]> = {};
    const dropped: Record<string, number> = {};
    for (const r of readers) {
      for (const v of r.views) (nodeViews[v.node] ||= new Set()).add(r.key);
      for (const p of r.picks) (nodePicks[p.node] ||= []).push(p);
      for (const c of r.cancels) nodeCancels[c.node] = (nodeCancels[c.node] || 0) + 1;
      for (const l of r.leaves) if (l.node) (nodeLeaves[l.node] ||= []).push(l.away ?? -1);
      if (!r.endings.length && r.views.length) {
        const lastView = r.views[r.views.length - 1];
        const pickedAfter = r.picks.some((p) => p.at >= lastView.at && p.node === lastView.node);
        if (!pickedAfter) dropped[lastView.node] = (dropped[lastView.node] || 0) + 1;
      }
    }
    const endings: Record<string, number> = {};
    for (const r of readers) for (const e of r.endings) endings[e.node] = (endings[e.node] || 0) + 1;

    // Items found: readers who made a choice that hands out the item.
    const items = (graph?.settings.items || []).map((it) => {
      const got = readers.filter((r) => r.picks.some((p) => {
        const o = findNode(graph!, p.node)?.options?.find((x) => x.id === p.option);
        return (o?.effects || []).some((e) => e.var === `item_${it.id}` && e.value !== "0" && e.value !== "");
      })).length;
      return { item: it, got };
    });

    // Map heat: travelled edges per reader attempt.
    const heatEdges: Record<string, number> = {};
    const heatNodes: Record<string, number> = {};
    if (layout) {
      for (const r of readers) {
        const attempts = new Set([...r.picks.map((p) => p.attempt), ...r.endings.map((e) => e.attempt)]);
        for (const a of attempts) {
          const ps = r.picks.filter((p) => p.attempt === a);
          const end = r.endings.find((e) => e.attempt === a)?.node || null;
          for (const k of pathEdges(layout, ps.map((p) => ({ node_id: p.node, option_id: p.option })), end)) heatEdges[k] = (heatEdges[k] || 0) + 1;
        }
      }
      for (const [n, s] of Object.entries(nodeViews)) heatNodes[n] = s.size;
      for (const [n, c] of Object.entries(endings)) heatNodes[n] = c;
    }

    // Activity per day (new readers).
    const days: Record<string, number> = {};
    for (const r of readers) { const d = new Date(r.first).toISOString().slice(0, 10); days[d] = (days[d] || 0) + 1; }

    return {
      started, finished, activeTotals, wallTotals, returned, aways, neverBack,
      nodeViews, nodePicks, nodeCancels, nodeLeaves, dropped, endings, items, heatEdges, heatNodes, days,
      firstDecision: median(readers.map((r) => r.picks[0]?.ms).filter((x): x is number => x != null)),
      guests: readers.filter((r) => !r.userId).length,
      answered: readers.filter((r) => r.answered).length,
    };
  }, [readers, graph, layout]);

  const decisionRows = useMemo(() => {
    if (!graph || !layout) return [];
    return layout.nodes.filter((n) => n.kind === "decision").map((n) => {
      const node = findNode(graph, n.id)!;
      const picks = stats.nodePicks[n.id] || [];
      const ms = picks.filter((p) => !p.timeout).map((p) => p.ms);
      return {
        id: n.id, node, layer: n.layer,
        views: stats.nodeViews[n.id]?.size || 0,
        picks: picks.length,
        med: median(ms), mean: avg(ms), min: ms.length ? Math.min(...ms) : null, max: ms.length ? Math.max(...ms) : null,
        timeouts: picks.filter((p) => p.timeout).length,
        cancels: stats.nodeCancels[n.id] || 0,
        leaves: (stats.nodeLeaves[n.id] || []).length,
        dropped: stats.dropped[n.id] || 0,
        options: (node.options || []).map((o, i) => {
          const op = picks.filter((p) => p.option === o.id);
          return { o, letter: String.fromCharCode(65 + i), count: op.length, med: median(op.filter((p) => !p.timeout).map((p) => p.ms)), timeouts: op.filter((p) => p.timeout).length };
        }),
      };
    }).sort((a, b) => a.layer - b.layer);
  }, [graph, layout, stats]);

  const reader = readers.find((r) => r.key === selReader) || null;
  const readerAttempts = reader ? [...new Set([...reader.picks.map((p) => p.attempt), ...reader.endings.map((e) => e.attempt)])].sort((a, b) => a - b) : [];
  const attempt = selAttempt ?? readerAttempts[readerAttempts.length - 1] ?? 1;

  const exportCsv = () => {
    const head = ["client_ts", "reader", "user_id", "device_id", "session_id", "attempt", "kind", "node_id", "option_id", "ms", "meta"];
    const lines = (events || []).map((e) => [e.client_ts, e.user_id ? names[e.user_id] || "" : "guest", e.user_id || "", e.device_id, e.session_id, e.attempt ?? "", e.kind, e.node_id || "", e.option_id || "", e.ms ?? "", JSON.stringify(e.meta || {})]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `case-analytics-${(current?.title || caseKey).replace(/\W+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const label = (nodeId: string | null) => {
    if (!nodeId || !graph) return nodeId || "";
    const n = findNode(graph, nodeId);
    return n ? (n.type === "ending" ? `END: ${n.endingTitle || n.id}` : n.title || n.id) : nodeId;
  };
  const optLabel = (nodeId: string, optId: string) => {
    const n = graph ? findNode(graph, nodeId) : undefined;
    const i = n?.options?.findIndex((o) => o.id === optId) ?? -1;
    return i >= 0 ? `${String.fromCharCode(65 + i)}. “${n!.options![i].label.replace(/[.!?]+$/, "")}”` : optId;
  };
  const describe = (e: IcEventRow): string => {
    switch (e.kind) {
      case "open": return (e.meta as any)?.resumed ? "Came back to the case" : "Opened the case";
      case "view": return `Reached “${label(e.node_id)}”`;
      case "confirm_open": return `Considered ${optLabel(e.node_id!, e.option_id!)} after ${fmtMs(e.ms)}`;
      case "confirm_cancel": return `Backed out of ${optLabel(e.node_id!, e.option_id!)}`;
      case "choose": return `Chose ${optLabel(e.node_id!, e.option_id!)} after ${fmtMs(e.ms)} of thinking`;
      case "timeout": return `Ran out of time; the file chose ${optLabel(e.node_id!, e.option_id!)}`;
      case "hidden": return `Left the page${e.node_id ? ` at “${label(e.node_id)}”` : ""}`;
      case "visible": return `Came back to the page after ${fmtMs(e.ms)}`;
      case "close": return `Closed the page${e.node_id ? ` at “${label(e.node_id)}”` : ""}`;
      case "ending": return `Reached ${label(e.node_id)}`;
      case "answer": return `Filed a written conclusion (${(e.meta as any)?.length ?? "?"} characters)`;
      case "replay": return "Started a new attempt";
      default: return e.kind;
    }
  };

  const endingNodes = graph ? graph.nodes.filter((n) => n.type === "ending") : [];
  const maxEnding = Math.max(1, ...Object.values(stats.endings));
  const selRow = decisionRows.find((r) => r.id === selNode) || null;
  const dayEntries = Object.entries(stats.days).sort(([a], [b]) => a.localeCompare(b)).slice(-30);
  const maxDay = Math.max(1, ...dayEntries.map(([, v]) => v));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl text-foreground">Case analytics</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          How readers move through each interactive case: what they choose, what they find, how long they think before answering, and where they leave and come back. Thinking time only counts while the page is open in front of them.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={caseKey} onChange={(e) => { setCaseKey(e.target.value); setSelAttempt(null); }} className="px-3 py-2 bg-card border border-border rounded text-sm text-foreground min-w-[16rem]">
          {(cases || []).filter((c) => !c.test).length > 0 && (
            <optgroup label="Interactive Case Files">
              {(cases || []).filter((c) => !c.test).map((c) => <option key={c.key} value={c.key}>{c.title}</option>)}
            </optgroup>
          )}
          {(cases || []).some((c) => c.test) && (
            <optgroup label="Tester links">
              {(cases || []).filter((c) => c.test).map((c) => <option key={c.key} value={c.key}>{c.title}</option>)}
            </optgroup>
          )}
        </select>
        {(["7", "30", "90", "all"] as Range[]).map((r) => (
          <button key={r} type="button" onClick={() => setRange(r)}
            className={`px-3 py-2 text-xs border rounded transition-colors ${range === r ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}>
            {r === "all" ? "All time" : `Last ${r} days`}
          </button>
        ))}
        <button type="button" onClick={() => void load()} className="px-3 py-2 text-xs border border-border rounded hover:border-primary">Refresh</button>
        <button type="button" onClick={exportCsv} disabled={!events?.length} className="ml-auto px-3 py-2 text-xs border border-border rounded hover:border-primary disabled:opacity-40">Export CSV</button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {cases && !cases.length && !error && <p className="text-sm text-muted-foreground">No interactive case files yet.</p>}
      {events === null && caseKey && !error && <p className="text-sm text-muted-foreground">Loading reading data…</p>}

      {events && events.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">No reading data for this case in this period yet. It fills in as soon as readers open it.</p>
      )}

      {events && events.length > 0 && (
        <>
          {/* Headline numbers */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            <Card label="Readers" value={readers.length} hint={`${readers.length - stats.guests} registered · ${stats.guests} guests`} />
            <Card label="Reached an ending" value={stats.finished.length} hint={`${pct(stats.finished.length, stats.started.length)} of those who started`} />
            <Card label="Median thinking time" value={fmtMs(median(stats.activeTotals))} hint="Total time spent deciding, per finished read" />
            <Card label="Median start to finish" value={fmtMs(median(stats.wallTotals))} hint="Clock time, breaks included" />
            <Card label="Left and came back" value={stats.returned.length} hint={`Median time away ${fmtMs(median(stats.aways))}`} />
            <Card label="Wrote a conclusion" value={stats.answered} hint={`${pct(stats.answered, stats.finished.length)} of finishers`} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6">
            <Section title="Traffic map" hint="Thicker lines = more readers took that choice. Numbers show readers per decision and ending. Click a decision for details.">
              {graph && layout
                ? <CaseMap graph={graph} layout={layout} heat={{ edges: stats.heatEdges, nodes: stats.heatNodes }} selected={selNode} onSelect={(id) => setSelNode(id)} />
                : <p className="text-sm text-muted-foreground">The case structure could not be loaded.</p>}
            </Section>

            <div className="space-y-6">
              <Section title="Endings reached">
                {endingNodes.map((n, i) => (
                  <Bar key={n.id} label={`END ${i + 1} · ${n.endingTitle || n.id}`} value={stats.endings[n.id] || 0} max={maxEnding}
                    right={`${stats.endings[n.id] || 0} · ${pct(stats.endings[n.id] || 0, stats.finished.length)}`} color={ENDING_COLORS[i % ENDING_COLORS.length]} />
                ))}
              </Section>

              {stats.items.length > 0 && (
                <Section title="Items found" hint="Readers who picked up each item at least once.">
                  {stats.items.map(({ item, got }) => (
                    <Bar key={item.id} label={item.name || item.id} value={got} max={Math.max(1, stats.started.length)} right={`${got} · ${pct(got, stats.started.length)}`} />
                  ))}
                </Section>
              )}

              <Section title="Where readers stopped" hint="Their last decision before they stopped without reaching an ending.">
                {Object.keys(stats.dropped).length === 0
                  ? <p className="text-xs text-muted-foreground">Nobody has abandoned the case mid-way.</p>
                  : Object.entries(stats.dropped).sort(([, a], [, b]) => b - a).slice(0, 8).map(([n, c]) => (
                    <Bar key={n} label={label(n)} value={c} max={Math.max(...Object.values(stats.dropped))} right={`${c} · ${pct(c, stats.started.length)}`} />
                  ))}
              </Section>

              <Section title="New readers per day">
                <div className="flex items-end gap-[2px] h-24">
                  {dayEntries.map(([d, v]) => (
                    <div key={d} title={`${d}: ${v} new reader${v === 1 ? "" : "s"}`} className="flex-1 min-w-[4px] rounded-t bg-primary/80 hover:bg-primary" style={{ height: `${(v / maxDay) * 100}%` }} />
                  ))}
                </div>
                {dayEntries.length > 0 && <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>{dayEntries[0][0]}</span><span>{dayEntries[dayEntries.length - 1][0]}</span></div>}
              </Section>
            </div>
          </div>

          {/* Selected decision */}
          {selRow && (
            <Section title={`Decision: ${selRow.node.title || selRow.id}`} hint={selRow.node.timeLimit ? `Timed: ${selRow.node.timeLimit} s` : undefined}
              right={<button type="button" onClick={() => setSelNode(null)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>}>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
                <Card label="Reached it" value={selRow.views} />
                <Card label="Median think" value={fmtMs(selRow.med)} hint={`Mean ${fmtMs(selRow.mean)}`} />
                <Card label="Fastest / slowest" value={<span className="text-base">{fmtMs(selRow.min)} / {fmtMs(selRow.max)}</span>} />
                <Card label="Ran out of time" value={selRow.timeouts} />
                <Card label="Changed their mind" value={selRow.cancels} hint="Opened a choice, then backed out" />
                <Card label="Left the page here" value={selRow.leaves} hint={`${selRow.dropped} never came back`} />
              </div>
              {selRow.options.map((o) => (
                <Bar key={o.o.id} label={`${o.letter}. ${o.o.label}`} value={o.count} max={Math.max(1, selRow.picks)}
                  right={`${o.count} · ${pct(o.count, selRow.picks)} · median ${fmtMs(o.med)}${o.timeouts ? ` · ${o.timeouts} timed out` : ""}`} />
              ))}
            </Section>
          )}

          {/* Every decision */}
          <Section title="Every decision" hint="Thinking time is how long the choice was on screen and the page was open, until they confirmed. Timeouts are left out of the time figures.">
            <div className="overflow-x-auto overscroll-contain" data-lenis-prevent>
              <table className="w-full text-xs">
                <thead className="text-muted-foreground text-left">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-normal">Decision</th>
                    <th className="py-2 px-2 font-normal text-right">Reached</th>
                    <th className="py-2 px-2 font-normal text-right">Median think</th>
                    <th className="py-2 px-2 font-normal text-right">Mean</th>
                    <th className="py-2 px-2 font-normal text-right">Timeouts</th>
                    <th className="py-2 px-2 font-normal text-right">Changed mind</th>
                    <th className="py-2 px-2 font-normal text-right">Left page</th>
                    <th className="py-2 px-2 font-normal text-right">Stopped here</th>
                    <th className="py-2 pl-2 font-normal">Most picked</th>
                  </tr>
                </thead>
                <tbody>
                  {decisionRows.map((r) => {
                    const top = [...r.options].sort((a, b) => b.count - a.count)[0];
                    return (
                      <tr key={r.id} onClick={() => setSelNode(r.id)} className={`border-b border-border/50 cursor-pointer hover:bg-secondary/40 ${selNode === r.id ? "bg-primary/10" : ""}`}>
                        <td className="py-2 pr-3 text-foreground"><span className="font-mono text-muted-foreground mr-2">{r.id}</span>{r.node.title}{r.node.timeLimit ? <span className="ml-1 text-primary">⏱</span> : null}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{r.views}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtMs(r.med)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtMs(r.mean)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{r.timeouts}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{r.cancels}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{r.leaves}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{r.dropped}</td>
                        <td className="py-2 pl-2 text-muted-foreground truncate max-w-[16rem]">{top && top.count ? `${top.letter}. ${top.o.label} (${pct(top.count, r.picks)})` : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Readers */}
          <Section title="Readers" hint="Click a reader to see their full timeline and route.">
            <div className="overflow-x-auto overscroll-contain max-h-[28rem]" data-lenis-prevent>
              <table className="w-full text-xs">
                <thead className="text-muted-foreground text-left sticky top-0 bg-card">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-normal">Reader</th>
                    <th className="py-2 px-2 font-normal">First seen</th>
                    <th className="py-2 px-2 font-normal">Last seen</th>
                    <th className="py-2 px-2 font-normal text-right">Visits</th>
                    <th className="py-2 px-2 font-normal text-right">Decisions</th>
                    <th className="py-2 px-2 font-normal text-right">Thinking</th>
                    <th className="py-2 px-2 font-normal text-right">Times left</th>
                    <th className="py-2 pl-2 font-normal">Ending</th>
                  </tr>
                </thead>
                <tbody>
                  {readers.map((r) => {
                    const end = r.endings[r.endings.length - 1];
                    return (
                      <tr key={r.key} onClick={() => { setSelReader(r.key); setSelAttempt(null); }}
                        className={`border-b border-border/50 cursor-pointer hover:bg-secondary/40 ${selReader === r.key ? "bg-primary/10" : ""}`}>
                        <td className="py-2 pr-3 text-foreground">{r.name}</td>
                        <td className="py-2 px-2 text-muted-foreground">{when(r.first)}</td>
                        <td className="py-2 px-2 text-muted-foreground">{when(r.last)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{r.sessions.size}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{r.picks.length}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtMs(r.picks.reduce((a, p) => a + p.ms, 0))}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{r.leaves.length}</td>
                        <td className="py-2 pl-2 text-muted-foreground">{end ? label(end.node).replace(/^END: /, "") : "Still reading / stopped"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          {reader && (
            <Section title={`Reader: ${reader.name}`}
              hint={`${reader.sessions.size} visit${reader.sessions.size === 1 ? "" : "s"} · ${reader.picks.length} decisions · ${fmtMs(reader.picks.reduce((a, p) => a + p.ms, 0))} thinking · ${reader.cancels.length} changed mind · ${reader.leaves.length} times left the page`}
              right={(
                <div className="flex flex-wrap items-center gap-2">
                  {readerAttempts.length > 1 && readerAttempts.map((a) => (
                    <button key={a} type="button" onClick={() => setSelAttempt(a)}
                      className={`px-2 py-1 text-xs border rounded ${a === attempt ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>Attempt {a}</button>
                  ))}
                  <button type="button" onClick={() => setSelReader(null)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
                </div>
              )}>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {graph && layout && (
                  <CaseMap graph={graph} layout={layout}
                    decisions={reader.picks.filter((p) => p.attempt === attempt).map((p) => ({ node_id: p.node, option_id: p.option }))}
                    endingNode={reader.endings.find((e) => e.attempt === attempt)?.node || null} />
                )}
                <ol className="space-y-0 max-h-[34rem] overflow-y-auto overscroll-contain pr-1 text-xs" data-lenis-prevent>
                  {reader.events.filter((e) => (e.attempt || 1) === attempt || e.kind === "open" || e.kind === "hidden" || e.kind === "visible" || e.kind === "close").map((e, i, arr) => {
                    const t = Date.parse(e.client_ts);
                    const prev = i ? Date.parse(arr[i - 1].client_ts) : t;
                    const gap = t - prev;
                    const newVisit = i > 0 && e.session_id !== arr[i - 1].session_id;
                    const tone = e.kind === "choose" ? "text-foreground" : e.kind === "timeout" ? "text-primary" : e.kind === "ending" ? "text-accent" : "text-muted-foreground";
                    return (
                      <li key={e.id || i}>
                        {newVisit && (
                          <div className="my-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-primary">
                            <span className="h-px flex-1 bg-primary/40" />New visit · away {fmtMs(gap)}<span className="h-px flex-1 bg-primary/40" />
                          </div>
                        )}
                        <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-1 border-b border-border/40">
                          <span className="text-muted-foreground tabular-nums">{new Date(t).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                          <span className={tone}>{describe(e)}</span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
};

export default CaseAnalytics;
