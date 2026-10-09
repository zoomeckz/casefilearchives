import React, { useEffect, useState } from "react";
import { cfApi, ROMAN } from "@/lib/commendations";

// Titles and clearance levels next to reader names, fetched in batches so a
// page of comments makes one request instead of one per comment.

type Entry = { title: string | null; clearance: number } | null;

const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const ids = [...pending];
  pending.clear();
  if (!ids.length) return;
  cfApi.titles(ids)
    .then((rows) => {
      const found = new Map((rows || []).map((r) => [r.user_id, { title: r.title, clearance: r.clearance }]));
      for (const id of ids) cache.set(id, found.get(id) ?? null);
    })
    .catch(() => { for (const id of ids) cache.set(id, null); })
    .finally(() => { for (const id of ids) listeners.get(id)?.forEach((fn) => fn()); });
}

function request(id: string) {
  if (cache.has(id) || pending.has(id)) return;
  pending.add(id);
  if (!timer) timer = setTimeout(flush, 40);
}

export function useReaderTitle(userId: string | null | undefined): Entry {
  const [, force] = useState(0);
  useEffect(() => {
    if (!userId) return;
    const fn = () => force((n) => n + 1);
    if (!listeners.has(userId)) listeners.set(userId, new Set());
    listeners.get(userId)!.add(fn);
    request(userId);
    return () => { listeners.get(userId)?.delete(fn); };
  }, [userId]);
  return userId ? cache.get(userId) ?? null : null;
}

/** Small mono tag: "INFORMANT · CL-III". Renders nothing for readers without commendations. */
export const ReaderTitle: React.FC<{ userId: string | null | undefined; className?: string }> = ({ userId, className = "" }) => {
  const entry = useReaderTitle(userId);
  if (!entry || (!entry.title && entry.clearance <= 1)) return null;
  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className}`}>
      {entry.title && (
        <span className="case-label !text-primary text-[8px] border border-primary/50 px-1 py-px">{entry.title}</span>
      )}
      {entry.clearance > 1 && (
        <span className="case-label text-[8px] border border-border px-1 py-px" title={`Clearance level ${ROMAN[entry.clearance]}`}>
          CL-{ROMAN[entry.clearance]}
        </span>
      )}
    </span>
  );
};

export default ReaderTitle;
