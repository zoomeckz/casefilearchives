import React, { useEffect, useState } from "react";
import { toast } from "sonner";

// The admin sidebar's order: which menus come first and which pages sit in each.
// Saved in the database (and in this browser, so it shows straight away).

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const STORAGE_KEY = "admin-menu-order";

/** Menus by name, and for each menu the page ids in order. */
export interface MenuOrder { groups: string[]; items: Record<string, string[]> }

interface Group<I> { label: string; items: I[] }

/** The menus in the saved order. Pages that are new since the order was saved keep their place. */
export function applyMenuOrder<I extends { id: string }>(groups: Group<I>[], order: MenuOrder | null): Group<I>[] {
  if (!order) return groups;
  const byId = new Map<string, I>();
  groups.forEach((g) => g.items.forEach((i) => byId.set(i.id, i)));
  const placed = new Set<string>();
  const labels = [...groups.map((g) => g.label)].sort((a, b) => {
    const ia = order.groups.indexOf(a), ib = order.groups.indexOf(b);
    return (ia < 0 ? 1000 + groups.findIndex((g) => g.label === a) : ia) - (ib < 0 ? 1000 + groups.findIndex((g) => g.label === b) : ib);
  });
  const result = labels.map((label) => {
    const items = (order.items[label] || []).filter((id) => byId.has(id) && !placed.has(id)).map((id) => { placed.add(id); return byId.get(id)!; });
    return { ...groups.find((g) => g.label === label)!, items };
  });
  // Anything not in the saved order stays in its original menu.
  groups.forEach((g) => g.items.forEach((i) => {
    if (placed.has(i.id)) return;
    result.find((r) => r.label === g.label)!.items.push(i);
  }));
  return result.filter((g) => g.items.length > 0);
}

function readLocal(): MenuOrder | null {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
}

function tokenOf(fallback?: string) {
  try {
    const s = JSON.parse(localStorage.getItem("app-auth-session") || "null");
    if (s?.access_token) return s.access_token as string;
  } catch { /* ignore */ }
  return fallback || ANON;
}

async function rpc(fn: string, body: unknown, token?: string) {
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${tokenOf(token)}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || "request_failed");
  return data;
}

export function useAdminMenuOrder(authToken?: string) {
  const [order, setOrder] = useState<MenuOrder | null>(readLocal);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    rpc("admin_get_setting", { _key: "menu_order" }, authToken)
      .then((value) => {
        if (cancelled) return;
        if (value && Array.isArray(value.groups)) {
          setOrder(value);
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* storage blocked */ }
        }
      })
      .catch(() => { /* not migrated yet: this browser's order still works */ })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [authToken]);

  const save = async (next: MenuOrder | null) => {
    setOrder(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); else localStorage.removeItem(STORAGE_KEY);
    } catch { /* storage blocked */ }
    try {
      await rpc("admin_set_setting", { _key: "menu_order", _value: next }, authToken);
      toast.success(next ? "Menu order saved" : "Menu order reset");
    } catch {
      toast.message("Menu order saved in this browser. Apply the latest database migration to keep it everywhere.");
    }
  };

  return { order, loaded, save };
}

type Item = { id: string; label: string };

/** "Arrange menu": move menus and pages up and down, or a page to another menu. */
export const MenuArranger: React.FC<{
  groups: Group<Item>[];
  onSave: (order: MenuOrder | null) => Promise<void>;
}> = ({ groups, onSave }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Group<Item>[]>(groups);
  useEffect(() => { if (open) setDraft(groups.map((g) => ({ ...g, items: [...g.items] }))); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const moveGroup = (i: number, dir: -1 | 1) => setDraft((d) => {
    const j = i + dir;
    if (j < 0 || j >= d.length) return d;
    const next = [...d];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const moveItem = (gi: number, ii: number, dir: -1 | 1) => setDraft((d) => {
    const next = d.map((g) => ({ ...g, items: [...g.items] }));
    const items = next[gi].items;
    const j = ii + dir;
    if (j < 0 || j >= items.length) return d;
    [items[ii], items[j]] = [items[j], items[ii]];
    return next;
  });
  const moveTo = (gi: number, ii: number, target: string) => setDraft((d) => {
    const next = d.map((g) => ({ ...g, items: [...g.items] }));
    const [item] = next[gi].items.splice(ii, 1);
    next.find((g) => g.label === target)!.items.push(item);
    return next;
  });

  const save = async () => {
    await onSave({ groups: draft.map((g) => g.label), items: Object.fromEntries(draft.map((g) => [g.label, g.items.map((i) => i.id)])) });
    setOpen(false);
  };

  const arrow = "w-7 h-7 flex items-center justify-center rounded border border-border text-xs hover:border-primary disabled:opacity-30";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="w-full mt-2 px-3 py-2 rounded-lg text-left text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-dashed border-border">
        ⇅ Arrange menu
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Arrange menu">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-card border border-border rounded-xl p-5">
            <h3 className="text-lg font-semibold text-foreground">Arrange menu</h3>
            <p className="text-xs text-muted-foreground mt-1 mb-4">Move menus and pages with the arrows. The admin panel always opens on the first page of the first menu.</p>
            <div className="space-y-4">
              {draft.map((g, gi) => (
                <div key={g.label} className="border border-border rounded-lg">
                  <div className="flex items-center gap-2 px-3 py-2 bg-secondary/40 rounded-t-lg">
                    <span className="flex-1 text-xs uppercase tracking-[0.18em] text-foreground">{g.label}</span>
                    <button type="button" className={arrow} disabled={gi === 0} onClick={() => moveGroup(gi, -1)} aria-label={`Move ${g.label} up`}>↑</button>
                    <button type="button" className={arrow} disabled={gi === draft.length - 1} onClick={() => moveGroup(gi, 1)} aria-label={`Move ${g.label} down`}>↓</button>
                  </div>
                  <ul className="divide-y divide-border">
                    {g.items.map((item, ii) => (
                      <li key={item.id} className="flex items-center gap-2 px-3 py-1.5">
                        <span className="flex-1 min-w-0 truncate text-sm text-foreground">{item.label}</span>
                        <select value={g.label} onChange={(e) => moveTo(gi, ii, e.target.value)} className="text-xs bg-background border border-border rounded px-1 py-1" aria-label={`Menu for ${item.label}`}>
                          {draft.map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}
                        </select>
                        <button type="button" className={arrow} disabled={ii === 0} onClick={() => moveItem(gi, ii, -1)} aria-label={`Move ${item.label} up`}>↑</button>
                        <button type="button" className={arrow} disabled={ii === g.items.length - 1} onClick={() => moveItem(gi, ii, 1)} aria-label={`Move ${item.label} down`}>↓</button>
                      </li>
                    ))}
                    {g.items.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">Empty (hidden from the sidebar)</li>}
                  </ul>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-5">
              <button type="button" onClick={save} className="px-4 py-2 rounded text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/85">Save order</button>
              <button type="button" onClick={async () => { if (window.confirm("Go back to the original menu order?")) { await onSave(null); setOpen(false); } }} className="px-4 py-2 rounded text-sm border border-border hover:border-primary">Reset</button>
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded text-sm text-muted-foreground">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
