import { useEffect, useState } from "react";
import { slugify } from "@/lib/slug";

// Dispatches: stories told in chapters. A dispatch is the serial; its chapters are
// stories with storyFormat "dispatch", dispatchId and dispatchPart (1, 2, 3…).

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export type DispatchStatus = "ongoing" | "complete" | "hiatus";

export interface Dispatch {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  status: DispatchStatus;
  sort_order: number;
}

export const DISPATCH_STATUS_LABEL: Record<DispatchStatus, string> = {
  ongoing: "Ongoing",
  complete: "Complete",
  hiatus: "On hiatus",
};

let cache: Promise<Dispatch[]> | null = null;
const listeners = new Set<(list: Dispatch[]) => void>();

/** All dispatches, shared between components and cached. */
export function fetchDispatches(force = false): Promise<Dispatch[]> {
  if (!cache || force) {
    cache = fetch(`${SUPA_URL}/rest/v1/dispatches?select=id,slug,title,description,cover_image_url,status,sort_order&order=sort_order.asc,title.asc`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => (Array.isArray(rows) ? rows : []))
      .catch(() => []);
    if (force) cache.then((list) => listeners.forEach((fn) => fn(list)));
  }
  return cache;
}

export function useDispatches(): Dispatch[] | null {
  const [list, setList] = useState<Dispatch[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const fn = (l: Dispatch[]) => { if (!cancelled) setList(l); };
    listeners.add(fn);
    fetchDispatches().then(fn);
    return () => { cancelled = true; listeners.delete(fn); };
  }, []);
  return list;
}

/** A slug that no other dispatch uses yet. */
export function uniqueDispatchSlug(title: string, taken: string[]): string {
  const base = slugify(title) || "dispatch";
  let slug = base;
  for (let i = 2; taken.includes(slug); i++) slug = `${base}-${i}`;
  return slug;
}

function token(): string {
  try { return JSON.parse(localStorage.getItem("app-auth-session") || "null")?.access_token || ANON; } catch { return ANON; }
}

async function write(path: string, method: string, body?: unknown) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : "return=minimal",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || "request_failed");
  return data;
}

// Row-level security lets only admins write.
export const dispatchAdmin = {
  create: async (d: Pick<Dispatch, "slug" | "title"> & Partial<Dispatch>) => (await write("dispatches", "POST", d))?.[0] as Dispatch | undefined,
  update: (id: string, patch: Partial<Omit<Dispatch, "id">>) => write(`dispatches?id=eq.${id}`, "PATCH", { ...patch, updated_at: new Date().toISOString() }),
  remove: (id: string) => write(`dispatches?id=eq.${id}`, "DELETE"),
};
