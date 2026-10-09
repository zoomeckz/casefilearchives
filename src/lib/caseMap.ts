import { findNode, type Decision, type InteractiveGraph, type StoryNode } from "@/lib/interactive";

// Story map: turns an interactive case into a layered graph of decisions and
// endings (scenes are folded into the arrows between them), laid out top to
// bottom like a flowchart. Used by the editor, the admin analytics, the case
// reports and the reader's "your route" view.

export const START_ID = "__start";

export interface MapNode {
  id: string;
  kind: "start" | "decision" | "ending";
  title: string;
  layer: number;
  order: number;
  x: number;
  y: number;
  /** Which opening choice first reaches this node (drives the colour). */
  branch: number;
  /** 1-based number for endings (END 1, END 2…). */
  endingNo?: number;
  timed: boolean;
  /** A choice here hands out an inventory item. */
  givesItem: boolean;
}

export interface MapEdge {
  key: string;
  from: string;
  to: string;
  optionId?: string;
  letter?: string;
  label?: string;
  requiresItem?: string;
  /** Reached through a conditional route or an option that can be hidden/locked. */
  conditional: boolean;
  branch: number;
}

export interface CaseMapLayout {
  nodes: MapNode[];
  edges: MapEdge[];
  width: number;
  height: number;
  byId: Record<string, MapNode>;
}

const LAYER_GAP = 96;
const COL_GAP = 92;
const PAD_X = 60;
const PAD_Y = 48;

/** Decisions/endings a section eventually leads to, following scenes (and their conditional routes). */
function stepTargets(g: InteractiveGraph, id: string | undefined, seen = new Set<string>()): { to: string; conditional: boolean }[] {
  if (!id || seen.has(id)) return [];
  seen.add(id);
  const n = findNode(g, id);
  if (!n) return [];
  if (n.type === "decision" || n.type === "ending") return [{ to: n.id, conditional: false }];
  const out: { to: string; conditional: boolean }[] = [];
  for (const r of n.routes || []) for (const t of stepTargets(g, r.to, new Set(seen))) out.push({ to: t.to, conditional: true });
  for (const t of stepTargets(g, n.next, new Set(seen))) out.push({ to: t.to, conditional: t.conditional || (n.conditions?.length || 0) > 0 || (n.routes?.length || 0) > 0 });
  const uniq = new Map<string, { to: string; conditional: boolean }>();
  for (const t of out) if (!uniq.has(t.to) || (uniq.get(t.to)!.conditional && !t.conditional)) uniq.set(t.to, t);
  return [...uniq.values()];
}

const short = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function buildCaseMap(g: InteractiveGraph): CaseMapLayout {
  const nodeIds = new Set<string>([START_ID]);
  const meta = new Map<string, StoryNode | undefined>();
  const edges: MapEdge[] = [];
  const endings = g.nodes.filter((n) => n.type === "ending");

  // Edges out of the start (the opening scenes up to the first decision).
  for (const t of stepTargets(g, g.startNodeId)) {
    edges.push({ key: `${START_ID}>${t.to}`, from: START_ID, to: t.to, conditional: t.conditional, branch: 0 });
  }
  for (const n of g.nodes) {
    if (n.type === "decision" || n.type === "ending") { nodeIds.add(n.id); meta.set(n.id, n); }
    if (n.type !== "decision") continue;
    (n.options || []).forEach((o, i) => {
      for (const t of stepTargets(g, o.next)) {
        edges.push({
          key: `${n.id}:${o.id}>${t.to}`, from: n.id, to: t.to, optionId: o.id,
          letter: String.fromCharCode(65 + i), label: o.label, requiresItem: o.requiresItem,
          conditional: t.conditional || (o.visibleIf?.length || 0) > 0 || (o.lockedIf?.length || 0) > 0,
          branch: 0,
        });
      }
    });
  }

  const out = new Map<string, MapEdge[]>();
  const inc = new Map<string, MapEdge[]>();
  for (const e of edges) {
    out.set(e.from, [...(out.get(e.from) || []), e]);
    inc.set(e.to, [...(inc.get(e.to) || []), e]);
  }

  // Longest-path layering from the start (back edges are ignored, so loops can't hang it).
  const layer = new Map<string, number>([[START_ID, 0]]);
  const order: string[] = [];
  const state = new Map<string, 1 | 2>();
  const visit = (id: string) => {
    if (state.get(id) === 2 || state.get(id) === 1) return;
    state.set(id, 1);
    for (const e of out.get(id) || []) visit(e.to);
    state.set(id, 2);
    order.push(id);
  };
  visit(START_ID);
  for (const id of nodeIds) visit(id);
  const topo = order.reverse();
  const pos = new Map(topo.map((id, i) => [id, i]));
  for (const id of topo) {
    const l = layer.get(id) ?? 1;
    layer.set(id, l);
    for (const e of out.get(id) || []) {
      if ((pos.get(e.to) ?? 0) <= (pos.get(id) ?? 0)) continue; // back edge
      layer.set(e.to, Math.max(layer.get(e.to) ?? 0, l + 1));
    }
  }
  // Endings share the bottom row.
  const maxDecisionLayer = Math.max(1, ...[...layer.entries()].filter(([id]) => meta.get(id)?.type !== "ending").map(([, l]) => l));
  for (const e of endings) layer.set(e.id, maxDecisionLayer + 1);

  // Branch colour: the opening choice that first reaches each node (BFS).
  const branch = new Map<string, number>([[START_ID, 0]]);
  const startOpts = out.get(START_ID) || [];
  const firstDecision = startOpts.length === 1 ? startOpts[0].to : null;
  const queue: string[] = [];
  if (firstDecision) {
    branch.set(firstDecision, 0);
    (out.get(firstDecision) || []).forEach((e, i) => { if (!branch.has(e.to)) { branch.set(e.to, i + 1); queue.push(e.to); } });
  } else {
    startOpts.forEach((e, i) => { if (!branch.has(e.to)) { branch.set(e.to, i + 1); queue.push(e.to); } });
  }
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of out.get(id) || []) if (!branch.has(e.to)) { branch.set(e.to, branch.get(id)!); queue.push(e.to); }
  }
  for (const e of edges) e.branch = branch.get(e.from) || branch.get(e.to) || 0;

  // Rows, ordered to reduce crossings (barycentre sweeps).
  const rows = new Map<number, string[]>();
  for (const id of topo) {
    const l = layer.get(id)!;
    if (meta.get(id)?.type === "ending") continue;
    rows.set(l, [...(rows.get(l) || []), id]);
  }
  rows.set(maxDecisionLayer + 1, endings.map((e) => e.id));
  const rowIdx = () => {
    const m = new Map<string, number>();
    for (const r of rows.values()) r.forEach((id, i) => m.set(id, i / Math.max(1, r.length - 1)));
    return m;
  };
  const layers = [...rows.keys()].sort((a, b) => a - b);
  for (let sweep = 0; sweep < 6; sweep++) {
    const down = sweep % 2 === 0;
    const seq = down ? layers : [...layers].reverse();
    for (const l of seq) {
      if (l === maxDecisionLayer + 1) continue; // keep END 1…n in order
      const idx = rowIdx();
      const r = rows.get(l)!;
      const score = (id: string) => {
        const ns = (down ? inc.get(id) : out.get(id))?.map((e) => idx.get(down ? e.from : e.to)).filter((v): v is number => v != null) || [];
        return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : idx.get(id) ?? 0.5;
      };
      rows.set(l, [...r].sort((a, b) => score(a) - score(b)));
    }
  }

  // The opening choices read left to right as A, B, C…
  const opening = firstDecision ? out.get(firstDecision) || [] : startOpts;
  const openIdx = new Map<string, number>();
  opening.forEach((e, i) => { if (!openIdx.has(e.to)) openIdx.set(e.to, i); });
  for (const [l, r] of rows) {
    if (r.length && r.every((id) => openIdx.has(id))) rows.set(l, [...r].sort((a, b) => openIdx.get(a)! - openIdx.get(b)!));
  }

  const maxRow = Math.max(...[...rows.values()].map((r) => r.length));
  const width = Math.max(420, PAD_X * 2 + (maxRow - 1) * COL_GAP);
  const height = PAD_Y * 2 + (layers[layers.length - 1]) * LAYER_GAP;
  const nodes: MapNode[] = [];
  for (const l of layers) {
    const r = rows.get(l)!;
    const span = (r.length - 1) * COL_GAP;
    r.forEach((id, i) => {
      const n = meta.get(id);
      const isStart = id === START_ID;
      nodes.push({
        id,
        kind: isStart ? "start" : n?.type === "ending" ? "ending" : "decision",
        title: isStart ? "Start" : short(n?.type === "ending" ? n.endingTitle || n.id : n?.title || n?.id || id),
        layer: l,
        order: i,
        x: width / 2 - span / 2 + i * COL_GAP,
        y: PAD_Y + l * LAYER_GAP,
        branch: branch.get(id) || 0,
        endingNo: n?.type === "ending" ? endings.findIndex((e) => e.id === id) + 1 : undefined,
        timed: !!n?.timeLimit,
        givesItem: !!n?.options?.some((o) => (o.effects || []).some((e) => e.var.startsWith("item_") && e.value !== "0" && e.value !== "")),
      });
    });
  }
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  return { nodes, edges: edges.filter((e) => byId[e.from] && byId[e.to]), width, height, byId };
}

/** The edges a reader actually travelled, from their decisions (and ending, if any). */
export function pathEdges(layout: CaseMapLayout, decisions: Pick<Decision, "node_id" | "option_id">[], endingNode?: string | null): Set<string> {
  const keys = new Set<string>();
  if (!decisions.length && !endingNode) return keys;
  const first = decisions[0]?.node_id || endingNode;
  const startEdge = layout.edges.find((e) => e.from === START_ID && e.to === first);
  if (startEdge) keys.add(startEdge.key);
  decisions.forEach((d, i) => {
    const nextStep = decisions[i + 1]?.node_id || endingNode || null;
    const cands = layout.edges.filter((e) => e.from === d.node_id && e.optionId === d.option_id);
    const hit = cands.find((e) => e.to === nextStep) || (cands.length === 1 ? cands[0] : undefined);
    if (hit) keys.add(hit.key);
  });
  return keys;
}

/** Neon palette for the branches (start, then one per opening choice). */
export const BRANCH_COLORS = ["#e5e7eb", "#38bdf8", "#34d399", "#d946ef", "#fbbf24", "#fb7185", "#a78bfa", "#22d3ee"];
export const ENDING_COLORS = ["#38bdf8", "#34d399", "#facc15", "#fb923c", "#f472b6", "#a78bfa", "#f87171", "#22d3ee", "#a3e635"];
