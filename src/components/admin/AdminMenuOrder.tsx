import React, { useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";

// The admin sidebar, with drag and drop: drag a menu heading to move the whole menu,
// or drag a page to move it within its menu or into another one. The order is saved
// as soon as you drop (in the database, and in this browser so it shows straight away).
// On touch screens, drag by the grip handle.

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

export function toMenuOrder(groups: Group<{ id: string }>[]): MenuOrder {
  return { groups: groups.map((g) => g.label), items: Object.fromEntries(groups.map((g) => [g.label, g.items.map((i) => i.id)])) };
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
  const warned = useRef(false);

  useEffect(() => {
    let cancelled = false;
    rpc("admin_get_setting", { _key: "menu_order" }, authToken)
      .then((value) => {
        if (cancelled || !value || !Array.isArray(value.groups)) return;
        setOrder(value);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* storage blocked */ }
      })
      .catch(() => { /* not migrated yet: this browser's order still works */ });
    return () => { cancelled = true; };
  }, [authToken]);

  const save = async (next: MenuOrder | null) => {
    setOrder(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); else localStorage.removeItem(STORAGE_KEY);
    } catch { /* storage blocked */ }
    try {
      await rpc("admin_set_setting", { _key: "menu_order", _value: next }, authToken);
      if (!next) toast.success("Menu order reset");
    } catch {
      if (!warned.current) {
        warned.current = true;
        toast.message("Menu order saved in this browser only. Apply the latest database migration to keep it everywhere.");
      }
    }
  };

  return { order, save };
}

// ── Sidebar with drag and drop ──────────────────────────────────────────────────

export interface NavItem { id: string; label: string; icon: React.ComponentType<{ className?: string }> }
export interface NavGroup { label: string; items: NavItem[] }

type DragKind = "group" | "item";
interface Drag { kind: DragKind; id: string }
interface Target { group: number; index: number }

/** The menus with the dragged menu or page moved to the drop position. */
function moved(groups: NavGroup[], drag: Drag, target: Target): NavGroup[] {
  if (drag.kind === "group") {
    const from = groups.findIndex((g) => g.label === drag.id);
    if (from < 0) return groups;
    const rest = groups.filter((_, i) => i !== from);
    rest.splice(Math.min(target.group, rest.length), 0, groups[from]);
    return rest;
  }
  let item: NavItem | undefined;
  const without = groups.map((g) => ({ ...g, items: g.items.filter((i) => (i.id === drag.id ? ((item = i), false) : true)) }));
  if (!item) return groups;
  const dest = without[target.group];
  if (!dest) return groups;
  dest.items.splice(Math.min(target.index, dest.items.length), 0, item);
  return without;
}

const sameOrder = (a: NavGroup[], b: NavGroup[]) => JSON.stringify(toMenuOrder(a)) === JSON.stringify(toMenuOrder(b));

export const AdminSidebarNav: React.FC<{
  groups: NavGroup[];
  activeTab: string;
  compact: boolean;
  onPick: (id: string) => void;
  onReorder: (groups: NavGroup[]) => void;
  canReset: boolean;
  onReset: () => void;
}> = ({ groups, activeTab, compact, onPick, onReorder, canReset, onReset }) => {
  const navRef = useRef<HTMLElement | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const press = useRef<{ kind: DragKind; id: string; x: number; y: number; active: boolean } | null>(null);
  const targetRef = useRef<Target | null>(null);
  const suppressClick = useRef(false);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  // Where the pointer would drop: measured against what is on screen, leaving out the dragged element.
  const measure = (kind: DragKind, id: string, y: number): Target | null => {
    const nav = navRef.current;
    if (!nav) return null;
    const groupEls = [...nav.querySelectorAll<HTMLElement>("[data-nav-group]")];
    if (kind === "group") {
      const others = groupEls.filter((el) => el.dataset.navGroup !== id);
      const index = others.filter((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2 < y; }).length;
      return { group: index, index: 0 };
    }
    let best = 0;
    let bestDist = Infinity;
    groupEls.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const dist = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    const label = groupEls[best]?.dataset.navGroup;
    const gi = groupsRef.current.findIndex((g) => g.label === label);
    const items = [...(groupEls[best]?.querySelectorAll<HTMLElement>("[data-nav-item]") || [])].filter((el) => el.dataset.navItem !== id);
    const index = items.filter((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2 < y; }).length;
    return gi < 0 ? null : { group: gi, index };
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      if (!p.active) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
        p.active = true;
        setDrag({ kind: p.kind, id: p.id });
        document.body.style.userSelect = "none";
      }
      e.preventDefault();
      const t = measure(p.kind, p.id, e.clientY);
      if (t) { targetRef.current = t; setTarget(t); }
    };
    const end = () => {
      const p = press.current;
      press.current = null;
      document.body.style.userSelect = "";
      if (p?.active) {
        suppressClick.current = true;
        window.setTimeout(() => { suppressClick.current = false; }, 0);
        const t = targetRef.current;
        if (t) {
          const next = moved(groupsRef.current, { kind: p.kind, id: p.id }, t);
          if (!sameOrder(next, groupsRef.current)) onReorderRef.current(next);
        }
      }
      targetRef.current = null;
      setDrag(null);
      setTarget(null);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mouse: drag the whole row. Touch: drag by the grip, so the list still scrolls.
  const start = (kind: DragKind, id: string, fromGrip: boolean) => (e: React.PointerEvent) => {
    if (compact || e.button !== 0) return;
    if (e.pointerType !== "mouse" && !fromGrip) return;
    if (fromGrip) e.preventDefault();
    press.current = { kind, id, x: e.clientX, y: e.clientY, active: false };
  };

  const shown = drag && target ? moved(groups, drag, target) : groups;
  const grip = "shrink-0 p-1 -m-1 text-muted-foreground/50 hover:text-foreground cursor-grab touch-none opacity-0 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100";

  return (
    <nav ref={navRef} className="space-y-6">
      {shown.map((group) => {
        const draggingGroup = drag?.kind === "group" && drag.id === group.label;
        return (
          <div key={group.label} data-nav-group={group.label}
            className={`rounded-lg transition-colors ${draggingGroup ? "bg-primary/10 ring-1 ring-primary/40" : ""}`}>
            {!compact && (
              <div onPointerDown={start("group", group.label, false)}
                className={`group/row px-3 mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 font-medium select-none ${drag ? "cursor-grabbing" : "cursor-grab"}`}
                title="Drag to move this menu">
                <span className="flex-1">{group.label}</span>
                <span onPointerDown={start("group", group.label, true)} className={grip} aria-hidden="true"><GripVertical className="w-3.5 h-3.5" /></span>
              </div>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = activeTab === item.id;
                const isDragged = drag?.kind === "item" && drag.id === item.id;
                const Icon = item.icon;
                return (
                  <div key={item.id} data-nav-item={item.id} className="group/row relative">
                    <button
                      type="button"
                      onPointerDown={start("item", item.id, false)}
                      onClick={() => { if (!suppressClick.current) onPick(item.id); }}
                      title={compact ? item.label : undefined}
                      className={`w-full flex items-center gap-3 ${compact ? "justify-center px-0" : "pl-3 pr-8"} py-2.5 rounded-lg text-left text-sm transition-colors select-none ${
                        isDragged
                          ? "bg-primary/20 text-primary border border-primary shadow-lg"
                          : isActive
                            ? "bg-primary/15 text-primary border border-primary/30"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-transparent"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {!compact && <span className="truncate">{item.label}</span>}
                    </button>
                    {!compact && (
                      <span onPointerDown={start("item", item.id, true)} className={`${grip} absolute right-3 top-1/2 -translate-y-1/2`} title="Drag to move" aria-hidden="true">
                        <GripVertical className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {!compact && canReset && !drag && (
        <button type="button" onClick={() => { if (window.confirm("Go back to the original menu order?")) onReset(); }}
          className="px-3 text-[10px] text-muted-foreground/60 hover:text-foreground">
          Reset menu order
        </button>
      )}
    </nav>
  );
};
