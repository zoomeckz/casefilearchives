import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import DOMPurify from "dompurify";
import type { AuthUser } from "@/hooks/useAuth";
import {
  InteractiveGraph, PlayState, StoryNode, DecisionOption, GUEST_CHOICE_LIMIT, DEFAULT_SETTINGS,
  findNode, isOptionLocked, isOptionVisible, startLocal, chooseLocal, parseServerState, collectNotebook,
  getConclusionQuestions, formatConclusion, heldItems, findItem,
} from "@/lib/interactive";
import { itemStyle } from "@/lib/itemColors";
import { notifyActivity } from "@/lib/commendations";
import { CaseReport, CaseReports } from "@/components/interactive/CaseReport";

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const ANSWER_MAX = 2000;

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
  /** Preview only: keep progress on this device under this key (used by tester links). */
  testKey?: string;
  onDiscuss?: () => void;
}

const guestKey = (id: string) => `ic-guest:${id}`;

/** 75 → "1:15" */
const clock = (s: number) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

export const InteractiveReader: React.FC<Props> = ({ chapterId, title, graph, user, setShowAuthModal, mode = "live", onDiscuss, testKey }) => {
  const { t } = useTranslation();
  const tr = (k: string, d: string, o?: any) => t(`interactive.${k}`, { defaultValue: d, ...o }) as string;
  const preview = mode === "preview";
  const guestAccess = graph.settings.guestAccess;
  const isGuest = !user && !preview;
  // Callers often rebuild the graph object on every render (e.g. the 30s
  // chapter poll); only reload the file when its content actually changes.
  const graphKey = useMemo(() => JSON.stringify(graph), [graph]);
  const questions = useMemo(() => getConclusionQuestions(graph.settings), [graph.settings]);
  const conclusionPrompt = questions.length === 1 ? questions[0] : questions.length > 1 ? tr("conclusionMany", "Answer each question for your report.") : "";

  const [state, setState] = useState<PlayState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<DecisionOption | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastConsequence, setLastConsequence] = useState<string | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const answer = formatConclusion(questions, answers);
  const perAnswerMax = questions.length > 1 ? Math.floor((ANSWER_MAX - questions.join("").length - questions.length * 8) / questions.length) : ANSWER_MAX;
  const allAnswered = questions.length > 0 && questions.every((_, i) => (answers[i] || "").trim());
  const [confirmAnswer, setConfirmAnswer] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

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
      if (preview) {
        let saved: PlayState | null = null;
        if (testKey) { try { saved = JSON.parse(localStorage.getItem(testKey) || "null"); } catch { saved = null; } }
        setState(saved && Array.isArray(saved.visited) ? saved : startLocal(graph));
        return;
      }
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
  useEffect(() => {
    if (!preview || !testKey || !state) return;
    try { localStorage.setItem(testKey, JSON.stringify(state)); } catch { /* ignore */ }
  }, [preview, testKey, state]);

  const guestLimit = guestAccess === "opening" ? 0 : guestAccess === "two_choices" ? GUEST_CHOICE_LIMIT : Infinity;
  const guestBlocked = isGuest && (state?.decisions.length ?? 0) >= guestLimit;

  // Timed decisions: the clock starts when the decision is reached (saved with the playthrough,
  // so refreshing does not reset it). At zero a random available option is filed.
  const currentNode = state?.status === "in_progress" ? findNode(graph, state.current_node) : undefined;
  const timeLimit = currentNode?.type === "decision" && !guestBlocked ? Number(currentNode.timeLimit) || 0 : 0;
  const [remaining, setRemaining] = useState<number | null>(null);
  const autoFiled = useRef<string | null>(null);

  const fileDecision = async (option: DecisionOption, timedOut = false) => {
    if (!state?.current_node) return;
    setSubmitting(true); setError(null);
    try {
      let next: PlayState | null;
      if (preview || !user) {
        next = chooseLocal(graph, state, state.current_node, option.id);
        if (!preview) writeGuest(next);
      } else {
        next = parseServerState(await rpc("ic_choose", { _chapter_id: chapterId, _node_id: state.current_node, _option_id: option.id }));
      }
      // The server files a random option instead if the time limit had already passed.
      const filedId = next?.decisions.find((d) => d.node_id === state.current_node)?.option_id;
      const filed = currentNode?.options?.find((o) => o.id === filedId) || option;
      setLastConsequence(timedOut || filed.id !== option.id
        ? `${tr("timeExpired", "Time expired. The file recorded:")} “${filed.label}”.${filed.consequence ? ` ${filed.consequence}` : ""}`
        : filed.consequence || null);
      setState(next);
      setPending(null);
      if (!preview) notifyActivity();
    } catch (e: any) {
      setError(e.message);
      if (user && !preview) void load();
    } finally { setSubmitting(false); }
  };

  const confirm = () => { if (pending) void fileDecision(pending); };

  useEffect(() => {
    if (!timeLimit || !state || state.status !== "in_progress" || !state.current_node) { setRemaining(null); return; }
    const reached = state.reached_at ? Date.parse(state.reached_at) : NaN;
    const deadline = (Number.isNaN(reached) ? Date.now() : reached) + timeLimit * 1000;
    const key = `${state.current_node}:${state.decisions.length}`;
    const tick = () => {
      const left = Math.max(0, (deadline - Date.now()) / 1000);
      setRemaining(left);
      if (left <= 0 && autoFiled.current !== key) {
        autoFiled.current = key;
        const open = (currentNode?.options || []).filter((o) => isOptionVisible(o, state.variables) && !isOptionLocked(o, state.variables));
        const pick = open[Math.floor(Math.random() * open.length)];
        if (pick) void fileDecision(pick, true);
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLimit, state]);

  /** The written conclusion: filed once per attempt, locked afterwards. */
  const fileAnswer = async () => {
    const text = answer.trim().slice(0, ANSWER_MAX);
    if (!text || !allAnswered || !state) return;
    setSubmitting(true); setError(null);
    try {
      if (preview) {
        setState({ ...state, final_answer: text, answered_at: new Date().toISOString() });
      } else {
        const next = parseServerState(await rpc("ic_answer", { _chapter_id: chapterId, _answer: text }));
        if (next) setState(next);
        notifyActivity();
      }
      setConfirmAnswer(false);
      setAnswers([]);
    } catch (e: any) {
      setError(e.message);
      setConfirmAnswer(false);
    } finally { setSubmitting(false); }
  };

  const replay = async () => {
    setLastConsequence(null);
    setShowHistory(false);
    if (preview) { setState(startLocal(graph)); return; }
    try { setState(parseServerState(await rpc("ic_start", { _chapter_id: chapterId, _replay: true }))); }
    catch (e: any) { setError(e.message); }
  };

  const replayPolicy = graph.settings.replay || DEFAULT_SETTINGS.replay;
  const waitHours = graph.settings.replayWaitHours || DEFAULT_SETTINGS.replayWaitHours || 168;
  const reopensAt = replayPolicy === "after_wait" && state?.completed_at
    ? Date.parse(state.completed_at) + waitHours * 3600_000
    : null;

  // Optional cap on total playthroughs per account (the server enforces the same rule).
  const maxAttempts = Number(graph.settings.maxAttempts) || 0;
  const attemptsUsedUp = !preview && !!user && !user.isAdmin && maxAttempts > 0 && (state?.attempt ?? 1) >= maxAttempts;

  const canReplay = useMemo(() => {
    if (preview) return true;
    if (attemptsUsedUp) return false;
    if (!user || !state || state.status !== "completed") return false;
    if (replayPolicy === "after_completion") return true;
    if (replayPolicy === "admin_only") return !!user.isAdmin;
    if (replayPolicy === "after_wait" && reopensAt) return reopensAt <= Date.now();
    return false;
  }, [preview, attemptsUsedUp, replayPolicy, reopensAt, user, state]);

  const visitedKey = state?.visited.join("|") ?? "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const notebook = useMemo(() => collectNotebook(graph, state?.visited ?? []), [graphKey, visitedKey]);
  const inventory = state ? heldItems(graph, state.variables) : [];
  const notebookEvidence = notebook.filter((e) => e.kind === "evidence");
  const notebookNotes = notebook.filter((e) => e.kind === "note");

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
  const fmtDate = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });

  return (
    <div>
      {preview && (
        <p className="mb-6 border border-dashed border-primary/60 p-3 text-xs uppercase tracking-wider text-primary">
          {testKey
            ? "Test copy — your progress is kept on this device only. Nothing is sent to the archive."
            : "Preview route — nothing is saved and no reader progress is affected."}
        </p>
      )}
      {shownNodes.map(renderNode)}

      {lastConsequence && (
        <div className="mb-8 border-y border-border py-3 text-sm italic text-muted-foreground">
          <span className="case-label text-[9px] not-italic mr-2">{tr("consequence", "Consequence logged")}</span>
          {lastConsequence}
        </div>
      )}

      {inventory.length > 0 && (
        <div className="mb-4 border border-border bg-card/40 px-4 py-3 flex flex-wrap items-center gap-2">
          <span className="case-label text-[10px] text-primary mr-1">{tr("inventory", "Carrying")}</span>
          {inventory.map((it) => {
            const st = itemStyle(it.color);
            return (
              <span key={it.id} className={`inline-flex items-center gap-1.5 px-2 py-0.5 border text-xs ${st.border} ${st.text} ${st.bg}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{it.name || it.id}
              </span>
            );
          })}
        </div>
      )}

      {notebook.length > 0 && (
        <details className="mb-8 border border-border bg-card/40 group">
          <summary className="cursor-pointer select-none px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <span className="case-label text-[10px] text-primary">{tr("notebook", "Case notebook")}</span>
            <span className="case-label text-[9px]">
              {tr("notebookCount", "{{notes}} notes · {{evidence}} evidence", { notes: notebookNotes.length, evidence: notebookEvidence.length })}
            </span>
          </summary>
          <div className="px-4 pb-4 space-y-5">
            {notebookEvidence.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{tr("notebookEvidence", "Evidence")}</p>
                <ol className="space-y-2">
                  {notebookEvidence.map((e, i) => (
                    <li key={i} className="border border-border border-l-4 border-l-primary px-3 py-2 text-sm text-foreground">
                      <span className="case-label text-[9px] block">{tr("notebookItem", "Item")} {String(i + 1).padStart(2, "0")}</span>
                      {e.text}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {notebookNotes.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{tr("notebookNotes", "Notes")}</p>
                <ul className="space-y-2">
                  {notebookNotes.map((e, i) => (
                    <li key={i} className="border-l border-border pl-3 text-sm text-foreground/90">{e.text}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}

      {strandedByEdit && (
        <div className="border border-destructive/40 p-6 text-sm">{tr("revised", "This case file was revised by the archivist and your current position no longer exists. Please check back soon.")}</div>
      )}

      {state.status === "in_progress" && current?.type === "decision" && (
        <section className="my-10 border-2 border-primary/70 bg-card/60 p-5 sm:p-8" aria-labelledby="ic-decision">
          <p className="case-label text-[10px] text-primary">{tr("actionRequired", "Action required")}</p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{tr("caseFile", "Case file")}: {title}</p>
          {remaining != null && timeLimit > 0 && (
            <div className="mt-4" role="timer" aria-label={tr("timeRemaining", "Time remaining")}>
              <div className="flex items-center justify-between gap-3 case-label text-[9px]">
                <span className={remaining <= 10 ? "!text-primary" : ""}>{tr("timeRemaining", "Time remaining")}</span>
                <span className={`tabular-nums text-xs ${remaining <= 10 ? "!text-primary animate-pulse" : "text-foreground"}`}>{clock(remaining)}</span>
              </div>
              <div className="mt-1.5 h-1.5 bg-secondary overflow-hidden">
                <div className="h-full bg-primary transition-[width] duration-200 ease-linear" style={{ width: `${Math.min(100, (remaining / timeLimit) * 100)}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">{tr("timeHint", "If time runs out, a course of action is chosen for you.")}</p>
            </div>
          )}
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
                const item = findItem(graph, o.requiresItem);
                const ist = item ? itemStyle(item.color) : null;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      disabled={locked || submitting || remaining === 0}
                      onClick={() => setPending(o)}
                      className={`w-full text-left border px-4 py-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${ist ? `${ist.border} ${ist.bg} ${ist.hover}` : "border-border hover:border-primary focus-visible:border-primary"}`}
                    >
                      {item && (
                        <span className={`block text-[10px] uppercase tracking-[0.18em] mb-1 pl-7 ${ist!.text}`}>
                          {tr("itemChoice", "Item")} · {item.name || item.id}
                        </span>
                      )}
                      <span className={`font-display mr-3 ${ist ? ist.text : "text-primary"}`}>{letter}.</span>
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
        <section className="my-10 border-2 border-primary/70 p-5 sm:p-8">
          <div className="text-center">
            <p className="case-label text-[10px] text-primary">{tr("outcome", "Case outcome")}</p>
            <h3 className="font-display text-3xl uppercase mt-2">{endingNode?.endingTitle || tr("fileClosed", "File closed")}</h3>
            {endingNode?.endingText && <p className="text-foreground/80 mt-3 max-w-prose mx-auto">{endingNode.endingText}</p>}
            {state.completed_at && <p className="text-xs text-muted-foreground mt-4">{tr("completed", "Completed")} {new Date(state.completed_at).toLocaleDateString()}</p>}

            {graph.settings.endingVisibility === "count" && allEndings.length > 0 && (
              <p className="text-xs text-muted-foreground mt-4">{tr("endingCount", "This file has {{n}} possible outcomes.", { n: allEndings.length })}</p>
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
          </div>

          {/* Written conclusion */}
          {conclusionPrompt && (
            <div className="mt-8 border-t border-border pt-6">
              <p className="case-label text-[10px] text-primary">{tr("conclusionKicker", "Your conclusion")}</p>
              <p className="font-display text-lg text-foreground mt-1">{conclusionPrompt}</p>
              {state.final_answer ? (
                <>
                  <blockquote className="mt-3 border-l-4 border-primary pl-4 italic text-foreground/85 whitespace-pre-line break-words">{state.final_answer}</blockquote>
                  <p className="case-label text-[9px] mt-2">
                    {tr("conclusionFiled", "Filed")}{state.answered_at ? ` ${new Date(state.answered_at).toLocaleDateString()}` : ""} · {tr("recordLocked", "Record locked")}
                  </p>
                  {state.admin_feedback ? (
                    <div className="mt-5 border border-border border-l-4 border-l-accent bg-card/40 px-4 py-3">
                      <p className="case-label text-[9px] !text-accent">
                        {tr("archivistResponse", "The archivist’s response")}{state.feedback_at ? ` · ${new Date(state.feedback_at).toLocaleDateString()}` : ""}
                      </p>
                      <p className="mt-2 text-foreground/90 whitespace-pre-line break-words">{state.admin_feedback}</p>
                    </div>
                  ) : !preview && (
                    <p className="text-xs text-muted-foreground mt-4">{tr("awaitingReview", "Your report is with the archivist. You’ll be notified when it has been reviewed.")}</p>
                  )}
                </>
              ) : isGuest ? (
                <div className="mt-3 text-sm">
                  <p className="text-muted-foreground">{tr("conclusionSignIn", "Register or sign in to file your conclusion.")}</p>
                  <button onClick={() => setShowAuthModal?.(true)} className="mt-3 px-4 py-2 bg-primary text-primary-foreground text-xs uppercase tracking-wider">
                    {tr("signIn", "Register or sign in")}
                  </button>
                </div>
              ) : (
                <>
                  {questions.map((q, i) => (
                    <div key={i} className={i === 0 ? "mt-3" : "mt-5"}>
                      {questions.length > 1 && (
                        <p className="text-foreground font-medium"><span className="font-display text-primary mr-2">{i + 1}.</span>{q}</p>
                      )}
                      <textarea
                        value={answers[i] || ""}
                        onChange={(e) => setAnswers((prev) => { const next = [...prev]; next[i] = e.target.value.slice(0, perAnswerMax); return next; })}
                        rows={questions.length > 1 ? 3 : 5}
                        placeholder={tr("conclusionPlaceholder", "Write what you believe happened…")}
                        className="mt-2 w-full px-3 py-2 bg-background border border-border text-foreground focus:outline-none focus:border-primary resize-y"
                      />
                      <span className="case-label text-[9px] tabular-nums">{(answers[i] || "").length}/{perAnswerMax}</span>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center justify-end gap-3 mt-3">
                    {questions.length > 1 && !allAnswered && (
                      <span className="text-xs text-muted-foreground mr-auto">{tr("answerAll", "Answer every question to file your report.")}</span>
                    )}
                    <button
                      type="button"
                      disabled={!allAnswered || submitting}
                      onClick={() => setConfirmAnswer(true)}
                      className="px-4 py-2 bg-primary text-primary-foreground text-xs uppercase tracking-wider disabled:opacity-50"
                    >
                      {tr("fileConclusion", "File conclusion")}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Summary of this attempt */}
          <div className="mt-8 border-t border-border pt-6">
            <CaseReport graph={graph} decisions={state.decisions} attempt={state.attempt} completedAt={state.completed_at} />
          </div>

          {error && <p className="text-xs text-destructive mt-4">{tr("errorGeneric", "Something went wrong.")} ({error})</p>}

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {canReplay && (
              <button onClick={replay} className="px-4 py-2 border border-primary text-primary text-xs uppercase tracking-wider">
                {tr("replay", "Reopen case (new attempt)")}
              </button>
            )}
            {user && !preview && (state.attempt ?? 1) > 1 && (
              <button onClick={() => setShowHistory((v) => !v)} className="px-4 py-2 border border-border text-xs uppercase tracking-wider">
                {showHistory ? tr("hideHistory", "Hide earlier attempts") : tr("showHistory", "Earlier attempts")}
              </button>
            )}
            {onDiscuss && !preview && (
              <button onClick={onDiscuss} className="px-4 py-2 border border-border text-xs uppercase tracking-wider">
                {tr("discuss", "Discuss this case (spoilers)")}
              </button>
            )}
          </div>
          {attemptsUsedUp && (
            <p className="text-xs text-muted-foreground mt-4 text-center">
              {tr("attemptsUsed", "You have used all {{n}} attempts for this file. Your record is final.", { n: maxAttempts })}
            </p>
          )}
          {!canReplay && !preview && !attemptsUsedUp && reopensAt && (
            <p className="text-xs text-muted-foreground mt-4 text-center">
              {tr("reopens", "This record is locked. The case reopens for another attempt on {{date}}.", { date: fmtDate(reopensAt) })}
            </p>
          )}
          {!canReplay && !preview && !attemptsUsedUp && replayPolicy === "disabled" && (
            <p className="text-xs text-muted-foreground mt-4 text-center">{tr("noReplay", "This record is permanent. Replay is not permitted for this file.")}</p>
          )}

          {showHistory && user && (
            <div className="mt-8 border-t border-border pt-6">
              <CaseReports chapterId={chapterId} userId={user.id} graph={graph} excludeAttempt={state.attempt} />
            </div>
          )}
        </section>
      )}

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4" role="dialog" aria-modal="true" aria-labelledby="ic-confirm">
          <div className="w-full max-w-md border-2 border-primary bg-card p-6">
            <p className="case-label text-[10px] text-primary">{tr("confirmTitle", "Confirm course of action")}</p>
            <p id="ic-confirm" className="font-display text-xl mt-2">{pending.label}</p>
            {remaining != null && timeLimit > 0 && (
              <p className="case-label text-[9px] !text-primary mt-2 tabular-nums">{tr("timeRemaining", "Time remaining")} {clock(remaining)}</p>
            )}
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

      {confirmAnswer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4" role="dialog" aria-modal="true" aria-labelledby="ic-answer-confirm">
          <div className="w-full max-w-md border-2 border-primary bg-card p-6">
            <p className="case-label text-[10px] text-primary">{tr("confirmConclusion", "File your conclusion")}</p>
            <p id="ic-answer-confirm" className="text-sm text-muted-foreground mt-3">
              {preview
                ? "Preview only — this conclusion is not saved."
                : tr("conclusionIrreversible", "Your conclusion will be saved to your account and cannot be changed for this attempt.")}
            </p>
            <blockquote className="mt-4 border-l-4 border-primary pl-3 italic text-foreground/85 max-h-48 overflow-y-auto overscroll-contain whitespace-pre-line break-words" data-lenis-prevent>{answer.trim()}</blockquote>
            <div className="mt-6 flex gap-3 justify-end">
              <button onClick={() => setConfirmAnswer(false)} disabled={submitting} className="px-4 py-2 border border-border text-xs uppercase tracking-wider">
                {tr("goBack", "Go back")}
              </button>
              <button onClick={fileAnswer} disabled={submitting} className="px-4 py-2 bg-primary text-primary-foreground text-xs uppercase tracking-wider">
                {submitting ? "…" : tr("fileConclusion", "File conclusion")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InteractiveReader;
