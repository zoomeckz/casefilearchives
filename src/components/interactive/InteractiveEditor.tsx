import React, { useMemo, useRef, useState } from "react";
import { RichTextEditor } from "@/components/RichTextEditor";
import { ImageUploadField } from "@/components/ImageUploadField";
import { InteractiveReader } from "@/components/interactive/InteractiveReader";
import {
  InteractiveGraph, StoryNode, NodeType, Condition, CondOp, Effect, DecisionOption, NotebookEntry,
  ReplayPolicy, GuestAccess, EndingVisibility,
  uid, validateGraph, removedNodeIds, normalizeGraph,
} from "@/lib/interactive";
import { sampleCaseGraph } from "@/lib/interactiveSample";
import { chainOfCustodyGraph } from "@/lib/cases/chainOfCustody";

/** Ready-made cases the editor can load as a starting point. */
const TEMPLATES: { id: string; label: string; make: () => InteractiveGraph }[] = [
  { id: "example", label: "Example case (short demo)", make: sampleCaseGraph },
  { id: "chain-of-custody", label: "Chain of Custody: intro", make: chainOfCustodyGraph },
];

// Admin-only (English) editor for Interactive Case Files. Edits the graph that
// the database functions ic_start / ic_choose enforce for registered readers.

interface Props {
  graph: InteractiveGraph;
  onChange: (g: InteractiveGraph) => void;
  title: string;
  /** Graph as last published — used to warn about edits that strand readers. */
  publishedGraph?: InteractiveGraph | null;
}

const field = "w-full px-3 py-2 bg-card/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary transition-colors [color-scheme:dark]";
const label = "block text-xs text-muted-foreground mb-1";
const panel = "p-4 rounded-lg border border-border/60 bg-card/30";
const smallBtn = "px-2 py-1 text-xs border border-border rounded hover:border-primary hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed";

const TYPE_LABEL: Record<NodeType, string> = { narrative: "Scene", decision: "Decision", ending: "Ending" };
const TYPE_STYLE: Record<NodeType, string> = {
  narrative: "border-border text-muted-foreground",
  decision: "border-primary/60 text-primary",
  ending: "border-accent/60 text-accent",
};
const NEW_PREFIX = "__new__:";
const MAX_OPTIONS = 6;

const OPS: { v: CondOp; l: string }[] = [
  { v: "eq", l: "equals" },
  { v: "neq", l: "does not equal" },
  { v: "truthy", l: "is true / set" },
  { v: "falsy", l: "is false / unset" },
  { v: "gt", l: ">" },
  { v: "gte", l: "≥" },
  { v: "lt", l: "<" },
  { v: "lte", l: "≤" },
];

function blankNode(type: NodeType): StoryNode {
  if (type === "decision") return { id: uid("d"), type, title: "", content: "", options: [blankOption(), blankOption()] };
  if (type === "ending") return { id: uid("end"), type, content: "", endingTitle: "", endingText: "" };
  return { id: uid("n"), type, title: "", content: "" };
}
function blankOption(): DecisionOption {
  return { id: uid("o"), label: "", next: "" };
}

// ── Small building blocks ──

/** Open/closed state for an editor panel, remembered in this browser. */
function usePanelOpen(key: string, initial = true): [boolean, () => void] {
  const [open, setOpen] = useState<boolean>(() => {
    try { const v = localStorage.getItem(key); return v == null ? initial : v === "1"; } catch { return initial; }
  });
  const toggle = () => setOpen((o) => {
    try { localStorage.setItem(key, o ? "0" : "1"); } catch { /* ignore */ }
    return !o;
  });
  return [open, toggle];
}

const CollapseToggle: React.FC<{ open: boolean; onToggle: () => void; what: string }> = ({ open, onToggle, what }) => (
  <button type="button" onClick={onToggle} aria-expanded={open} className={smallBtn} title={`${open ? "Collapse" : "Expand"} ${what}`}>
    {open ? "▾ Collapse" : "▸ Expand"}
  </button>
);

const ConditionList: React.FC<{ value?: Condition[]; onChange: (c: Condition[]) => void; empty: string }> = ({ value, onChange, empty }) => {
  const list = value || [];
  const set = (i: number, patch: Partial<Condition>) => onChange(list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-2">
      {list.length === 0 && <p className="text-xs text-muted-foreground italic">{empty}</p>}
      {list.map((c, i) => (
        <div key={i} className="flex flex-wrap gap-2 items-center">
          <input list="ic-vars" value={c.var} onChange={(e) => set(i, { var: e.target.value.trim() })} placeholder="variable" className={`${field} flex-1 min-w-[8rem]`} />
          <select value={c.op || "eq"} onChange={(e) => set(i, { op: e.target.value as CondOp })} className={`${field} w-auto`}>
            {OPS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          {c.op !== "truthy" && c.op !== "falsy" && (
            <input value={c.value ?? ""} onChange={(e) => set(i, { value: e.target.value })} placeholder="value" className={`${field} w-28`} />
          )}
          <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} className={smallBtn} aria-label="Remove condition">✕</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...list, { var: "", op: "eq", value: "" }])} className="text-xs text-primary hover:underline">+ Add condition</button>
      {list.length > 1 && <p className="text-[11px] text-muted-foreground">All conditions must match.</p>}
    </div>
  );
};

const EffectList: React.FC<{ value?: Effect[]; onChange: (e: Effect[]) => void }> = ({ value, onChange }) => {
  const list = value || [];
  const set = (i: number, patch: Partial<Effect>) => onChange(list.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  return (
    <div className="space-y-2">
      {list.length === 0 && <p className="text-xs text-muted-foreground italic">This option changes no variables.</p>}
      {list.map((e, i) => (
        <div key={i} className="flex flex-wrap gap-2 items-center">
          <input list="ic-vars" value={e.var} onChange={(ev) => set(i, { var: ev.target.value.trim() })} placeholder="variable" className={`${field} flex-1 min-w-[8rem]`} />
          <select value={e.op} onChange={(ev) => set(i, { op: ev.target.value as Effect["op"] })} className={`${field} w-auto`}>
            <option value="set">set to</option>
            <option value="add">add (number)</option>
          </select>
          <input value={e.value} onChange={(ev) => set(i, { value: ev.target.value })} placeholder={e.op === "add" ? "1" : "true"} className={`${field} w-28`} />
          <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} className={smallBtn} aria-label="Remove effect">✕</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...list, { var: "", op: "set", value: "true" }])} className="text-xs text-primary hover:underline">+ Set a variable</button>
    </div>
  );
};

const NotebookList: React.FC<{ value?: NotebookEntry[]; onChange: (e: NotebookEntry[]) => void }> = ({ value, onChange }) => {
  const list = value || [];
  const set = (i: number, patch: Partial<NotebookEntry>) => onChange(list.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  return (
    <div className="space-y-2">
      {list.length === 0 && <p className="text-xs text-muted-foreground italic">This scene adds nothing to the notebook.</p>}
      {list.map((e, i) => (
        <div key={i} className="flex flex-wrap gap-2 items-start">
          <select value={e.kind} onChange={(ev) => set(i, { kind: ev.target.value as NotebookEntry["kind"] })} className={`${field} w-auto`}>
            <option value="note">Note</option>
            <option value="evidence">Evidence</option>
          </select>
          <textarea value={e.text} onChange={(ev) => set(i, { text: ev.target.value })} rows={2}
            placeholder={e.kind === "evidence" ? "Napkin from Ames’s desk: “14 — L”" : "Reyes corrected the log before anyone asked."}
            className={`${field} flex-1 min-w-[12rem]`} />
          <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} className={smallBtn} aria-label="Remove notebook entry">✕</button>
        </div>
      ))}
      <div className="flex gap-3">
        <button type="button" onClick={() => onChange([...list, { kind: "note", text: "" }])} className="text-xs text-primary hover:underline">+ Add note</button>
        <button type="button" onClick={() => onChange([...list, { kind: "evidence", text: "" }])} className="text-xs text-primary hover:underline">+ Add evidence</button>
      </div>
    </div>
  );
};

const NodeSelect: React.FC<{ value?: string; nodes: StoryNode[]; selfId: string; onChange: (v: string) => void; emptyLabel: string }> = ({ value, nodes, selfId, onChange, emptyLabel }) => (
  <select value={value || ""} onChange={(e) => onChange(e.target.value)} className={field}>
    <option value="">{emptyLabel}</option>
    {value && !nodes.some((n) => n.id === value) && <option value={value}>{value} (missing!)</option>}
    {nodes.filter((n) => n.id !== selfId).map((n) => (
      <option key={n.id} value={n.id}>
        [{TYPE_LABEL[n.type || "narrative"]}] {n.id}{n.title || n.endingTitle ? ` — ${n.title || n.endingTitle}` : ""}
      </option>
    ))}
    <option value={`${NEW_PREFIX}narrative`}>+ Create new scene</option>
    <option value={`${NEW_PREFIX}decision`}>+ Create new decision</option>
    <option value={`${NEW_PREFIX}ending`}>+ Create new ending</option>
  </select>
);

const NodeIdField: React.FC<{ id: string; onRename: (next: string) => string | null }> = ({ id, onRename }) => {
  const [draft, setDraft] = useState(id);
  const [err, setErr] = useState<string | null>(null);
  React.useEffect(() => { setDraft(id); setErr(null); }, [id]);
  const commit = () => {
    if (draft === id) return;
    const e = onRename(draft);
    setErr(e);
    if (e) setDraft(id);
  };
  return (
    <div>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} className={`${field} font-mono`} />
      {err && <p className="text-xs text-destructive mt-1">{err}</p>}
    </div>
  );
};

// ── Editor ──

export const InteractiveEditor: React.FC<Props> = ({ graph, onChange, title, publishedGraph }) => {
  const [selectedId, setSelectedId] = useState<string>(graph.startNodeId || graph.nodes[0]?.id || "");
  const [preview, setPreview] = useState<{ start: string; key: number } | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [settingsOpen, toggleSettings] = usePanelOpen("ic-editor:settings-open");
  const [structureOpen, toggleStructure] = usePanelOpen("ic-editor:structure-open");

  const issues = useMemo(() => validateGraph(graph), [graph]);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const removed = useMemo(() => removedNodeIds(publishedGraph ?? null, graph), [publishedGraph, graph]);
  // Stable object so unrelated parent re-renders don't restart the preview.
  const previewGraph = useMemo(() => (preview ? { ...graph, startNodeId: preview.start } : null), [graph, preview]);

  const varNames = useMemo(() => {
    const s = new Set<string>();
    for (const n of graph.nodes) {
      (n.conditions || []).forEach((c) => c.var && s.add(c.var));
      (n.routes || []).forEach((r) => r.conditions.forEach((c) => c.var && s.add(c.var)));
      for (const o of n.options || []) {
        (o.effects || []).forEach((e) => e.var && s.add(e.var));
        (o.visibleIf || []).forEach((c) => c.var && s.add(c.var));
        (o.lockedIf || []).forEach((c) => c.var && s.add(c.var));
      }
    }
    return [...s].sort();
  }, [graph]);

  const incoming = useMemo(() => {
    const m = new Map<string, string[]>();
    const add = (to: string | undefined, from: string) => { if (to) m.set(to, [...(m.get(to) || []), from]); };
    for (const n of graph.nodes) {
      add(n.next, n.id);
      (n.routes || []).forEach((r) => add(r.to, n.id));
      (n.options || []).forEach((o) => add(o.next, n.id));
    }
    return m;
  }, [graph]);

  const sel = graph.nodes.find((n) => n.id === selectedId) || graph.nodes[0];
  const selIndex = graph.nodes.findIndex((n) => n.id === sel?.id);

  // The rich-text editor may hold on to its first onChange callback, so its
  // updates read the latest graph from a ref instead of this render's closure.
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const setContentFor = (nodeId: string, html: string) => {
    const g = graphRef.current;
    onChange({ ...g, nodes: g.nodes.map((n) => (n.id === nodeId ? { ...n, content: html } : n)) });
  };

  const setNodes = (nodes: StoryNode[], extra: Partial<InteractiveGraph> = {}) => onChange({ ...graphRef.current, ...extra, nodes });
  const patchSel = (patch: Partial<StoryNode>) => {
    const id = sel.id;
    setNodes(graphRef.current.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };
  const patchOption = (optId: string, patch: Partial<DecisionOption>) =>
    patchSel({ options: (sel.options || []).map((o) => (o.id === optId ? { ...o, ...patch } : o)) });

  /** Links the selected node to `value`, creating a fresh node first when a "+ Create" entry was picked. */
  const commitLink = (value: string, apply: (n: StoryNode, id: string) => StoryNode) => {
    let nodes = graph.nodes;
    let target = value;
    if (value.startsWith(NEW_PREFIX)) {
      const created = blankNode(value.slice(NEW_PREFIX.length) as NodeType);
      nodes = [...nodes, created];
      target = created.id;
    }
    setNodes(nodes.map((n) => (n.id === sel.id ? apply(n, target) : n)));
  };

  const addNode = (type: NodeType) => {
    const n = blankNode(type);
    const nodes = [...graph.nodes];
    nodes.splice(selIndex < 0 ? nodes.length : selIndex + 1, 0, n);
    setNodes(nodes);
    setSelectedId(n.id);
  };

  const duplicateNode = () => {
    const copy: StoryNode = JSON.parse(JSON.stringify(sel));
    copy.id = uid(sel.type === "decision" ? "d" : sel.type === "ending" ? "end" : "n");
    if (copy.title) copy.title = `${copy.title} (copy)`;
    copy.options = copy.options?.map((o) => ({ ...o, id: uid("o") }));
    const nodes = [...graph.nodes];
    nodes.splice(selIndex + 1, 0, copy);
    setNodes(nodes);
    setSelectedId(copy.id);
  };

  const deleteNode = () => {
    if (sel.id === graph.startNodeId) return;
    const refs = incoming.get(sel.id) || [];
    const msg = refs.length
      ? `Delete "${sel.id}"? It is linked from: ${[...new Set(refs)].join(", ")}. Those links will break until you re-point them.`
      : `Delete "${sel.id}"?`;
    if (!window.confirm(msg)) return;
    const nodes = graph.nodes.filter((n) => n.id !== sel.id);
    setNodes(nodes);
    setSelectedId(nodes[Math.max(0, selIndex - 1)]?.id || "");
  };

  const moveNode = (dir: -1 | 1) => {
    const j = selIndex + dir;
    if (j < 0 || j >= graph.nodes.length) return;
    const nodes = [...graph.nodes];
    [nodes[selIndex], nodes[j]] = [nodes[j], nodes[selIndex]];
    setNodes(nodes);
  };

  const renameNode = (raw: string): string | null => {
    const next = raw.trim().replace(/\s+/g, "_");
    if (!next) return "ID cannot be empty.";
    if (next === sel.id) return null;
    if (graph.nodes.some((n) => n.id === next)) return `"${next}" is already used.`;
    if (publishedGraph?.nodes.some((n) => n.id === sel.id) &&
      !window.confirm("This section is already published. Readers positioned here will be stranded if you rename it. Rename anyway?")) {
      return "Rename cancelled.";
    }
    const fix = (x?: string) => (x === sel.id ? next : x);
    onChange({
      ...graph,
      startNodeId: fix(graph.startNodeId) || "",
      nodes: graph.nodes.map((n) => ({
        ...n,
        id: fix(n.id) || n.id,
        next: fix(n.next),
        routes: n.routes?.map((r) => ({ ...r, to: fix(r.to) || "" })),
        options: n.options?.map((o) => ({ ...o, next: fix(o.next) || "" })),
      })),
    });
    setSelectedId(next);
    return null;
  };

  const changeType = (type: NodeType) => {
    if (type === sel.type) return;
    const patch: Partial<StoryNode> = { type };
    if (type === "decision" && !(sel.options || []).length) patch.options = [blankOption(), blankOption()];
    patchSel(patch);
  };

  const moveOption = (i: number, dir: -1 | 1) => {
    const opts = [...(sel.options || [])];
    const j = i + dir;
    if (j < 0 || j >= opts.length) return;
    [opts[i], opts[j]] = [opts[j], opts[i]];
    patchSel({ options: opts });
  };

  const setSettings = (patch: Partial<InteractiveGraph["settings"]>) => onChange({ ...graph, settings: { ...graph.settings, ...patch } });

  const loadTemplate = (templateId: string) => {
    const t = TEMPLATES.find((x) => x.id === templateId);
    if (!t) return;
    const hasWork = graph.nodes.length > 1 || graph.nodes.some((n) => n.content.replace(/<[^>]*>/g, "").trim());
    if (hasWork && !window.confirm(`Replace the current case structure with “${t.label}”?`)) return;
    const g = t.make();
    onChange(g);
    setSelectedId(g.startNodeId);
  };

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonDraft);
      if (!parsed || !Array.isArray(parsed.nodes)) throw new Error("JSON must contain a \"nodes\" array.");
      const g = normalizeGraph(parsed);
      onChange(g);
      setSelectedId(g.startNodeId);
      setJsonError(null);
      setShowJson(false);
    } catch (e: any) {
      setJsonError(e.message || "Invalid JSON");
    }
  };

  const errorCountFor = (id: string) => issues.filter((i) => i.nodeId === id && i.level === "error").length;
  const warnCountFor = (id: string) => issues.filter((i) => i.nodeId === id && i.level === "warning").length;

  if (!sel) return null;

  return (
    <div className="space-y-6">
      <datalist id="ic-vars">{varNames.map((v) => <option key={v} value={v} />)}</datalist>

      {/* Settings */}
      <div className={panel}>
        <div className={`flex flex-wrap items-center justify-between gap-2 ${settingsOpen || showJson ? "mb-3" : ""}`}>
          <div className="flex items-center gap-2">
            <CollapseToggle open={settingsOpen} onToggle={toggleSettings} what="case settings" />
            <h3 className="text-sm font-medium text-foreground">Interactive case settings</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <select value="" onChange={(e) => loadTemplate(e.target.value)} className={`${smallBtn} bg-transparent [color-scheme:dark]`} aria-label="Load a template">
              <option value="">Load a template…</option>
              {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <button type="button" onClick={() => { setJsonDraft(JSON.stringify(graph, null, 2)); setJsonError(null); setShowJson((v) => !v); }} className={smallBtn}>
              {showJson ? "Close JSON" : "Import / export JSON"}
            </button>
          </div>
        </div>
        {settingsOpen && (<>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <label className={label}>Replay</label>
            <select value={graph.settings.replay} onChange={(e) => setSettings({ replay: e.target.value as ReplayPolicy })} className={field}>
              <option value="disabled">Disabled — the record is permanent</option>
              <option value="after_completion">Allowed after completion</option>
              <option value="after_wait">Allowed after a waiting period (default: one week)</option>
              <option value="admin_only">Admin testing only</option>
            </select>
            {graph.settings.replay === "after_wait" && (
              <div className="mt-2 flex items-center gap-2">
                <input type="number" min={1} value={graph.settings.replayWaitHours ?? 168}
                  onChange={(e) => setSettings({ replayWaitHours: Math.max(1, parseInt(e.target.value) || 168) })} className={`${field} w-24`} />
                <span className="text-xs text-muted-foreground">hours after completion (168 = one week)</span>
              </div>
            )}
          </div>
          <div>
            <label className={label}>Attempts per account</label>
            <input type="number" min={1} max={99} value={graph.settings.maxAttempts ?? ""} placeholder="No limit"
              onChange={(e) => { const v = parseInt(e.target.value, 10); setSettings({ maxAttempts: Number.isFinite(v) && v > 0 ? v : undefined }); }}
              className={`${field} w-32`} />
            <p className="text-[11px] text-muted-foreground mt-1">
              {graph.settings.replay === "disabled"
                ? "Replay is disabled, so every account gets exactly one attempt."
                : "Total playthroughs each registered reader may start. Empty = no limit. Admins are never limited."}
            </p>
          </div>
          <div>
            <label className={label}>Unregistered visitors may</label>
            <select value={graph.settings.guestAccess} onChange={(e) => setSettings({ guestAccess: e.target.value as GuestAccess })} className={field}>
              <option value="opening">Read the opening only</option>
              <option value="two_choices">Read the opening and make two decisions</option>
              <option value="full_nosave">Read the full story (nothing saved)</option>
            </select>
          </div>
          <div>
            <label className={label}>At the ending, readers see</label>
            <select value={graph.settings.endingVisibility} onChange={(e) => setSettings({ endingVisibility: e.target.value as EndingVisibility })} className={field}>
              <option value="own">Only their own ending</option>
              <option value="count">How many endings exist</option>
              <option value="index">The full ending index</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className={label}>Closing question — readers type an answer after the ending (leave empty for none)</label>
          <textarea value={graph.settings.conclusionPrompt ?? ""} onChange={(e) => setSettings({ conclusionPrompt: e.target.value })}
            rows={2} className={field} placeholder="What do you believe really happened?" />
        </div>
        {varNames.length > 0 && (
          <p className="mt-3 text-[11px] text-muted-foreground break-words">
            Variables in this case: <span className="font-mono">{varNames.join(", ")}</span>
          </p>
        )}
        </>)}
        {showJson && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-2">Copy this to back up the case, or paste a saved case and apply it.</p>
            <textarea value={jsonDraft} onChange={(e) => setJsonDraft(e.target.value)} rows={12} className={`${field} font-mono text-xs`} spellCheck={false} />
            {jsonError && <p className="text-xs text-destructive mt-1">{jsonError}</p>}
            <button type="button" onClick={applyJson} className="mt-2 px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs">Apply JSON</button>
          </div>
        )}
      </div>

      {/* Validation */}
      <div className={`${panel} ${errors.length ? "border-destructive/50" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-foreground">
            Structure check:{" "}
            {errors.length === 0 && warnings.length === 0 ? <span className="text-primary">ready to publish</span> : (
              <span>
                {errors.length > 0 && <span className="text-destructive">{errors.length} error{errors.length === 1 ? "" : "s"}</span>}
                {errors.length > 0 && warnings.length > 0 && " · "}
                {warnings.length > 0 && <span className="text-accent">{warnings.length} warning{warnings.length === 1 ? "" : "s"}</span>}
              </span>
            )}
          </h3>
          <button type="button" onClick={() => setPreview({ start: graph.startNodeId, key: Date.now() })} className="px-3 py-1.5 bg-accent/20 hover:bg-accent/30 text-accent rounded text-xs">
            Preview from opening
          </button>
        </div>
        {(issues.length > 0 || removed.length > 0) && (
          <ul className="mt-3 space-y-1 text-xs max-h-48 overflow-y-auto">
            {removed.length > 0 && (
              <li className="text-destructive">
                Removed since last publish: {removed.join(", ")} — readers currently on these sections will be stranded.
              </li>
            )}
            {issues.map((i, k) => (
              <li key={k} className={i.level === "error" ? "text-destructive" : "text-accent"}>
                {i.nodeId ? (
                  <button type="button" onClick={() => setSelectedId(i.nodeId!)} className="underline font-mono mr-1">{i.nodeId}</button>
                ) : null}
                {i.message}
              </li>
            ))}
          </ul>
        )}
        {errors.length > 0 && <p className="text-[11px] text-muted-foreground mt-2">Errors must be fixed before the case can be published.</p>}
      </div>

      <div className={`grid grid-cols-1 gap-6 ${structureOpen ? "lg:grid-cols-[18rem_1fr]" : ""}`}>
        {/* Node list — scrolls on its own so the page stays put */}
        {structureOpen && (
        <aside className={`${panel} flex flex-col max-h-[75vh] lg:self-start lg:sticky lg:top-20`}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Structure · {graph.nodes.length}</h3>
            <CollapseToggle open onToggle={toggleStructure} what="structure" />
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            <button type="button" onClick={() => addNode("narrative")} className={smallBtn}>+ Scene</button>
            <button type="button" onClick={() => addNode("decision")} className={smallBtn}>+ Decision</button>
            <button type="button" onClick={() => addNode("ending")} className={smallBtn}>+ Ending</button>
          </div>
          <ol className="space-y-1 flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1">
            {graph.nodes.map((n) => {
              const active = n.id === sel.id;
              const errs = errorCountFor(n.id);
              const warns = warnCountFor(n.id);
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => setSelectedId(n.id)}
                    className={`w-full text-left px-2 py-1.5 rounded border text-xs transition-colors ${active ? "border-primary bg-primary/10" : "border-transparent hover:border-border"}`}>
                    <span className={`inline-block px-1 mr-2 border rounded text-[9px] uppercase tracking-wider ${TYPE_STYLE[n.type || "narrative"]}`}>{TYPE_LABEL[n.type || "narrative"]}</span>
                    <span className="font-mono text-foreground">{n.id}</span>
                    {n.id === graph.startNodeId && <span className="ml-1 text-[9px] uppercase text-primary">opening</span>}
                    {(n.conditions?.length || 0) > 0 && <span className="ml-1 text-[9px] uppercase text-muted-foreground">conditional</span>}
                    {(n.notebook?.length || 0) > 0 && <span className="ml-1 text-[9px] uppercase text-muted-foreground">notebook</span>}
                    {errs > 0 && <span className="ml-1 text-destructive">●</span>}
                    {!errs && warns > 0 && <span className="ml-1 text-accent">●</span>}
                    {(n.title || n.endingTitle) && <span className="block text-muted-foreground truncate">{n.title || n.endingTitle}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
        )}

        {/* Node form */}
        <section className={`${panel} space-y-5 min-w-0`}>
          <div className="flex flex-wrap items-center gap-2">
            {!structureOpen && (
              <button type="button" onClick={toggleStructure} aria-expanded={false} className={smallBtn}>▸ Structure ({graph.nodes.length})</button>
            )}
            <button type="button" onClick={() => moveNode(-1)} disabled={selIndex <= 0} className={smallBtn}>↑ Up</button>
            <button type="button" onClick={() => moveNode(1)} disabled={selIndex >= graph.nodes.length - 1} className={smallBtn}>↓ Down</button>
            <button type="button" onClick={duplicateNode} className={smallBtn}>Duplicate</button>
            <button type="button" onClick={() => onChange({ ...graph, startNodeId: sel.id })} disabled={sel.id === graph.startNodeId} className={smallBtn}>Set as opening</button>
            <button type="button" onClick={() => setPreview({ start: sel.id, key: Date.now() })} className={smallBtn}>Preview from here</button>
            <button type="button" onClick={deleteNode} disabled={sel.id === graph.startNodeId} className={`${smallBtn} ml-auto hover:border-destructive hover:text-destructive`}>Delete</button>
          </div>
          {(incoming.get(sel.id) || []).length > 0 && (
            <p className="text-[11px] text-muted-foreground">Reached from: <span className="font-mono">{[...new Set(incoming.get(sel.id))].join(", ")}</span></p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={label}>Section ID</label>
              <NodeIdField id={sel.id} onRename={renameNode} />
            </div>
            <div>
              <label className={label}>Type</label>
              <select value={sel.type || "narrative"} onChange={(e) => changeType(e.target.value as NodeType)} className={field}>
                <option value="narrative">Scene (narrative)</option>
                <option value="decision">Decision</option>
                <option value="ending">Ending</option>
              </select>
            </div>
            <div>
              <label className={label}>Case status / location label</label>
              <input value={sel.label || ""} onChange={(e) => patchSel({ label: e.target.value || undefined })} placeholder="e.g. Location: Basement, 00:12" className={field} />
            </div>
          </div>

          {sel.type !== "ending" && (
            <div>
              <label className={label}>{sel.type === "decision" ? "Decision title (e.g. Select testimony)" : "Scene title (optional)"}</label>
              <input value={sel.title || ""} onChange={(e) => patchSel({ title: e.target.value || undefined })} className={field} />
            </div>
          )}

          <div>
            <label className={label}>{sel.type === "decision" ? "Text shown before the decision (optional)" : sel.type === "ending" ? "Final scene text (optional)" : "Story text"}</label>
            <RichTextEditor key={sel.id} content={sel.content} onChange={(html) => setContentFor(sel.id, html)} glossaryTerms={[]} />
          </div>

          <ImageUploadField
            key={`img-${sel.id}`}
            kind="inline"
            pathPrefix="chapters/interactive"
            label="Image or attachment (optional)"
            value={sel.image || null}
            onChange={(url) => patchSel({ image: url || undefined })}
          />

          {/* Scene */}
          {(sel.type || "narrative") === "narrative" && (
            <>
              <div>
                <label className={label}>Notebook — added to the reader’s notes and evidence when this scene is shown</label>
                <NotebookList value={sel.notebook} onChange={(e) => patchSel({ notebook: e.length ? e : undefined })} />
              </div>
              <div>
                <label className={label}>Show this scene only if… (otherwise it is skipped)</label>
                <ConditionList value={sel.conditions} onChange={(c) => patchSel({ conditions: c.length ? c : undefined })} empty="Always shown." />
              </div>
              <div>
                <label className={label}>Conditional routes (checked in order, first match wins)</label>
                <div className="space-y-3">
                  {(sel.routes || []).map((r, i) => (
                    <div key={i} className="p-3 border border-border rounded-lg space-y-2">
                      <ConditionList value={r.conditions} empty="No conditions — this route always matches."
                        onChange={(c) => patchSel({ routes: (sel.routes || []).map((x, j) => (j === i ? { ...x, conditions: c } : x)) })} />
                      <div className="flex gap-2 items-center">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">then go to</span>
                        <NodeSelect value={r.to} nodes={graph.nodes} selfId={sel.id} emptyLabel="— choose —"
                          onChange={(v) => commitLink(v, (n, id) => ({ ...n, routes: (n.routes || []).map((x, j) => (j === i ? { ...x, to: id } : x)) }))} />
                        <button type="button" onClick={() => patchSel({ routes: (sel.routes || []).filter((_, j) => j !== i) })} className={smallBtn} aria-label="Remove route">✕</button>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => patchSel({ routes: [...(sel.routes || []), { conditions: [{ var: "", op: "truthy" }], to: "" }] })} className="text-xs text-primary hover:underline">
                    + Add conditional route
                  </button>
                </div>
              </div>
              <div>
                <label className={label}>{(sel.routes || []).length ? "Otherwise, next section" : "Next section"}</label>
                <NodeSelect value={sel.next} nodes={graph.nodes} selfId={sel.id} emptyLabel="— none (file ends here) —"
                  onChange={(v) => commitLink(v, (n, id) => ({ ...n, next: id || undefined }))} />
              </div>
            </>
          )}

          {/* Decision */}
          {sel.type === "decision" && (
            <>
              <div>
                <label className={label}>Current situation (what is at stake)</label>
                <textarea value={sel.context || ""} onChange={(e) => patchSel({ context: e.target.value || undefined })} rows={2} className={field} />
              </div>
              <div>
                <label className={label}>Confirmation warning (leave empty for the standard text)</label>
                <input value={sel.warning || ""} onChange={(e) => patchSel({ warning: e.target.value || undefined })}
                  placeholder="This decision will be saved to your account and cannot be changed." className={field} />
              </div>
              <div>
                <label className={label}>Time limit in seconds (optional)</label>
                <input type="number" min={5} max={3600} value={sel.timeLimit ?? ""} placeholder="No limit"
                  onChange={(e) => { const v = parseInt(e.target.value, 10); patchSel({ timeLimit: Number.isFinite(v) && v > 0 ? v : undefined }); }}
                  className={`${field} w-40`} />
                <p className="text-[11px] text-muted-foreground mt-1">The clock starts when the reader reaches this decision. When it runs out, a random available option is filed.</p>
              </div>
              <div className="space-y-4">
                {(sel.options || []).map((o, i) => (
                  <div key={o.id} className="p-4 border border-border rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-primary text-lg">{String.fromCharCode(65 + i)}.</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{o.id}</span>
                      <div className="ml-auto flex gap-1">
                        <button type="button" onClick={() => moveOption(i, -1)} disabled={i === 0} className={smallBtn}>↑</button>
                        <button type="button" onClick={() => moveOption(i, 1)} disabled={i === (sel.options || []).length - 1} className={smallBtn}>↓</button>
                        <button type="button" onClick={() => patchSel({ options: (sel.options || []).filter((x) => x.id !== o.id) })}
                          disabled={(sel.options || []).length <= 2} className={`${smallBtn} hover:border-destructive hover:text-destructive`}>Remove</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className={label}>Option label</label>
                        <input value={o.label} onChange={(e) => patchOption(o.id, { label: e.target.value })} placeholder="Follow Mara into the kitchen." className={field} />
                      </div>
                      <div>
                        <label className={label}>Leads to</label>
                        <NodeSelect value={o.next} nodes={graph.nodes} selfId={sel.id} emptyLabel="— choose —"
                          onChange={(v) => commitLink(v, (n, id) => ({ ...n, options: (n.options || []).map((x) => (x.id === o.id ? { ...x, next: id } : x)) }))} />
                      </div>
                    </div>
                    <div>
                      <label className={label}>Description (optional)</label>
                      <input value={o.description || ""} onChange={(e) => patchOption(o.id, { description: e.target.value || undefined })}
                        placeholder="“She was in the house first. She knows where the key is.”" className={field} />
                    </div>
                    <div>
                      <label className={label}>Consequence logged after confirming (optional)</label>
                      <input value={o.consequence || ""} onChange={(e) => patchOption(o.id, { consequence: e.target.value || undefined })}
                        placeholder="Mara will remember this." className={field} />
                    </div>
                    <details className="text-sm" open={!!(o.effects?.length || o.visibleIf?.length || o.lockedIf?.length)}>
                      <summary className="cursor-pointer text-xs text-muted-foreground select-none">
                        Variables & conditions
                        {(o.effects?.length || 0) > 0 && ` · sets ${o.effects!.length}`}
                        {(o.visibleIf?.length || 0) > 0 && " · conditional"}
                        {(o.lockedIf?.length || 0) > 0 && " · can lock"}
                      </summary>
                      <div className="mt-3 space-y-4 pl-3 border-l border-border">
                        <div>
                          <label className={label}>When chosen</label>
                          <EffectList value={o.effects} onChange={(e) => patchOption(o.id, { effects: e.length ? e : undefined })} />
                        </div>
                        <div>
                          <label className={label}>Only show this option if…</label>
                          <ConditionList value={o.visibleIf} onChange={(c) => patchOption(o.id, { visibleIf: c.length ? c : undefined })} empty="Always shown." />
                        </div>
                        <div>
                          <label className={label}>Show as unavailable (locked) if…</label>
                          <ConditionList value={o.lockedIf} onChange={(c) => patchOption(o.id, { lockedIf: c.length ? c : undefined })} empty="Never locked." />
                        </div>
                      </div>
                    </details>
                  </div>
                ))}
                {(sel.options || []).length < MAX_OPTIONS && (
                  <button type="button" onClick={() => patchSel({ options: [...(sel.options || []), blankOption()] })} className="text-xs text-primary hover:underline">
                    + Add option
                  </button>
                )}
              </div>
            </>
          )}

          {/* Ending */}
          {sel.type === "ending" && (
            <>
              <div>
                <label className={label}>Ending title</label>
                <input value={sel.endingTitle || ""} onChange={(e) => patchSel({ endingTitle: e.target.value })} placeholder="CASE CLOSED" className={`${field} font-display uppercase`} />
              </div>
              <div>
                <label className={label}>Outcome description</label>
                <textarea value={sel.endingText || ""} onChange={(e) => patchSel({ endingText: e.target.value })} rows={3}
                  placeholder="You identified the real threat and escaped with enough evidence." className={field} />
              </div>
            </>
          )}
        </section>
      </div>

      {/* Route preview — local only, never touches reader progress */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-background/95 backdrop-blur border-b border-border">
            <span className="text-sm text-muted-foreground font-medium">
              Route preview{preview.start !== graph.startNodeId && <> from <span className="font-mono">{preview.start}</span> (variables start empty)</>}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPreview({ ...preview, key: Date.now() })} className="px-4 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm">Restart</button>
              <button type="button" onClick={() => setPreview(null)} className="px-4 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm">Close</button>
            </div>
          </div>
          <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
            <h1 className="font-display text-3xl uppercase text-primary mb-8">{title || "Untitled case"}</h1>
            <InteractiveReader key={preview.key} chapterId="preview" title={title || "Untitled case"}
              graph={previewGraph!} user={null} mode="preview" />
          </div>
        </div>
      )}
    </div>
  );
};

export default InteractiveEditor;
