import React, { useEffect, useMemo, useRef, useState } from "react";
import { RichTextEditor } from "@/components/RichTextEditor";
import { ImageUploadField } from "@/components/ImageUploadField";
import { InteractiveReader } from "@/components/interactive/InteractiveReader";
import { Collapse, CollapseButton, usePanelOpen } from "@/components/Collapsible";
import { CaseMap } from "@/components/interactive/CaseMap";
import {
  InteractiveGraph, StoryNode, NodeType, Condition, CondOp, Effect, DecisionOption, NotebookEntry,
  ReplayPolicy, GuestAccess, EndingVisibility, InventoryItem, ItemColor,
  uid, validateGraph, removedNodeIds, normalizeGraph, nextNodeId, getConclusionQuestions, findItem, emptyGraph,
  ITEM_COLORS, ITEM_PREFIX, itemVar,
} from "@/lib/interactive";
import { ITEM_STYLE, itemStyle } from "@/lib/itemColors";
import { toast } from "sonner";
import { sampleCaseGraph } from "@/lib/interactiveSample";
import { chainOfCustodyGraph } from "@/lib/cases/chainOfCustody";
import { NODE_CHANNEL_PREFIX, type NodeMsg } from "@/lib/nodeChannel";

/** Ready-made cases the editor can load as a starting point ("blank" empties the case). */
const TEMPLATES: { id: string; label: string; make: () => InteractiveGraph | Promise<InteractiveGraph> }[] = [
  { id: "blank", label: "Blank case (start empty)", make: emptyGraph },
  { id: "lot-14", label: "Lights Out at the Meridian: Lot 14 (1974, 7 endings)", make: () => import("@/lib/cases/lot14").then((m) => m.lot14Graph()) },
  { id: "chain-of-custody", label: "Chain of Custody: Chapter 1 (1974)", make: chainOfCustodyGraph },
  { id: "example", label: "Example case (short demo)", make: sampleCaseGraph },
];

// Admin-only (English) editor for Interactive Case Files. Edits the graph that
// the database functions ic_start / ic_choose enforce for registered readers.

interface Props {
  graph: InteractiveGraph;
  onChange: (g: InteractiveGraph) => void;
  title: string;
  /** Graph as last published — used to warn about edits that strand readers. */
  publishedGraph?: InteractiveGraph | null;
  /** When the case structure was last saved (shown in the node editor window). */
  savedAt?: number | null;
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

function blankNode(type: NodeType, id: string): StoryNode {
  if (type === "decision") return { id, type, title: "", content: "", options: [blankOption(), blankOption()] };
  if (type === "ending") return { id, type, content: "", endingTitle: "", endingText: "" };
  return { id, type, title: "", content: "" };
}
function blankOption(): DecisionOption {
  return { id: uid("o"), label: "", next: "" };
}

// ── Small building blocks ──

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

/** Inventory items for the whole case. */
const ItemsEditor: React.FC<{ items: InventoryItem[]; onChange: (i: InventoryItem[]) => void }> = ({ items, onChange }) => {
  const set = (i: number, patch: Partial<InventoryItem>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const add = () => {
    const used = new Set(items.map((x) => x.id));
    let n = items.length + 1;
    while (used.has(`item${n}`)) n++;
    const color = ITEM_COLORS[items.length % ITEM_COLORS.length];
    onChange([...items, { id: `item${n}`, name: "", color }]);
  };
  return (
    <div className="space-y-2">
      {items.length === 0 && <p className="text-xs text-muted-foreground italic">No items. Choices that need an item are drawn in the item’s colour instead of red.</p>}
      {items.map((it, i) => {
        const st = itemStyle(it.color);
        return (
          <div key={i} className="flex flex-wrap gap-2 items-center">
            <span className={`w-3 h-3 rounded-full shrink-0 ${st.dot}`} />
            <input value={it.name} placeholder="e.g. Revolver"
              onChange={(e) => set(i, { name: e.target.value })}
              className={`${field} flex-1 min-w-[10rem]`} />
            <select value={it.color} onChange={(e) => set(i, { color: e.target.value as ItemColor })} className={`${field} w-auto`}>
              {ITEM_COLORS.map((c) => <option key={c} value={c}>{ITEM_STYLE[c].label}</option>)}
            </select>
            <span className="font-mono text-[10px] text-muted-foreground" title="Internal ID used by the story logic; it never changes, so renaming the item is safe">{itemVar(it.id)}</span>
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className={smallBtn} aria-label="Remove item">✕</button>
          </div>
        );
      })}
      <button type="button" onClick={add} className="text-xs text-primary hover:underline">+ Add item</button>
    </div>
  );
};

/** Closing questions readers answer after the ending. */
const QuestionsEditor: React.FC<{ questions: string[]; onChange: (q: string[]) => void }> = ({ questions, onChange }) => {
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= questions.length) return;
    const q = [...questions];
    [q[i], q[j]] = [q[j], q[i]];
    onChange(q);
  };
  return (
    <div className="space-y-2">
      {questions.length === 0 && <p className="text-xs text-muted-foreground italic">No closing questions. Readers just see their ending.</p>}
      {questions.map((q, i) => (
        <div key={i} className="flex gap-2 items-start">
          <span className="font-display text-primary pt-2 w-5 shrink-0">{i + 1}.</span>
          <textarea value={q} rows={1} onChange={(e) => onChange(questions.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder={i === 0 ? "e.g. Who killed Walter Ames?" : "e.g. What was the motive?"} className={`${field} flex-1`} />
          <div className="flex gap-1 pt-1">
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={smallBtn} aria-label="Move question up">↑</button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === questions.length - 1} className={smallBtn} aria-label="Move question down">↓</button>
            <button type="button" onClick={() => onChange(questions.filter((_, j) => j !== i))} className={smallBtn} aria-label="Remove question">✕</button>
          </div>
        </div>
      ))}
      {questions.length < 8 && (
        <button type="button" onClick={() => onChange([...questions, ""])} className="text-xs text-primary hover:underline">+ Add question</button>
      )}
    </div>
  );
};

// ── Editor ──

export const InteractiveEditor: React.FC<Props> = ({ graph, onChange, title, publishedGraph, savedAt }) => {
  const [selectedId, setSelectedId] = useState<string>(graph.startNodeId || graph.nodes[0]?.id || "");
  const [preview, setPreview] = useState<{ start: string; key: number } | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [settingsOpen, toggleSettings] = usePanelOpen("ic-editor:settings-open");
  const [structureOpen, toggleStructure] = usePanelOpen("ic-editor:structure-open");
  const [checkOpen, toggleCheck] = usePanelOpen("ic-editor:check-open");
  const [sectionOpen, toggleSection] = usePanelOpen("ic-editor:section-open");
  const [mapOpen, toggleMap] = usePanelOpen("ic-editor:map-open", false);
  // Option / route cards collapsed in this session, keyed per section.
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(() => new Set());
  const cardOpen = (key: string) => !collapsedCards.has(key);
  const toggleCard = (key: string) => setCollapsedCards((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const [openVars, setOpenVars] = useState<Record<string, boolean>>({});

  /** Jump from a structure-check line to the exact field: select the section, open what is
   *  folded, scroll there, focus the field and flash it. */
  const goToIssue = (issue: { nodeId?: string; loc?: string }) => {
    const loc = issue.loc || "";
    let target = "";
    if (loc.startsWith("settings:")) {
      if (!settingsOpen) toggleSettings();
      target = loc;
    } else if (loc === "add:ending") {
      if (!structureOpen) toggleStructure();
      target = "add:ending";
    } else if (issue.nodeId) {
      setSelectedId(issue.nodeId);
      if (!sectionOpen) toggleSection();
      const m = loc.match(/^opt:(\d+):/);
      if (m) {
        const node = graph.nodes.find((x) => x.id === issue.nodeId);
        const opt = node?.options?.[Number(m[1])];
        if (opt) setCollapsedCards((prev) => { const next = new Set(prev); next.delete(`${issue.nodeId}:opt:${opt.id}`); return next; });
      }
      target = !loc ? `${issue.nodeId}|section` : loc.startsWith("notebook:") ? `${issue.nodeId}|notebook` : `${issue.nodeId}|${loc}`;
    }
    if (!target) return;
    // Wait for the section to render and folded boxes to open (~200ms animation).
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-loc="${CSS.escape(target)}"]`);
      if (!el) return;
      const lenis = (window as any).__lenis;
      const top = el.getBoundingClientRect().top + window.scrollY - 140;
      if (lenis?.scrollTo) lenis.scrollTo(top, { duration: 0.6 }); else window.scrollTo({ top, behavior: "smooth" });
      const input = el.matches("input,select,textarea,button") ? el : el.querySelector<HTMLElement>("input,select,textarea,[contenteditable=true],button");
      window.setTimeout(() => input?.focus({ preventScroll: true }), 450);
      el.classList.add("ic-flash");
      window.setTimeout(() => el.classList.remove("ic-flash"), 1800);
    }, 260);
  };

  const issues = useMemo(() => validateGraph(graph), [graph]);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const removed = useMemo(() => removedNodeIds(publishedGraph ?? null, graph), [publishedGraph, graph]);
  // Stable object so unrelated parent re-renders don't restart the preview.
  const previewGraph = useMemo(() => (preview ? { ...graph, startNodeId: preview.start } : null), [graph, preview]);

  // While the route preview is open, freeze the page behind it: pause the global
  // smooth scroller (Lenis) and hide the page scrollbar, so the overlay is the
  // only thing that scrolls and the mouse wheel reaches it.
  const previewOpen = !!preview;
  useEffect(() => {
    if (!previewOpen) return;
    const lenis = (window as any).__lenis;
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    lenis?.stop?.();
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prevOverflow;
      lenis?.start?.();
    };
  }, [previewOpen]);

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

  // ── Pop-out node editor ──
  // The node window talks to this editor over a BroadcastChannel: it asks for the
  // case, sends every edit back (saved by the story editor like any other change),
  // and node clicks are mirrored both ways.
  const nodeChannelKey = useMemo(() => uid("ch"), []);
  const nodeChan = useRef<BroadcastChannel | null>(null);
  const fromNodeWindow = useRef(new WeakSet<InteractiveGraph>());
  const remoteSelect = useRef<string | null>(null);
  const nodeHandlers = useRef({ graph, title, selectedId, onUpdate: (_g: InteractiveGraph) => {}, onSelect: (_id: string) => {} });
  nodeHandlers.current = {
    graph, title, selectedId,
    onUpdate: (g: InteractiveGraph) => { fromNodeWindow.current.add(g); onChange(g); },
    onSelect: (id: string) => { remoteSelect.current = id; if (graphRef.current.nodes.some((n) => n.id === id)) goToIssue({ nodeId: id }); },
  };
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const chan = new BroadcastChannel(`${NODE_CHANNEL_PREFIX}${nodeChannelKey}`);
    nodeChan.current = chan;
    chan.onmessage = (e: MessageEvent<NodeMsg>) => {
      const m = e.data;
      const h = nodeHandlers.current;
      if (!m || typeof m !== "object") return;
      if (m.t === "hello") chan.postMessage({ t: "state", graph: h.graph, title: h.title, selectedId: h.selectedId } satisfies NodeMsg);
      else if (m.t === "ping") chan.postMessage({ t: "pong" } satisfies NodeMsg);
      else if (m.t === "update" && m.graph && Array.isArray(m.graph.nodes)) h.onUpdate(m.graph);
      else if (m.t === "select" && m.id) h.onSelect(m.id);
    };
    const bye = () => chan.postMessage({ t: "bye" } satisfies NodeMsg);
    window.addEventListener("pagehide", bye);
    return () => { window.removeEventListener("pagehide", bye); bye(); chan.close(); nodeChan.current = null; };
  }, [nodeChannelKey]);
  useEffect(() => {
    if (fromNodeWindow.current.has(graph)) return;
    nodeChan.current?.postMessage({ t: "state", graph, title } satisfies NodeMsg);
  }, [graph, title]);
  useEffect(() => {
    if (remoteSelect.current === selectedId) { remoteSelect.current = null; return; }
    if (selectedId) nodeChan.current?.postMessage({ t: "select", id: selectedId } satisfies NodeMsg);
  }, [selectedId]);
  useEffect(() => {
    if (savedAt) nodeChan.current?.postMessage({ t: "saved", at: savedAt } satisfies NodeMsg);
  }, [savedAt]);
  const openNodeEditor = () => {
    const w = window.open(`/node-editor?ch=${nodeChannelKey}`, "ic-node-editor", "popup=yes,width=1480,height=920");
    if (!w) toast.error("The pop-up was blocked. Allow pop-ups for this site and press the button again.");
    else w.focus();
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
      const t = value.slice(NEW_PREFIX.length) as NodeType;
      const created = blankNode(t, nextNodeId(graph, t));
      nodes = [...nodes, created];
      target = created.id;
    }
    setNodes(nodes.map((n) => (n.id === sel.id ? apply(n, target) : n)));
  };

  const addNode = (type: NodeType) => {
    const n = blankNode(type, nextNodeId(graph, type));
    // A scene that does not continue anywhere yet is linked to the new section,
    // so new sections start out connected instead of "unreachable".
    let nodes = graph.nodes.map((x) =>
      x.id === sel?.id && (x.type || "narrative") === "narrative" && !x.next && !(x.routes || []).length ? { ...x, next: n.id } : x);
    nodes = [...nodes];
    nodes.splice(selIndex < 0 ? nodes.length : selIndex + 1, 0, n);
    setNodes(nodes);
    setSelectedId(n.id);
  };

  const duplicateNode = () => {
    const copy: StoryNode = JSON.parse(JSON.stringify(sel));
    copy.id = nextNodeId(graph, sel.type || "narrative");
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
  const questions = Array.isArray(graph.settings.conclusionQuestions) ? graph.settings.conclusionQuestions : getConclusionQuestions(graph.settings);
  const items = graph.settings.items || [];

  // Test link: a snapshot of the case as it is right now, readable by anyone with the link.
  const [testLink, setTestLink] = useState<string | null>(null);
  const [makingLink, setMakingLink] = useState(false);
  const createTestLink = async () => {
    setMakingLink(true);
    try {
      const token = (() => { try { return JSON.parse(localStorage.getItem("app-auth-session") || "null")?.access_token || null; } catch { return null; } })();
      if (!token) throw new Error("Sign in again to create a test link.");
      const id = crypto.randomUUID();
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const body = JSON.stringify({ title: title || "Untitled case", createdAt: new Date().toISOString(), graph: graphRef.current });
      const res = await fetch(`${url}/storage/v1/object/images/test-cases/${id}.json`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-upsert": "false" },
        body,
      });
      if (!res.ok) throw new Error((await res.text().catch(() => "")) || `Upload failed (${res.status})`);
      const link = `${window.location.origin}/test-case/${id}`;
      setTestLink(link);
      try { await navigator.clipboard.writeText(link); toast.success("Test link copied. It shows the case exactly as it is now."); }
      catch { toast.success("Test link created."); }
    } catch (e: any) {
      toast.error(e?.message || "Could not create the test link.");
    } finally { setMakingLink(false); }
  };

  /** Swap in a whole new graph, with an Undo in the toast so nothing is lost by accident. */
  const replaceGraph = (g: InteractiveGraph, message: string) => {
    const before = graphRef.current;
    onChange(g);
    setSelectedId(g.startNodeId);
    toast.success(message, {
      duration: 10000,
      action: { label: "Undo", onClick: () => { onChange(before); setSelectedId(before.startNodeId); } },
    });
  };

  const loadTemplate = async (templateId: string) => {
    const t = TEMPLATES.find((x) => x.id === templateId);
    if (!t) return;
    const hasWork = graph.nodes.length > 1 || graph.nodes.some((n) => n.content.replace(/<[^>]*>/g, "").trim());
    const question = t.id === "blank" ? "Clear the whole case and start empty?" : `Replace the current case structure with “${t.label}”?`;
    if (hasWork && !window.confirm(question)) return;
    try {
      const g = await t.make();
      replaceGraph(g, t.id === "blank" ? "Case cleared." : `Loaded “${t.label}”.`);
    } catch {
      toast.error("Could not load that template. Try again.");
    }
  };

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonDraft);
      if (!parsed || !Array.isArray(parsed.nodes)) throw new Error("JSON must contain a \"nodes\" array.");
      const g = normalizeGraph(parsed);
      replaceGraph(g, "JSON applied.");
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CollapseButton open={settingsOpen} onToggle={toggleSettings} label="case settings" />
            <button type="button" onClick={toggleSettings} className="text-sm font-medium text-foreground text-left">Interactive case settings</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openNodeEditor} className={`${smallBtn} border-primary/60 text-primary`} title="Opens the visual node editor in its own window. Edits there show up here and save straight away.">
              Open node editor ↗
            </button>
            <select value="" onChange={(e) => loadTemplate(e.target.value)} className={`${smallBtn} bg-transparent [color-scheme:dark]`} aria-label="Load a template">
              <option value="">Load a template or clear…</option>
              {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <button type="button" onClick={() => { setJsonDraft(JSON.stringify(graph, null, 2)); setJsonError(null); setShowJson((v) => !v); }} className={smallBtn}>
              {showJson ? "Close JSON" : "Import / export JSON"}
            </button>
          </div>
        </div>
        <Collapse open={settingsOpen}>
        <div className="pt-3">
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
        <div className="mt-5" data-loc="settings:items">
          <label className={label}>Inventory items — things readers can pick up through their choices</label>
          <ItemsEditor items={graph.settings.items || []} onChange={(items) => setSettings({ items: items.length ? items : undefined })} />
        </div>
        <div className="mt-5">
          <label className={label}>Closing questions — readers answer each one in writing after the ending (none = no written conclusion)</label>
          <QuestionsEditor
            questions={questions}
            onChange={(qs) => setSettings({ conclusionQuestions: qs, conclusionPrompt: qs.find((q) => q.trim()) || "" })}
          />
        </div>
        {varNames.length > 0 && (
          <p className="mt-3 text-[11px] text-muted-foreground break-words">
            Variables in this case: <span className="font-mono">{varNames.join(", ")}</span>
          </p>
        )}
        </div>
        </Collapse>
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
          <div className="flex items-center gap-2 min-w-0">
          {(issues.length > 0 || removed.length > 0) && <CollapseButton open={checkOpen} onToggle={toggleCheck} label="structure check" />}
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
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setPreview({ start: graph.startNodeId, key: Date.now() })} className="px-3 py-1.5 bg-accent/20 hover:bg-accent/30 text-accent rounded text-xs">
              Preview from opening
            </button>
            <button type="button" onClick={createTestLink} disabled={makingLink} className="px-3 py-1.5 border border-border hover:border-primary hover:text-primary rounded text-xs disabled:opacity-50"
              title="Creates a link testers can open without an account. It shows the case as it is right now; make a new link after changes.">
              {makingLink ? "Creating…" : "Copy test link"}
            </button>
          </div>
        </div>
        {testLink && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Test link (snapshot of this version):</span>
            <input readOnly value={testLink} onFocus={(e) => e.currentTarget.select()} className={`${field} !py-1 font-mono text-xs flex-1 min-w-[16rem]`} />
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(testLink); toast.success("Copied."); }} className={smallBtn}>Copy</button>
            <a href={testLink} target="_blank" rel="noreferrer" className={smallBtn}>Open</a>
          </div>
        )}
        <Collapse open={checkOpen}>
        {(issues.length > 0 || removed.length > 0) && (
          <ul className="mt-3 space-y-1.5 text-xs max-h-72 overflow-y-auto overscroll-contain pr-1" data-lenis-prevent>
            {removed.length > 0 && (
              <li className="text-destructive">
                Removed since last publish: {removed.join(", ")} — readers currently on these sections will be stranded.
              </li>
            )}
            {[...issues].sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1)).map((i, k) => {
              const n = i.nodeId ? graph.nodes.find((x) => x.id === i.nodeId) : undefined;
              const t = n?.type || "narrative";
              const name = n ? (n.title || n.endingTitle || "") : "";
              const canGo = !!(i.nodeId || i.loc);
              return (
                <li key={k}>
                  <button type="button" disabled={!canGo} onClick={() => goToIssue(i)}
                    className={`group w-full text-left rounded border px-2 py-1.5 transition-colors ${i.level === "error" ? "border-destructive/40 hover:bg-destructive/10" : "border-accent/30 hover:bg-accent/10"} disabled:cursor-default`}>
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className={`text-[9px] uppercase tracking-wider px-1 border rounded ${i.level === "error" ? "border-destructive/60 text-destructive" : "border-accent/60 text-accent"}`}>{i.level === "error" ? "Error" : "Warning"}</span>
                      {n && <span className={`text-[9px] uppercase tracking-wider px-1 border rounded ${TYPE_STYLE[t]}`}>{TYPE_LABEL[t]}</span>}
                      {n && <span className="font-mono text-foreground">{n.id}</span>}
                      {name && <span className="text-muted-foreground truncate max-w-[14rem]">“{name}”</span>}
                      {i.where && <span className="text-foreground">› {i.where}</span>}
                      {canGo && <span className="ml-auto text-[10px] text-muted-foreground group-hover:text-foreground">Go to →</span>}
                    </span>
                    <span className={`block mt-0.5 ${i.level === "error" ? "text-destructive" : "text-accent"}`}>{i.message}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {errors.length > 0 && <p className="text-[11px] text-muted-foreground mt-2">Errors must be fixed before the case can be published.</p>}
        </Collapse>
      </div>

      {/* Story map */}
      <div className={panel}>
        <div className="flex items-center gap-2">
          <CollapseButton open={mapOpen} onToggle={toggleMap} label="story map" />
          <button type="button" onClick={toggleMap} className="text-sm font-medium text-foreground text-left">Story map</button>
          {!mapOpen && <span className="text-xs text-muted-foreground">· every decision and ending as a flowchart</span>}
        </div>
        <Collapse open={mapOpen}>
          <div className="pt-3">
            {mapOpen && <CaseMap graph={graph} selected={sel?.id} onSelect={(id) => goToIssue({ nodeId: id })} />}
            <p className="text-[11px] text-muted-foreground mt-2">Click a decision or ending to open it below. Scenes are folded into the arrows between decisions.</p>
          </div>
        </Collapse>
      </div>

      <div className={`grid grid-cols-1 gap-y-6 transition-[grid-template-columns,column-gap] duration-200 ease-out motion-reduce:transition-none ${structureOpen ? "lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-x-6" : "lg:grid-cols-[0rem_minmax(0,1fr)] lg:gap-x-0"}`}>
        {/* Node list — scrolls on its own so the page stays put. On wide screens it
            slides closed sideways; on narrow screens it folds up. */}
        <div className={`min-w-0 overflow-clip transition-opacity duration-200 ease-out ${structureOpen ? "opacity-100" : "hidden lg:block opacity-0 pointer-events-none"}`}
          aria-hidden={!structureOpen} {...(structureOpen ? {} : ({ inert: "" } as Record<string, string>))}>
        <aside className={`${panel} flex flex-col max-h-[75vh] lg:w-72 lg:sticky lg:top-20`}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Structure · {graph.nodes.length}</h3>
            <CollapseButton open onToggle={toggleStructure} label="structure" />
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            <button type="button" onClick={() => addNode("narrative")} className={smallBtn}>+ Scene</button>
            <button type="button" onClick={() => addNode("decision")} className={smallBtn}>+ Decision</button>
            <button type="button" onClick={() => addNode("ending")} className={smallBtn} data-loc="add:ending">+ Ending</button>
          </div>
          <ol className="space-y-1 flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1" data-lenis-prevent>
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
                    {n.type === "decision" && <span className="ml-1 text-[9px] uppercase text-muted-foreground">{(n.options || []).length} choices</span>}
                    {n.type === "decision" && (n.timeLimit || 0) > 0 && <span className="ml-1 text-[9px] uppercase text-primary">⏱ {n.timeLimit}s</span>}
                    {errs > 0 && <span className="ml-1 text-destructive">●</span>}
                    {!errs && warns > 0 && <span className="ml-1 text-accent">●</span>}
                    {(n.title || n.endingTitle) && <span className="block text-muted-foreground truncate">{n.title || n.endingTitle}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
        </div>

        {/* Node form */}
        <section className={`${panel} min-w-0`} data-loc={`${sel.id}|section`}>
          <div className="flex flex-wrap items-center gap-2">
            <CollapseButton open={sectionOpen} onToggle={toggleSection} label="section" />
            {!sectionOpen && <span className="font-mono text-xs text-muted-foreground">{sel.id}</span>}
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
          <Collapse open={sectionOpen}>
          <div className="space-y-5 pt-5">
          {(incoming.get(sel.id) || []).length > 0 && (
            <p className="text-[11px] text-muted-foreground">Reached from: <span className="font-mono">{[...new Set(incoming.get(sel.id))].join(", ")}</span></p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div data-loc={`${sel.id}|id`}>
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

          {/* Choices — first thing you see on a decision */}
          {sel.type === "decision" && (
            <div className="rounded-lg border border-primary/40 bg-primary/[0.03] p-4 space-y-4" data-loc={`${sel.id}|choices`}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h4 className="text-sm font-medium text-foreground">Choices</h4>
                  <p className="text-[11px] text-muted-foreground">What the reader can pick. Each choice needs a label and a section it leads to.</p>
                </div>
                <div className="flex items-end gap-2">
                  <div data-loc={`${sel.id}|timer`}>
                    <label className={label}>⏱ Timer (seconds)</label>
                    <input type="number" min={5} max={3600} value={sel.timeLimit ?? ""} placeholder="No timer"
                      onChange={(e) => { const v = parseInt(e.target.value, 10); patchSel({ timeLimit: Number.isFinite(v) && v > 0 ? v : undefined }); }}
                      className={`${field} w-32`} />
                  </div>
                </div>
              </div>
              {(sel.timeLimit || 0) > 0 && (
                <p className="text-[11px] text-primary -mt-2">Timed decision: readers get {sel.timeLimit} seconds once they reach it. When time runs out, a random available choice is filed for them.</p>
              )}
              <div className="space-y-3">
                {(sel.options || []).map((o, i) => {
                  const letter = String.fromCharCode(65 + i);
                  const key = `${sel.id}:opt:${o.id}`;
                  const req = findItem(graph, o.requiresItem);
                  const st = req ? itemStyle(req.color) : null;
                  const otherEffects = (o.effects || []).filter((e) => !e.var.startsWith(ITEM_PREFIX));
                  const otherVisible = (o.visibleIf || []).filter((c) => !(o.requiresItem && c.var === itemVar(o.requiresItem)));
                  const itemMode = (id: string) => {
                    const e = (o.effects || []).find((x) => x.var === itemVar(id));
                    return !e ? "none" : (e.value === "" || e.value === "0" || e.value === "false") ? "take" : "give";
                  };
                  const setItemMode = (id: string, mode: "none" | "give" | "take") => {
                    const rest = (o.effects || []).filter((x) => x.var !== itemVar(id));
                    const next = mode === "none" ? rest : [...rest, { var: itemVar(id), op: "set" as const, value: mode === "give" ? "1" : "0" }];
                    patchOption(o.id, { effects: next.length ? next : undefined });
                  };
                  const setRequires = (id: string) => {
                    const base = (o.visibleIf || []).filter((c) => !(o.requiresItem && c.var === itemVar(o.requiresItem)));
                    const vis = id ? [...base, { var: itemVar(id), op: "truthy" as const }] : base;
                    patchOption(o.id, { requiresItem: id || undefined, visibleIf: vis.length ? vis : undefined });
                  };
                  const advOpen = openVars[o.id] ?? !!(otherEffects.length || otherVisible.length || o.lockedIf?.length);
                  const problems = [!o.label?.trim() && "needs a label", !o.next && "pick where it leads"].filter(Boolean) as string[];
                  return (
                  <div key={o.id} className={`p-4 border rounded-lg ${st ? `${st.border} ${st.bg}` : "border-border"}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <CollapseButton open={cardOpen(key)} onToggle={() => toggleCard(key)} label={`choice ${letter}`} />
                      <span className={`font-display text-lg ${st ? st.text : "text-primary"}`}>{letter}.</span>
                      {req && <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 border rounded ${st!.border} ${st!.text}`}>Item: {req.name}</span>}
                      {!cardOpen(key) && <span className="text-xs text-muted-foreground truncate min-w-0">{o.label || <em>No label</em>} → <span className="font-mono">{o.next || "—"}</span></span>}
                      {problems.length > 0 && <span className="text-[11px] text-destructive truncate">{problems.join(" · ")}</span>}
                      <div className="ml-auto flex gap-1">
                        <button type="button" onClick={() => moveOption(i, -1)} disabled={i === 0} className={smallBtn} aria-label="Move choice up">↑</button>
                        <button type="button" onClick={() => moveOption(i, 1)} disabled={i === (sel.options || []).length - 1} className={smallBtn} aria-label="Move choice down">↓</button>
                        <button type="button" onClick={() => patchSel({ options: (sel.options || []).filter((x) => x.id !== o.id) })}
                          disabled={(sel.options || []).length <= 2} className={`${smallBtn} hover:border-destructive hover:text-destructive`}>Remove</button>
                      </div>
                    </div>
                    <Collapse open={cardOpen(key)}>
                    <div className="space-y-3 pt-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div data-loc={`${sel.id}|opt:${i}:label`}>
                        <label className={label}>Choice text</label>
                        <input value={o.label} onChange={(e) => patchOption(o.id, { label: e.target.value })} placeholder="e.g. Follow Mara into the kitchen." className={field} />
                      </div>
                      <div data-loc={`${sel.id}|opt:${i}:next`}>
                        <label className={label}>Leads to</label>
                        <NodeSelect value={o.next} nodes={graph.nodes} selfId={sel.id} emptyLabel="— choose —"
                          onChange={(v) => commitLink(v, (n, id) => ({ ...n, options: (n.options || []).map((x) => (x.id === o.id ? { ...x, next: id } : x)) }))} />
                      </div>
                    </div>
                    <div>
                      <label className={label}>Description (optional)</label>
                      <input value={o.description || ""} onChange={(e) => patchOption(o.id, { description: e.target.value || undefined })}
                        placeholder="e.g. “She was in the house first. She knows where the key is.”" className={field} />
                    </div>
                    <div>
                      <label className={label}>Consequence logged after confirming (optional)</label>
                      <input value={o.consequence || ""} onChange={(e) => patchOption(o.id, { consequence: e.target.value || undefined })}
                        placeholder="e.g. Mara will remember this." className={field} />
                    </div>
                    {items.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div data-loc={`${sel.id}|opt:${i}:item`}>
                          <label className={label}>Item choice — only shown to readers carrying</label>
                          <select value={o.requiresItem || ""} onChange={(e) => setRequires(e.target.value)} className={field}>
                            <option value="">— nobody needs an item (normal red choice) —</option>
                            {items.map((it) => <option key={it.id} value={it.id}>{it.name || it.id} ({ITEM_STYLE[it.color]?.label || "Blue"})</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={label}>Picking this choice…</label>
                          <div className="flex flex-wrap gap-1.5">
                            {items.map((it) => {
                              const m = itemMode(it.id);
                              const ist = itemStyle(it.color);
                              const cycle = () => setItemMode(it.id, m === "none" ? "give" : m === "give" ? "take" : "none");
                              return (
                                <button key={it.id} type="button" onClick={cycle} title="Click to switch: no change → gives → takes away"
                                  className={`px-2 py-1 text-xs border rounded transition-colors ${m === "none" ? "border-border text-muted-foreground" : `${ist.border} ${ist.text} ${ist.bg}`}`}>
                                  <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${ist.dot}`} />
                                  {m === "give" ? "Gives " : m === "take" ? "Takes away " : ""}{it.name || it.id}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Want item choices (e.g. a gun picked up earlier)? Add inventory items under Interactive case settings.</p>
                    )}
                    <div className="text-sm">
                      <button type="button" onClick={() => setOpenVars((m) => ({ ...m, [o.id]: !advOpen }))}
                        aria-expanded={advOpen}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground select-none text-left">
                        <span className={`inline-block transition-transform duration-200 ease-out ${advOpen ? "rotate-90" : ""}`}>▸</span>
                        Variables & conditions (advanced)
                        {otherEffects.length > 0 && ` · sets ${otherEffects.length}`}
                        {otherVisible.length > 0 && " · conditional"}
                        {(o.lockedIf?.length || 0) > 0 && " · can lock"}
                      </button>
                      <Collapse open={advOpen}>
                      <div className="mt-3 space-y-4 pl-3 border-l border-border">
                        <div>
                          <label className={label}>When chosen</label>
                          <EffectList value={otherEffects} onChange={(e) => {
                            const itemFx = (o.effects || []).filter((x) => x.var.startsWith(ITEM_PREFIX));
                            const all = [...e, ...itemFx];
                            patchOption(o.id, { effects: all.length ? all : undefined });
                          }} />
                        </div>
                        <div>
                          <label className={label}>Only show this choice if…</label>
                          <ConditionList value={otherVisible} onChange={(c) => {
                            const itemCond = (o.visibleIf || []).filter((x) => o.requiresItem && x.var === itemVar(o.requiresItem));
                            const all = [...c, ...itemCond];
                            patchOption(o.id, { visibleIf: all.length ? all : undefined });
                          }} empty={req ? `Shown to readers carrying ${req.name || req.id}.` : "Always shown."} />
                        </div>
                        <div>
                          <label className={label}>Show as unavailable (locked) if…</label>
                          <ConditionList value={o.lockedIf} onChange={(c) => patchOption(o.id, { lockedIf: c.length ? c : undefined })} empty="Never locked." />
                        </div>
                      </div>
                      </Collapse>
                    </div>
                    </div>
                    </Collapse>
                  </div>
                  );
                })}
                {(sel.options || []).length < MAX_OPTIONS && (
                  <button type="button" onClick={() => patchSel({ options: [...(sel.options || []), blankOption()] })}
                    className="w-full py-2 border border-dashed border-border rounded-lg text-xs text-primary hover:border-primary transition-colors">
                    + Add choice
                  </button>
                )}
              </div>
            </div>
          )}

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
              <div data-loc={`${sel.id}|notebook`}>
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
                    <div key={i} className="p-3 border border-border rounded-lg" data-loc={`${sel.id}|route:${i}`}>
                      <div className="flex items-center gap-2">
                        <CollapseButton open={cardOpen(`${sel.id}:route:${i}`)} onToggle={() => toggleCard(`${sel.id}:route:${i}`)} label={`route ${i + 1}`} />
                        <span className="text-xs text-muted-foreground">Route {i + 1}</span>
                        {!cardOpen(`${sel.id}:route:${i}`) && <span className="text-xs text-muted-foreground/80 truncate min-w-0">· {(r.conditions || []).length} condition{(r.conditions || []).length === 1 ? "" : "s"} → <span className="font-mono">{r.to || "—"}</span></span>}
                      </div>
                      <Collapse open={cardOpen(`${sel.id}:route:${i}`)}>
                      <div className="space-y-2 pt-2">
                      <ConditionList value={r.conditions} empty="No conditions — this route always matches."
                        onChange={(c) => patchSel({ routes: (sel.routes || []).map((x, j) => (j === i ? { ...x, conditions: c } : x)) })} />
                      <div className="flex gap-2 items-center">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">then go to</span>
                        <NodeSelect value={r.to} nodes={graph.nodes} selfId={sel.id} emptyLabel="— choose —"
                          onChange={(v) => commitLink(v, (n, id) => ({ ...n, routes: (n.routes || []).map((x, j) => (j === i ? { ...x, to: id } : x)) }))} />
                        <button type="button" onClick={() => patchSel({ routes: (sel.routes || []).filter((_, j) => j !== i) })} className={smallBtn} aria-label="Remove route">✕</button>
                      </div>
                      </div>
                      </Collapse>
                    </div>
                  ))}
                  <button type="button" onClick={() => patchSel({ routes: [...(sel.routes || []), { conditions: [{ var: "", op: "truthy" }], to: "" }] })} className="text-xs text-primary hover:underline">
                    + Add conditional route
                  </button>
                </div>
              </div>
              <div data-loc={`${sel.id}|next`}>
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
            </>
          )}

          {/* Ending */}
          {sel.type === "ending" && (
            <>
              <div data-loc={`${sel.id}|endingTitle`}>
                <label className={label}>Ending title</label>
                <input value={sel.endingTitle || ""} onChange={(e) => patchSel({ endingTitle: e.target.value })} placeholder="PLATFORM 4" className={`${field} font-display uppercase`} />
              </div>
              <div>
                <label className={label}>Outcome description</label>
                <textarea value={sel.endingText || ""} onChange={(e) => patchSel({ endingText: e.target.value })} rows={3}
                  placeholder="Celeste Varga is arrested on Platform 4. The file is closed." className={field} />
                <p className="text-[11px] text-muted-foreground mt-1">Describe what happens, never whether the reader was right. The written conclusion and your review do that.</p>
              </div>
            </>
          )}
          </div>
          </Collapse>
        </section>
      </div>

      {/* Route preview — local only, never touches reader progress */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto overscroll-contain" data-lenis-prevent>
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
