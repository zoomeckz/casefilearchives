import React, { useId, useMemo } from "react";
import type { Decision, InteractiveGraph } from "@/lib/interactive";
import { BRANCH_COLORS, ENDING_COLORS, START_ID, buildCaseMap, pathEdges, type CaseMapLayout } from "@/lib/caseMap";
import { ITEM_STYLE } from "@/lib/itemColors";

const ITEM_HEX: Record<string, string> = { blue: "#38bdf8", green: "#34d399", amber: "#fbbf24", violet: "#a78bfa", cyan: "#22d3ee", pink: "#f472b6" };

export interface CaseMapProps {
  graph: InteractiveGraph;
  /** A reader's decisions: their route is lit up, everything else dims. */
  decisions?: Pick<Decision, "node_id" | "option_id">[];
  endingNode?: string | null;
  /** reader = spoiler-safe: sections they never reached are unlabeled. */
  mode?: "full" | "reader";
  /** Traffic per edge key / node id (admin analytics). */
  heat?: { edges: Record<string, number>; nodes: Record<string, number> };
  selected?: string | null;
  onSelect?: (nodeId: string) => void;
  className?: string;
  /** Pre-built layout (when the caller also needs it). */
  layout?: CaseMapLayout;
}

/** A flowchart of the case: decisions as circles (diamonds hand out items), endings at the bottom. */
export const CaseMap: React.FC<CaseMapProps> = ({ graph, decisions, endingNode, mode = "full", heat, selected, onSelect, className = "", layout: given }) => {
  const uid = useId().replace(/:/g, "");
  const layout = useMemo(() => given || buildCaseMap(graph), [given, graph]);
  const lit = useMemo(() => (decisions ? pathEdges(layout, decisions, endingNode) : new Set<string>()), [layout, decisions, endingNode]);
  const hasPath = lit.size > 0;
  const visited = useMemo(() => {
    const s = new Set<string>([START_ID]);
    for (const e of layout.edges) if (lit.has(e.key)) { s.add(e.from); s.add(e.to); }
    if (endingNode) s.add(endingNode);
    return s;
  }, [layout, lit, endingNode]);
  const items = useMemo(() => Object.fromEntries((graph.settings.items || []).map((i) => [i.id, i])), [graph]);
  const maxEdge = heat ? Math.max(1, ...Object.values(heat.edges)) : 1;
  const maxNode = heat ? Math.max(1, ...Object.values(heat.nodes)) : 1;

  // The letter of the choice that leads into each node (like A/B/C in a flowchart).
  const incomingLetter = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of layout.edges) if (e.letter && !m[e.to]) m[e.to] = e.letter;
    return m;
  }, [layout]);

  const R = 17;
  const reader = mode === "reader";

  return (
    <div className={`overflow-auto overscroll-contain rounded-lg bg-[#07090d] border border-border ${className}`} data-lenis-prevent>
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width="100%" style={{ minWidth: Math.min(layout.width, 640) }} role="img"
        aria-label={hasPath ? "Story map with the chosen route highlighted" : "Story map"}>
        <defs>
          <filter id={`glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Arrows */}
        {layout.edges.map((e) => {
          const a = layout.byId[e.from];
          const b = layout.byId[e.to];
          const on = lit.has(e.key);
          const item = e.requiresItem ? items[e.requiresItem] : undefined;
          const color = item ? ITEM_HEX[item.color] || "#38bdf8" : BRANCH_COLORS[e.branch % BRANCH_COLORS.length];
          const y1 = a.y + (a.kind === "start" ? 14 : R);
          const y2 = b.y - (b.kind === "ending" ? 16 : R);
          const back = y2 <= y1;
          const mid = (y1 + y2) / 2;
          const d = back
            ? `M ${a.x} ${y1} C ${a.x + 90} ${y1 + 60}, ${b.x + 90} ${y2 - 60}, ${b.x} ${y2}`
            : `M ${a.x} ${y1} C ${a.x} ${mid}, ${b.x} ${mid}, ${b.x} ${y2}`;
          const count = heat?.edges[e.key] || 0;
          const w = heat ? 1 + (count / maxEdge) * 7 : on ? 3 : 1.4;
          const opacity = hasPath ? (on ? 1 : reader ? 0.08 : 0.14) : heat ? (count ? 0.35 + 0.65 * (count / maxEdge) : 0.12) : 0.55;
          return (
            <g key={e.key}>
              <path d={d} fill="none" stroke={color} strokeWidth={w} strokeOpacity={opacity}
                strokeDasharray={item || e.conditional ? "5 4" : undefined} filter={on ? `url(#glow-${uid})` : undefined} />
              <circle cx={b.x} cy={y2} r={on ? 3 : 2} fill={color} fillOpacity={opacity} />
              <title>
                {[e.letter && `${e.letter}.`, !reader || on ? e.label : null, item ? `(needs ${item.name})` : null, heat ? `· ${count} reader${count === 1 ? "" : "s"}` : null]
                  .filter(Boolean).join(" ")}
              </title>
            </g>
          );
        })}

        {/* Sections */}
        {layout.nodes.map((n) => {
          const isOn = !hasPath || visited.has(n.id);
          const hidden = reader && !visited.has(n.id);
          const sel = selected === n.id;
          const click = onSelect && n.kind !== "start" ? () => onSelect(n.id) : undefined;
          const nodeHeat = heat?.nodes[n.id] || 0;
          if (n.kind === "start") {
            return (
              <g key={n.id} filter={`url(#glow-${uid})`}>
                <rect x={n.x - 46} y={n.y - 15} width={92} height={30} rx={15} fill="#07090d" stroke="#e5e7eb" strokeWidth={1.6} />
                <text x={n.x} y={n.y + 5} textAnchor="middle" fill="#f8fafc" fontSize={13} fontWeight={700} letterSpacing={2}>START</text>
              </g>
            );
          }
          if (n.kind === "ending") {
            const c = ENDING_COLORS[((n.endingNo || 1) - 1) % ENDING_COLORS.length];
            const mine = endingNode === n.id;
            return (
              <g key={n.id} onClick={click} style={{ cursor: click ? "pointer" : undefined }} opacity={hasPath && !mine ? 0.3 : 1}
                filter={mine || sel ? `url(#glow-${uid})` : undefined}>
                <rect x={n.x - 38} y={n.y - 16} width={76} height={32} rx={7} fill="#07090d" stroke={c} strokeWidth={mine || sel ? 2.6 : 1.6} />
                <text x={n.x} y={n.y + 5} textAnchor="middle" fill={c} fontSize={12} fontWeight={700} letterSpacing={1}>END {n.endingNo}</text>
                {!hidden && !reader && <text x={n.x} y={n.y + 30} textAnchor="middle" fill="#94a3b8" fontSize={9}>{n.title}</text>}
                {reader && mine && <text x={n.x} y={n.y + 30} textAnchor="middle" fill={c} fontSize={9}>{n.title}</text>}
                {heat && <text x={n.x + 36} y={n.y - 18} textAnchor="end" fill="#f8fafc" fontSize={9}>{nodeHeat}</text>}
                <title>{reader && !mine ? `Ending ${n.endingNo}` : `END ${n.endingNo}: ${n.title}`}{heat ? ` · ${nodeHeat} readers` : ""}</title>
              </g>
            );
          }
          const c = BRANCH_COLORS[n.branch % BRANCH_COLORS.length];
          const stroke = hidden ? "#475569" : c;
          const letter = incomingLetter[n.id] || "";
          const heatR = heat && nodeHeat ? R + 4 + (nodeHeat / maxNode) * 8 : 0;
          return (
            <g key={n.id} onClick={click} style={{ cursor: click ? "pointer" : undefined }} opacity={isOn ? 1 : 0.25}
              filter={(hasPath && visited.has(n.id)) || sel ? `url(#glow-${uid})` : undefined}>
              {heatR > 0 && <circle cx={n.x} cy={n.y} r={heatR} fill={c} fillOpacity={0.12} />}
              {n.givesItem
                ? <rect x={n.x - R * 0.9} y={n.y - R * 0.9} width={R * 1.8} height={R * 1.8} transform={`rotate(45 ${n.x} ${n.y})`} fill="#07090d" stroke={stroke} strokeWidth={sel ? 3 : 1.8} />
                : <circle cx={n.x} cy={n.y} r={R} fill="#07090d" stroke={stroke} strokeWidth={sel ? 3 : 1.8} />}
              {!hidden && <text x={n.x} y={n.y + 5} textAnchor="middle" fill={c} fontSize={14} fontWeight={700}>{letter}</text>}
              {n.timed && !hidden && (
                <g>
                  <circle cx={n.x + R - 2} cy={n.y - R + 2} r={6.5} fill="#07090d" stroke="#f87171" strokeWidth={1.2} />
                  <path d={`M ${n.x + R - 2} ${n.y - R - 1.5} V ${n.y - R + 2} H ${n.x + R + 1}`} stroke="#f87171" strokeWidth={1.2} fill="none" />
                </g>
              )}
              {!hidden && !reader && (
                <text x={n.x} y={n.y + R + 13} textAnchor="middle" fill="#94a3b8" fontSize={9}>{n.title}</text>
              )}
              {heat && nodeHeat > 0 && <text x={n.x - R - 2} y={n.y - R} textAnchor="end" fill="#f8fafc" fontSize={9}>{nodeHeat}</text>}
              <title>{hidden ? "Not reached" : `${n.title}${n.timed ? " · timed" : ""}${n.givesItem ? " · hands out an item" : ""}${heat ? ` · ${nodeHeat} readers` : ""}`}</title>
            </g>
          );
        })}
      </svg>
      {!reader && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-[10px] text-slate-400 border-t border-border/60">
          <span>○ decision</span>
          <span>◇ hands out an item</span>
          <span className="text-red-400">◷ timed</span>
          <span>- - - conditional or item choice</span>
          {(graph.settings.items || []).map((i) => (
            <span key={i.id} style={{ color: ITEM_HEX[i.color] }}>- - - needs {i.name || ITEM_STYLE[i.color]?.label}</span>
          ))}
        </div>
      )}
    </div>
  );
};

export default CaseMap;
