import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

/** Open/closed state for an editor box, remembered in this browser. */
export function usePanelOpen(key: string | undefined, initial = true): [boolean, () => void] {
  const [open, setOpen] = useState<boolean>(() => {
    if (!key) return initial;
    try { const v = localStorage.getItem(key); return v == null ? initial : v === "1"; } catch { return initial; }
  });
  const toggle = () => setOpen((o) => {
    if (key) { try { localStorage.setItem(key, o ? "0" : "1"); } catch { /* ignore */ } }
    return !o;
  });
  return [open, toggle];
}

const DURATION = 200;

/**
 * Smoothly opens and closes its content (height and fade, ~0.2s).
 * Content stays clipped while animating, then becomes overflow-visible once
 * fully open so dropdowns and popovers inside are not cut off.
 */
export const Collapse: React.FC<{ open: boolean; children: React.ReactNode; className?: string }> = ({ open, children, className = "" }) => {
  const [settled, setSettled] = useState(open);
  useEffect(() => {
    if (!open) { setSettled(false); return; }
    const t = window.setTimeout(() => setSettled(true), DURATION + 20);
    return () => window.clearTimeout(t);
  }, [open]);
  const inertProps = open ? {} : ({ inert: "" } as Record<string, string>);
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      aria-hidden={!open}
      {...inertProps}
    >
      <div className={`min-h-0 min-w-0 ${open && settled ? "overflow-visible" : "overflow-hidden"} ${className}`}>{children}</div>
    </div>
  );
};

/**
 * True once a box has finished collapsing (false again the moment it opens).
 * Use it to switch layout (e.g. let collapsed boxes share a row) only after the
 * close animation, so the box doesn't jump sideways mid-animation.
 */
export function useCollapsedSettled(open: boolean): boolean {
  const [settled, setSettled] = useState(!open);
  useEffect(() => {
    if (open) { setSettled(false); return; }
    const t = window.setTimeout(() => setSettled(true), DURATION);
    return () => window.clearTimeout(t);
  }, [open]);
  return !open && settled;
}

/** Chevron toggle button used in box headers. */
export const CollapseButton: React.FC<{ open: boolean; onToggle: () => void; label: string; className?: string }> = ({ open, onToggle, label, className = "" }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-expanded={open}
    title={`${open ? "Collapse" : "Expand"} ${label}`}
    aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
    className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary ${className}`}
  >
    <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ease-out ${open ? "" : "-rotate-90"}`} />
  </button>
);

type PanelProps = {
  title: React.ReactNode;
  /** Shown next to the title while collapsed (e.g. "3 tags"). */
  summary?: React.ReactNode;
  /** Extra controls on the right of the header, always visible. */
  actions?: React.ReactNode;
  /** Remember the open state under this localStorage key. */
  storageKey?: string;
  defaultOpen?: boolean;
  /** Controlled mode. */
  open?: boolean;
  onToggle?: () => void;
  className?: string;
  children: React.ReactNode;
};

/** A bordered editor box with a header that collapses its body. */
export const CollapsiblePanel: React.FC<PanelProps> = ({
  title, summary, actions, storageKey, defaultOpen = true, open: openProp, onToggle, className = "", children,
}) => {
  const [ownOpen, ownToggle] = usePanelOpen(storageKey, defaultOpen);
  const open = openProp ?? ownOpen;
  const toggle = onToggle ?? ownToggle;
  const label = typeof title === "string" ? title.toLowerCase() : "section";
  return (
    <div className={`p-4 rounded-lg border border-border/60 bg-card/30 ${className}`}>
      <div className="flex flex-wrap items-center gap-2 min-h-6">
        <CollapseButton open={open} onToggle={toggle} label={label} />
        <button type="button" onClick={toggle} className="text-sm text-muted-foreground hover:text-foreground transition-colors text-left">
          {title}
        </button>
        {!open && summary != null && summary !== "" && (
          <span className="text-xs text-muted-foreground/80 truncate min-w-0">· {summary}</span>
        )}
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <Collapse open={open}>
        <div className="pt-3">{children}</div>
      </Collapse>
    </div>
  );
};
