import { useEffect, useState } from "react";
import { slugify } from "@/lib/slug";

// Series and collections: ordered groups of related case files.

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export interface SeriesEntry { chapter_id: string; position: number }

export interface Series {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  sort_order: number;
  entries: SeriesEntry[];
}

let cache: Promise<Series[]> | null = null;
const listeners = new Set<(list: Series[]) => void>();

/** All series with their files in order. Shared between components and cached. */
export function fetchSeries(force = false): Promise<Series[]> {
  if (!cache || force) {
    const select = "id,slug,title,description,cover_image_url,sort_order,series_entries(chapter_id,position)";
    cache = fetch(`${SUPA_URL}/rest/v1/series?select=${encodeURIComponent(select)}&order=sort_order.asc,title.asc`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: any[]) => (rows || []).map((s) => ({
        ...s,
        entries: [...(s.series_entries || [])].sort((a: SeriesEntry, b: SeriesEntry) => a.position - b.position),
      })))
      .catch(() => []);
    if (force) cache.then((list) => listeners.forEach((fn) => fn(list)));
  }
  return cache;
}

export function useSeries(): Series[] | null {
  const [list, setList] = useState<Series[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const fn = (l: Series[]) => { if (!cancelled) setList(l); };
    listeners.add(fn);
    fetchSeries().then(fn);
    return () => { cancelled = true; listeners.delete(fn); };
  }, []);
  return list;
}

/** A slug that no other series uses yet. */
export function uniqueSeriesSlug(title: string, taken: string[]): string {
  const base = slugify(title) || "series";
  let slug = base;
  for (let i = 2; taken.includes(slug); i++) slug = `${base}-${i}`;
  return slug;
}

// ── Admin writes (row-level security lets only admins through) ──

async function write(path: string, method: string, token: string | undefined, body?: unknown) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token || ANON}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation,resolution=merge-duplicates" : "return=minimal",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || "request_failed");
  return data;
}

export const seriesAdmin = {
  create: async (token: string | undefined, s: { slug: string; title: string; description?: string | null }) =>
    (await write("series", "POST", token, s))?.[0] as Series | undefined,
  update: (token: string | undefined, id: string, patch: Partial<Pick<Series, "title" | "description" | "sort_order" | "cover_image_url">>) =>
    write(`series?id=eq.${id}`, "PATCH", token, patch),
  remove: (token: string | undefined, id: string) => write(`series?id=eq.${id}`, "DELETE", token),
  setEntry: (token: string | undefined, seriesId: string, chapterId: string, position: number) =>
    write("series_entries?on_conflict=series_id,chapter_id", "POST", token, { series_id: seriesId, chapter_id: chapterId, position }),
  removeEntry: (token: string | undefined, seriesId: string, chapterId: string) =>
    write(`series_entries?series_id=eq.${seriesId}&chapter_id=eq.${chapterId}`, "DELETE", token),
};
