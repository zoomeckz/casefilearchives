import { useCallback, useEffect, useRef, useState } from "react";
import { NodeCanvas } from "@/components/interactive/NodeCanvas";
import { normalizeGraph, type InteractiveGraph } from "@/lib/interactive";
import { ensurePositions } from "@/lib/nodeGraph";
import { NODE_CHANNEL_PREFIX, type NodeMsg } from "@/lib/nodeChannel";

/**
 * Pop-out node editor: /node-editor?ch=<channel>.
 * Opened from the Interactive Case editor. It holds no data of its own: the
 * main window sends the case over a BroadcastChannel, every edit made here is
 * sent straight back (and saved there), and clicking a node in either window
 * selects it in the other.
 */
const MAX_HISTORY = 150;

const NodeEditorPage = () => {
  const ch = new URLSearchParams(window.location.search).get("ch") || "";
  const [graph, setGraph] = useState<InteractiveGraph | null>(null);
  const [title, setTitle] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [connected, setConnected] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const chanRef = useRef<BroadcastChannel | null>(null);
  const lastSeen = useRef(0);
  const graphRef = useRef<InteractiveGraph | null>(null);
  graphRef.current = graph;
  const undo = useRef<InteractiveGraph[]>([]);
  const redo = useRef<InteractiveGraph[]>([]);
  const lastCoalesce = useRef<{ key: string; at: number } | null>(null);
  const [, force] = useState(0);

  const send = useCallback((m: NodeMsg) => chanRef.current?.postMessage(m), []);

  // Full-screen tool: no page scrolling, no smooth-scroll library, no indexing.
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    (window as any).__lenis?.stop?.();
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { root.style.overflow = prev; document.body.style.overflow = ""; meta.remove(); };
  }, []);

  useEffect(() => { document.title = title ? `Nodes · ${title}` : "Node editor"; }, [title]);

  useEffect(() => {
    if (!ch || typeof BroadcastChannel === "undefined") return;
    const chan = new BroadcastChannel(`${NODE_CHANNEL_PREFIX}${ch}`);
    chanRef.current = chan;
    chan.onmessage = (e: MessageEvent<NodeMsg>) => {
      const m = e.data;
      if (!m || typeof m !== "object") return;
      lastSeen.current = Date.now();
      setConnected(true);
      if (m.t === "state") {
        const incoming = normalizeGraph(m.graph);
        const laid = ensurePositions(incoming);
        setGraph(laid);
        if (typeof m.title === "string") setTitle(m.title);
        if (m.selectedId) setSelectedId(m.selectedId);
        // Nodes added in the main window get a spot on the canvas; send the positions back once.
        if (laid !== incoming) chan.postMessage({ t: "update", graph: laid } satisfies NodeMsg);
      } else if (m.t === "select") {
        setSelectedId(m.id);
        setFocus((f) => ({ id: m.id, n: (f?.n || 0) + 1 }));
      } else if (m.t === "saved") {
        setSavedAt(m.at);
      } else if (m.t === "bye") {
        setConnected(false);
        lastSeen.current = 0;
      }
    };
    chan.postMessage({ t: "hello" } satisfies NodeMsg);
    const ping = window.setInterval(() => {
      chan.postMessage({ t: "ping" } satisfies NodeMsg);
      if (Date.now() - lastSeen.current > 5000) setConnected(false);
    }, 2000);
    return () => { window.clearInterval(ping); chan.close(); chanRef.current = null; };
  }, [ch]);

  const commit = useCallback((next: InteractiveGraph, coalesce?: string) => {
    const cur = graphRef.current;
    if (!cur || next === cur) return;
    const now = Date.now();
    const lc = lastCoalesce.current;
    if (!(coalesce && lc && lc.key === coalesce && now - lc.at < 1200)) {
      undo.current = [...undo.current.slice(-(MAX_HISTORY - 1)), cur];
      redo.current = [];
    }
    lastCoalesce.current = coalesce ? { key: coalesce, at: now } : null;
    graphRef.current = next;
    setGraph(next);
    send({ t: "update", graph: next });
  }, [send]);

  const doUndo = useCallback(() => {
    const cur = graphRef.current;
    const prev = undo.current.pop();
    if (!cur || !prev) return;
    redo.current.push(cur);
    lastCoalesce.current = null;
    graphRef.current = prev;
    setGraph(prev);
    send({ t: "update", graph: prev });
    force((x) => x + 1);
  }, [send]);

  const doRedo = useCallback(() => {
    const cur = graphRef.current;
    const next = redo.current.pop();
    if (!cur || !next) return;
    undo.current.push(cur);
    lastCoalesce.current = null;
    graphRef.current = next;
    setGraph(next);
    send({ t: "update", graph: next });
    force((x) => x + 1);
  }, [send]);

  const onSelect = useCallback((id: string) => {
    setSelectedId(id);
    send({ t: "select", id });
  }, [send]);

  if (!ch || typeof BroadcastChannel === "undefined") {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-foreground p-6 text-center">
        <p className="max-w-md text-muted-foreground">Open the node editor from an Interactive Case in the admin editor (“Open node editor”).{typeof BroadcastChannel === "undefined" ? " This browser is too old for the pop-out editor." : ""}</p>
      </div>
    );
  }

  const status = (
    <span className={`flex items-center gap-1.5 px-2 text-xs ${connected ? "text-muted-foreground" : "text-destructive"}`}
      title={connected ? "Every change goes straight to the main editor window, which saves it." : "The main editor window is closed or was reloaded."}>
      <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-destructive animate-pulse"}`} />
      {connected ? (savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Live") : "Not connected"}
    </span>
  );

  return (
    <div className="fixed inset-0 bg-background">
      {graph ? (
        <NodeCanvas
          graph={graph}
          onChange={commit}
          selectedId={selectedId}
          onSelect={onSelect}
          focus={focus}
          onUndo={doUndo}
          onRedo={doRedo}
          canUndo={undo.current.length > 0}
          canRedo={redo.current.length > 0}
          status={status}
          title={title}
        />
      ) : (
        <div className="h-full grid place-items-center text-muted-foreground text-sm">Connecting to the editor…</div>
      )}
      {graph && !connected && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-background/70 backdrop-blur-sm">
          <div className="max-w-sm bg-card border border-border rounded-lg p-5 text-sm space-y-3 text-center shadow-2xl">
            <p className="font-medium">Lost the main editor</p>
            <p className="text-muted-foreground">Changes are saved through the story editor window. Keep it open on this case, or press “Open node editor” there again.</p>
            <button type="button" className="px-3 py-1.5 border border-border rounded hover:border-primary hover:text-primary" onClick={() => send({ t: "hello" })}>Try again</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NodeEditorPage;
