import type { InteractiveGraph } from "@/lib/interactive";

/** Messages between the story editor and its pop-out node editor (same browser, BroadcastChannel). */
export const NODE_CHANNEL_PREFIX = "ic-nodes:";

export type NodeMsg =
  | { t: "hello" }                 // node window → editor: send me the case
  | { t: "ping" }                  // node window → editor: still there?
  | { t: "pong" }
  | { t: "state"; graph: InteractiveGraph; title?: string; selectedId?: string } // editor → node window
  | { t: "update"; graph: InteractiveGraph } // node window → editor: the case after an edit
  | { t: "select"; id: string }   // either way: this node was clicked
  | { t: "saved"; at: number }    // editor → node window: the case was saved
  | { t: "bye" };                  // editor closed
