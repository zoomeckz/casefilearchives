import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  validateGraph, ITEM_COLORS,
  type InteractiveGraph, type InventoryItem, type ItemColor, type NodeType, type StoryNode,
} from "@/lib/interactive";
import { itemStyle } from "@/lib/itemColors";
import {
  NODE_W, NODE_HEAD, NODE_BODY, NODE_ROW,
  rowsOf, typeOf, nodeHeight, posOf, inPoint, outPoint, snippet, nodeName, portKey, graphBounds,
  addNode, setPortTarget, getPortTarget, insertOnPort, deleteNodes, duplicateNodes, moveNodes, patchNode,
  patchOption, addOption, removeOption, moveOption, addRoute, removeRoute, changeType, autoArrange,
  withRequiredItem, withGivenItem, htmlToParagraphs, paragraphsToHtml,
  type Pos, type PortRef, type NodeRow,
} from "@/lib/nodeGraph";

// Node editor canvas: pan (drag the background, scroll or two-finger swipe),
// zoom (Ctrl/⌘ + scroll, pinch, or the buttons), drag nodes, drag from a port to
// connect, drop a wire on empty space to create the next node, hover a wire to
// insert a node into it or cut it. Every edit goes through onChange right away.

const ITEM_HEX: Record<ItemColor, string> = { blue: "#38bdf8", green: "#34d399", amber: "#f59e0b", violet: "#a78bfa", cyan: "#22d3ee", pink: "#f472b6" };
const TONE: Record<NodeType, { label: string; border: string; head: string; text: string; hex: string }> = {
  narrative: { label: "Scene", border: "border-sky-500/50", head: "bg-sky-500/10", text: "text-sky-400", hex: "#38bdf8" },
  decision: { label: "Decision", border: "border-primary/70", head: "bg-primary/15", text: "text-primary", hex: "#dc2626" },
  ending: { label: "Ending", border: "border-amber-400/60", head: "bg-amber-400/10", text: "text-amber-400", hex: "#f59e0b" },
};
const EDGE_HEX = { next: "#94a3b8", route: "#94a3b8", option: "#e05555" };
const MIN_K = 0.05;
const MAX_K = 2.5;

type Inter =
  | { kind: "pan"; sx: number; sy: number; vx: number; vy: number }
  | { kind: "drag"; ids: string[]; start: Pos; orig: Record<string, Pos>; moved: boolean; clickId: string; additive: boolean }
  | { kind: "connect"; port: PortRef; from: Pos }
  | { kind: "box"; start: Pos; additive: boolean };

type Menu =
  | { kind: "create"; sx: number; sy: number; w: Pos; port?: PortRef }
  | { kind: "insert"; sx: number; sy: number; w: Pos; port: PortRef }
  | { kind: "node"; sx: number; sy: number; nodeId: string };

interface Props {
  graph: InteractiveGraph;
  /** Every edit. `coalesce` groups rapid edits of one field into a single undo step. */
  onChange: (g: InteractiveGraph, coalesce?: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Bump `n` to fly the view to node `id`. */
  focus: { id: string; n: number } | null;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  status?: React.ReactNode;
  title?: string;
}

const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
};

function bezier(a: Pos, b: Pos) {
  const dx = Math.max(60, Math.abs(b.x - a.x) * 0.5);
  const c1 = { x: a.x + dx, y: a.y };
  const c2 = { x: b.x - dx, y: b.y };
  const at = (t: number) => {
    const u = 1 - t;
    return {
      x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
    };
  };
  return { d: `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`, at };
}

export const NodeCanvas: React.FC<Props> = ({ graph, onChange, selectedId, onSelect, focus, onUndo, onRedo, canUndo, canRedo, status, title }) => {
  const vpRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const view = useRef({ x: 80, y: 300, k: 0.8 });
  const [viewState, setViewState] = useState(view.current);
  const viewRaf = useRef(0);
  const anim = useRef(0);
  const inter = useRef<Inter | null>(null);
  const spaceDown = useRef(false);
  const [drag, setDrag] = useState<Record<string, Pos> | null>(null);
  const [wire, setWire] = useState<{ from: Pos; to: Pos; hover?: string } | null>(null);
  const [box, setBox] = useState<{ a: Pos; b: Pos } | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const hoverTimer = useRef<number>(0);
  const [sel, setSel] = useState<string[]>(selectedId ? [selectedId] : []);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [panning, setPanning] = useState(false);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  // Latest values for the window-level handlers.
  const g = useRef(graph);
  g.current = graph;
  const selRef = useRef(sel);
  selRef.current = sel;

  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const items = graph.settings.items || [];
  const issues = useMemo(() => validateGraph(graph), [graph]);
  const errorsByNode = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of issues) if (i.level === "error" && i.nodeId) m.set(i.nodeId, (m.get(i.nodeId) || 0) + 1);
    return m;
  }, [issues]);

  useEffect(() => { if (selectedId && !(sel.length === 1 && sel[0] === selectedId)) setSel([selectedId]); }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── View ──
  const applyView = useCallback(() => {
    const v = view.current;
    if (worldRef.current) worldRef.current.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.k})`;
    if (vpRef.current) {
      // Dot grid that stays readable at every zoom (coarser steps when zoomed far out).
      let step = 24 * v.k;
      while (step < 14) step *= 4;
      vpRef.current.style.backgroundPosition = `${v.x}px ${v.y}px`;
      vpRef.current.style.backgroundSize = `${step}px ${step}px`;
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
    const sx = r.w / 2, sy = r.h / 2;
    animateTo({ k, x: sx - (sx - v.x) * (k / v.k), y: sy - (sy - v.y) * (k / v.k) });
  };

  const fit = useCallback((animate = true) => {
    const b = graphBounds(g.current);
    const r = vpSize();
    const pad = 80;
    const k = Math.min(1.1, Math.max(MIN_K, Math.min((r.w - pad * 2 - (inspectorOpen ? 360 : 0)) / b.w, (r.h - pad * 2) / b.h)));
    const usable = r.w - (inspectorOpen ? 360 : 0);
    const t = { k, x: usable / 2 - (b.x + b.w / 2) * k, y: r.h / 2 - (b.y + b.h / 2) * k };
    if (animate) animateTo(t); else { view.current = t; applyView(); }
  }, [animateTo, applyView, inspectorOpen]);

  const centerOn = useCallback((id: string) => {
    const n = g.current.nodes.find((x) => x.id === id);
    if (!n) return;
    const r = vpSize();
    const p = posOf(n);
    const k = Math.max(0.6, view.current.k);
    const usable = r.w - (inspectorOpen ? 360 : 0);
    animateTo({ k, x: usable / 2 - (p.x + NODE_W / 2) * k, y: r.h / 2 - (p.y + nodeHeight(n) / 2) * k });
  }, [animateTo, inspectorOpen]);

  // First paint: small cases are shown whole; big ones open on the opening at a readable size.
  const fitted = useRef(false);
  useLayoutEffect(() => {
    applyView();
    if (fitted.current || !graph.nodes.length) return;
    fitted.current = true;
    const start = g.current.nodes.find((n) => n.id === (selectedId || g.current.startNodeId)) || g.current.nodes[0];
    if (g.current.nodes.length <= 12 || !start) { fit(false); return; }
    const r = vpSize();
    const p = posOf(start);
    const k = 0.8;
    view.current = { k, x: r.w * 0.22 - p.x * k, y: r.h / 2 - (p.y + nodeHeight(start) / 2) * k };
    applyView();
  }, [graph.nodes.length, applyView, fit]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (focus) centerOn(focus.id); }, [focus?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wheel: scroll/swipe pans, Ctrl/⌘ + wheel or pinch zooms around the cursor.
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("[data-scrollable]")) return;
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

  // ── Selection and edits ──
  const select = (ids: string[]) => {
    setSel(ids);
    if (ids.length === 1) onSelect(ids[0]);
  };
  const edit = (next: InteractiveGraph, coalesce?: string) => onChange(next, coalesce);

  const createAt = (type: NodeType, w: Pos, port?: PortRef) => {
    const pos = { x: Math.round(w.x), y: Math.round(w.y - NODE_HEAD / 2) };
    const { graph: next, id } = addNode(g.current, type, pos);
    edit(port ? setPortTarget(next, port, id) : next);
    select([id]);
    setInspectorOpen(true);
  };
  const createAtCenter = (type: NodeType) => {
    const r = vpSize();
    const w = toWorld(r.left + (r.w - (inspectorOpen ? 360 : 0)) / 2 - NODE_W / 2 * view.current.k, r.top + r.h / 2);
    // Nudge down until it does not sit on top of another node.
    let p = { x: w.x, y: w.y };
    while (g.current.nodes.some((n) => Math.abs(posOf(n).x - p.x) < NODE_W * 0.6 && Math.abs(posOf(n).y - (p.y - NODE_HEAD / 2)) < 60)) p = { x: p.x + 30, y: p.y + 70 };
    createAt(type, p);
  };
  const removeSelected = () => {
    const ids = selRef.current.filter((id) => id !== g.current.startNodeId);
    if (!ids.length) return;
    edit(deleteNodes(g.current, ids));
    setSel([]);
  };
  const duplicateSelected = () => {
    if (!selRef.current.length) return;
    const r = duplicateNodes(g.current, selRef.current);
    edit(r.graph);
    select(r.ids);
  };

  // ── Pointer handling ──
  const startPan = (e: React.PointerEvent) => {
    inter.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: view.current.x, vy: view.current.y };
    setPanning(true);
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.bg) return;
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

  const onNodeDown = useCallback((e: React.PointerEvent, id: string) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.stopPropagation();
    setMenu(null);
    if (e.button === 1 || spaceDown.current) { startPan(e); return; }
    let ids = selRef.current;
    if (e.shiftKey || e.metaKey || e.ctrlKey) ids = ids.includes(id) ? ids : [...ids, id];
    else if (!ids.includes(id)) ids = [id];
    setSel(ids);
    const orig: Record<string, Pos> = {};
    for (const x of ids) { const n = g.current.nodes.find((m) => m.id === x); if (n) orig[x] = posOf(n); }
    inter.current = { kind: "drag", ids, start: toWorld(e.clientX, e.clientY), orig, moved: false, clickId: id, additive: e.shiftKey || e.metaKey || e.ctrlKey };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onPortDown = useCallback((e: React.PointerEvent, port: PortRef, from: Pos) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setMenu(null);
    inter.current = { kind: "connect", port, from };
    setWire({ from, to: toWorld(e.clientX, e.clientY) });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onNodeContext = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const r = vpSize();
    if (!selRef.current.includes(id)) { setSel([id]); onSelect(id); }
    setMenu({ kind: "node", sx: e.clientX - r.left, sy: e.clientY - r.top, nodeId: id });
  }, [onSelect]);

  const onNodeDouble = useCallback((id: string) => {
    setSel([id]);
    onSelect(id);
    setInspectorOpen(true);
    window.setTimeout(() => document.querySelector<HTMLElement>("[data-inspector] input, [data-inspector] textarea")?.focus(), 60);
  }, [onSelect]);

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
        if (!it.moved && Math.hypot(dx * view.current.k, dy * view.current.k) < 3) return;
        it.moved = true;
        const next: Record<string, Pos> = {};
        for (const id of it.ids) next[id] = { x: it.orig[id].x + dx, y: it.orig[id].y + dy };
        setDrag(next);
      } else if (it.kind === "connect") {
        const w = toWorld(e.clientX, e.clientY);
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-node-id]");
        const hover = el?.dataset.nodeId && el.dataset.nodeId !== it.port.nodeId ? el.dataset.nodeId : undefined;
        setWire({ from: it.from, to: w, hover });
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
          const dx = w.x - it.start.x, dy = w.y - it.start.y;
          const pos: Record<string, Pos> = {};
          for (const id of it.ids) pos[id] = { x: it.orig[id].x + dx, y: it.orig[id].y + dy };
          onChange(moveNodes(g.current, pos));
          setDrag(null);
        } else if (!it.additive) {
          setSel([it.clickId]);
          onSelect(it.clickId);
        } else if (it.ids.length === 1) onSelect(it.clickId);
      }
      if (it.kind === "connect") {
        setWire(null);
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-node-id]");
        const target = el?.dataset.nodeId;
        if (target && target !== it.port.nodeId) onChange(setPortTarget(g.current, it.port, target));
        else if (!target) {
          const r = vpSize();
          setMenu({ kind: "create", sx: e.clientX - r.left, sy: e.clientY - r.top, w: toWorld(e.clientX, e.clientY), port: it.port });
        }
      }
      if (it.kind === "box") {
        const b = { a: it.start, b: toWorld(e.clientX, e.clientY) };
        setBox(null);
        const x0 = Math.min(b.a.x, b.b.x), x1 = Math.max(b.a.x, b.b.x), y0 = Math.min(b.a.y, b.b.y), y1 = Math.max(b.a.y, b.b.y);
        const hit = g.current.nodes.filter((n) => {
          const p = posOf(n);
          return p.x < x1 && p.x + NODE_W > x0 && p.y < y1 && p.y + nodeHeight(n) > y0;
        }).map((n) => n.id);
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
  }, [applyView, onChange, onSelect]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard ──
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === " " && !isTyping(e.target)) { spaceDown.current = true; if (!inter.current) setPanning(true); e.preventDefault(); return; }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) onRedo(); else onUndo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); onRedo(); return; }
      if (isTyping(e.target)) return;
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateSelected(); return; }
      if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); select(g.current.nodes.map((n) => n.id)); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSelected(); return; }
      if (e.key === "Escape") { setMenu(null); setWire(null); inter.current = null; setItemsOpen(false); setHelpOpen(false); return; }
      if (mod) return;
      const k = e.key.toLowerCase();
      if (k === "f") fit();
      else if (k === "0") zoomCenter(1 / view.current.k);
      else if (k === "=" || k === "+") zoomCenter(1.25);
      else if (k === "-") zoomCenter(0.8);
      else if (k === "s" || k === "d" || k === "e") {
        const type: NodeType = k === "s" ? "narrative" : k === "d" ? "decision" : "ending";
        const lp = lastPointer.current;
        const r = vpSize();
        if (lp && lp.x > r.left && lp.x < r.left + r.w && lp.y > r.top && lp.y < r.top + r.h) createAt(type, toWorld(lp.x, lp.y));
        else createAtCenter(type);
      } else if (k === "?") setHelpOpen((v) => !v);
    };
    const upKey = (e: KeyboardEvent) => { if (e.key === " ") { spaceDown.current = false; if (!inter.current) setPanning(false); } };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", upKey);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", upKey); };
  }); // re-bound every render so handlers see the latest state

  // ── Edges ──
  const posFor = (n: StoryNode) => drag?.[n.id] || posOf(n);
  const edges = useMemo(() => {
    const out: { key: string; port: PortRef; d: string; mid: Pos; giveAt?: Pos; color: string; dash?: string; from: string; to: string; gives: string[]; locked: boolean }[] = [];
    for (const n of graph.nodes) {
      const rows = rowsOf(n);
      rows.forEach((r, i) => {
        const t = r.to ? byId.get(r.to) : undefined;
        if (!t) return;
        const a = outPoint(n, i, drag?.[n.id] || posOf(n));
        const b = inPoint(t, drag?.[t.id] || posOf(t));
        const bz = bezier(a, b);
        const color = r.requiresItem ? ITEM_HEX[items.find((x) => x.id === r.requiresItem)?.color || "blue"] : EDGE_HEX[r.tone];
        out.push({
          key: r.key, port: r.port, d: bz.d, mid: bz.at(0.5), giveAt: r.gives.length ? bz.at(0.14) : undefined,
          color, dash: r.tone === "route" ? "6 6" : r.requiresItem ? "2 6" : r.conditional || r.locked ? "8 5" : undefined,
          from: n.id, to: t.id, gives: r.gives, locked: r.locked,
        });
      });
    }
    return out;
  }, [graph, byId, drag, items]);

  const selSet = useMemo(() => new Set(sel), [sel]);
  const primary = sel.length === 1 ? byId.get(sel[0]) : undefined;

  const onEdgeEnter = (key: string) => { window.clearTimeout(hoverTimer.current); setHoverEdge(key); };
  const onEdgeLeave = () => { window.clearTimeout(hoverTimer.current); hoverTimer.current = window.setTimeout(() => setHoverEdge(null), 220); };

  // ── Minimap ──
  const bounds = useMemo(() => graphBounds(graph), [graph]);
  const MM_W = 200, MM_H = 120;
  const mm = useMemo(() => {
    const pad = 200;
    const bx = bounds.x - pad, by = bounds.y - pad, bw = bounds.w + pad * 2, bh = bounds.h + pad * 2;
    const s = Math.min(MM_W / bw, MM_H / bh);
    return { bx, by, s, ox: (MM_W - bw * s) / 2, oy: (MM_H - bh * s) / 2 };
  }, [bounds]);
  const vp = vpSize();
  const mmView = {
    x: mm.ox + ((-viewState.x / viewState.k) - mm.bx) * mm.s,
    y: mm.oy + ((-viewState.y / viewState.k) - mm.by) * mm.s,
    w: (vp.w / viewState.k) * mm.s,
    h: (vp.h / viewState.k) * mm.s,
  };
  const mmJump = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const wx = (e.clientX - r.left - mm.ox) / mm.s + mm.bx;
    const wy = (e.clientY - r.top - mm.oy) / mm.s + mm.by;
    const k = view.current.k;
    view.current = { k, x: vp.w / 2 - wx * k, y: vp.h / 2 - wy * k };
    applyView();
  };

  const btn = "h-8 px-2.5 text-xs border border-border bg-card/90 backdrop-blur hover:border-primary hover:text-primary transition-colors disabled:opacity-30 disabled:pointer-events-none rounded";

  return (
    <div className="relative w-full h-full overflow-hidden bg-background text-foreground select-none" data-lenis-prevent>
      {/* Canvas */}
      <div
        ref={vpRef}
        className="absolute inset-0"
        style={{
          touchAction: "none",
          cursor: panning ? (inter.current?.kind === "pan" ? "grabbing" : "grab") : "default",
          backgroundImage: "radial-gradient(circle, hsl(var(--border) / 0.55) 1px, transparent 1.2px)",
        }}
        onPointerDown={onBackgroundDown}
        onDoubleClick={(e) => {
          if (e.target !== e.currentTarget) return;
          const r = vpSize();
          setMenu({ kind: "create", sx: e.clientX - r.left, sy: e.clientY - r.top, w: toWorld(e.clientX, e.clientY) });
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (e.target !== e.currentTarget) return;
          const r = vpSize();
          setMenu({ kind: "create", sx: e.clientX - r.left, sy: e.clientY - r.top, w: toWorld(e.clientX, e.clientY) });
        }}
      >
        <div ref={worldRef} className="absolute left-0 top-0" style={{ transformOrigin: "0 0", willChange: "transform" }}>
          {/* Wires */}
          <svg className="absolute left-0 top-0 overflow-visible" width="1" height="1" style={{ pointerEvents: "none" }}>
            {edges.map((e) => {
              const hot = selSet.has(e.from) || selSet.has(e.to) || hoverEdge === e.key;
              const dim = sel.length > 0 && !hot;
              return (
                <g key={e.key}>
                  <path d={e.d} fill="none" stroke="transparent" strokeWidth={16} style={{ pointerEvents: "stroke", cursor: "pointer" }}
                    onPointerEnter={() => onEdgeEnter(e.key)} onPointerLeave={onEdgeLeave} />
                  <path d={e.d} fill="none" stroke={e.color} strokeWidth={hot ? 3 : 2} strokeDasharray={e.dash} strokeLinecap="round"
                    opacity={dim ? 0.35 : hot ? 1 : 0.8} />
                  {e.giveAt && e.gives.map((it, i) => (
                    <rect key={it} x={e.giveAt!.x - 5 + i * 12} y={e.giveAt!.y - 5} width={10} height={10}
                      transform={`rotate(45 ${e.giveAt!.x + i * 12} ${e.giveAt!.y})`}
                      fill={ITEM_HEX[items.find((x) => x.id === it)?.color || "blue"]} opacity={dim ? 0.4 : 1} />
                  ))}
                </g>
              );
            })}
            {wire && (() => {
              const bz = bezier(wire.from, wire.to);
              return <path d={bz.d} fill="none" stroke="#e5e7eb" strokeWidth={2.5} strokeDasharray="5 5" />;
            })()}
            {box && (
              <rect x={Math.min(box.a.x, box.b.x)} y={Math.min(box.a.y, box.b.y)} width={Math.abs(box.b.x - box.a.x)} height={Math.abs(box.b.y - box.a.y)}
                fill="hsl(var(--primary) / 0.08)" stroke="hsl(var(--primary))" strokeDasharray="4 4" />
            )}
          </svg>

          {/* Wire controls: insert a node into the wire, or cut it */}
          {hoverEdge && (() => {
            const e = edges.find((x) => x.key === hoverEdge);
            if (!e) return null;
            return (
              <div className="absolute flex gap-1" style={{ left: e.mid.x - 30, top: e.mid.y - 13 }}
                onPointerEnter={() => onEdgeEnter(e.key)} onPointerLeave={onEdgeLeave} onPointerDown={(ev) => ev.stopPropagation()}>
                <button type="button" title="Insert a node here" className="w-7 h-7 rounded-full bg-card border border-border text-sm hover:border-primary hover:text-primary shadow"
                  onClick={(ev) => {
                    const r = vpSize();
                    setMenu({ kind: "insert", sx: ev.clientX - r.left, sy: ev.clientY - r.top, w: { x: e.mid.x - NODE_W / 2, y: e.mid.y + 40 }, port: e.port });
                  }}>+</button>
                <button type="button" title="Cut this connection" className="w-7 h-7 rounded-full bg-card border border-border text-sm hover:border-destructive hover:text-destructive shadow"
                  onClick={() => { onChange(setPortTarget(g.current, e.port, "")); setHoverEdge(null); }}>✕</button>
              </div>
            );
          })()}

          {/* Nodes */}
          {graph.nodes.map((n) => (
            <NodeCard
              key={n.id}
              n={n}
              pos={posFor(n)}
              selected={selSet.has(n.id)}
              isStart={n.id === graph.startNodeId}
              items={items}
              errors={errorsByNode.get(n.id) || 0}
              wireTarget={wire?.hover === n.id}
              onDown={onNodeDown}
              onPort={onPortDown}
              onContext={onNodeContext}
              onDouble={onNodeDouble}
            />
          ))}
        </div>
      </div>

      {/* Top bar */}
      <div className="absolute left-3 right-3 top-3 flex flex-wrap items-center gap-2 pointer-events-none">
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 bg-card/80 backdrop-blur border border-border rounded-lg p-1.5">
          {title && <span className="px-2 text-xs font-medium truncate max-w-[16rem]" title={title}>{title}</span>}
          <button type="button" className={btn} onClick={() => createAtCenter("narrative")} title="Add a scene (S)">+ Scene</button>
          <button type="button" className={btn} onClick={() => createAtCenter("decision")} title="Add a decision (D)">+ Decision</button>
          <button type="button" className={btn} onClick={() => createAtCenter("ending")} title="Add an ending (E)">+ Ending</button>
          <button type="button" className={btn} onClick={() => setItemsOpen((v) => !v)} aria-pressed={itemsOpen}>Items ({items.length})</button>
          <span className="w-px h-6 bg-border mx-0.5" />
          <button type="button" className={btn} onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl/⌘ Z)">Undo</button>
          <button type="button" className={btn} onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl/⌘ Shift Z)">Redo</button>
          <button type="button" className={btn} onClick={() => { if (window.confirm("Re-arrange every node automatically? You can undo this.")) { onChange(autoArrange(g.current)); window.setTimeout(() => fit(), 30); } }}>Auto-arrange</button>
        </div>
        <div className="pointer-events-auto ml-auto flex items-center gap-1.5 bg-card/80 backdrop-blur border border-border rounded-lg p-1.5">
          {status}
          <button type="button" className={btn} onClick={() => zoomCenter(0.8)} title="Zoom out (−)">−</button>
          <button type="button" className={`${btn} w-14 tabular-nums`} onClick={() => zoomCenter(1 / view.current.k)} title="Reset to 100% (0)">{Math.round(viewState.k * 100)}%</button>
          <button type="button" className={btn} onClick={() => zoomCenter(1.25)} title="Zoom in (+)">+</button>
          <button type="button" className={btn} onClick={() => fit()} title="Show everything (F)">Fit</button>
          <button type="button" className={btn} onClick={() => setHelpOpen((v) => !v)} title="Controls (?)">?</button>
          <button type="button" className={btn} onClick={() => setInspectorOpen((v) => !v)}>{inspectorOpen ? "Hide panel" : "Show panel"}</button>
        </div>
      </div>

      {/* Items */}
      {itemsOpen && <ItemsPanel graph={graph} onChange={edit} onClose={() => setItemsOpen(false)} />}

      {/* Help */}
      {helpOpen && (
        <div className="absolute left-3 top-16 z-20 w-80 bg-card border border-border rounded-lg p-4 text-xs space-y-1.5 shadow-xl" onPointerDown={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-2"><span className="font-medium text-sm">Controls</span><button type="button" onClick={() => setHelpOpen(false)} className="text-muted-foreground hover:text-foreground">✕</button></div>
          {[
            ["Pan", "Drag the background, scroll, or hold Space and drag"],
            ["Zoom", "Ctrl/⌘ + scroll, pinch, or + / − / 0"],
            ["Show everything", "F"],
            ["Connect", "Drag from a dot on the right of a row onto a node"],
            ["Create next node", "Drop a wire on empty space"],
            ["Insert or cut", "Hover a wire, then + or ✕"],
            ["Add node", "S scene · D decision · E ending (at the mouse), or double-click the background"],
            ["Select many", "Shift + drag the background, or Shift + click"],
            ["Delete", "Delete / Backspace"],
            ["Duplicate", "Ctrl/⌘ D"],
            ["Undo / redo", "Ctrl/⌘ Z · Ctrl/⌘ Shift Z"],
            ["More", "Right-click a node"],
          ].map(([a, b]) => <div key={a} className="grid grid-cols-[7.5rem_1fr] gap-2"><span className="text-muted-foreground">{a}</span><span>{b}</span></div>)}
        </div>
      )}

      {/* Menus */}
      {menu && (
        <div className="absolute z-30 min-w-[11rem] bg-card border border-border rounded-lg shadow-xl py-1 text-sm" style={{ left: Math.min(menu.sx, vp.w - 200), top: Math.min(menu.sy, vp.h - 260) }}
          onPointerDown={(e) => e.stopPropagation()}>
          {(menu.kind === "create" || menu.kind === "insert") && (
            <>
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">{menu.kind === "insert" ? "Insert into this wire" : menu.port ? "Connect to a new…" : "Add a…"}</div>
              {(["narrative", "decision", "ending"] as NodeType[]).filter((t) => !(menu.kind === "insert" && t === "ending")).map((t) => (
                <button key={t} type="button" className="w-full text-left px-3 py-1.5 hover:bg-primary/10 flex items-center gap-2"
                  onClick={() => {
                    if (menu.kind === "insert") {
                      const r = insertOnPort(g.current, menu.port, t, { x: Math.round(menu.w.x), y: Math.round(menu.w.y) });
                      onChange(r.graph);
                      select([r.id]);
                    } else createAt(t, menu.w, menu.port);
                    setMenu(null);
                  }}>
                  <span className={`w-2 h-2 rounded-full`} style={{ background: TONE[t].hex }} />{TONE[t].label}
                </button>
              ))}
              {menu.kind === "create" && menu.port && getPortTarget(g.current, menu.port) && (
                <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-destructive/10 text-destructive" onClick={() => { onChange(setPortTarget(g.current, menu.port!, "")); setMenu(null); }}>Disconnect</button>
              )}
            </>
          )}
          {menu.kind === "node" && (() => {
            const n = byId.get(menu.nodeId);
            if (!n) return null;
            const item = (label: string, fn: () => void, danger = false, disabled = false) => (
              <button type="button" disabled={disabled} className={`w-full text-left px-3 py-1.5 disabled:opacity-40 ${danger ? "text-destructive hover:bg-destructive/10" : "hover:bg-primary/10"}`}
                onClick={() => { fn(); setMenu(null); }}>{label}</button>
            );
            return (
              <>
                {item("Edit", () => onNodeDouble(n.id))}
                {typeOf(n) === "decision" && item("Add a choice", () => onChange(addOption(g.current, n.id)))}
                {typeOf(n) === "narrative" && item("Add a conditional route", () => onChange(addRoute(g.current, n.id)))}
                {item("Duplicate", duplicateSelected)}
                {item("Make this the opening", () => onChange({ ...g.current, startNodeId: n.id }), false, n.id === graph.startNodeId)}
                {item("Centre view here", () => centerOn(n.id))}
                <div className="my-1 border-t border-border" />
                {item(sel.length > 1 ? `Delete ${sel.length} nodes` : "Delete", removeSelected, true, n.id === graph.startNodeId && sel.length <= 1)}
              </>
            );
          })()}
        </div>
      )}

      {/* Minimap */}
      <div className="absolute left-3 bottom-3 bg-card/85 backdrop-blur border border-border rounded-lg overflow-hidden" onPointerDown={(e) => e.stopPropagation()}>
        <svg width={MM_W} height={MM_H} className="block cursor-pointer" onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); mmJump(e); }}
          onPointerMove={(e) => { if (e.buttons === 1) mmJump(e); }}>
          {graph.nodes.map((n) => {
            const p = posFor(n);
            return <rect key={n.id} x={mm.ox + (p.x - mm.bx) * mm.s} y={mm.oy + (p.y - mm.by) * mm.s} width={Math.max(2, NODE_W * mm.s)} height={Math.max(2, nodeHeight(n) * mm.s)}
              fill={selSet.has(n.id) ? "#ffffff" : TONE[typeOf(n)].hex} opacity={selSet.has(n.id) ? 1 : 0.7} />;
          })}
          <rect x={mmView.x} y={mmView.y} width={mmView.w} height={mmView.h} fill="hsl(var(--primary) / 0.1)" stroke="hsl(var(--primary))" strokeWidth={1.5} />
        </svg>
      </div>

      {/* Inspector */}
      {inspectorOpen && (
        <aside data-inspector data-scrollable className="absolute right-3 top-16 bottom-3 w-[344px] bg-card/95 backdrop-blur border border-border rounded-lg overflow-y-auto overscroll-contain shadow-xl"
          onPointerDown={(e) => e.stopPropagation()}>
          {primary ? (
            <Inspector key={primary.id} graph={graph} node={primary} onChange={edit} onSelect={(id) => { select([id]); centerOn(id); }} onDelete={removeSelected} />
          ) : sel.length > 1 ? (
            <div className="p-4 space-y-3 text-sm">
              <p className="font-medium">{sel.length} nodes selected</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btn} onClick={duplicateSelected}>Duplicate</button>
                <button type="button" className={`${btn} hover:!border-destructive hover:!text-destructive`} onClick={removeSelected}>Delete</button>
              </div>
            </div>
          ) : (
            <div className="p-4 text-sm text-muted-foreground space-y-3">
              <p className="text-foreground font-medium">Nothing selected</p>
              <p>Click a node to edit it here. Changes save straight into the story in the main window.</p>
              <p>{graph.nodes.length} nodes · {issues.filter((i) => i.level === "error").length} errors · {issues.filter((i) => i.level === "warning").length} warnings</p>
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

// ── Node card ──

interface CardProps {
  n: StoryNode;
  pos: Pos;
  selected: boolean;
  isStart: boolean;
  items: InventoryItem[];
  errors: number;
  wireTarget: boolean;
  onDown: (e: React.PointerEvent, id: string) => void;
  onPort: (e: React.PointerEvent, port: PortRef, from: Pos) => void;
  onContext: (e: React.MouseEvent, id: string) => void;
  onDouble: (id: string) => void;
}

const NodeCard = memo(function NodeCard({ n, pos, selected, isStart, items, errors, wireTarget, onDown, onPort, onContext, onDouble }: CardProps) {
  const t = typeOf(n);
  const tone = TONE[t];
  const rows = rowsOf(n);
  const name = nodeName(n);
  const text = snippet(n);
  return (
    <div
      data-node-id={n.id}
      className={`absolute rounded-lg border-2 bg-card shadow-lg transition-[box-shadow,border-color] duration-150 ${tone.border} ${selected ? "!border-foreground shadow-[0_0_0_3px_hsl(var(--primary)/0.35),0_12px_32px_rgba(0,0,0,0.45)]" : ""} ${wireTarget ? "!border-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.35)]" : ""}`}
      style={{ left: 0, top: 0, width: NODE_W, transform: `translate(${pos.x}px, ${pos.y}px)`, cursor: "grab" }}
      onPointerDown={(e) => onDown(e, n.id)}
      onContextMenu={(e) => onContext(e, n.id)}
      onDoubleClick={(e) => { e.stopPropagation(); onDouble(n.id); }}
    >
      {/* Input */}
      <span className={`absolute -left-[7px] w-3 h-3 rounded-full border-2 bg-background ${wireTarget ? "border-emerald-400 bg-emerald-400" : "border-muted-foreground"}`} style={{ top: NODE_HEAD / 2 - 6 }} />
      <div className={`px-3 flex flex-col justify-center rounded-t-md ${tone.head}`} style={{ height: NODE_HEAD }}>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
          <span className={`font-semibold ${tone.text}`}>{tone.label}</span>
          {isStart && <span className="px-1 rounded bg-emerald-500/20 text-emerald-400">Opening</span>}
          {!!n.timeLimit && <span className="px-1 rounded bg-amber-500/15 text-amber-400 normal-case tracking-normal">⏱ {n.timeLimit}s</span>}
          {!!n.conditions?.length && <span className="px-1 rounded bg-sky-500/15 text-sky-300 normal-case tracking-normal" title="Only shown if its conditions are met">if</span>}
          {errors > 0 && <span className="ml-auto px-1 rounded bg-destructive/20 text-destructive normal-case tracking-normal">{errors} error{errors > 1 ? "s" : ""}</span>}
          <span className={`${errors > 0 ? "" : "ml-auto"} font-mono normal-case tracking-normal text-muted-foreground truncate max-w-[6.5rem]`}>{n.id}</span>
        </div>
        <div className="text-sm font-medium truncate">{name || <span className="text-muted-foreground italic">Untitled</span>}</div>
      </div>
      <div className="px-3 py-1.5 text-[11px] leading-snug text-muted-foreground overflow-hidden" style={{ height: NODE_BODY }}>
        <span className="line-clamp-2">{text || <span className="italic opacity-60">{t === "ending" ? "No outcome text yet" : "No text yet"}</span>}</span>
      </div>
      {rows.map((r, i) => <Row key={r.key} r={r} i={i} n={n} pos={pos} items={items} onPort={onPort} />)}
      {t === "ending" && <div style={{ height: 0 }} />}
    </div>
  );
});

function Row({ r, i, n, pos, items, onPort }: { r: NodeRow; i: number; n: StoryNode; pos: Pos; items: InventoryItem[]; onPort: CardProps["onPort"] }) {
  const need = r.requiresItem ? items.find((x) => x.id === r.requiresItem) : undefined;
  const color = need ? ITEM_HEX[need.color] : r.tone === "option" ? EDGE_HEX.option : EDGE_HEX.next;
  return (
    <div className="relative flex items-center gap-1.5 px-3 border-t border-border/60 text-xs" style={{ height: NODE_ROW }}>
      {r.tone === "option" && <span className="font-mono text-[10px] text-muted-foreground w-3">{String.fromCharCode(65 + i)}</span>}
      {r.tone === "route" && <span className="text-[10px] text-sky-300">⤷</span>}
      <span className={`truncate flex-1 ${r.label ? "" : "italic text-muted-foreground"} ${r.tone !== "option" ? "text-muted-foreground" : ""}`}>
        {r.tone === "next" ? (r.to ? `Continue → ${r.to}` : "Continue →") : r.label || "(no text)"}
      </span>
      {need && <span className="shrink-0 text-[10px] px-1 rounded border" style={{ borderColor: color, color }} title={`Needs: ${need.name}`}>◇ {need.name.length > 10 ? `${need.name.slice(0, 9)}…` : need.name}</span>}
      {r.gives.map((id) => {
        const it = items.find((x) => x.id === id);
        return <span key={id} className="shrink-0 text-[11px]" style={{ color: ITEM_HEX[it?.color || "blue"] }} title={`Gives: ${it?.name || id}`}>◆</span>;
      })}
      {r.locked && <span className="shrink-0 text-[10px]" title="Has a lock rule">🔒</span>}
      {r.conditional && <span className="shrink-0 text-[10px] text-sky-300" title="Has a show-only-if rule">if</span>}
      <span
        role="button"
        aria-label="Drag to connect"
        className="absolute -right-[8px] w-[15px] h-[15px] rounded-full border-2 cursor-crosshair hover:scale-125 transition-transform"
        style={{ borderColor: color, background: r.to ? color : "hsl(var(--background))", top: NODE_ROW / 2 - 7.5 }}
        onPointerDown={(e) => onPort(e, r.port, outPoint(n, i, pos))}
      />
    </div>
  );
}

// ── Inspector ──

const fieldCls = "w-full px-2.5 py-1.5 bg-background/60 border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary [color-scheme:dark]";
const labelCls = "block text-[11px] text-muted-foreground mb-1";

function TargetSelect({ graph, value, onChange, self }: { graph: InteractiveGraph; value: string; onChange: (v: string) => void; self: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldCls}>
      <option value="">— not connected —</option>
      {graph.nodes.filter((x) => x.id !== self).map((x) => (
        <option key={x.id} value={x.id}>{TONE[typeOf(x)].label} · {x.id}{nodeName(x) ? ` · ${nodeName(x)}` : ""}</option>
      ))}
    </select>
  );
}

/** Text field that edits HTML as paragraphs (blank line = new paragraph), keeping the typing state local. */
function ParagraphField({ html, onChange, rows = 6, placeholder }: { html: string; onChange: (html: string) => void; rows?: number; placeholder?: string }) {
  const asText = htmlToParagraphs(html);
  const raw = asText === null;
  const [value, setValue] = useState(raw ? html : asText);
  const emitted = useRef(html);
  useEffect(() => {
    if (html !== emitted.current) {
      emitted.current = html;
      const t = htmlToParagraphs(html);
      setValue(t === null ? html : t);
    }
  }, [html]);
  return (
    <>
      <textarea value={value} rows={rows} placeholder={placeholder} className={`${fieldCls} resize-y leading-relaxed ${raw ? "font-mono text-xs" : ""}`}
        onChange={(e) => {
          setValue(e.target.value);
          const next = raw ? e.target.value : paragraphsToHtml(e.target.value);
          emitted.current = next;
          onChange(next);
        }} />
      <p className="text-[10px] text-muted-foreground mt-1">{raw ? "This text has rich formatting, so it is shown as HTML here." : "Blank line = new paragraph. Use the main window for bold, italics and images."}</p>
    </>
  );
}

function Inspector({ graph, node: n, onChange, onSelect, onDelete }: { graph: InteractiveGraph; node: StoryNode; onChange: (g: InteractiveGraph, coalesce?: string) => void; onSelect: (id: string) => void; onDelete: () => void }) {
  const t = typeOf(n);
  const items = graph.settings.items || [];
  const set = (patch: Partial<StoryNode>, field: string) => onChange(patchNode(graph, n.id, patch), `${n.id}:${field}`);
  const incoming = graph.nodes.filter((x) => rowsOf(x).some((r) => r.to === n.id));
  return (
    <div className="p-4 space-y-4 text-sm">
      <div className="flex items-center gap-2">
        <span className={`text-[10px] uppercase tracking-wider font-semibold ${TONE[t].text}`}>{TONE[t].label}</span>
        <span className="font-mono text-xs text-muted-foreground truncate">{n.id}</span>
        <select value={t} onChange={(e) => onChange(changeType(graph, n.id, e.target.value as NodeType))} className="ml-auto text-xs bg-transparent border border-border rounded px-1.5 py-1 [color-scheme:dark]" aria-label="Node type">
          <option value="narrative">Scene</option>
          <option value="decision">Decision</option>
          <option value="ending">Ending</option>
        </select>
      </div>

      {t !== "ending" && (
        <div>
          <label className={labelCls}>Title</label>
          <input value={n.title || ""} onChange={(e) => set({ title: e.target.value }, "title")} className={fieldCls} placeholder={t === "decision" ? "What does the reader decide?" : "Scene name"} />
        </div>
      )}

      {t === "narrative" && (
        <>
          <div>
            <label className={labelCls}>Time and place label</label>
            <input value={n.label || ""} onChange={(e) => set({ label: e.target.value }, "label")} className={fieldCls} placeholder="23:12 · The landing" />
          </div>
          <div>
            <label className={labelCls}>Scene text</label>
            <ParagraphField html={n.content || ""} onChange={(html) => set({ content: html }, "content")} rows={9} />
          </div>
          <div>
            <label className={labelCls}>Continue to</label>
            <TargetSelect graph={graph} value={n.next || ""} self={n.id} onChange={(v) => onChange(setPortTarget(graph, { nodeId: n.id, kind: "next" }, v))} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><span className={labelCls}>Conditional routes (checked first)</span>
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => onChange(addRoute(graph, n.id))}>+ Route</button></div>
            {(n.routes || []).map((r, i) => (
              <div key={i} className="border border-border rounded p-2 space-y-1.5">
                <div className="flex gap-1.5">
                  <input value={r.conditions[0]?.var || ""} placeholder="variable, e.g. alerted" className={fieldCls}
                    onChange={(e) => onChange(patchNode(graph, n.id, { routes: (n.routes || []).map((x, j) => (j === i ? { ...x, conditions: [{ ...(x.conditions[0] || { op: "truthy" }), var: e.target.value }, ...x.conditions.slice(1)] } : x)) }), `${n.id}:route${i}`)} />
                  <select value={r.conditions[0]?.op === "falsy" ? "falsy" : "truthy"} className={`${fieldCls} w-28`}
                    onChange={(e) => onChange(patchNode(graph, n.id, { routes: (n.routes || []).map((x, j) => (j === i ? { ...x, conditions: [{ ...(x.conditions[0] || { var: "" }), op: e.target.value as "truthy" | "falsy" }, ...x.conditions.slice(1)] } : x)) }))}>
                    <option value="truthy">is set</option>
                    <option value="falsy">is not set</option>
                  </select>
                </div>
                {r.conditions.length > 1 && <p className="text-[10px] text-muted-foreground">+ {r.conditions.length - 1} more condition(s), edit in the main window</p>}
                <div className="flex gap-1.5">
                  <TargetSelect graph={graph} value={r.to || ""} self={n.id} onChange={(v) => onChange(setPortTarget(graph, { nodeId: n.id, kind: "route", index: i }, v))} />
                  <button type="button" className="px-2 text-muted-foreground hover:text-destructive" onClick={() => onChange(removeRoute(graph, n.id, i))} aria-label="Remove route">✕</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {t === "decision" && (
        <>
          <div>
            <label className={labelCls}>Context line</label>
            <input value={n.context || ""} onChange={(e) => set({ context: e.target.value }, "context")} className={fieldCls} placeholder="The coat queue is getting shorter." />
          </div>
          <div>
            <label className={labelCls}>Timer (seconds, empty = no timer)</label>
            <input type="number" min={5} value={n.timeLimit ?? ""} className={fieldCls}
              onChange={(e) => set({ timeLimit: e.target.value ? Math.max(5, Number(e.target.value)) : undefined }, "timer")} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><span className={labelCls}>Choices</span>
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => onChange(addOption(graph, n.id))}>+ Choice</button></div>
            {(n.options || []).map((o, i) => (
              <div key={o.id} className="border border-border rounded p-2 space-y-1.5" style={o.requiresItem ? { borderColor: ITEM_HEX[items.find((x) => x.id === o.requiresItem)?.color || "blue"] } : undefined}>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-muted-foreground">{String.fromCharCode(65 + i)}</span>
                  <input value={o.label} placeholder="What the reader can choose" className={fieldCls}
                    onChange={(e) => onChange(patchOption(graph, n.id, o.id, { label: e.target.value }), `${n.id}:${o.id}:label`)} />
                </div>
                <TargetSelect graph={graph} value={o.next || ""} self={n.id} onChange={(v) => onChange(setPortTarget(graph, { nodeId: n.id, kind: "option", optionId: o.id }, v))} />
                {items.length > 0 && (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground w-12 shrink-0">Needs</span>
                      <select value={o.requiresItem || ""} className={fieldCls}
                        onChange={(e) => onChange(patchOption(graph, n.id, o.id, withRequiredItem(o, e.target.value)))}>
                        <option value="">Nothing (normal choice)</option>
                        {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                      </select>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-[10px] text-muted-foreground w-12 shrink-0 pt-1.5">Gives</span>
                      <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
                        {items.filter((it) => (o.effects || []).some((e) => e.var === `item_${it.id}` && e.value !== "0" && e.value !== "")).map((it) => {
                          const st = itemStyle(it.color);
                          return (
                            <button key={it.id} type="button" title="Click to stop giving this item" onClick={() => onChange(patchOption(graph, n.id, o.id, withGivenItem(o, it.id, false)))}
                              className={`text-[10px] px-1.5 py-0.5 rounded border ${st.border} ${st.bg} ${st.text}`}>◆ {it.name} ✕</button>
                          );
                        })}
                        <select value="" className="text-[11px] bg-transparent border border-dashed border-border rounded px-1 py-0.5 text-muted-foreground [color-scheme:dark]"
                          onChange={(e) => { if (e.target.value) onChange(patchOption(graph, n.id, o.id, withGivenItem(o, e.target.value, true))); }}>
                          <option value="">+ give item</option>
                          {items.filter((it) => !(o.effects || []).some((e) => e.var === `item_${it.id}` && e.value !== "0" && e.value !== "")).map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                        </select>
                      </div>
                    </div>
                  </>
                )}
                {(o.lockedIf?.length || (o.visibleIf || []).some((c) => !(o.requiresItem && c.var === `item_${o.requiresItem}`))) ? (
                  <p className="text-[10px] text-sky-300">Has show / lock rules. Edit those in the main window.</p>
                ) : null}
                <div className="flex justify-end gap-2 text-xs">
                  <button type="button" className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0} onClick={() => onChange(moveOption(graph, n.id, o.id, -1))}>↑</button>
                  <button type="button" className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === (n.options || []).length - 1} onClick={() => onChange(moveOption(graph, n.id, o.id, 1))}>↓</button>
                  <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => onChange(removeOption(graph, n.id, o.id))}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {t === "ending" && (
        <>
          <div>
            <label className={labelCls}>Ending title</label>
            <input value={n.endingTitle || ""} onChange={(e) => set({ endingTitle: e.target.value }, "endingTitle")} className={fieldCls} placeholder="Platform 4" />
          </div>
          <div>
            <label className={labelCls}>Outcome (one or two lines)</label>
            <textarea value={n.endingText || ""} rows={3} onChange={(e) => set({ endingText: e.target.value }, "endingText")} className={`${fieldCls} resize-y`} placeholder="Celeste Varga is arrested on Platform 4. The file is closed." />
          </div>
          <div>
            <label className={labelCls}>Closing scene</label>
            <ParagraphField html={n.content || ""} onChange={(html) => set({ content: html }, "content")} rows={7} />
          </div>
          <p className="text-[11px] text-muted-foreground">Describe what happens, never whether the reader was right. The written conclusion and your review do that.</p>
        </>
      )}

      <div className="pt-2 border-t border-border space-y-2">
        <p className={labelCls}>Comes from</p>
        {incoming.length ? (
          <div className="flex flex-wrap gap-1">
            {incoming.map((x) => <button key={x.id} type="button" onClick={() => onSelect(x.id)} className="text-[11px] font-mono px-1.5 py-0.5 rounded border border-border hover:border-primary">{x.id}</button>)}
          </div>
        ) : <p className="text-xs text-muted-foreground">{n.id === graph.startNodeId ? "This is the opening." : "Nothing leads here yet."}</p>}
        <div className="flex gap-2 pt-1">
          {n.id !== graph.startNodeId && <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange({ ...graph, startNodeId: n.id })}>Make opening</button>}
          {n.id !== graph.startNodeId && <button type="button" className="ml-auto text-xs text-destructive hover:underline" onClick={onDelete}>Delete node</button>}
        </div>
      </div>
    </div>
  );
}

// ── Items ──

function ItemsPanel({ graph, onChange, onClose }: { graph: InteractiveGraph; onChange: (g: InteractiveGraph, coalesce?: string) => void; onClose: () => void }) {
  const items = graph.settings.items || [];
  const setItems = (next: InventoryItem[], coalesce?: string) => onChange({ ...graph, settings: { ...graph.settings, items: next } }, coalesce);
  const add = () => {
    let i = items.length + 1;
    while (items.some((x) => x.id === `item${i}`)) i++;
    setItems([...items, { id: `item${i}`, name: `Item ${i}`, color: ITEM_COLORS[items.length % ITEM_COLORS.length] }]);
  };
  const usedBy = (id: string) => graph.nodes.flatMap((n) => (n.options || []).filter((o) => o.requiresItem === id || (o.effects || []).some((e) => e.var === `item_${id}`)).map(() => n.id));
  return (
    <div data-scrollable className="absolute left-3 top-16 z-20 w-80 max-h-[70vh] overflow-y-auto bg-card border border-border rounded-lg p-4 shadow-xl space-y-3" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex justify-between items-center"><span className="font-medium text-sm">Items</span><button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button></div>
      <p className="text-xs text-muted-foreground">Things the reader can pick up. Choose “Gives” on a choice to hand one out, and “Needs” to make a coloured item choice.</p>
      {items.map((it) => {
        const st = itemStyle(it.color);
        const uses = usedBy(it.id).length;
        return (
          <div key={it.id} className={`border rounded p-2 space-y-1.5 ${st.border}`}>
            <input value={it.name} className={fieldCls} onChange={(e) => setItems(items.map((x) => (x.id === it.id ? { ...x, name: e.target.value } : x)), `item:${it.id}`)} />
            <div className="flex items-center gap-1">
              {ITEM_COLORS.map((c) => (
                <button key={c} type="button" aria-label={c} onClick={() => setItems(items.map((x) => (x.id === it.id ? { ...x, color: c } : x)))}
                  className={`w-5 h-5 rounded-full border-2 ${it.color === c ? "border-foreground" : "border-transparent"}`} style={{ background: ITEM_HEX[c] }} />
              ))}
              <span className="ml-auto text-[10px] font-mono text-muted-foreground">{it.id} · {uses} use{uses === 1 ? "" : "s"}</span>
              <button type="button" className="text-xs text-muted-foreground hover:text-destructive ml-1" onClick={() => {
                if (uses && !window.confirm(`“${it.name}” is used by ${uses} choice(s). Remove it anyway? Those choices keep their rules until you change them.`)) return;
                setItems(items.filter((x) => x.id !== it.id));
              }}>✕</button>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={add} className="w-full text-xs border border-dashed border-border rounded py-2 hover:border-primary hover:text-primary">+ Add item</button>
    </div>
  );
}
