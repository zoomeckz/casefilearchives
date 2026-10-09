// Commendations — the Case Files award system.
// The catalogue mirrors public.commendations (see the 20261009120000 migration);
// unlocking is decided server-side by cf_sync, never in the browser.

export type CommendationCategory = "reading" | "interactive" | "habits" | "community" | "special";

export interface Commendation {
  key: string;
  title: string;
  description: string;
  category: CommendationCategory;
  points: number;
  frame?: string;
  rewardTitle?: string;
  glyph: string; // SVG path data on a 24×24 grid
}

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

export const COMMENDATIONS: Commendation[] = [
  { key: "case_opened", title: "Case Opened", description: "Read your first file.", category: "reading", points: 10,
    glyph: "M3 7h6l2 2h10v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" },
  { key: "field_agent", title: "Field Agent", description: "Read 5 files.", category: "reading", points: 20, frame: "manila",
    glyph: `${circle(10, 10, 6)}M14.5 14.5 20 20` },
  { key: "senior_investigator", title: "Senior Investigator", description: "Read 15 files.", category: "reading", points: 30, frame: "brass",
    glyph: "M12 3l2.6 6 6.4.3-5 4.1 1.8 6.6-5.8-3.7-5.8 3.7 1.8-6.6-5-4.1 6.4-.3z" },
  { key: "archivist", title: "Archivist", description: "Read every published file.", category: "reading", points: 50, frame: "gold-seal", rewardTitle: "Archivist",
    glyph: "M5 3h14v18H5zM8 7h8M8 11h8M8 15h5" },
  { key: "first_decision", title: "First Decision", description: "File a decision in an interactive case.", category: "interactive", points: 10,
    glyph: "M12 21v-8M12 13 6 6M12 13l6-7M3 6h5M16 6h5" },
  { key: "case_closed", title: "Case Closed", description: "Reach an ending in an interactive case.", category: "interactive", points: 15,
    glyph: "M4 12.5l5 5L20 6.5" },
  { key: "every_angle", title: "Every Angle", description: "Reach every ending of one interactive case.", category: "interactive", points: 40, frame: "red-string",
    glyph: `M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z${circle(12, 12, 3)}` },
  { key: "night_shift", title: "Night Shift", description: "Finish a file between 00:00 and 04:00.", category: "habits", points: 15, rewardTitle: "Night Shift",
    glyph: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" },
  { key: "stakeout", title: "Stakeout", description: "Read on 7 days in a row.", category: "habits", points: 30, frame: "surveillance",
    glyph: `${circle(12, 12, 9)}M12 7v5l3 3` },
  { key: "statement_given", title: "Statement Given", description: "Leave your first comment.", category: "community", points: 10,
    glyph: "M4 5h16v11H9l-5 4z" },
  { key: "informant", title: "Informant", description: "Leave 10 comments.", category: "community", points: 25, rewardTitle: "Informant",
    glyph: "M3 4h12v8H7l-4 3zM9 15v1h7l4 3V8h-3" },
  { key: "theorist", title: "Theorist", description: "Post your first theory.", category: "community", points: 10,
    glyph: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" },
  { key: "lead_detective", title: "Lead Detective", description: "Post 10 theories.", category: "community", points: 35, rewardTitle: "Lead Detective",
    glyph: `M5 6l7 6 7-4M12 12l-3 7${circle(5, 6, 2)}${circle(19, 8, 2)}${circle(9, 19, 2)}` },
  { key: "evidence_locker", title: "Evidence Locker", description: "Bookmark 5 files or saved quotes.", category: "community", points: 15,
    glyph: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3" },
  { key: "founding_witness", title: "Founding Witness", description: "One of the first 100 registered readers.", category: "special", points: 30, frame: "founding", rewardTitle: "Founding Witness",
    glyph: `${circle(8, 15, 4)}M11 12l9-9M16 7l3 3` },
  { key: "recruiter", title: "Recruiter", description: "Someone registers through your referral link.", category: "special", points: 25, frame: "recruiter",
    glyph: `${circle(9, 8, 4)}M2 21c0-4 3-6 7-6s7 2 7 6M19 8v6M16 11h6` },
];

export const COMMENDATION_MAP: Record<string, Commendation> = Object.fromEntries(COMMENDATIONS.map((c) => [c.key, c]));

export const CATEGORY_ORDER: CommendationCategory[] = ["reading", "interactive", "habits", "community", "special"];
export const CATEGORY_LABELS: Record<CommendationCategory, string> = {
  reading: "Reading record",
  interactive: "Interactive cases",
  habits: "Field habits",
  community: "Testimony",
  special: "Special designation",
};

export const FRAME_LABELS: Record<string, string> = {
  manila: "Manila",
  brass: "Brass",
  "gold-seal": "Gold Seal",
  "red-string": "Red String",
  surveillance: "Surveillance",
  founding: "Founding",
  recruiter: "Recruiter",
};

// ── Clearance levels ──

export interface ClearanceLevel { level: number; name: string; min: number }
export const CLEARANCE_LEVELS: ClearanceLevel[] = [
  { level: 1, name: "Public", min: 0 },
  { level: 2, name: "Restricted", min: 40 },
  { level: 3, name: "Confidential", min: 100 },
  { level: 4, name: "Secret", min: 180 },
  { level: 5, name: "Top Secret", min: 280 },
];
export const ROMAN = ["", "I", "II", "III", "IV", "V"];

export function clearanceFor(points: number) {
  let current = CLEARANCE_LEVELS[0];
  for (const l of CLEARANCE_LEVELS) if (points >= l.min) current = l;
  const next = CLEARANCE_LEVELS.find((l) => l.min > points) || null;
  return { ...current, points, next };
}

export function pointsFor(keys: Iterable<string>) {
  let total = 0;
  for (const k of keys) total += COMMENDATION_MAP[k]?.points || 0;
  return total;
}

// ── Progress toward each commendation ──

export interface CommendationStats {
  files_read: number;
  published: number;
  published_read: number;
  decisions: number;
  endings: number;
  every_angle: boolean;
  night_shift: boolean;
  best_streak: number;
  current_streak: number;
  comments: number;
  theories: number;
  evidence: number;
  reader_number: number | null;
  recruits: number;
  reading_seconds: number;
}

export function progressFor(key: string, s: CommendationStats | null): { current: number; max: number } | null {
  if (!s) return null;
  const n = (current: number, max: number) => ({ current: Math.min(current, max), max });
  switch (key) {
    case "case_opened": return n(s.files_read, 1);
    case "field_agent": return n(s.files_read, 5);
    case "senior_investigator": return n(s.files_read, 15);
    case "archivist": return s.published > 0 ? n(s.published_read, s.published) : null;
    case "first_decision": return n(s.decisions, 1);
    case "case_closed": return n(s.endings, 1);
    case "stakeout": return n(s.best_streak, 7);
    case "statement_given": return n(s.comments, 1);
    case "informant": return n(s.comments, 10);
    case "theorist": return n(s.theories, 1);
    case "lead_detective": return n(s.theories, 10);
    case "evidence_locker": return n(s.evidence, 5);
    case "recruiter": return n(s.recruits, 1);
    default: return null; // yes/no commendations
  }
}

// ── API ──

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export function sessionToken(): string | null {
  try {
    const s = JSON.parse(localStorage.getItem("app-auth-session") || "null");
    if (!s?.access_token) return null;
    if (s.expires_at && s.expires_at < Math.floor(Date.now() / 1000) + 30) return null;
    return s.access_token;
  } catch {
    return null;
  }
}

async function call<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const token = sessionToken();
  if (init.auth && !token) throw new Error("auth_required");
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token || ANON}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || "request_failed");
  return data as T;
}

const rpc = <T,>(fn: string, body: unknown, auth = false) =>
  call<T>(`rpc/${fn}`, { method: "POST", body: JSON.stringify(body), auth });

export interface UnlockedRow { key: string; unlocked_at: string; seen?: boolean }

export interface DossierCase {
  chapter_id: string;
  title: string;
  status: string;
  updated_at: string;
  completed_at: string | null;
  endings_total: number;
  endings_reached: number;
  ending_index: number | null;
  ending_title: string | null;
}

export interface DossierLogEntry {
  type: "comment" | "thread" | "commendation" | "case_closed" | "read";
  at: string;
  chapter_id?: string;
  post_id?: string;
  title?: string;
  text?: string;
  key?: string;
  category?: string;
}

export interface Dossier {
  user_id: string;
  name: string;
  avatar_url: string | null;
  selected_frame: string | null;
  created_at: string;
  reader_number: number | null;
  title: string | null;
  points: number;
  clearance: number;
  is_owner: boolean;
  signed_in: boolean;
  visibility: Record<PrivacySection, boolean>;
  settings?: { pinned: string[]; selected_title: string | null; favorite_chapter_id: string | null };
  commendations?: UnlockedRow[];
  pinned?: string[];
  statement?: {
    bio: string | null; instagram: string | null; tiktok: string | null; website: string | null;
    favorite: { id: string; title: string; cover_image_url: string | null } | null;
  };
  record?: {
    files_read: number; decisions: number; endings: number; current_streak: number;
    best_streak: number; reading_seconds: number; comments: number; theories: number;
  };
  cases?: DossierCase[];
  log?: DossierLogEntry[];
  activity?: Record<string, number>;
  today?: string;
  evidence?: { id: string; text: string; chapter_id: string | null; title: string | null; at: string }[];
}

export type PrivacySection = "statement" | "record" | "commendations" | "cases" | "evidence" | "log" | "activity";

export const PRIVACY_LABELS: Record<PrivacySection, string> = {
  statement: "Statement & favourite file",
  record: "Case record",
  commendations: "Commendations",
  cases: "Interactive history",
  evidence: "Evidence board",
  log: "Field log",
  activity: "Activity map",
};

export interface ProfileSettingsPatch {
  pinned?: string[];
  selected_title?: string | null;
  favorite_chapter_id?: string | null;
  show_statement?: boolean;
  show_record?: boolean;
  show_commendations?: boolean;
  show_cases?: boolean;
  show_evidence?: boolean;
  show_log?: boolean;
  show_activity?: boolean;
}

export const cfApi = {
  sync: (tz?: string) =>
    rpc<{ stats: CommendationStats; unlocked: UnlockedRow[] }>("cf_sync", { _tz: tz ?? null }, true),
  markSeen: (keys: string[]) => rpc<void>("cf_mark_seen", { _keys: keys }, true),
  redeemReferral: (code: string) => rpc<boolean>("cf_redeem_referral", { _code: code }, true),
  dossier: (userId: string) => rpc<Dossier | null>("cf_dossier", { _user_id: userId }),
  titles: (ids: string[]) =>
    rpc<{ user_id: string; title: string | null; clearance: number }[]>("cf_reader_titles", { _user_ids: ids }),
  saveSettings: (userId: string, patch: ProfileSettingsPatch) =>
    call<unknown>("profile_settings?on_conflict=user_id", {
      method: "POST",
      auth: true,
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: userId, ...patch }),
    }),
  setFrame: (userId: string, frame: string | null) =>
    call<unknown>(`profiles?user_id=eq.${userId}`, {
      method: "PATCH",
      auth: true,
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ selected_frame: frame }),
    }),
};

/** Tell the commendations system something happened (a file read, a decision, a comment). */
export function notifyActivity() {
  try { window.dispatchEvent(new Event("cf:activity")); } catch { /* ignore */ }
}

export function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
