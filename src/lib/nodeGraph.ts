import {
  nextNodeId, uid, itemVar, ITEM_PREFIX,
  type DecisionOption, type InteractiveGraph, type NodeType, type StoryNode,
} from "@/lib/interactive";

// Node editor model: geometry, automatic layout and every edit the canvas can
// make (add, connect, insert, delete, move…). Pure functions on the graph, so
// the canvas, the pop-out window and the main editor all share one source of
// truth: the InteractiveGraph that gets saved.

export const NODE_W = 264;
export const NODE_HEAD = 46;
export const NODE_BODY = 44;
export const NODE_ROW = 30;
export const NODE_PAD = 8;
const COL_GAP = 100;
const ROW_GAP = 36;

export interface Pos { x: number; y: number }

export type PortRef =
  | { nodeId: string; kind: "next" }
  | { nodeId: string; kind: "route"; index: number }
  | { nodeId: string; kind: "option"; optionId: string };

export interface NodeRow {
  port: PortRef;
  key: string;
  label: string;
  to: string;
  tone: "next" | "route" | "option";
  requiresItem?: string;
  gives: string[];
  /** Has a lock rule (lockedIf). */
  locked: boolean;
  /** Has a show-only-if rule besides the item requirement. */
  conditional: boolean;
}

export const typeOf = (n: StoryNode): NodeType => n.type || "narrative";
export const portKey = (p: PortRef) =>
  p.kind === "next" ? `${p.nodeId}::next` : p.kind === "route" ? `${p.nodeId}::route::${p.index}` : `${p.nodeId}::opt::${p.optionId}`;

export const givesOf = (o: DecisionOption) =>
  (o.effects || []).filter((e) => e.var.startsWith(ITEM_PREFIX) && e.value !== "0" && e.value !== "" && e.value !== "false").map((e) => e.var.slice(ITEM_PREFIX.length));

/** The outgoing connections a node shows as rows, in order. */
export function rowsOf(n: StoryNode): NodeRow[] {
  const t = typeOf(n);
  if (t === "ending") return [];
  if (t === "decision") {
    return (n.options || []).map((o) => ({
      port: { nodeId: n.id, kind: "option", optionId: o.id },
      key: `${n.id}::opt::${o.id}`,
      label: o.label,
      to: o.next || "",
      tone: "option",
      requiresItem: o.requiresItem,
      gives: givesOf(o),
      locked: !!o.lockedIf?.length,
      conditional: (o.visibleIf || []).some((c) => !(o.requiresItem && c.var === itemVar(o.requiresItem))),
    }));
  }
  const rows: NodeRow[] = [{ port: { nodeId: n.id, kind: "next" }, key: `${n.id}::next`, label: "Continue", to: n.next || "", tone: "next", gives: [], locked: false, conditional: false }];
  (n.routes || []).forEach((r, i) => rows.push({
    port: { nodeId: n.id, kind: "route", index: i },
    key: `${n.id}::route::${i}`,
    label: r.conditions.length ? `If ${r.conditions.map(condLabel).join(" and ")}` : "If…",
    to: r.to || "",
    tone: "route",
    gives: [],
    locked: false,
    conditional: true,
  }));
  return rows;
}

function condLabel(c: { var: string; op?: string; value?: string }) {
  const v = c.var.startsWith(ITEM_PREFIX) ? `has ${c.var.slice(ITEM_PREFIX.length)}` : c.var || "?";
  switch (c.op) {
    case "falsy": return `not ${v}`;
    case "truthy": return v;
    case "neq": return `${v} ≠ ${c.value ?? ""}`;
    case "gt": return `${v} > ${c.value ?? ""}`;
    case "gte": return `${v} ≥ ${c.value ?? ""}`;
    case "lt": return `${v} < ${c.value ?? ""}`;
    case "lte": return `${v} ≤ ${c.value ?? ""}`;
    default: return `${v} = ${c.value ?? ""}`;
  }
}

export const nodeHeight = (n: StoryNode) => NODE_HEAD + NODE_BODY + rowsOf(n).length * NODE_ROW + NODE_PAD;
export const posOf = (n: StoryNode): Pos => n.pos || { x: 0, y: 0 };
export const inPoint = (n: StoryNode, p: Pos = posOf(n)): Pos => ({ x: p.x, y: p.y + NODE_HEAD / 2 });
export const outPoint = (n: StoryNode, row: number, p: Pos = posOf(n)): Pos => ({ x: p.x + NODE_W, y: p.y + NODE_HEAD + NODE_BODY + row * NODE_ROW + NODE_ROW / 2 });

export function snippet(n: StoryNode, max = 120): string {
  const raw = typeOf(n) === "ending" ? n.endingText || "" : typeOf(n) === "decision" ? n.context || n.content || "" : n.content || "";
  const text = raw.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export const nodeName = (n: StoryNode) => (typeOf(n) === "ending" ? n.endingTitle : n.title || (typeOf(n) === "narrative" ? n.label : "")) || "";

// ── Layout ──

/** Left-to-right layered layout (longest path from the start, then crossing reduction). */
export function layoutPositions(g: InteractiveGraph): Record<string, Pos> {
  const ids = g.nodes.map((n) => n.id);
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const succ = new Map<string, string[]>();
  for (const n of g.nodes) succ.set(n.id, [...new Set(rowsOf(n).map((r) => r.to).filter((t) => byId.has(t)))]);

  // DFS order; back edges (loops) are ignored for layering.
  const order: string[] = [];
  const state = new Map<string, number>();
  const back = new Set<string>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const t of succ.get(id) || []) {
      if (state.get(t) === 1) back.add(`${id}>${t}`);
      else if (!state.get(t)) visit(t);
    }
    state.set(id, 2);
    order.push(id);
  };
  if (byId.has(g.startNodeId)) visit(g.startNodeId);
  for (const id of ids) if (!state.get(id)) visit(id);
  const topo = order.reverse();

  const layer = new Map<string, number>(topo.map((id) => [id, 0]));
  for (const id of topo) {
    for (const t of succ.get(id) || []) {
      if (back.has(`${id}>${t}`)) continue;
      layer.set(t, Math.max(layer.get(t) || 0, (layer.get(id) || 0) + 1));
    }
  }
  const pred = new Map<string, string[]>();
  for (const [id, ts] of succ) for (const t of ts) if (!back.has(`${id}>${t}`)) pred.set(t, [...(pred.get(t) || []), id]);

  const cols = new Map<number, string[]>();
  for (const id of topo) cols.set(layer.get(id)!, [...(cols.get(layer.get(id)!) || []), id]);
  const layers = [...cols.keys()].sort((a, b) => a - b);
  const idx = () => {
    const m = new Map<string, number>();
    for (const c of cols.values()) c.forEach((id, i) => m.set(id, i));
    return m;
  };
  for (let sweep = 0; sweep < 8; sweep++) {
    const down = sweep % 2 === 0;
    const seq = down ? layers : [...layers].reverse();
    for (const l of seq) {
      const m = idx();
      const score = (id: string) => {
        const ns = (down ? pred.get(id) : succ.get(id)) || [];
        const vals = ns.map((x) => m.get(x)).filter((v): v is number => v != null);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : m.get(id)!;
      };
      cols.set(l, [...cols.get(l)!].sort((a, b) => score(a) - score(b)));
    }
  }

  const out: Record<string, Pos> = {};
  for (const l of layers) {
    const col = cols.get(l)!;
    const heights = col.map((id) => nodeHeight(byId.get(id)!));
    const total = heights.reduce((a, b) => a + b, 0) + ROW_GAP * (col.length - 1);
    let y = -total / 2;
    col.forEach((id, i) => {
      out[id] = { x: l * (NODE_W + COL_GAP), y: Math.round(y) };
      y += heights[i] + ROW_GAP;
    });
  }
  return out;
}

/** Re-arranges every node. */
export function autoArrange(g: InteractiveGraph): InteractiveGraph {
  const pos = layoutPositions(g);
  return { ...g, nodes: g.nodes.map((n) => ({ ...n, pos: pos[n.id] })) };
}

/** Gives a position to nodes that have none (new graphs, or nodes added in the main editor).
 *  Returns the same object when nothing was missing. */
export function ensurePositions(g: InteractiveGraph): InteractiveGraph {
  const missing = g.nodes.filter((n) => !n.pos || !Number.isFinite(n.pos.x) || !Number.isFinite(n.pos.y));
  if (!missing.length) return g;
  if (missing.length === g.nodes.length) return autoArrange(g);
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const placed = new Map<string, Pos>();
  for (const n of g.nodes) if (n.pos && !missing.includes(n)) placed.set(n.id, n.pos);
  const maxX = Math.max(...[...placed.values()].map((p) => p.x));
  let spare = 0;
  for (const n of missing) {
    // Next to the first node that links to it, otherwise in a column on the right.
    const from = g.nodes.find((x) => placed.has(x.id) && rowsOf(x).some((r) => r.to === n.id));
    let p: Pos;
    if (from) {
      const fp = placed.get(from.id)!;
      p = { x: fp.x + NODE_W + COL_GAP, y: fp.y };
      while ([...placed.values()].some((q) => Math.abs(q.x - p.x) < NODE_W && Math.abs(q.y - p.y) < 80)) p = { x: p.x, y: p.y + 120 };
    } else {
      p = { x: maxX + NODE_W + COL_GAP, y: spare };
      spare += nodeHeight(byId.get(n.id)!) + ROW_GAP;
    }
    placed.set(n.id, p);
  }
  return { ...g, nodes: g.nodes.map((n) => (placed.has(n.id) && (!n.pos || missing.includes(n)) ? { ...n, pos: placed.get(n.id) } : n)) };
}

// ── Edits ──

export function blankOption(): DecisionOption {
  return { id: uid("o"), label: "", next: "" };
}

export function blankNode(type: NodeType, id: string, pos?: Pos): StoryNode {
  const base = pos ? { pos } : {};
  if (type === "decision") return { id, type, title: "", context: "", content: "", options: [blankOption(), blankOption()], ...base };
  if (type === "ending") return { id, type, content: "", endingTitle: "", endingText: "", ...base };
  return { id, type: "narrative", title: "", content: "", ...base };
}

const mapNode = (g: InteractiveGraph, id: string, fn: (n: StoryNode) => StoryNode): InteractiveGraph =>
  ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? fn(n) : n)) });

export function addNode(g: InteractiveGraph, type: NodeType, pos: Pos): { graph: InteractiveGraph; id: string } {
  const id = nextNodeId(g, type);
  return { graph: { ...g, nodes: [...g.nodes, blankNode(type, id, pos)] }, id };
}

export function getPortTarget(g: InteractiveGraph, port: PortRef): string {
  const n = g.nodes.find((x) => x.id === port.nodeId);
  if (!n) return "";
  if (port.kind === "next") return n.next || "";
  if (port.kind === "route") return n.routes?.[port.index]?.to || "";
  return n.options?.find((o) => o.id === port.optionId)?.next || "";
}

/** Points a port at a node ("" disconnects it). */
export function setPortTarget(g: InteractiveGraph, port: PortRef, to: string): InteractiveGraph {
  return mapNode(g, port.nodeId, (n) => {
    if (port.kind === "next") return { ...n, next: to || undefined };
    if (port.kind === "route") return { ...n, routes: (n.routes || []).map((r, i) => (i === port.index ? { ...r, to } : r)) };
    return { ...n, options: (n.options || []).map((o) => (o.id === port.optionId ? { ...o, next: to } : o)) };
  });
}

/** Puts a new node in the middle of an existing connection. */
export function insertOnPort(g: InteractiveGraph, port: PortRef, type: NodeType, pos: Pos): { graph: InteractiveGraph; id: string } {
  const old = getPortTarget(g, port);
  const { graph, id } = addNode(g, type, pos);
  let next = setPortTarget(graph, port, id);
  if (old) {
    if (type === "narrative") next = mapNode(next, id, (n) => ({ ...n, next: old }));
    if (type === "decision") next = mapNode(next, id, (n) => ({ ...n, options: (n.options || []).map((o, i) => (i === 0 ? { ...o, next: old } : o)) }));
  }
  return { graph: next, id };
}

/** Deletes nodes (never the opening) and clears every link that pointed at them. */
export function deleteNodes(g: InteractiveGraph, ids: string[]): InteractiveGraph {
  const kill = new Set(ids.filter((id) => id !== g.startNodeId));
  if (!kill.size) return g;
  const fix = (t?: string) => (t && kill.has(t) ? "" : t);
  return {
    ...g,
    nodes: g.nodes.filter((n) => !kill.has(n.id)).map((n) => ({
      ...n,
      next: fix(n.next) || undefined,
      routes: n.routes?.map((r) => ({ ...r, to: fix(r.to) || "" })),
      options: n.options?.map((o) => ({ ...o, next: fix(o.next) || "" })),
    })),
  };
}

export function duplicateNodes(g: InteractiveGraph, ids: string[]): { graph: InteractiveGraph; ids: string[] } {
  let next = g;
  const created: string[] = [];
  const rename = new Map<string, string>();
  for (const id of ids) {
    const src = g.nodes.find((n) => n.id === id);
    if (!src) continue;
    const nid = nextNodeId(next, typeOf(src));
    rename.set(id, nid);
    const copy: StoryNode = JSON.parse(JSON.stringify(src));
    copy.id = nid;
    if (copy.title) copy.title = `${copy.title} (copy)`;
    copy.options = copy.options?.map((o) => ({ ...o, id: uid("o") }));
    const p = posOf(src);
    copy.pos = { x: p.x + 40, y: p.y + 40 };
    next = { ...next, nodes: [...next.nodes, copy] };
    created.push(nid);
  }
  // Links between duplicated nodes point at the copies.
  const fix = (t?: string) => (t && rename.has(t) ? rename.get(t)! : t);
  next = { ...next, nodes: next.nodes.map((n) => (created.includes(n.id) ? {
    ...n,
    next: fix(n.next),
    routes: n.routes?.map((r) => ({ ...r, to: fix(r.to) || "" })),
    options: n.options?.map((o) => ({ ...o, next: fix(o.next) || "" })),
  } : n)) };
  return { graph: next, ids: created };
}

export function moveNodes(g: InteractiveGraph, positions: Record<string, Pos>): InteractiveGraph {
  return { ...g, nodes: g.nodes.map((n) => (positions[n.id] ? { ...n, pos: { x: Math.round(positions[n.id].x), y: Math.round(positions[n.id].y) } } : n)) };
}

export const patchNode = (g: InteractiveGraph, id: string, patch: Partial<StoryNode>) => mapNode(g, id, (n) => ({ ...n, ...patch }));

export const patchOption = (g: InteractiveGraph, nodeId: string, optId: string, patch: Partial<DecisionOption>) =>
  mapNode(g, nodeId, (n) => ({ ...n, options: (n.options || []).map((o) => (o.id === optId ? { ...o, ...patch } : o)) }));

export const addOption = (g: InteractiveGraph, nodeId: string) => mapNode(g, nodeId, (n) => ({ ...n, options: [...(n.options || []), blankOption()] }));
export const removeOption = (g: InteractiveGraph, nodeId: string, optId: string) =>
  mapNode(g, nodeId, (n) => ({ ...n, options: (n.options || []).filter((o) => o.id !== optId) }));
export const moveOption = (g: InteractiveGraph, nodeId: string, optId: string, dir: -1 | 1) => mapNode(g, nodeId, (n) => {
  const opts = [...(n.options || [])];
  const i = opts.findIndex((o) => o.id === optId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= opts.length) return n;
  [opts[i], opts[j]] = [opts[j], opts[i]];
  return { ...n, options: opts };
});

export const addRoute = (g: InteractiveGraph, nodeId: string) =>
  mapNode(g, nodeId, (n) => ({ ...n, routes: [...(n.routes || []), { conditions: [{ var: "", op: "truthy" }], to: "" }] }));
export const removeRoute = (g: InteractiveGraph, nodeId: string, index: number) =>
  mapNode(g, nodeId, (n) => ({ ...n, routes: (n.routes || []).filter((_, i) => i !== index) }));

/** Changes a node's type, keeping what still makes sense. */
export function changeType(g: InteractiveGraph, id: string, type: NodeType): InteractiveGraph {
  return mapNode(g, id, (n) => {
    if (typeOf(n) === type) return n;
    if (type === "decision") return { ...n, type, options: n.options?.length ? n.options : [{ ...blankOption(), next: n.next || "" }, blankOption()], next: undefined, routes: undefined };
    if (type === "ending") return { ...n, type, next: undefined, routes: undefined, options: undefined, endingTitle: n.endingTitle ?? n.title ?? "" };
    return { ...n, type: "narrative", next: n.next || n.options?.find((o) => o.next)?.next, options: undefined };
  });
}

/** Item the option needs (kept in sync with the matching show-only-if rule, like the main editor). */
export function withRequiredItem(o: DecisionOption, itemId: string): DecisionOption {
  const base = (o.visibleIf || []).filter((c) => !(o.requiresItem && c.var === itemVar(o.requiresItem)));
  const visibleIf = itemId ? [...base, { var: itemVar(itemId), op: "truthy" as const }] : base;
  return { ...o, requiresItem: itemId || undefined, visibleIf: visibleIf.length ? visibleIf : undefined };
}

/** Turns "picking this option gives item X" on or off. */
export function withGivenItem(o: DecisionOption, itemId: string, on: boolean): DecisionOption {
  const rest = (o.effects || []).filter((e) => e.var !== itemVar(itemId));
  const effects = on ? [...rest, { var: itemVar(itemId), op: "set" as const, value: "1" }] : rest;
  return { ...o, effects: effects.length ? effects : undefined };
}

/** Plain text (blank line between paragraphs) for simple HTML; null when the HTML holds richer blocks. */
export function htmlToParagraphs(html: string): string | null {
  const s = (html || "").trim();
  if (!s) return "";
  if (/<(?!\/?(p|br|em|strong|i|b|u|span|a)\b)[a-z]/i.test(s)) return null;
  return s
    .replace(/^<p[^>]*>/i, "")
    .replace(/<\/p>\s*$/i, "")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n");
}

export function paragraphsToHtml(text: string): string {
  const paras = text.replace(/\r/g, "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return paras.map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
}

/** Bounding box of all nodes. */
export function graphBounds(g: InteractiveGraph): { x: number; y: number; w: number; h: number } {
  if (!g.nodes.length) return { x: 0, y: 0, w: NODE_W, h: 100 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of g.nodes) {
    const p = posOf(n);
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + NODE_W); y1 = Math.max(y1, p.y + nodeHeight(n));
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
