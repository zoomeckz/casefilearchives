import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import DOMPurify from "dompurify";
import type { AuthUser } from "@/hooks/useAuth";
import {
  InteractiveGraph, PlayState, StoryNode, DecisionOption, GUEST_CHOICE_LIMIT,
  findNode, isOptionLocked, isOptionVisible, startLocal, chooseLocal, parseServerState,
} from "@/lib/interactive";

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function getToken(): string | null {
  try { return JSON.parse(localStorage.getItem("app-auth-session") || "null")?.access_token || null; } catch { return null; }
}

async function rpc(fn: string, body: any): Promise<any> {
  const token = getToken();
  if (!token) throw new Error("auth_required");
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || "request_failed");
  return data;
}

interface Props {
  chapterId: string;
  title: string;
  graph: InteractiveGraph;
  user: AuthUser | null;
  setShowAuthModal?: (b: boolean) => void;
  /** preview = admin route test; nothing is saved anywhere. */
  mode?: "live" | "preview";
  onDiscuss?: () => void;
}

const guestKey = (id: string) => `ic-guest:${id}`;

export const InteractiveReader: React.FC<Props> = ({ chapterId, title, graph, user, setShowAuthModal, mode = "live", onDiscuss }) => {
  const { t } = useTranslation();
  const tr = (k: string, d: string, o?: any) => t(`interactive.${k}`, { defaultValue: d, ...o }) as string;
  const preview = mode === "preview";
  const guestAccess = graph.settings.guestAccess;
  const isGuest = !user && !preview;
  // Callers often rebuild the graph object on every render (e.g. the 30s
  // chapter poll); only reload the file when its content actually changes.
  const graphKey = useMemo(() => JSON.stringify(graph), [graph]);

  const [state, setState] = useState<PlayState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<DecisionOption | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastConsequence, setLastConsequence] = useState<string | null>(null);

  const readGuest = (): PlayState | null => {
    if (guestAccess === "full_nosave") return null;
    try { return JSON.parse(localStorage.getItem(guestKey(chapterId)) || "null"); } catch { return null; }
  };
  const writeGuest = (s: PlayState) => {
    if (guestAccess === "full_nosave") return;
    try { localStorage.setItem(guestKey(chapterId), JSON.stringify(s)); } catch {}
  };

  // Load: preview → fresh local; guest → device-stored; user → server (importing guest picks once).
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (preview) { setState(startLocal(graph)); return; }
      if (!user) { setState(readGuest() || startLocal(graph)); return; }
      let s = parseServerState(await rpc("ic_start", { _chapter_id: chapterId, _replay: false }));
      const guest = readGuest();
      if (s && guest && s.decisions.length === 0 && guest.decisions.length > 0) {
        for (const d of guest.decisions) {
          try { s = parseServerState(await rpc("ic_choose", { _chapter_id: chapterId, _node_id: d.node_id, _option_id: d.option_id })) || s; }
          catch { break; }
        }
      }
      try { localStorage.removeItem(guestKey(chapterId)); } catch {}
      setState(s);
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, user?.id, preview, graphKey]);

  useEffect(() => { void load(); }, [load]);

  const guestLimit = guestAccess === "opening" ? 0 : guestAccess === "two_choices" ? GUEST_CHOICE_LIMIT : Infinity;
  const guestBlocked = isGuest && (state?.decisions.length ?? 0) >= guestLimit;

  const confirm = async () => {
    if (!pending || !state?.current_node) return;
    setSubmitting(true); setError(null);
    try {
      let next: PlayState | null;
      if (preview || !user) {
        next = chooseLocal(graph, state, state.current_node, pending.id);
        if (!preview) writeGuest(next);
      } else {
        next = parseServerState(await rpc("ic_choose", { _chapter_id: chapterId, _node_id: state.current_node, _option_id: pending.id }));
      }
      setLastConsequence(pending.consequence || null);
      setState(next);
      setPending(null);
    } catch (e: any) {
      setError(e.message);
      if (user && !preview) void load();
    } finally { setSubmitting(false); }
  };

  const replay = async () => {
    setLastConsequence(null);
    if (preview) { setState(startLocal(graph)); return; }
    try { setState(parseServerState(await rpc("ic_start", { _chapter_id: chapterId, _replay: true }))); }
    catch (e: any) { setError(e.message); }
  };

  const canReplay = useMemo(() => {
    if (preview) return true;
    const p = graph.settings.replay;
    if (!user || !state || state.status !== "completed") return false;
    if (p === "after_completion") return true;
    if (p === "admin_only") return !!user.isAdmin;
    if (p === "after_wait" && state.completed_at) {
      return Date.parse(state.completed_at) + (graph.settings.replayWaitHours || 24) * 3600_000 <= Date.now();
    }
    return false;
  }, [preview, graph.settings, user, state]);

  if (loading) return <p className="text-muted-foreground text-sm py-8">{tr("loading", "Retrieving file…")}</p>;
  if (!state) {
    return (
      <div className="border border-destructive/40 p-6 text-sm">
        <p>{tr("loadError", "This case file could not be opened.")}</p>
        {error && <p className="text-muted-foreground mt-1 text-xs">{error}</p>}
      </div>
    );
  }

  const decisionsByNode = new Map(state.decisions.map((d) => [d.node_id, d]));
  const current = findNode(graph, state.current_node);
  const strandedByEdit = state.status === "in_progress" && !current;

  const renderNode = (n: StoryNode, i: number) => {
    const chosen = decisionsByNode.get(n.id);
    return (
      <section key={`${n.id}-${i}`} className="mb-10">
        {(n.label || n.title) && (
          <header className="mb-4">
            {n.label && <span className="case-label text-[9px]">{n.label}</span>}
            {n.title && <h2 className="font-display text-2xl uppercase text-foreground mt-1">{n.title}</h2>}
          </header>
        )}
        {n.image && <img src={n.image} alt="" className="w-full mb-6 border border-border" loading="lazy" />}
        {n.content && <div className="prose-story chapter-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(n.content) }} />}
        {n.type === "decision" && chosen && (
          <div className="mt-6 border border-border border-l-4 border-l-primary bg-card/40 px-4 py-3 text-sm">
            <span className="case-label text-[9px]">{tr("recordLocked", "Record locked")}</span>
            <p className="text-foreground mt-1">{chosen.option_label || n.options?.find((o) => o.id === chosen.option_id)?.label}</p>
          </div>
        )}
      </section>
    );
  };

  // Content shown so far: everything visited except an unanswered decision's options (shown in the panel).
  const shownNodes = state.visited.map((id) => findNode(graph, id)).filter(Boolean) as StoryNode[];

  const endingNode = state.status === "completed" ? findNode(graph, state.ending_node) : undefined;
  const allEndings = graph.nodes.filter((n) => n.type === "ending");

  return (
    <div>
      {preview && (
        <p className="mb-6 border border-dashed border-primary/60 p-3 text-xs uppercase tracking-wider text-primary">
          Preview route — nothing is saved and no reader progress is affected.
        </p>
      )}
      {shownNodes.map(renderNode)}

      {lastConsequence && (
        <div className="mb-8 border-y border-border py-3 text-sm italic text-muted-foreground">
          <span className="case-label text-[9px] not-italic mr-2">{tr("consequence", "Consequence logged")}</span>
          {lastConsequence}
        </div>
      )}

      {strandedByEdit && (
        <div className="border border-destructive/40 p-6 text-sm">{tr("revised", "This case file was revised by the archivist and your current position no longer exists. Please check back soon.")}</div>
      )}

      {state.status === "in_progress" && current?.type === "decision" && (
        <section className="my-10 border-2 border-primary/70 bg-card/60 p-5 sm:p-8" aria-labelledby="ic-decision">
          <p className="case-label text-[10px] text-primary">{tr("actionRequired", "Action required")}</p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{tr("caseFile", "Case file")}: {title}</p>
          {current.context && (
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{tr("situation", "Current situation")}</p>
              <p className="text-foreground/90 mt-1">{current.context}</p>
            </div>
          )}
          <h3 id="ic-decision" className="font-display uppercase text-lg mt-6 mb-4">{current.title || tr("selectOne", "Select one course of action")}</h3>

          {guestBlocked ? (
            <div className="border border-border p-5 text-sm">
              <p className="text-foreground">{tr("signInRequired", "To file further decisions, register or sign in. Your choices so far will be kept.")}</p>
              <button onClick={() => setShowAuthModal?.(true)} className="mt-4 px-4 py-2 bg-primary text-primary-foreground text-xs uppercase tracking-wider">
                {tr("signIn", "Register or sign in")}
              </button>
            </div>
          ) : (
            <ol className="space-y-3">
              {(current.options || []).filter((o) => isOptionVisible(o, state.variables)).map((o, idx) => {
                const locked = isOptionLocked(o, state.variables);
                const letter = String.fromCharCode(65 + idx);
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      disabled={locked || submitting}
                      onClick={() => setPending(o)}
                      className="w-full text-left border border-border hover:border-primary focus-visible:border-primary px-4 py-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span className="font-display text-primary mr-3">{letter}.</span>
                      <span className="text-foreground">{o.label}</span>
                      {o.description && <span className="block text-sm text-muted-foreground mt-1 pl-7">{o.description}</span>}
                      {locked && <span className="block text-[10px] uppercase tracking-wider text-muted-foreground mt-1 pl-7">{tr("unavailable", "Unavailable")}</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          {isGuest && !guestBlocked && Number.isFinite(guestLimit) && (
            <p className="text-xs text-muted-foreground mt-4">
              {tr("guestRemaining", "Guest decisions remaining: {{n}}", { n: guestLimit - state.decisions.length })}
            </p>
          )}
          {error && <p className="text-xs text-destructive mt-4">{tr("error", "The decision could not be filed.")} ({error})</p>}
        </section>
      )}

      {state.status === "completed" && (
        <section className="my-10 border-2 border-primary/70 p-6 sm:p-8 text-center">
          <p className="case-label text-[10px] text-primary">{tr("outcome", "Case outcome")}</p>
          <h3 className="font-display text-3xl uppercase mt-2">{endingNode?.endingTitle || tr("fileClosed", "File closed")}</h3>
          {endingNode?.endingText && <p className="text-foreground/80 mt-3 max-w-prose mx-auto">{endingNode.endingText}</p>}
          {state.completed_at && <p className="text-xs text-muted-foreground mt-4">{tr("completed", "Completed")} {new Date(state.completed_at).toLocaleDateString()}</p>}

          {state.decisions.length > 0 && (
            <div className="mt-6 text-left max-w-md mx-auto">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{tr("decisionsMade", "Decisions on record")}</p>
              <ol className="text-sm list-decimal pl-5 space-y-1">{state.decisions.map((d) => <li key={d.node_id}>{d.option_label}</li>)}</ol>
            </div>
          )}

          {graph.settings.endingVisibility === "count" && allEndings.length > 0 && (
            <p className="text-xs text-muted-foreground mt-6">{tr("endingCount", "This file has {{n}} possible outcomes.", { n: allEndings.length })}</p>
          )}
          {graph.settings.endingVisibility === "index" && (
            <ul className="mt-6 text-sm space-y-1">
              {allEndings.map((e) => (
                <li key={e.id} className={e.id === state.ending_node ? "text-primary" : "text-muted-foreground"}>
                  {e.id === state.ending_node ? "■ " : "□ "}{e.endingTitle || e.id}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {canReplay && (
              <button onClick={replay} className="px-4 py-2 border border-primary text-primary text-xs uppercase tracking-wider">
                {tr("replay", "Reopen case (new playthrough)")}
              </button>
            )}
            {onDiscuss && !preview && (
              <button onClick={onDiscuss} className="px-4 py-2 border border-border text-xs uppercase tracking-wider">
                {tr("discuss", "Discuss this case (spoilers)")}
              </button>
            )}
          </div>
          {!canReplay && !preview && graph.settings.replay === "disabled" && (
            <p className="text-xs text-muted-foreground mt-4">{tr("noReplay", "This record is permanent. Replay is not permitted for this file.")}</p>
          )}
        </section>
      )}

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4" role="dialog" aria-modal="true" aria-labelledby="ic-confirm">
          <div className="w-full max-w-md border-2 border-primary bg-card p-6">
            <p className="case-label text-[10px] text-primary">{tr("confirmTitle", "Confirm course of action")}</p>
            <p id="ic-confirm" className="font-display text-xl mt-2">{pending.label}</p>
            <p className="text-sm text-muted-foreground mt-4">
              {current?.warning || (preview
                ? "Preview only — this choice is not saved."
                : user
                  ? tr("irreversible", "This decision will be saved to your account and cannot be changed.")
                  : tr("irreversibleGuest", "This decision will be saved on this device and cannot be changed."))}
            </p>
            <div className="mt-6 flex gap-3 justify-end">
              <button onClick={() => setPending(null)} disabled={submitting} className="px-4 py-2 border border-border text-xs uppercase tracking-wider">
                {tr("goBack", "Go back")}
              </button>
              <button onClick={confirm} disabled={submitting} className="px-4 py-2 bg-primary text-primary-foreground text-xs uppercase tracking-wider">
                {submitting ? "…" : tr("confirm", "Confirm decision")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InteractiveReader;
