// Interactive Case Files — shared data model + client-side engine.
// The engine mirrors the database functions (ic_eval_conds / ic_resolve /
// ic_choose) so guest reads and admin previews behave exactly like the
// server-enforced path for registered readers.

export type CondOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "truthy" | "falsy";
export interface Condition { var: string; op: CondOp; value?: string }
export interface Effect { var: string; op: "set" | "add"; value: string }
export interface Route { conditions: Condition[]; to: string }

export interface DecisionOption {
  id: string;
  label: string;
  description?: string;
  next: string;
  visibleIf?: Condition[];
  lockedIf?: Condition[];
  effects?: Effect[];
  consequence?: string;
}

export type NodeType = "narrative" | "decision" | "ending";

/** A line the reader's case notebook gains when the scene holding it is shown. */
export interface NotebookEntry { kind: "note" | "evidence"; text: string }

export interface StoryNode {
  id: string;
  type: NodeType;
  title?: string;
  label?: string; // case status / location label
  content: string; // HTML
  image?: string;
  next?: string;
  routes?: Route[];
  conditions?: Condition[]; // narrative only: skip when unmet
  notebook?: NotebookEntry[]; // narrative only: added to the reader's notebook when shown
  // decision
  context?: string;
  options?: DecisionOption[];
  warning?: string;
  /** Seconds to decide; when time runs out a random available option is filed. */
  timeLimit?: number;
  // ending
  endingTitle?: string;
  endingText?: string;
}

export type ReplayPolicy = "disabled" | "after_completion" | "after_wait" | "admin_only";
export type GuestAccess = "opening" | "two_choices" | "full_nosave";
export type EndingVisibility = "own" | "count" | "index";

export interface InteractiveSettings {
  replay: ReplayPolicy;
  replayWaitHours?: number;
  guestAccess: GuestAccess;
  endingVisibility: EndingVisibility;
  /** Question readers answer in writing after the ending. Empty = no written conclusion. */
  conclusionPrompt?: string;
}

export interface InteractiveGraph {
  startNodeId: string;
  settings: InteractiveSettings;
  nodes: StoryNode[];
}

export interface Decision { node_id: string; option_id: string; option_label?: string; created_at?: string }

export interface PlayState {
  status: "in_progress" | "completed" | "replayed";
  current_node: string | null;
  variables: Record<string, string>;
  visited: string[];
  ending_node: string | null;
  completed_at?: string | null;
  attempt?: number;
  /** When the current decision was reached (ISO); starts the clock on timed decisions. */
  reached_at?: string | null;
  /** The reader's written conclusion for this attempt. */
  final_answer?: string | null;
  answered_at?: string | null;
  decisions: Decision[];
}

export const DEFAULT_SETTINGS: InteractiveSettings = {
  // A closed case reopens for a new attempt one week after completion.
  replay: "after_wait",
  replayWaitHours: 168,
  guestAccess: "two_choices",
  endingVisibility: "own",
  conclusionPrompt: "File your conclusion: what do you believe really happened?",
};

export const GUEST_CHOICE_LIMIT = 2;

export function uid(prefix = "n"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyGraph(): InteractiveGraph {
  const start: StoryNode = { id: "opening", type: "narrative", title: "Opening", content: "" };
  return { startNodeId: start.id, settings: { ...DEFAULT_SETTINGS }, nodes: [start] };
}

export function normalizeGraph(raw: any): InteractiveGraph {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.nodes)) return emptyGraph();
  return {
    startNodeId: raw.startNodeId || raw.nodes[0]?.id || "",
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
    nodes: raw.nodes,
  };
}

const isFalsy = (v: string | undefined) => v == null || v === "" || v === "false" || v === "0";

export function evalConds(conds: Condition[] | undefined, vars: Record<string, string>): boolean {
  if (!conds || conds.length === 0) return true;
  for (const c of conds) {
    if (!c.var) continue;
    const v = vars[c.var];
    const t = c.value ?? "";
    switch (c.op || "eq") {
      case "eq": if ((v ?? "") !== t) return false; break;
      case "neq": if ((v ?? "") === t) return false; break;
      case "truthy": if (isFalsy(v)) return false; break;
      case "falsy": if (!isFalsy(v)) return false; break;
      default: {
        const a = Number(v === undefined || v === "" ? "0" : v);
        const b = Number(t);
        if (Number.isNaN(a) || Number.isNaN(b)) return false;
        if (c.op === "gt" && !(a > b)) return false;
        if (c.op === "gte" && !(a >= b)) return false;
        if (c.op === "lt" && !(a < b)) return false;
        if (c.op === "lte" && !(a <= b)) return false;
      }
    }
  }
  return true;
}

export function isOptionVisible(o: DecisionOption, vars: Record<string, string>) {
  return evalConds(o.visibleIf, vars);
}
export function isOptionLocked(o: DecisionOption, vars: Record<string, string>) {
  return !!o.lockedIf && o.lockedIf.length > 0 && evalConds(o.lockedIf, vars);
}

export function findNode(g: InteractiveGraph, id: string | null | undefined) {
  return id ? g.nodes.find((n) => n.id === id) : undefined;
}

export function resolve(g: InteractiveGraph, start: string | undefined, vars: Record<string, string>) {
  let cur: string | undefined = start;
  const visited: string[] = [];
  for (let i = 0; i < 300 && cur; i++) {
    const n = findNode(g, cur);
    if (!n) return { current: null, visited, terminal: true, ending: null as string | null };
    if ((n.type || "narrative") === "narrative" && !evalConds(n.conditions, vars)) {
      cur = n.next || undefined;
      continue;
    }
    visited.push(cur);
    if (n.type === "decision") return { current: cur, visited, terminal: false, ending: null };
    if (n.type === "ending") return { current: cur, visited, terminal: true, ending: cur };
    const route = (n.routes || []).find((r) => r.to && evalConds(r.conditions, vars));
    const nxt = route?.to || n.next;
    if (!nxt) return { current: cur, visited, terminal: true, ending: null };
    cur = nxt;
  }
  return { current: null, visited, terminal: true, ending: null };
}

export function applyEffects(effects: Effect[] | undefined, vars: Record<string, string>) {
  const out = { ...vars };
  for (const e of effects || []) {
    if (!e.var) continue;
    if (e.op === "add") {
      const a = Number(out[e.var] || "0");
      const b = Number(e.value || "0");
      if (!Number.isNaN(a) && !Number.isNaN(b)) out[e.var] = String(a + b);
    } else out[e.var] = e.value ?? "";
  }
  return out;
}

export function startLocal(g: InteractiveGraph): PlayState {
  const r = resolve(g, g.startNodeId, {});
  return {
    status: r.terminal ? "completed" : "in_progress",
    current_node: r.current,
    variables: {},
    visited: r.visited,
    ending_node: r.ending,
    completed_at: r.terminal ? new Date().toISOString() : null,
    reached_at: new Date().toISOString(),
    decisions: [],
  };
}

/** Local (guest/preview) choice — same checks the server performs. */
export function chooseLocal(g: InteractiveGraph, s: PlayState, nodeId: string, optionId: string): PlayState {
  if (s.status !== "in_progress" || s.current_node !== nodeId) throw new Error("decision_not_reached");
  if (s.decisions.some((d) => d.node_id === nodeId)) throw new Error("already_decided");
  const n = findNode(g, nodeId);
  const o = n?.options?.find((x) => x.id === optionId);
  if (!n || n.type !== "decision" || !o) throw new Error("invalid_option");
  if (!isOptionVisible(o, s.variables) || isOptionLocked(o, s.variables)) throw new Error("option_unavailable");
  if (!o.next || !findNode(g, o.next)) throw new Error("broken_link");
  const vars = applyEffects(o.effects, s.variables);
  const r = resolve(g, o.next, vars);
  return {
    ...s,
    variables: vars,
    current_node: r.current,
    visited: [...s.visited, ...r.visited],
    status: r.terminal ? "completed" : "in_progress",
    ending_node: r.ending,
    completed_at: r.terminal ? new Date().toISOString() : null,
    reached_at: new Date().toISOString(),
    decisions: [...s.decisions, { node_id: nodeId, option_id: optionId, option_label: o.label, created_at: new Date().toISOString() }],
  };
}

export function parseServerState(raw: any): PlayState | null {
  const p = raw?.playthrough;
  if (!p) return null;
  return {
    status: p.status,
    current_node: p.current_node,
    variables: p.variables || {},
    visited: Array.isArray(p.visited) ? p.visited : [],
    ending_node: p.ending_node,
    completed_at: p.completed_at,
    attempt: p.attempt,
    reached_at: p.updated_at ?? null,
    final_answer: p.final_answer ?? null,
    answered_at: p.answered_at ?? null,
    decisions: Array.isArray(raw.decisions) ? raw.decisions : [],
  };
}

/** Notebook entries from every scene the reader has been shown, in order, without repeats. */
export function collectNotebook(g: InteractiveGraph, visited: string[]): NotebookEntry[] {
  const seen = new Set<string>();
  const out: NotebookEntry[] = [];
  for (const id of visited) {
    for (const e of findNode(g, id)?.notebook || []) {
      const text = (e.text || "").trim();
      const kind = e.kind === "evidence" ? "evidence" : "note";
      if (!text || seen.has(`${kind}:${text}`)) continue;
      seen.add(`${kind}:${text}`);
      out.push({ kind, text });
    }
  }
  return out;
}

/** Plain-text opening used as the story's searchable/SEO body. */
export function openingContent(g: InteractiveGraph): string {
  return resolve(g, g.startNodeId, {}).visited
    .map((id) => findNode(g, id)?.content || "")
    .join("\n");
}

export interface ValidationIssue { level: "error" | "warning"; nodeId?: string; message: string }

/** Pre-publish checks: broken links, dead decisions, unreachable nodes/endings. */
export function validateGraph(g: InteractiveGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  for (const n of g.nodes) {
    if (!n.id) issues.push({ level: "error", message: "A node has no ID." });
    else if (ids.has(n.id)) issues.push({ level: "error", nodeId: n.id, message: `Duplicate node ID "${n.id}".` });
    ids.add(n.id);
  }
  if (!findNode(g, g.startNodeId)) issues.push({ level: "error", message: "The opening node is missing." });

  const link = (from: string, to: string | undefined, what: string) => {
    if (to && !ids.has(to)) issues.push({ level: "error", nodeId: from, message: `${what} points to missing node "${to}".` });
  };

  for (const n of g.nodes) {
    if (n.type === "decision") {
      const opts = n.options || [];
      if (opts.length < 2) issues.push({ level: "error", nodeId: n.id, message: "Decision needs at least two options." });
      if (n.timeLimit != null && n.timeLimit > 0 && n.timeLimit < 5) {
        issues.push({ level: "warning", nodeId: n.id, message: "A time limit under 5 seconds leaves little time to read the options." });
      }
      opts.forEach((o, i) => {
        if (!o.label?.trim()) issues.push({ level: "error", nodeId: n.id, message: `Option ${i + 1} has no label.` });
        if (!o.next) issues.push({ level: "error", nodeId: n.id, message: `Option "${o.label || i + 1}" does not lead anywhere.` });
        link(n.id, o.next, `Option "${o.label || i + 1}"`);
      });
      if (opts.length > 0 && opts.every((o) => (o.visibleIf?.length || 0) > 0 || (o.lockedIf?.length || 0) > 0)) {
        issues.push({ level: "warning", nodeId: n.id, message: "Every option has conditions — some readers may have no valid option." });
      }
    } else if (n.type === "ending") {
      if (!n.endingTitle?.trim()) issues.push({ level: "warning", nodeId: n.id, message: "Ending has no title." });
    } else {
      link(n.id, n.next, "Next");
      (n.routes || []).forEach((r) => link(n.id, r.to, "Conditional route"));
      if (!n.next && !(n.routes || []).length) {
        issues.push({ level: "warning", nodeId: n.id, message: "Scene has no next node — the file ends here without an ending." });
      }
      (n.notebook || []).forEach((e, i) => {
        if (!e.text?.trim()) issues.push({ level: "warning", nodeId: n.id, message: `Notebook entry ${i + 1} is empty and will not be shown.` });
      });
    }
  }

  // Reachability (ignores conditions — structural graph walk).
  const reach = new Set<string>();
  const stack = [g.startNodeId];
  while (stack.length) {
    const id = stack.pop()!;
    if (!id || reach.has(id)) continue;
    const n = findNode(g, id);
    if (!n) continue;
    reach.add(id);
    if (n.next) stack.push(n.next);
    (n.routes || []).forEach((r) => stack.push(r.to));
    (n.options || []).forEach((o) => stack.push(o.next));
  }
  for (const n of g.nodes) {
    if (!reach.has(n.id)) {
      issues.push({ level: "warning", nodeId: n.id, message: n.type === "ending" ? "This ending can never be reached." : "Node is unreachable." });
    }
  }
  if (!g.nodes.some((n) => n.type === "ending")) issues.push({ level: "warning", message: "The case has no ending nodes." });
  return issues;
}

/** Nodes that existed before an edit but are now gone — may strand readers. */
export function removedNodeIds(before: InteractiveGraph | null, after: InteractiveGraph): string[] {
  if (!before) return [];
  const now = new Set(after.nodes.map((n) => n.id));
  return before.nodes.map((n) => n.id).filter((id) => !now.has(id));
}
