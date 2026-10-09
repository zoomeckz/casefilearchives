// Reading analytics for Interactive Case Files. Every reader (guests included)
// sends small events: which decision they saw, how long they took (only time
// the tab was actually visible counts as thinking time), what they picked,
// when they left the page and when they came back. Admin panel → Case analytics
// turns these into statistics. Nothing here is shown to other readers.

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export type IcEventKind =
  | "open" | "view" | "confirm_open" | "confirm_cancel" | "choose" | "timeout"
  | "hidden" | "visible" | "close" | "ending" | "answer" | "replay";

export interface IcEventRow {
  id?: string;
  case_key: string;
  user_id: string | null;
  device_id: string;
  session_id: string;
  attempt: number | null;
  kind: IcEventKind;
  node_id: string | null;
  option_id: string | null;
  ms: number | null;
  meta: Record<string, unknown>;
  client_ts: string;
  created_at?: string;
}

function deviceId(): string {
  try {
    let id = localStorage.getItem("ic-device");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("ic-device", id); }
    return id;
  } catch { return "no-storage"; }
}

function authToken(): string | null {
  try { return JSON.parse(localStorage.getItem("app-auth-session") || "null")?.access_token || null; } catch { return null; }
}

export interface Tracker {
  /** A decision panel appeared. */
  view(nodeId: string): void;
  confirmOpen(nodeId: string, optionId: string): void;
  confirmCancel(nodeId: string, optionId: string): void;
  choose(nodeId: string, optionId: string, extra?: { timedOut?: boolean; filedOptionId?: string }): void;
  ending(nodeId: string): void;
  answer(length: number, questions: number): void;
  replay(): void;
  setAttempt(n: number | null | undefined): void;
  dispose(): void;
}

/** Starts a reading session. `caseKey` is the chapter id, or "test:<id>" for tester links. */
export function startTracking(opts: { caseKey: string; userId?: string | null; attempt?: number | null; currentNode?: string | null; resumed: boolean }): Tracker {
  const sessionId = crypto.randomUUID();
  const device = deviceId();
  let attempt = opts.attempt ?? null;
  let queue: IcEventRow[] = [];
  let timer: number | null = null;

  // Clock for the decision on screen: visible time only.
  let viewNode: string | null = opts.currentNode ?? null;
  let viewStarted = Date.now();
  let activeMs = 0;
  let visibleSince: number | null = document.visibilityState === "visible" ? Date.now() : null;
  let hiddenAt: number | null = null;
  const active = () => activeMs + (visibleSince ? Date.now() - visibleSince : 0);

  const flush = () => {
    if (!queue.length || !SUPA_URL) return;
    const batch = queue;
    queue = [];
    const token = authToken();
    try {
      void fetch(`${SUPA_URL}/rest/v1/interactive_events`, {
        method: "POST",
        keepalive: true,
        headers: { apikey: ANON, Authorization: `Bearer ${token || ANON}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(batch.map((e) => ({ ...e, user_id: token ? e.user_id : null }))),
      }).catch(() => { /* analytics must never break reading */ });
    } catch { /* ignore */ }
  };
  const push = (kind: IcEventKind, fields: Partial<IcEventRow> = {}) => {
    queue.push({
      case_key: opts.caseKey, user_id: opts.userId ?? null, device_id: device, session_id: sessionId, attempt,
      kind, node_id: null, option_id: null, ms: null, meta: {}, client_ts: new Date().toISOString(), ...fields,
    });
    if (queue.length >= 12) flush();
    else if (timer == null) timer = window.setTimeout(() => { timer = null; flush(); }, 4000);
  };

  push("open", { node_id: opts.currentNode ?? null, meta: { resumed: opts.resumed, path: location.pathname } });

  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      if (visibleSince) { activeMs += Date.now() - visibleSince; visibleSince = null; }
      hiddenAt = Date.now();
      push("hidden", { node_id: viewNode, ms: viewNode ? active() : null });
      flush();
    } else {
      const away = hiddenAt ? Date.now() - hiddenAt : null;
      hiddenAt = null;
      visibleSince = Date.now();
      push("visible", { node_id: viewNode, ms: away });
    }
  };
  const onPageHide = () => { push("close", { node_id: viewNode, ms: viewNode ? active() : null }); flush(); };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);

  const resetClock = (nodeId: string | null) => {
    viewNode = nodeId;
    viewStarted = Date.now();
    activeMs = 0;
    visibleSince = document.visibilityState === "visible" ? Date.now() : null;
  };

  return {
    view(nodeId) {
      if (viewNode === nodeId && Date.now() - viewStarted < 1500) return;
      resetClock(nodeId);
      push("view", { node_id: nodeId });
    },
    confirmOpen(nodeId, optionId) { push("confirm_open", { node_id: nodeId, option_id: optionId, ms: active() }); },
    confirmCancel(nodeId, optionId) { push("confirm_cancel", { node_id: nodeId, option_id: optionId, ms: active() }); },
    choose(nodeId, optionId, extra = {}) {
      push(extra.timedOut ? "timeout" : "choose", {
        node_id: nodeId, option_id: extra.filedOptionId || optionId, ms: active(),
        meta: { total_ms: Date.now() - viewStarted, picked: optionId, ...(extra.filedOptionId && extra.filedOptionId !== optionId ? { server_override: true } : {}) },
      });
      resetClock(null);
    },
    ending(nodeId) { push("ending", { node_id: nodeId }); flush(); },
    answer(length, questions) { push("answer", { meta: { length, questions } }); flush(); },
    replay() { push("replay"); },
    setAttempt(n) { attempt = n ?? null; },
    dispose() {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      if (timer != null) window.clearTimeout(timer);
      flush();
    },
  };
}
