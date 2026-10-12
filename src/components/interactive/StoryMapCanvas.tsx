import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { nextNodeId, validateGraph, type InteractiveGraph, type MapPlacement, type NodeType, type StoryNode } from "@/lib/interactive";
import { BRANCH_COLORS, ENDING_COLORS, START_ID, buildCaseMap } from "@/lib/caseMap";
import { addOption, addRoute, blankNode, deleteNodes, duplicateNodes, getPortTarget, nodeName, setPortTarget, typeOf, type PortRef } from "@/lib/nodeGraph";
import { Inspector, ItemsPanel, ITEM_HEX, TONE, isTyping } from "@/components/interactive/NodeCanvas";

// Story map window: the same top-to-bottom flowchart readers and the website show
// (decisions as circles, endings along the bottom, scenes as small dots on the
// arrows), but editable like a design canvas. Scroll pans, Ctrl/⌘ + scroll or a
// pinch zooms, nodes snap to the map grid when dragged (and swap with whatever is
// in the cell). Moving a node writes settings.map, so the website map always
// matches this one. Every edit goes through onChange straight away.

type Pos = { x: number; y: number };
type Cell = MapPlacement;
/** Where a connection starts: a choice, a scene's continue/route, the case start, or "add a new choice here". */
type Port = PortRef | { kind: "start" } | { kind: "choice"; nodeId: string };

interface WireInfo { letter?: string; optIndex: number; optCount: number; label?: string; requiresItem?: string; conditional: boolean }
/** A connection from a decision (or the start) to the next decision or ending, through any scenes. */
interface Wire extends WireInfo { key: string; from: string; to: string; scenes: string[]; last: Port }
/** A connection that stops before reaching a decision or ending: the open end can be dragged somewhere. */
interface Stub extends WireInfo { key: string; from: string; scenes: string[]; open: Port }

type Inter =
  | { kind: "pan"; sx: number; sy: number; vx: number; vy: number }
  | { kind: "drag"; ids: string[]; start: Pos; orig: Record<string, Cell>; moved: boolean; clickId: string; additive: boolean }
  | { kind: "connect"; port: Port; from: Pos }
  | { kind: "box"; start: Pos; additive: boolean };

type Menu =
  | { kind: "create"; sx: number; sy: number; w: Pos; port?: Port }
  | { kind: "insert"; sx: number; sy: number; wire: Wire }
  | { kind: "node"; sx: number; sy: number; nodeId: string };

interface Props {
  graph: InteractiveGraph;
  onChange: (g: InteractiveGraph, coalesce?: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  focus: { id: string; n: number } | null;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  status?: React.ReactNode;
  title?: string;
  switcher?: React.ReactNode;
}

const CW = 150; // world pixels per map column
const CH = 128; // world pixels per map row
const R = 22; // decision radius
const END_W = 96;
const END_H = 36;
const MIN_K = 0.1;
const MAX_K = 3;
const SCENE_HEX = TONE.narrative.hex;

const portOwner = (p: Port) => (p.kind === "start" ? START_ID : p.nodeId);
const portId = (p: Port) => (p.kind === "start" ? "start" : p.kind === "choice" ? `${p.nodeId}+` : p.kind === "next" ? `${p.nodeId}>` : p.kind === "route" ? `${p.nodeId}~${p.index}` : `${p.nodeId}:${p.optionId}`);

function portTarget(g: InteractiveGraph, p: Port): string {
  if (p.kind === "start") return g.startNodeId || "";
  if (p.kind === "choice") return "";
  return getPortTarget(g, p);
}

/** Points a port at a node. A "choice" port uses the decision's first unconnected choice, or adds one. */
function connect(g: InteractiveGraph, p: Port, to: string): InteractiveGraph {
  if (p.kind === "start") return to ? { ...g, startNodeId: to } : g;
  if (p.kind === "choice") {
    const n = g.nodes.find((x) => x.id === p.nodeId);
    const free = n?.options?.find((o) => !o.next);
    if (free) return setPortTarget(g, { nodeId: p.nodeId, kind: "option", optionId: free.id }, to);
    const g2 = addOption(g, p.nodeId);
    const added = g2.nodes.find((x) => x.id === p.nodeId)?.options?.slice(-1)[0];
    return added ? setPortTarget(g2, { nodeId: p.nodeId, kind: "option", optionId: added.id }, to) : g2;
  }
  return setPortTarget(g, p, to);
}

/** New node in the middle of a connection (a new decision continues through its first choice). */
function insertOn(g: InteractiveGraph, p: Port, type: NodeType): { graph: InteractiveGraph; id: string } {
  const old = portTarget(g, p);
  const id = nextNodeId(g, type);
  let node: StoryNode = blankNode(type, id);
  if (old && type === "narrative") node = { ...node, next: old };
  if (old && type === "decision") node = { ...node, options: (node.options || []).map((o, i) => (i === 0 ? { ...o, next: old } : o)) };
  return { graph: connect({ ...g, nodes: [...g.nodes, node] }, p, id), id };
}

/** Follows every choice (and the start) through its scenes to the next decision or ending. */
function traceWires(g: InteractiveGraph) {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const wires: Wire[] = [];
  const stubs: Stub[] = [];
  const onMap = new Set<string>();
  const keys = new Map<string, number>();
  const uniq = (k: string) => { const c = keys.get(k) || 0; keys.set(k, c + 1); return c ? `${k}#${c}` : k; };
  const follow = (from: string, first: Port, info: WireInfo) => {
    const walk = (id: string | undefined, last: Port, scenes: string[], seen: Set<string>, conditional: boolean) => {
      const n = id ? byId.get(id) : undefined;
      if (!n) {
        stubs.push({ ...info, key: uniq(`${portId(first)}|${scenes.join(",")}|open`), from, scenes, open: last });
        return;
      }
      if (typeOf(n) !== "narrative") {
        wires.push({ ...info, conditional: info.conditional || conditional, key: uniq(`${portId(first)}>${n.id}|${scenes.join(",")}`), from, to: n.id, scenes, last });
        return;
      }
      if (seen.has(n.id)) return; // scenes that loop back on themselves
      onMap.add(n.id);
      const nextSeen = new Set(seen).add(n.id);
      const sc = [...scenes, n.id];
      (n.routes || []).forEach((r, i) => walk(r.to, { nodeId: n.id, kind: "route", index: i }, sc, nextSeen, true));
      walk(n.next, { nodeId: n.id, kind: "next" }, sc, nextSeen, conditional || !!n.conditions?.length || !!n.routes?.length);
    };
    walk(portTarget(g, first), first, [], new Set(), false);
  };
  follow(START_ID, { kind: "start" }, { optIndex: 0, optCount: 1, conditional: false });
  for (const n of g.nodes) {
    if (typeOf(n) !== "decision") continue;
    const opts = n.options || [];
    opts.forEach((o, i) => follow(n.id, { nodeId: n.id, kind: "option", optionId: o.id }, {
      letter: String.fromCharCode(65 + i), optIndex: i, optCount: opts.length, label: o.label, requiresItem: o.requiresItem,
      conditional: !!(o.visibleIf?.length || o.lockedIf?.length),
    }));
  }
  return { wires, stubs, onMap };
}

function cubic(a: Pos, c1: Pos, c2: Pos, b: Pos) {
  const at = (t: number): Pos => {
    const u = 1 - t;
    return {
      x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
    };
  };
  return { d: `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`, at, a, b };
}

/** Up to two lines of about `n` characters. */
function wrap(s: string, n = 20): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= n) cur += " " + w;
    else { lines.push(cur); cur = w; if (lines.length === 2) break; }
  }
  if (cur && lines.length < 2) lines.push(cur);
  if (lines.length === 2 && words.join(" ").length > lines.join(" ").length) lines[1] = `${lines[1].slice(0, n - 1)}…`;
  return lines.map((l) => (l.length > n + 4 ? `${l.slice(0, n)}…` : l));
}

export const StoryMapCanvas: React.FC<Props> = ({ graph, onChange, selectedId, onSelect, focus, onUndo, onRedo, canUndo, canRedo, status, title, switcher }) => {
  const vpRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const view = useRef({ x: 80, y: 80, k: 0.8 });
  const [viewState, setViewState] = useState(view.current);
  const viewRaf = useRef(0);
  const anim = useRef(0);
  const inter = useRef<Inter | null>(null);
  const spaceDown = useRef(false);
  const [dragCells, setDragCells] = useState<Record<string, Cell> | null>(null);
  const [wire, setWire] = useState<{ from: Pos; to: Pos; hover?: string } | null>(null);
  const [box, setBox] = useState<{ a: Pos; b: Pos } | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [hoverWire, setHoverWire] = useState<string | null>(null);
  const [hoverAt, setHoverAt] = useState<Pos | null>(null);
  const hoverTimer = useRef(0);
  const [sel, setSel] = useState<string[]>(selectedId ? [selectedId] : []);
  const [inspectorOpen, setInspectorOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 900);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [panning, setPanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef(0);
  const lastPointer = useRef<Pos | null>(null);

  const g = useRef(graph);
  g.current = graph;
  const selRef = useRef(sel);
  selRef.current = sel;

  const layout = useMemo(() => buildCaseMap(graph, { keepBackEdges: true }), [graph]);
  const cells = useMemo(() => {
    const m: Record<string, Cell> = {};
    for (const n of layout.nodes) m[n.id] = { row: n.layer, col: n.col ?? n.order, ...(n.code ? { code: n.code } : {}) };
    return m;
  }, [layout]);
  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  const traced = useMemo(() => traceWires(graph), [graph]);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const items = graph.settings.items || [];
  const issues = useMemo(() => validateGraph(graph), [graph]);
  const errorsByNode = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of issues) if (i.level === "error" && i.nodeId) m.set(i.nodeId, (m.get(i.nodeId) || 0) + 1);
    return m;
  }, [issues]);
  const loose = useMemo(() => graph.nodes.filter((n) => typeOf(n) === "narrative" && !traced.onMap.has(n.id)), [graph, traced]);

  useEffect(() => { if (selectedId && !(sel.length === 1 && sel[0] === selectedId)) setSel([selectedId]); }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const flash = (msg: string) => {
    setNotice(msg);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2600);
  };

  // ── View ──
  const applyView = useCallback(() => {
    const v = view.current;
    worldRef.current?.setAttribute("transform", `translate(${v.x},${v.y}) scale(${v.k})`);
    if (vpRef.current) {
      // One dot per map cell: the grid nodes snap to.
      vpRef.current.style.backgroundSize = `${CW * v.k}px ${CH * v.k}px`;
      vpRef.current.style.backgroundPosition = `${v.x - (CW * v.k) / 2}px ${v.y - (CH * v.k) / 2}px`;
    }
    cancelAnimationFrame(viewRaf.current);
    viewRaf.current = requestAnimationFrame(() => setViewState({ ...view.current }));
  }, []);

  const vpSize = () => {
    const r = vpRef.current?.getBoundingClientRect();
    return { w: r?.width || 1200, h: r?.height || 800, left: r?.left || 0, top: r?.top || 0 };
  };
  const toWorld = (cx: number, cy: number): Pos => {
    const r = vpSize();
    const v = view.current;
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  };
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const animateTo = useCallback((t: { x: number; y: number; k: number }) => {
    cancelAnimationFrame(anim.current);
    const s = { ...view.current };
    const t0 = performance.now();
    const D = reducedMotion ? 0 : 340;
    const step = (now: number) => {
      const p = D ? Math.min(1, (now - t0) / D) : 1;
      const e = 1 - Math.pow(1 - p, 3);
      view.current = { x: s.x + (t.x - s.x) * e, y: s.y + (t.y - s.y) * e, k: s.k + (t.k - s.k) * e };
      applyView();
      if (p < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, [applyView, reducedMotion]);

  const zoomAt = useCallback((sx: number, sy: number, factor: number) => {
    cancelAnimationFrame(anim.current);
    const v = view.current;
    const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
    view.current = { k, x: sx - (sx - v.x) * (k / v.k), y: sy - (sy - v.y) * (k / v.k) };
    applyView();
  }, [applyView]);
  const zoomCenter = (factor: number) => {
    const r = vpSize();
    const v = view.current;
    const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
    const sx = (r.w - (inspectorOpen ? 360 : 0)) / 2, sy = r.h / 2;
    animateTo({ k, x: sx - (sx - v.x) * (k / v.k), y: sy - (sy - v.y) * (k / v.k) });
  };

  const fit = useCallback((animate = true) => {
    const cs = Object.values(cellsRef.current);
    if (!cs.length) return;
    const x0 = Math.min(...cs.map((c) => c.col)) * CW - 110, x1 = Math.max(...cs.map((c) => c.col)) * CW + 110;
    const y0 = Math.min(...cs.map((c) => c.row)) * CH - 60, y1 = Math.max(...cs.map((c) => c.row)) * CH + 90;
    const r = vpSize();
    const usable = r.w - (inspectorOpen ? 360 : 0);
    const k = Math.min(1.2, Math.max(MIN_K, Math.min((usable - 60) / (x1 - x0), (r.h - 130) / (y1 - y0))));
    const t = { k, x: usable / 2 - ((x0 + x1) / 2) * k, y: 70 + (r.h - 100) / 2 - ((y0 + y1) / 2) * k };
    if (animate) animateTo(t); else { view.current = t; applyView(); }
  }, [animateTo, applyView, inspectorOpen]);

  // ── Geometry ──
  const cellAt = (id: string) => dragCells?.[id] || cells[id];
  const posOfId = (id: string): Pos | null => {
    const c = cellAt(id);
    return c ? { x: c.col * CW, y: c.row * CH } : null;
  };

  const geom = useMemo(() => {
    const at = (id: string): Pos | null => {
      const c = dragCells?.[id] || cells[id];
      return c ? { x: c.col * CW, y: c.row * CH } : null;
    };
    const wireG = traced.wires.map((w) => {
      const p = at(w.from), q = at(w.to);
      if (!p || !q) return null;
      const startKind = layout.byId[w.from]?.kind;
      const endKind = layout.byId[w.to]?.kind;
      const spread = (w.optIndex - (w.optCount - 1) / 2) * 7;
      let c;
      if (q.y > p.y) {
        const a = startKind === "start" ? { x: p.x, y: p.y + 15 } : { x: p.x + spread, y: p.y + R - 1 };
        const b = endKind === "ending" ? { x: q.x, y: q.y - END_H / 2 } : { x: q.x, y: q.y - R };
        const mid = (a.y + b.y) / 2;
        c = cubic(a, { x: a.x, y: mid }, { x: b.x, y: mid }, b);
      } else {
        // Back up the page (a repeatable round) or across the same row: loop out to the right.
        const a = { x: p.x + (startKind === "start" ? 46 : R), y: p.y + spread * 0.6 };
        const b = { x: q.x + (endKind === "ending" ? END_W / 2 : R), y: q.y };
        c = cubic(a, { x: a.x + 80, y: a.y + 30 }, { x: b.x + 80, y: b.y - 30 }, b);
      }
      return { w, ...c, back: !(q.y > p.y) };
    }).filter(Boolean) as ({ w: Wire; back: boolean } & ReturnType<typeof cubic>)[];
    const perNode = new Map<string, number>();
    const stubG = traced.stubs.map((s) => {
      const p = at(s.from);
      if (!p) return null;
      const i = perNode.get(s.from) || 0;
      perNode.set(s.from, i + 1);
      const startKind = layout.byId[s.from]?.kind;
      const spread = (s.optIndex - (s.optCount - 1) / 2) * 7;
      const a = startKind === "start" ? { x: p.x, y: p.y + 15 } : { x: p.x + spread, y: p.y + R - 1 };
      const b = { x: p.x + (s.optIndex - (s.optCount - 1) / 2) * 34, y: p.y + 70 + (s.scenes.length > 1 ? 14 : 0) };
      return { s, ...cubic(a, { x: a.x, y: a.y + 30 }, { x: b.x, y: b.y - 30 }, b) };
    }).filter(Boolean) as ({ s: Stub } & ReturnType<typeof cubic>)[];
    return { wires: wireG, stubs: stubG };
  }, [traced, cells, dragCells, layout]);

  const sceneT = (j: number, m: number) => 0.18 + (0.64 * (j + 1)) / (m + 1);

  const centerOn = useCallback((id: string) => {
    let p: Pos | null = null;
    const c = cellsRef.current[id];
    if (c) p = { x: c.col * CW, y: c.row * CH };
    else {
      const gw = geom.wires.find((x) => x.w.scenes.includes(id));
      if (gw) p = gw.at(sceneT(gw.w.scenes.indexOf(id), gw.w.scenes.length));
      const gs = !p && geom.stubs.find((x) => x.s.scenes.includes(id));
      if (gs) p = gs.at(sceneT(gs.s.scenes.indexOf(id), gs.s.scenes.length));
    }
    if (!p) return;
    const r = vpSize();
    const k = Math.max(0.7, view.current.k);
    const usable = r.w - (inspectorOpen ? 360 : 0);
    animateTo({ k, x: usable / 2 - p.x * k, y: r.h / 2 - p.y * k });
  }, [animateTo, inspectorOpen, geom]);

  // First paint: the whole map.
  const fitted = useRef(false);
  useLayoutEffect(() => {
    applyView();
    if (fitted.current) return;
    fitted.current = true;
    fit(false);
  }, [applyView, fit]);

  useEffect(() => { if (focus) centerOn(focus.id); }, [focus?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wheel: scroll / two-finger swipe pans (Shift + wheel sideways), Ctrl/⌘ + wheel or pinch zooms at the cursor.
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest?.("[data-scrollable]")) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
      const dx = e.deltaX * unit, dy = e.deltaY * unit;
      if (e.ctrlKey || e.metaKey) {
        const rate = Math.abs(dy) < 50 ? 0.01 : 0.0025;
        zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-dy * rate));
      } else {
        cancelAnimationFrame(anim.current);
        const sh = e.shiftKey && !dx;
        view.current = { ...view.current, x: view.current.x - (sh ? dy : dx), y: view.current.y - (sh ? 0 : dy) };
        applyView();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, applyView]);

  // ── Edits ──
  const select = (ids: string[]) => {
    setSel(ids);
    if (ids.length === 1 && ids[0] !== START_ID) onSelect(ids[0]);
  };

  /** Saves the map cells (all of them, so the website shows exactly this), shifted so the map starts at row 0, column 0. */
  const commitCells = (base: InteractiveGraph, map: Record<string, Cell>, coalesce?: string) => {
    const ids = new Set(base.nodes.filter((n) => typeOf(n) !== "narrative").map((n) => n.id));
    ids.add(START_ID);
    const entries = Object.entries(map).filter(([id]) => ids.has(id));
    const dr = entries.length ? -Math.min(...entries.map(([, c]) => c.row)) : 0;
    const dc = entries.length ? -Math.floor(Math.min(...entries.map(([, c]) => c.col))) : 0;
    const out: Record<string, Cell> = {};
    for (const [id, c] of entries) out[id] = { ...c, row: c.row + dr, col: c.col + dc };
    if (dr || dc) {
      const v = view.current;
      view.current = { ...v, x: v.x - dc * CW * v.k, y: v.y - dr * CH * v.k };
      applyView();
    }
    onChange({ ...base, settings: { ...base.settings, map: out } }, coalesce);
  };

  const taken = (map: Record<string, Cell>, row: number, col: number, ignore: Set<string>) =>
    Object.entries(map).some(([id, c]) => !ignore.has(id) && c.row === row && c.col === col);
  const freeCell = (map: Record<string, Cell>, row: number, col: number): Cell => {
    for (let d = 0; d < 80; d++) for (const c of d ? [col + d, col - d] : [col]) if (!taken(map, row, c, new Set())) return { row, col: c };
    return { row, col };
  };
  const snap = (w: Pos): Cell => ({ row: Math.round(w.y / CH), col: Math.round(w.x / CW) });

  /** Moves map nodes to new cells. One node swaps with whatever is in its new cell; a group needs free cells. */
  const moveTo = (moves: Record<string, Cell>, coalesce?: string) => {
    const cur = { ...cellsRef.current };
    const ids = Object.keys(moves);
    if (ids.length === 1) {
      const id = ids[0];
      const t = moves[id];
      const other = Object.keys(cur).find((k) => k !== id && cur[k].row === t.row && cur[k].col === t.col);
      if (other) cur[other] = { ...cur[other], row: cur[id].row, col: cur[id].col };
      cur[id] = { ...cur[id], row: t.row, col: t.col };
    } else {
      const moving = new Set(ids);
      if (ids.some((id) => taken(cur, moves[id].row, moves[id].col, moving))) { flash("Some of those cells are taken. Move one node at a time to swap places."); return; }
      for (const id of ids) cur[id] = { ...cur[id], row: moves[id].row, col: moves[id].col };
    }
    commitCells(g.current, cur, coalesce);
  };

  const createNode = (type: NodeType, w: Pos, port?: Port) => {
    const base = g.current;
    const id = nextNodeId(base, type);
    let next: InteractiveGraph = { ...base, nodes: [...base.nodes, blankNode(type, id)] };
    if (port) next = connect(next, port, id);
    if (type !== "narrative") {
      const cur = { ...cellsRef.current };
      const s = snap(w);
      cur[id] = freeCell(cur, s.row, s.col);
      commitCells(next, cur);
    } else {
      onChange(next);
      if (!port) flash("New scene added. Connect it from the panel on the right (Continue to), or drag a choice onto it.");
    }
    select([id]);
    setInspectorOpen(true);
  };
  const viewCenter = () => {
    const r = vpSize();
    return toWorld(r.left + (r.w - (inspectorOpen ? 360 : 0)) / 2, r.top + r.h / 2);
  };

  const removeSelected = () => {
    const ids = selRef.current.filter((id) => id !== START_ID && id !== g.current.startNodeId);
    if (!ids.length) {
      if (selRef.current.includes(g.current.startNodeId)) flash("The opening can't be deleted. Make another section the opening first.");
      return;
    }
    let next = deleteNodes(g.current, ids);
    if (next.settings.map) {
      const m = { ...next.settings.map };
      ids.forEach((id) => delete m[id]);
      next = { ...next, settings: { ...next.settings, map: m } };
    }
    onChange(next);
    setSel([]);
  };

  const duplicateSelected = () => {
    const ids = selRef.current.filter((id) => id !== START_ID && byId.has(id));
    if (!ids.length) return;
    const r = duplicateNodes(g.current, ids);
    const cur = { ...cellsRef.current };
    r.ids.forEach((nid, i) => { const src = cur[ids[i]]; if (src) cur[nid] = freeCell(cur, src.row, src.col + 1); });
    commitCells(r.graph, cur);
    select(r.ids);
  };

  const insertInto = (w: Wire, type: "narrative" | "decision") => {
    const r = insertOn(g.current, w.last, type);
    if (type === "decision") {
      const a = cellsRef.current[w.from], b = cellsRef.current[w.to];
      const cur = { ...cellsRef.current };
      if (a && b) cur[r.id] = freeCell(cur, Math.max(a.row + 1, Math.round((a.row + b.row) / 2)), Math.round((a.col + b.col) / 2));
      commitCells(r.graph, cur);
    } else onChange(r.graph);
    select([r.id]);
    setInspectorOpen(true);
  };

  const autoLayout = () => {
    if (!window.confirm("Lay the whole map out automatically? Every hand-placed position is replaced. You can undo this.")) return;
    const auto = buildCaseMap({ ...g.current, settings: { ...g.current.settings, map: undefined } });
    const cur: Record<string, Cell> = {};
    for (const n of auto.nodes) cur[n.id] = { row: n.layer, col: n.col ?? n.order, ...(cellsRef.current[n.id]?.code ? { code: cellsRef.current[n.id].code } : {}) };
    commitCells(g.current, cur);
    window.setTimeout(() => fit(), 30);
  };

  // ── Pointer handling ──
  const startPan = (e: React.PointerEvent) => {
    inter.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: view.current.x, vy: view.current.y };
    setPanning(true);
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest("[data-hit]")) return;
    setMenu(null);
    cancelAnimationFrame(anim.current);
    if (e.button === 2) return;
    if (e.button === 1 || spaceDown.current || (e.button === 0 && !e.shiftKey)) {
      if (e.button === 0 && !spaceDown.current) setSel([]);
      startPan(e);
    } else if (e.button === 0 && e.shiftKey) {
      const w = toWorld(e.clientX, e.clientY);
      inter.current = { kind: "box", start: w, additive: true };
      setBox({ a: w, b: w });
    }
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onNodeDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.stopPropagation();
    setMenu(null);
    if (e.button === 1 || spaceDown.current) { startPan(e); return; }
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    let ids = selRef.current;
    if (additive) ids = ids.includes(id) ? ids : [...ids, id];
    else if (!ids.includes(id)) ids = [id];
    setSel(ids);
    const orig: Record<string, Cell> = {};
    for (const x of ids) if (cellsRef.current[x]) orig[x] = cellsRef.current[x];
    inter.current = { kind: "drag", ids: Object.keys(orig), start: toWorld(e.clientX, e.clientY), orig, moved: false, clickId: id, additive };
  };

  const onSceneDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setMenu(null);
    if (e.shiftKey || e.metaKey || e.ctrlKey) setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    else { select([id]); setInspectorOpen(true); }
  };

  const onPortDown = (e: React.PointerEvent, port: Port, from: Pos) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setMenu(null);
    setHoverWire(null);
    inter.current = { kind: "connect", port, from };
    setWire({ from, to: toWorld(e.clientX, e.clientY) });
  };

  const onContext = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const r = vpSize();
    if (!selRef.current.includes(id)) select([id]);
    setMenu({ kind: "node", sx: e.clientX - r.left, sy: e.clientY - r.top, nodeId: id });
  };

  const openEditor = (id: string) => {
    if (id === START_ID) return;
    select([id]);
    setInspectorOpen(true);
    window.setTimeout(() => document.querySelector<HTMLElement>("[data-inspector] input, [data-inspector] textarea")?.focus(), 60);
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      lastPointer.current = { x: e.clientX, y: e.clientY };
      const it = inter.current;
      if (!it) return;
      if (it.kind === "pan") {
        view.current = { ...view.current, x: it.vx + (e.clientX - it.sx), y: it.vy + (e.clientY - it.sy) };
        applyView();
      } else if (it.kind === "drag") {
        const w = toWorld(e.clientX, e.clientY);
        const dx = w.x - it.start.x, dy = w.y - it.start.y;
        if (!it.moved && Math.hypot(dx * view.current.k, dy * view.current.k) < 4) return;
        it.moved = true;
        const dc = Math.round(dx / CW), dr = Math.round(dy / CH);
        const next: Record<string, Cell> = {};
        for (const id of it.ids) next[id] = { ...it.orig[id], row: it.orig[id].row + dr, col: it.orig[id].col + dc };
        setDragCells(next);
      } else if (it.kind === "connect") {
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-map-id]");
        const id = el?.getAttribute("data-map-id") || undefined;
        setWire({ from: it.from, to: toWorld(e.clientX, e.clientY), hover: id && id !== START_ID && id !== portOwner(it.port) ? id : undefined });
      } else if (it.kind === "box") {
        setBox({ a: it.start, b: toWorld(e.clientX, e.clientY) });
      }
    };
    const up = (e: PointerEvent) => {
      const it = inter.current;
      inter.current = null;
      if (!it) return;
      if (it.kind === "pan") setPanning(false);
      if (it.kind === "drag") {
        if (it.moved) {
          const w = toWorld(e.clientX, e.clientY);
          const dc = Math.round((w.x - it.start.x) / CW), dr = Math.round((w.y - it.start.y) / CH);
          setDragCells(null);
          if (dc || dr) {
            const moves: Record<string, Cell> = {};
            for (const id of it.ids) moves[id] = { ...it.orig[id], row: it.orig[id].row + dr, col: it.orig[id].col + dc };
            moveTo(moves);
          }
        } else if (!it.additive) select([it.clickId]);
        else if (it.ids.length === 1) onSelect(it.clickId);
      }
      if (it.kind === "connect") {
        setWire(null);
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-map-id]");
        const target = el?.getAttribute("data-map-id");
        if (target && target !== START_ID && target !== portOwner(it.port)) onChange(connect(g.current, it.port, target));
        else if (!target) {
          const r = vpSize();
          setMenu({ kind: "create", sx: e.clientX - r.left, sy: e.clientY - r.top, w: toWorld(e.clientX, e.clientY), port: it.port });
        }
      }
      if (it.kind === "box") {
        const a = it.start, b = toWorld(e.clientX, e.clientY);
        setBox(null);
        const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
        const hit = Object.entries(cellsRef.current).filter(([id, c]) => id !== START_ID && c.col * CW >= x0 && c.col * CW <= x1 && c.row * CH >= y0 && c.row * CH <= y1).map(([id]) => id);
        select([...new Set([...(it.additive ? selRef.current : []), ...hit])]);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }); // re-bound every render so handlers see the latest state

  // ── Keyboard ──
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === " " && !isTyping(e.target)) { spaceDown.current = true; if (!inter.current) setPanning(true); e.preventDefault(); return; }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) onRedo(); else onUndo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); onRedo(); return; }
      if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoomCenter(1.25); return; }
      if (mod && e.key === "-") { e.preventDefault(); zoomCenter(0.8); return; }
      if (mod && e.key === "0") { e.preventDefault(); zoomCenter(1 / view.current.k); return; }
      if (isTyping(e.target)) return;
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateSelected(); return; }
      if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); select(Object.keys(cellsRef.current).filter((id) => id !== START_ID)); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSelected(); return; }
      if (e.key === "Escape") { setMenu(null); setWire(null); inter.current = null; setItemsOpen(false); setHelpOpen(false); return; }
      if (e.key.startsWith("Arrow")) {
        const ids = selRef.current.filter((id) => cellsRef.current[id]);
        if (!ids.length) return;
        e.preventDefault();
        const dr = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
        const dc = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
        const moves: Record<string, Cell> = {};
        for (const id of ids) moves[id] = { ...cellsRef.current[id], row: cellsRef.current[id].row + dr, col: cellsRef.current[id].col + dc };
        moveTo(moves, "nudge");
        return;
      }
      if (mod) return;
      if (e.shiftKey && e.code === "Digit1") { fit(); return; }
      const k = e.key.toLowerCase();
      if (k === "f") fit();
      else if (k === "=" || k === "+") zoomCenter(1.25);
      else if (k === "-") zoomCenter(0.8);
      else if (k === "0") zoomCenter(1 / view.current.k);
      else if (k === "s" || k === "d" || k === "e") {
        const type: NodeType = k === "s" ? "narrative" : k === "d" ? "decision" : "ending";
        const lp = lastPointer.current;
        const r = vpSize();
        const inside = lp && lp.x > r.left && lp.x < r.left + r.w && lp.y > r.top && lp.y < r.top + r.h;
        createNode(type, inside ? toWorld(lp!.x, lp!.y) : viewCenter());
      } else if (k === "?") setHelpOpen((v) => !v);
    };
    const upKey = (e: KeyboardEvent) => { if (e.key === " ") { spaceDown.current = false; if (!inter.current) setPanning(false); } };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", upKey);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", upKey); };
  });

  const onWireEnter = (key: string, e?: React.PointerEvent) => {
    window.clearTimeout(hoverTimer.current);
    // The controls appear where the mouse met the connection (long ones can run off screen).
    if (e && key !== hoverWire) setHoverAt(toWorld(e.clientX, e.clientY));
    setHoverWire(key);
  };
  const onWireLeave = () => { window.clearTimeout(hoverTimer.current); hoverTimer.current = window.setTimeout(() => setHoverWire(null), 260); };

  const selSet = useMemo(() => new Set(sel), [sel]);
  const primary = sel.length === 1 ? byId.get(sel[0]) : undefined;
  const vp = vpSize();
  const btn = "h-8 px-2.5 text-xs border border-border bg-card/90 backdrop-blur hover:border-primary hover:text-primary transition-colors disabled:opacity-30 disabled:pointer-events-none rounded";
  const anySel = sel.length > 0;

  // ── Render ──
  const sceneDot = (id: string, p: Pos, dim: boolean) => {
    const n = byId.get(id);
    const on = selSet.has(id);
    return (
      <circle key={id} data-hit data-map-id={id} cx={p.x} cy={p.y} r={on ? 8 : 6} fill={on ? "#f8fafc" : SCENE_HEX} stroke="#07090d" strokeWidth={2}
        opacity={dim ? 0.35 : 1} style={{ cursor: "pointer" }}
        onPointerDown={(e) => onSceneDown(e, id)} onDoubleClick={() => openEditor(id)} onContextMenu={(e) => onContext(e, id)}>
        <title>{`Scene · ${id}${n && nodeName(n) ? ` · ${nodeName(n)}` : ""}${errorsByNode.get(id) ? ` · ${errorsByNode.get(id)} error(s)` : ""}`}</title>
      </circle>
    );
  };

  const hovered = hoverWire ? geom.wires.find((x) => x.w.key === hoverWire) : undefined;

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#07090d] text-foreground select-none" data-lenis-prevent>
      <div
        ref={vpRef}
        className="absolute inset-0"
        style={{
          touchAction: "none",
          cursor: panning ? (inter.current?.kind === "pan" ? "grabbing" : "grab") : "default",
          backgroundImage: "radial-gradient(circle, hsl(var(--border) / 0.7) 1.2px, transparent 1.6px)",
        }}
        onPointerDown={onBackgroundDown}
        onDoubleClick={(e) => {
          if ((e.target as Element).closest("[data-hit]")) return;
          const r = vpSize();
          setMenu({ kind: "create", sx: e.clientX - r.left, sy: e.clientY - r.top, w: toWorld(e.clientX, e.clientY) });
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if ((e.target as Element).closest("[data-hit]")) return;
          const r = vpSize();
          setMenu({ kind: "create", sx: e.clientX - r.left, sy: e.clientY - r.top, w: toWorld(e.clientX, e.clientY) });
        }}
      >
        <svg className="absolute inset-0 w-full h-full" role="img" aria-label="Story map">
          <g ref={worldRef}>
            {/* Drop target while dragging a node */}
            {dragCells && Object.values(dragCells).map((c, i) => (
              <rect key={i} x={c.col * CW - CW / 2 + 6} y={c.row * CH - CH / 2 + 6} width={CW - 12} height={CH - 12} rx={10}
                fill="hsl(var(--primary) / 0.06)" stroke="hsl(var(--primary) / 0.5)" strokeDasharray="5 5" />
            ))}

            {/* Connections */}
            {geom.wires.map(({ w, d, at, b, back }) => {
              const hot = selSet.has(w.from) || selSet.has(w.to) || w.scenes.some((s) => selSet.has(s)) || hoverWire === w.key;
              const dim = anySel && !hot;
              const item = w.requiresItem ? items.find((x) => x.id === w.requiresItem) : undefined;
              const color = item ? ITEM_HEX[item.color] : BRANCH_COLORS[(layout.byId[w.from]?.branch || 0) % BRANCH_COLORS.length];
              const lp = at(back ? 0.1 : 0.16);
              return (
                <g key={w.key}>
                  <path d={d} fill="none" stroke={color} strokeWidth={hot ? 3 : 1.8} strokeOpacity={dim ? 0.18 : back ? 0.45 : 0.75}
                    strokeDasharray={back ? "3 6" : item || w.conditional ? "6 5" : undefined} strokeLinecap="round" />
                  <path data-hit d={d} fill="none" stroke="transparent" strokeWidth={14 / Math.min(1, viewState.k)} style={{ pointerEvents: "stroke", cursor: "pointer" }}
                    onPointerEnter={(e) => onWireEnter(w.key, e)} onPointerLeave={onWireLeave}>
                    <title>{[w.letter && `${w.letter}. ${w.label || "(no text)"}`, item && `needs ${item.name}`, w.scenes.length ? `through ${w.scenes.join(" → ")}` : null, back ? "goes back up the map" : null].filter(Boolean).join(" · ")}</title>
                  </path>
                  <circle cx={b.x} cy={b.y} r={hot ? 3.5 : 2.5} fill={color} opacity={dim ? 0.3 : 1} />
                  {w.letter && (
                    <g opacity={dim ? 0.3 : 1} style={{ pointerEvents: "none" }}>
                      <circle cx={lp.x} cy={lp.y} r={7.5} fill="#07090d" stroke={color} strokeWidth={1} />
                      <text x={lp.x} y={lp.y + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={color}>{w.letter}</text>
                    </g>
                  )}
                  {w.scenes.map((s, j) => sceneDot(s, at(sceneT(j, w.scenes.length)), dim && !selSet.has(s)))}
                </g>
              );
            })}

            {/* Open ends: choices or scenes that lead nowhere yet */}
            {geom.stubs.map(({ s, d, at, b }) => {
              const dim = anySel && !selSet.has(s.from) && !s.scenes.some((x) => selSet.has(x));
              const lp = at(0.2);
              return (
                <g key={s.key} opacity={dim ? 0.35 : 1}>
                  <path d={d} fill="none" stroke="#94a3b8" strokeWidth={1.6} strokeDasharray="4 4" />
                  {s.letter && (
                    <g style={{ pointerEvents: "none" }}>
                      <circle cx={lp.x} cy={lp.y} r={7.5} fill="#07090d" stroke="#94a3b8" strokeWidth={1} />
                      <text x={lp.x} y={lp.y + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#cbd5e1">{s.letter}</text>
                    </g>
                  )}
                  {s.scenes.map((x, j) => sceneDot(x, at(sceneT(j, s.scenes.length + 0.6)), false))}
                  <circle data-hit cx={b.x} cy={b.y} r={8} fill="#07090d" stroke="#f8fafc" strokeWidth={1.6} strokeDasharray="3 2" style={{ cursor: "crosshair" }}
                    onPointerDown={(e) => onPortDown(e, s.open, b)}>
                    <title>{`${s.letter ? `${s.letter}. ${s.label || "(no text)"} · ` : ""}leads nowhere yet: drag onto a node, or onto empty space to create one`}</title>
                  </circle>
                </g>
              );
            })}

            {/* Nodes */}
            {layout.nodes.map((m) => {
              const p = posOfId(m.id);
              if (!p) return null;
              const on = selSet.has(m.id);
              const isTarget = wire?.hover === m.id;
              const errs = errorsByNode.get(m.id) || 0;
              const node = byId.get(m.id);
              const common = {
                "data-hit": true, "data-map-id": m.id,
                style: { cursor: "grab" } as React.CSSProperties,
                onPointerDown: (e: React.PointerEvent) => onNodeDown(e, m.id),
                onDoubleClick: (e: React.MouseEvent) => { e.stopPropagation(); openEditor(m.id); },
                onContextMenu: (e: React.MouseEvent) => onContext(e, m.id),
              };
              if (m.kind === "start") {
                return (
                  <g key={m.id} {...common}>
                    <rect x={p.x - 46} y={p.y - 15} width={92} height={30} rx={15} fill="#07090d" stroke={on ? "#ffffff" : "#e5e7eb"} strokeWidth={on ? 2.6 : 1.6} />
                    <text x={p.x} y={p.y + 5} textAnchor="middle" fill="#f8fafc" fontSize={13} fontWeight={700} letterSpacing={2}>START</text>
                    <title>{`The case opens at ${graph.startNodeId || "(nothing yet)"}`}</title>
                  </g>
                );
              }
              const lines = wrap(node ? nodeName(node) || m.id : m.id);
              if (m.kind === "ending") {
                const c = ENDING_COLORS[((m.endingNo || 1) - 1) % ENDING_COLORS.length];
                return (
                  <g key={m.id} {...common}>
                    <rect x={p.x - END_W / 2} y={p.y - END_H / 2} width={END_W} height={END_H} rx={8} fill="#07090d"
                      stroke={isTarget ? "#34d399" : on ? "#ffffff" : c} strokeWidth={on || isTarget ? 3 : 1.8} />
                    <text x={p.x} y={p.y + 5} textAnchor="middle" fill={c} fontSize={13} fontWeight={700} letterSpacing={1}>END {m.endingNo}</text>
                    {lines.map((l, i) => <text key={i} x={p.x} y={p.y + END_H / 2 + 14 + i * 12} textAnchor="middle" fill="#94a3b8" fontSize={10.5}>{l}</text>)}
                    {errs > 0 && <circle cx={p.x + END_W / 2 - 2} cy={p.y - END_H / 2 + 2} r={5} fill="hsl(var(--destructive))" />}
                    <title>{`Ending · ${m.id}${errs ? ` · ${errs} error(s)` : ""}`}</title>
                  </g>
                );
              }
              const c = BRANCH_COLORS[m.branch % BRANCH_COLORS.length];
              const stroke = isTarget ? "#34d399" : on ? "#ffffff" : c;
              return (
                <g key={m.id} {...common} className="group">
                  {m.givesItem
                    ? <rect x={p.x - R * 0.9} y={p.y - R * 0.9} width={R * 1.8} height={R * 1.8} transform={`rotate(45 ${p.x} ${p.y})`} fill="#07090d" stroke={stroke} strokeWidth={on || isTarget ? 3 : 1.8} />
                    : <circle cx={p.x} cy={p.y} r={R} fill="#07090d" stroke={stroke} strokeWidth={on || isTarget ? 3 : 1.8} />}
                  {m.code && <text x={p.x} y={p.y + 5} textAnchor="middle" fill={c} fontSize={m.code.length > 1 ? 13 : 15} fontWeight={700}>{m.code}</text>}
                  {m.timed && (
                    <g>
                      <circle cx={p.x + R - 2} cy={p.y - R + 2} r={7} fill="#07090d" stroke="#f87171" strokeWidth={1.2} />
                      <path d={`M ${p.x + R - 2} ${p.y - R - 1.5} V ${p.y - R + 2} H ${p.x + R + 1}`} stroke="#f87171" strokeWidth={1.2} fill="none" />
                    </g>
                  )}
                  {errs > 0 && <circle cx={p.x - R + 3} cy={p.y - R + 3} r={5} fill="hsl(var(--destructive))" />}
                  {lines.map((l, i) => <text key={i} x={p.x} y={p.y + R + 14 + i * 12} textAnchor="middle" fill="#94a3b8" fontSize={10.5}>{l}</text>)}
                  {/* Drag from + to add a choice that leads somewhere */}
                  <g data-hit className={on ? "" : "opacity-0 group-hover:opacity-100 transition-opacity"} style={{ cursor: "crosshair" }}
                    onPointerDown={(e) => onPortDown(e, { kind: "choice", nodeId: m.id }, { x: p.x + R + 4, y: p.y + R - 4 })}>
                    <circle cx={p.x + R + 4} cy={p.y + R - 4} r={8} fill="#07090d" stroke="hsl(var(--primary))" strokeWidth={1.6} />
                    <text x={p.x + R + 4} y={p.y + R} textAnchor="middle" fontSize={13} fontWeight={700} fill="hsl(var(--primary))">+</text>
                    <title>Drag onto a node to add a choice that leads there</title>
                  </g>
                  <title>{`Decision · ${m.id}${node?.timeLimit ? ` · ${node.timeLimit}s timer` : ""}${errs ? ` · ${errs} error(s)` : ""}`}</title>
                </g>
              );
            })}

            {/* Controls on the hovered connection: drag its end somewhere else, insert a section, or cut it */}
            {hovered && (() => {
              const { w, at, b } = hovered;
              const u = 1 / viewState.k; // constant size on screen at any zoom
              const anchor = hoverAt || at(0.5);
              const mid = { x: anchor.x, y: anchor.y - 22 * u };
              const canCut = w.last.kind !== "start";
              const dx = canCut ? 13 * u : 0;
              return (
                <g onPointerEnter={() => onWireEnter(w.key)} onPointerLeave={onWireLeave}>
                  <circle data-hit cx={b.x} cy={b.y} r={7 * Math.min(u, 3)} fill="#f8fafc" stroke="#07090d" strokeWidth={2} style={{ cursor: "crosshair" }}
                    onPointerDown={(e) => onPortDown(e, w.last, at(0.94))}>
                    <title>Drag to point this connection somewhere else</title>
                  </circle>
                  {/* Invisible bridge from the connection up to the buttons, so they stay while the mouse moves there. */}
                  <rect data-hit x={mid.x - 26 * u} y={mid.y - 12 * u} width={52 * u} height={34 * u} fill="transparent" />
                  <g data-hit style={{ cursor: "pointer" }} onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { const r = vpSize(); setMenu({ kind: "insert", sx: e.clientX - r.left, sy: e.clientY - r.top, wire: w }); }}>
                    <circle cx={mid.x - dx} cy={mid.y} r={11 * u} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth={u} />
                    <text x={mid.x - dx} y={mid.y + 5 * u} textAnchor="middle" fontSize={15 * u} fill="#f8fafc">+</text>
                    <title>Insert a scene or decision here</title>
                  </g>
                  {canCut && (
                    <g data-hit style={{ cursor: "pointer" }} onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => { onChange(connect(g.current, w.last, "")); setHoverWire(null); }}>
                      <circle cx={mid.x + dx} cy={mid.y} r={11 * u} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth={u} />
                      <text x={mid.x + dx} y={mid.y + 4.5 * u} textAnchor="middle" fontSize={12 * u} fill="hsl(var(--destructive))">✕</text>
                      <title>Cut this connection</title>
                    </g>
                  )}
                </g>
              );
            })()}

            {wire && (() => {
              const mid = (wire.from.y + wire.to.y) / 2;
              return <path d={`M${wire.from.x},${wire.from.y} C${wire.from.x},${mid} ${wire.to.x},${mid} ${wire.to.x},${wire.to.y}`} fill="none" stroke="#e5e7eb" strokeWidth={2.5} strokeDasharray="5 5" style={{ pointerEvents: "none" }} />;
            })()}
            {box && (
              <rect x={Math.min(box.a.x, box.b.x)} y={Math.min(box.a.y, box.b.y)} width={Math.abs(box.b.x - box.a.x)} height={Math.abs(box.b.y - box.a.y)}
                fill="hsl(var(--primary) / 0.08)" stroke="hsl(var(--primary))" strokeDasharray="4 4" style={{ pointerEvents: "none" }} />
            )}
          </g>
        </svg>
      </div>

      {/* Top bar */}
      <div className="absolute left-3 right-3 top-3 flex flex-wrap items-center gap-2 pointer-events-none">
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 bg-card/80 backdrop-blur border border-border rounded-lg p-1.5">
          {switcher}
          {title && <span className="px-2 text-xs font-medium truncate max-w-[16rem]" title={title}>{title}</span>}
          <button type="button" className={btn} onClick={() => createNode("decision", viewCenter())} title="Add a decision (D)">+ Decision</button>
          <button type="button" className={btn} onClick={() => createNode("ending", viewCenter())} title="Add an ending (E)">+ Ending</button>
          <button type="button" className={btn} onClick={() => createNode("narrative", viewCenter())} title="Add a scene (S)">+ Scene</button>
          <button type="button" className={btn} onClick={() => setItemsOpen((v) => !v)} aria-pressed={itemsOpen}>Items ({items.length})</button>
          <span className="w-px h-6 bg-border mx-0.5" />
          <button type="button" className={btn} onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl/⌘ Z)">Undo</button>
          <button type="button" className={btn} onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl/⌘ Shift Z)">Redo</button>
          <button type="button" className={btn} onClick={autoLayout} title="Replace every position with an automatic layout">Auto-layout</button>
        </div>
        <div className="pointer-events-auto ml-auto flex items-center gap-1.5 bg-card/80 backdrop-blur border border-border rounded-lg p-1.5">
          {status}
          <button type="button" className={btn} onClick={() => zoomCenter(0.8)} title="Zoom out (Ctrl/⌘ −)">−</button>
          <button type="button" className={`${btn} w-14 tabular-nums`} onClick={() => zoomCenter(1 / view.current.k)} title="Reset to 100% (Ctrl/⌘ 0)">{Math.round(viewState.k * 100)}%</button>
          <button type="button" className={btn} onClick={() => zoomCenter(1.25)} title="Zoom in (Ctrl/⌘ +)">+</button>
          <button type="button" className={btn} onClick={() => fit()} title="Show the whole map (F or Shift 1)">Fit</button>
          <button type="button" className={btn} onClick={() => setHelpOpen((v) => !v)} title="Controls (?)">?</button>
          <button type="button" className={btn} onClick={() => setInspectorOpen((v) => !v)}>{inspectorOpen ? "Hide panel" : "Show panel"}</button>
        </div>
      </div>

      {notice && (
        <div className="absolute left-1/2 -translate-x-1/2 top-16 z-30 px-3 py-2 text-xs bg-card border border-border rounded-lg shadow-xl max-w-md text-center">{notice}</div>
      )}

      {itemsOpen && <ItemsPanel graph={graph} onChange={onChange} onClose={() => setItemsOpen(false)} />}

      {helpOpen && (
        <div data-scrollable className="absolute left-3 top-16 z-20 w-[22rem] max-h-[75vh] overflow-y-auto bg-card border border-border rounded-lg p-4 text-xs space-y-1.5 shadow-xl" onPointerDown={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-2"><span className="font-medium text-sm">Controls</span><button type="button" onClick={() => setHelpOpen(false)} className="text-muted-foreground hover:text-foreground">✕</button></div>
          {[
            ["Pan", "Scroll (Shift + scroll sideways), drag the background, or hold Space and drag"],
            ["Zoom", "Ctrl/⌘ + scroll, pinch, Ctrl/⌘ + / − / 0, or the buttons"],
            ["Whole map", "F or Shift + 1"],
            ["Move", "Drag a node. It snaps to the grid and swaps places with whatever is in that cell. Arrow keys nudge one cell."],
            ["Add a choice", "Drag the + beside a decision onto a node"],
            ["Open ends", "Dashed ends lead nowhere yet. Drag one onto a node, or onto empty space to create the next section there."],
            ["Re-route", "Hover a connection and drag the white dot at its end"],
            ["Insert or cut", "Hover a connection, then + or ✕"],
            ["Scenes", "The small blue dots on the connections. Click one to edit it."],
            ["Add", "D decision · E ending · S scene (at the mouse), or double-click the background"],
            ["Edit", "Click a node; the panel on the right edits text, choices, events, rules, items and notebook entries"],
            ["Select many", "Shift + drag the background, or Shift + click"],
            ["Delete / duplicate", "Delete · Ctrl/⌘ D"],
            ["Undo / redo", "Ctrl/⌘ Z · Ctrl/⌘ Shift Z"],
            ["More", "Right-click a node"],
          ].map(([a, b]) => <div key={a} className="grid grid-cols-[6.5rem_1fr] gap-2"><span className="text-muted-foreground">{a}</span><span>{b}</span></div>)}
          <div className="pt-2 mt-2 border-t border-border grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
            <span>○ decision</span><span>◇ hands out an item</span>
            <span><span className="text-red-400">◷</span> timed</span><span><span style={{ color: SCENE_HEX }}>●</span> scene</span>
            <span>- - - conditional / item</span><span>··· goes back up the map</span>
          </div>
        </div>
      )}

      {menu && (
        <div className="absolute z-30 min-w-[11rem] bg-card border border-border rounded-lg shadow-xl py-1 text-sm" style={{ left: Math.min(menu.sx, vp.w - 200), top: Math.min(menu.sy, vp.h - 280) }}
          onPointerDown={(e) => e.stopPropagation()}>
          {menu.kind === "create" && (
            <>
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">{menu.port ? "Lead to a new…" : "Add a…"}</div>
              {(["decision", "ending", "narrative"] as NodeType[]).map((t) => (
                <button key={t} type="button" className="w-full text-left px-3 py-1.5 hover:bg-primary/10 flex items-center gap-2"
                  onClick={() => { createNode(t, menu.w, menu.port); setMenu(null); }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: t === "narrative" ? SCENE_HEX : TONE[t].hex }} />{TONE[t].label}
                </button>
              ))}
              {menu.port && menu.port.kind !== "start" && menu.port.kind !== "choice" && portTarget(g.current, menu.port) && (
                <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-destructive/10 text-destructive" onClick={() => { onChange(connect(g.current, menu.port!, "")); setMenu(null); }}>Disconnect</button>
              )}
            </>
          )}
          {menu.kind === "insert" && (
            <>
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Insert into this connection</div>
              <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-primary/10 flex items-center gap-2" onClick={() => { insertInto(menu.wire, "narrative"); setMenu(null); }}>
                <span className="w-2 h-2 rounded-full" style={{ background: SCENE_HEX }} />Scene
              </button>
              <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-primary/10 flex items-center gap-2" onClick={() => { insertInto(menu.wire, "decision"); setMenu(null); }}>
                <span className="w-2 h-2 rounded-full" style={{ background: TONE.decision.hex }} />Decision
              </button>
            </>
          )}
          {menu.kind === "node" && (() => {
            const n = byId.get(menu.nodeId);
            const isStartPill = menu.nodeId === START_ID;
            const item = (label: string, fn: () => void, danger = false, disabled = false) => (
              <button type="button" disabled={disabled} className={`w-full text-left px-3 py-1.5 disabled:opacity-40 ${danger ? "text-destructive hover:bg-destructive/10" : "hover:bg-primary/10"}`}
                onClick={() => { fn(); setMenu(null); }}>{label}</button>
            );
            return (
              <>
                {n && item("Edit", () => openEditor(n.id))}
                {n && typeOf(n) === "decision" && item("Add a choice", () => onChange(addOption(g.current, n.id)))}
                {n && typeOf(n) === "narrative" && item("Add a conditional route", () => onChange(addRoute(g.current, n.id)))}
                {n && item("Duplicate", duplicateSelected)}
                {n && item("Make this the opening", () => onChange({ ...g.current, startNodeId: n.id }), false, n.id === graph.startNodeId)}
                {item("Centre view here", () => centerOn(menu.nodeId))}
                {!isStartPill && <div className="my-1 border-t border-border" />}
                {!isStartPill && item(sel.length > 1 ? `Delete ${sel.length} nodes` : "Delete", removeSelected, true, menu.nodeId === graph.startNodeId && sel.length <= 1)}
              </>
            );
          })()}
        </div>
      )}

      {/* Scenes nothing leads to */}
      {loose.length > 0 && (
        <div data-scrollable className="absolute left-3 bottom-3 z-10 max-w-[22rem] max-h-40 overflow-y-auto bg-card/90 backdrop-blur border border-border rounded-lg p-2 text-xs" onPointerDown={(e) => e.stopPropagation()}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Not on the map ({loose.length}): nothing leads to these scenes</p>
          <div className="flex flex-wrap gap-1">
            {loose.map((n) => (
              <button key={n.id} type="button" onClick={() => { select([n.id]); setInspectorOpen(true); }}
                className={`px-1.5 py-0.5 rounded border font-mono text-[11px] ${selSet.has(n.id) ? "border-foreground" : "border-border hover:border-primary"}`}
                title={nodeName(n) || undefined}>{n.id}</button>
            ))}
          </div>
        </div>
      )}

      {inspectorOpen && (
        <aside data-inspector data-scrollable className="absolute right-3 top-16 bottom-3 w-[344px] bg-card/95 backdrop-blur border border-border rounded-lg overflow-y-auto overscroll-contain shadow-xl"
          onPointerDown={(e) => e.stopPropagation()}>
          {primary ? (
            <Inspector key={primary.id} graph={graph} node={primary} onChange={onChange} onSelect={(id) => { select([id]); centerOn(id); }} onDelete={removeSelected} />
          ) : sel.length === 1 && sel[0] === START_ID ? (
            <div className="p-4 text-sm space-y-2">
              <p className="font-medium">Start</p>
              <p className="text-muted-foreground">The case opens at <span className="font-mono text-foreground">{graph.startNodeId || "nothing yet"}</span>. Right-click any section and choose “Make this the opening” to change it.</p>
            </div>
          ) : sel.length > 1 ? (
            <div className="p-4 space-y-3 text-sm">
              <p className="font-medium">{sel.length} selected</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btn} onClick={duplicateSelected}>Duplicate</button>
                <button type="button" className={`${btn} hover:!border-destructive hover:!text-destructive`} onClick={removeSelected}>Delete</button>
              </div>
              <p className="text-xs text-muted-foreground">Drag any of them, or use the arrow keys, to move them together.</p>
            </div>
          ) : (
            <div className="p-4 text-sm text-muted-foreground space-y-3">
              <p className="text-foreground font-medium">Nothing selected</p>
              <p>Click a decision, an ending or a scene dot to edit it here. Changes go straight into the story in the main window, and moving nodes changes the map readers see.</p>
              <p>{layout.nodes.length - 1} on the map · {graph.nodes.length} sections · {issues.filter((i) => i.level === "error").length} errors · {issues.filter((i) => i.level === "warning").length} warnings</p>
              {issues.filter((i) => i.level === "error").slice(0, 8).map((i, k) => (
                <button key={k} type="button" className="block w-full text-left text-xs border border-destructive/40 rounded px-2 py-1.5 hover:border-destructive"
                  onClick={() => { if (i.nodeId) { select([i.nodeId]); centerOn(i.nodeId); } }}>
                  <span className="text-destructive">{i.nodeId}</span>{i.where ? ` › ${i.where}` : ""}: {i.message}
                </button>
              ))}
            </div>
          )}
        </aside>
      )}
    </div>
  );
};

export default StoryMapCanvas;
