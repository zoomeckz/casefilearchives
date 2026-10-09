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
  /** Inventory item this option needs. The option is only shown to readers who hold it,
   *  and is drawn in the item's colour. (Enforced through a matching visibleIf condition.) */
  requiresItem?: string;
}

/** Colours an item choice can be drawn in (the normal choice colour is the site red). */
export type ItemColor = "blue" | "green" | "amber" | "violet" | "cyan" | "pink";
export const ITEM_COLORS: ItemColor[] = ["blue", "green", "amber", "violet", "cyan", "pink"];

/** Something the reader can carry (a gun, a key, a photograph…). Held = variable item_<id> is true. */
export interface InventoryItem { id: string; name: string; color: ItemColor }

export const ITEM_PREFIX = "item_";
export const itemVar = (id: string) => `${ITEM_PREFIX}${id}`;

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
  /** Total playthroughs each registered reader may start. Empty = no limit; admins are exempt. */
  maxAttempts?: number;
  guestAccess: GuestAccess;
  endingVisibility: EndingVisibility;
  /** Question readers answer in writing after the ending. Empty = no written conclusion.
   *  Superseded by conclusionQuestions; kept for older cases (and set to the first question). */
  conclusionPrompt?: string;
  /** Questions readers answer in writing after the ending (e.g. "Who did it?", "Why?"). */
  conclusionQuestions?: string[];
  /** Items readers can pick up through their choices. */
  items?: InventoryItem[];
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
  /** The archivist's response to the written conclusion (admin panel → Case reports). */
  admin_feedback?: string | null;
  feedback_at?: string | null;
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

/** The closing questions of a case (new list, or the single older prompt). */
export function getConclusionQuestions(settings: InteractiveSettings): string[] {
  const list = Array.isArray(settings.conclusionQuestions)
    ? settings.conclusionQuestions
    : [settings.conclusionPrompt ?? DEFAULT_SETTINGS.conclusionPrompt ?? ""];
  return list.map((q) => (q || "").trim()).filter(Boolean);
}

/** One stored text for all answers (the database keeps a single conclusion per attempt). */
export function formatConclusion(questions: string[], answers: string[]): string {
  if (questions.length <= 1) return (answers[0] || "").trim();
  return questions.map((q, i) => `${i + 1}. ${q}\n${(answers[i] || "").trim() || "—"}`).join("\n\n");
}

/** Items the reader currently holds, in the order they are defined. */
export function heldItems(g: InteractiveGraph, vars: Record<string, string>): InventoryItem[] {
  return (g.settings.items || []).filter((it) => !isFalsy(vars[itemVar(it.id)]));
}

export function findItem(g: InteractiveGraph, id: string | undefined): InventoryItem | undefined {
  return id ? (g.settings.items || []).find((it) => it.id === id) : undefined;
}

/** Readable, unused section ID: scene_3, decision_2, ending_1… */
export function nextNodeId(g: InteractiveGraph, type: NodeType): string {
  const base = type === "decision" ? "decision" : type === "ending" ? "ending" : "scene";
  const used = new Set(g.nodes.map((n) => n.id));
  let i = g.nodes.filter((n) => (n.type || "narrative") === type).length + 1;
  while (used.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

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
    admin_feedback: p.admin_feedback ?? null,
    feedback_at: p.feedback_at ?? null,
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

export interface ValidationIssue {
  level: "error" | "warning";
  nodeId?: string;
  message: string;
  /** Where in the section the problem is, in words (e.g. "Choice A › Choice text"). */
  where?: string;
  /** Which field to jump to: "next", "endingTitle", "timer", "choices", "opt:0:label",
   *  "opt:0:next", "opt:0:item", "route:0", "notebook:0", "settings:items", "add:ending". */
  loc?: string;
}

/** Pre-publish checks: broken links, dead decisions, unreachable nodes/endings. */
export function validateGraph(g: InteractiveGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  for (const n of g.nodes) {
    if (!n.id) issues.push({ level: "error", message: "A section has no ID." });
    else if (ids.has(n.id)) issues.push({ level: "error", nodeId: n.id, where: "Section ID", loc: "id", message: `Two sections are called "${n.id}". Rename one of them.` });
    ids.add(n.id);
  }
  if (!findNode(g, g.startNodeId)) issues.push({ level: "error", message: "The opening section is missing. Pick a section and press “Set as opening”." });

  const missing = (to: string | undefined) => !!to && !ids.has(to);
  const letter = (i: number) => String.fromCharCode(65 + i);

  for (const n of g.nodes) {
    if (n.type === "decision") {
      const opts = n.options || [];
      if (opts.length < 2) issues.push({ level: "error", nodeId: n.id, where: "Choices", loc: "choices", message: "Needs at least two choices. Press “+ Add choice”." });
      if (n.timeLimit != null && n.timeLimit > 0 && n.timeLimit < 5) {
        issues.push({ level: "warning", nodeId: n.id, where: "Choices › Timer", loc: "timer", message: "Under 5 seconds leaves little time to read the choices." });
      }
      opts.forEach((o, i) => {
        const name = `Choice ${letter(i)}`;
        if (!o.label?.trim()) issues.push({ level: "error", nodeId: n.id, where: `${name} › Choice text`, loc: `opt:${i}:label`, message: "Empty. Type what the reader can pick." });
        if (!o.next) issues.push({ level: "error", nodeId: n.id, where: `${name} › Leads to`, loc: `opt:${i}:next`, message: "Not set. Pick the section this choice leads to." });
        else if (missing(o.next)) issues.push({ level: "error", nodeId: n.id, where: `${name} › Leads to`, loc: `opt:${i}:next`, message: `Points to "${o.next}", which no longer exists.` });
        if (o.requiresItem && !findItem(g, o.requiresItem)) {
          issues.push({ level: "error", nodeId: n.id, where: `${name} › Item choice`, loc: `opt:${i}:item`, message: "Needs an item that was removed. Pick another item or none." });
        }
      });
      if (opts.length > 0 && opts.every((o) => (o.visibleIf?.length || 0) > 0 || (o.lockedIf?.length || 0) > 0)) {
        issues.push({ level: "warning", nodeId: n.id, where: "Choices", loc: "choices", message: "Every choice has conditions, so some readers may have nothing to pick." });
      }
    } else if (n.type === "ending") {
      if (!n.endingTitle?.trim()) issues.push({ level: "warning", nodeId: n.id, where: "Ending title", loc: "endingTitle", message: "Empty. Readers see “File closed” instead." });
    } else {
      if (missing(n.next)) issues.push({ level: "error", nodeId: n.id, where: "Next section", loc: "next", message: `Points to "${n.next}", which no longer exists.` });
      (n.routes || []).forEach((r, i) => {
        if (missing(r.to)) issues.push({ level: "error", nodeId: n.id, where: `Conditional route ${i + 1}`, loc: `route:${i}`, message: `Points to "${r.to}", which no longer exists.` });
      });
      if (!n.next && !(n.routes || []).length) {
        issues.push({ level: "warning", nodeId: n.id, where: "Next section", loc: "next", message: "Not set, so the story stops here without an ending. Pick the next section." });
      }
      (n.notebook || []).forEach((e, i) => {
        if (!e.text?.trim()) issues.push({ level: "warning", nodeId: n.id, where: `Notebook entry ${i + 1}`, loc: `notebook:${i}`, message: "Empty, so it will not be shown." });
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
      issues.push({ level: "warning", nodeId: n.id, message: n.type === "ending"
        ? "Nothing leads to this ending yet. Pick it in a choice’s “Leads to” or a scene’s “Next section”."
        : "Nothing leads here yet, so readers can never see it. Pick it in a choice’s “Leads to” or a scene’s “Next section”." });
    }
  }
  if (!g.nodes.some((n) => n.type === "ending")) issues.push({ level: "warning", loc: "add:ending", message: "The case has no ending yet. Press “+ Ending” in the Structure panel." });
  for (const it of g.settings.items || []) {
    const given = g.nodes.some((n) => (n.options || []).some((o) => (o.effects || []).some((e) => e.var === itemVar(it.id) && !isFalsy(e.value))));
    if (!given) issues.push({ level: "warning", loc: "settings:items", where: "Inventory items", message: `“${it.name || it.id}” is never given by any choice, so nobody can carry it.` });
  }
  return issues;
}

/** Nodes that existed before an edit but are now gone — may strand readers. */
export function removedNodeIds(before: InteractiveGraph | null, after: InteractiveGraph): string[] {
  if (!before) return [];
  const now = new Set(after.nodes.map((n) => n.id));
  return before.nodes.map((n) => n.id).filter((id) => !now.has(id));
}
