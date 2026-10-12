import { useCallback, useEffect, useRef, useState } from "react";
import { NodeCanvas } from "@/components/interactive/NodeCanvas";
import { StoryMapCanvas } from "@/components/interactive/StoryMapCanvas";
import { normalizeGraph, type InteractiveGraph } from "@/lib/interactive";
import { ensurePositions } from "@/lib/nodeGraph";
import { NODE_CHANNEL_PREFIX, type NodeMsg } from "@/lib/nodeChannel";

/**
 * Pop-out editor: /node-editor?ch=<channel>[&view=map].
 * Opened from the Interactive Case editor, as the node editor or the Story map
 * (two views of the same case; switch at the top left). It holds no data of its
 * own: the main window sends the case over a BroadcastChannel, every edit made
 * here is sent straight back (and saved there) and to any other open pop-out,
 * and clicking a node in any window selects it in the others.
 */
const MAX_HISTORY = 150;
type View = "nodes" | "map";

const NodeEditorPage = () => {
  const params = new URLSearchParams(window.location.search);
  const ch = params.get("ch") || "";
  const [view, setView] = useState<View>(params.get("view") === "map" ? "map" : "nodes");
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

  useEffect(() => {
    const name = view === "map" ? "Story map" : "Nodes";
    document.title = title ? `${name} · ${title}` : view === "map" ? "Story map" : "Node editor";
  }, [title, view]);

  const switchView = (v: View) => {
    setView(v);
    const url = new URL(window.location.href);
    if (v === "map") url.searchParams.set("view", "map"); else url.searchParams.delete("view");
    window.history.replaceState(null, "", url.toString());
    if (selectedId) setFocus((f) => ({ id: selectedId, n: (f?.n || 0) + 1 }));
  };

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
      } else if (m.t === "update" && m.graph && Array.isArray(m.graph.nodes)) {
        // An edit made in another pop-out (the Story map and the node editor can both be open).
        setGraph(ensurePositions(normalizeGraph(m.graph)));
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

  const commit = useCallback((edited: InteractiveGraph, coalesce?: string) => {
    const cur = graphRef.current;
    if (!cur || edited === cur) return;
    // Sections added on the Story map get a spot in the node view too.
    const next = ensurePositions(edited);
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

  const switcher = (
    <div className="flex rounded border border-border overflow-hidden text-xs" role="tablist" aria-label="View">
      {([["map", "Story map"], ["nodes", "Nodes"]] as [View, string][]).map(([v, label]) => (
        <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => switchView(v)}
          className={`h-8 px-2.5 transition-colors ${view === v ? "bg-primary text-primary-foreground" : "bg-card/90 hover:text-primary"}`}>{label}</button>
      ))}
    </div>
  );

  const canvasProps = {
    graph: graph as InteractiveGraph,
    onChange: commit,
    selectedId,
    onSelect,
    focus,
    onUndo: doUndo,
    onRedo: doRedo,
    canUndo: undo.current.length > 0,
    canRedo: redo.current.length > 0,
    status,
    title,
    switcher,
  };

  return (
    <div className="fixed inset-0 bg-background">
      {graph ? (
        view === "map" ? <StoryMapCanvas key="map" {...canvasProps} /> : <NodeCanvas key="nodes" {...canvasProps} />
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
