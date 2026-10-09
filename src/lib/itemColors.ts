import type { ItemColor } from "@/lib/interactive";

/** Tailwind classes for each inventory item colour (full strings so Tailwind keeps them). */
export const ITEM_STYLE: Record<ItemColor, { label: string; border: string; hover: string; text: string; bg: string; dot: string }> = {
  blue: { label: "Blue", border: "border-sky-500/70", hover: "hover:border-sky-400 focus-visible:border-sky-400", text: "text-sky-400", bg: "bg-sky-500/10", dot: "bg-sky-500" },
  green: { label: "Green", border: "border-emerald-500/70", hover: "hover:border-emerald-400 focus-visible:border-emerald-400", text: "text-emerald-400", bg: "bg-emerald-500/10", dot: "bg-emerald-500" },
  amber: { label: "Amber", border: "border-amber-500/70", hover: "hover:border-amber-400 focus-visible:border-amber-400", text: "text-amber-400", bg: "bg-amber-500/10", dot: "bg-amber-500" },
  violet: { label: "Violet", border: "border-violet-500/70", hover: "hover:border-violet-400 focus-visible:border-violet-400", text: "text-violet-400", bg: "bg-violet-500/10", dot: "bg-violet-500" },
  cyan: { label: "Cyan", border: "border-cyan-500/70", hover: "hover:border-cyan-400 focus-visible:border-cyan-400", text: "text-cyan-400", bg: "bg-cyan-500/10", dot: "bg-cyan-500" },
  pink: { label: "Pink", border: "border-pink-500/70", hover: "hover:border-pink-400 focus-visible:border-pink-400", text: "text-pink-400", bg: "bg-pink-500/10", dot: "bg-pink-500" },
};

export const itemStyle = (c: ItemColor | undefined) => ITEM_STYLE[c && ITEM_STYLE[c] ? c : "blue"];
