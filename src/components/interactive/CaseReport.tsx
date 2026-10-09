import React, { useEffect, useState } from "react";
import { findNode, normalizeGraph, type Decision, type InteractiveGraph } from "@/lib/interactive";
import { sessionToken } from "@/lib/commendations";

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface ReportProps {
  graph: InteractiveGraph;
  decisions: Decision[];
  attempt?: number;
  endingNodeId?: string | null;
  completedAt?: string | null;
  finalAnswer?: string | null;
  answeredAt?: string | null;
  feedback?: string | null;
  feedbackAt?: string | null;
  /** Also show the outcome and the written conclusion (the ending screen shows those itself). */
  full?: boolean;
}

/** Summary of one playthrough: every decision filed, in order. */
export const CaseReport: React.FC<ReportProps> = ({
  graph, decisions, attempt, endingNodeId, completedAt, finalAnswer, answeredAt, feedback, feedbackAt, full = false,
}) => {
  const ending = findNode(graph, endingNodeId);
  const ordered = [...decisions].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));

  return (
    <div className="text-left">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <p className="case-label text-[10px] !text-primary">Case report{attempt ? ` · attempt ${attempt}` : ""}</p>
        {completedAt && <p className="case-label text-[9px]">Closed {new Date(completedAt).toLocaleDateString()}</p>}
      </div>

      {full && (
        <div className="mb-5">
          <p className="case-label text-[9px]">Outcome</p>
          <p className="font-display text-xl uppercase text-foreground">{ending?.endingTitle || "File closed"}</p>
          {ending?.endingText && <p className="text-sm text-muted-foreground mt-1">{ending.endingText}</p>}
        </div>
      )}

      {ordered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No decisions on record.</p>
      ) : (
        <ol className="relative border-l border-border ml-2 space-y-4">
          {ordered.map((d, i) => {
            const node = findNode(graph, d.node_id);
            const heading = node?.context || node?.title || `Decision ${i + 1}`;
            const label = d.option_label || node?.options?.find((o) => o.id === d.option_id)?.label || d.option_id;
            return (
              <li key={`${d.node_id}-${i}`} className="pl-5 relative">
                <span className="absolute -left-[5px] top-1.5 w-[9px] h-[9px] bg-primary" aria-hidden="true" />
                <p className="case-label text-[9px]">
                  Decision {i + 1}{d.created_at ? ` · ${new Date(d.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}` : ""}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{heading}</p>
                <p className="text-foreground mt-0.5">{label}</p>
              </li>
            );
          })}
        </ol>
      )}

      {full && finalAnswer && (
        <div className="mt-6">
          <p className="case-label text-[9px]">
            Written conclusion{answeredAt ? ` · ${new Date(answeredAt).toLocaleDateString()}` : ""}
          </p>
          <blockquote className="mt-2 border-l-4 border-primary pl-4 italic text-foreground/85 whitespace-pre-line break-words">{finalAnswer}</blockquote>
        </div>
      )}

      {full && feedback && (
        <div className="mt-4 border border-border border-l-4 border-l-accent bg-card/40 px-4 py-3">
          <p className="case-label text-[9px] !text-accent">
            The archivist’s response{feedbackAt ? ` · ${new Date(feedbackAt).toLocaleDateString()}` : ""}
          </p>
          <p className="mt-2 text-foreground/90 whitespace-pre-line break-words">{feedback}</p>
        </div>
      )}
    </div>
  );
};

interface PlaythroughRow {
  id: string;
  attempt: number;
  status: string;
  ending_node: string | null;
  completed_at: string | null;
  final_answer: string | null;
  answered_at: string | null;
  admin_feedback?: string | null;
  feedback_at?: string | null;
  interactive_decisions: Decision[];
}

interface HistoryProps {
  chapterId: string;
  userId: string;
  /** Pass the case structure when it is already loaded; otherwise it is fetched. */
  graph?: InteractiveGraph | null;
  /** Leave out this attempt (e.g. the one already shown on the ending screen). */
  excludeAttempt?: number;
}

/** Every closed attempt of one case by one reader, newest first. Private to that reader. */
export const CaseReports: React.FC<HistoryProps> = ({ chapterId, userId, graph: given, excludeAttempt }) => {
  const [rows, setRows] = useState<PlaythroughRow[] | null>(null);
  const [graph, setGraph] = useState<InteractiveGraph | null>(given ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = sessionToken();
        if (!token) throw new Error("auth_required");
        const headers = { apikey: ANON, Authorization: `Bearer ${token}` };
        const select = "id,attempt,status,ending_node,completed_at,final_answer,answered_at,admin_feedback,feedback_at,interactive_decisions(node_id,option_id,option_label,created_at)";
        const res = await fetch(
          `${SUPA_URL}/rest/v1/interactive_playthroughs?select=${encodeURIComponent(select)}&chapter_id=eq.${chapterId}&user_id=eq.${userId}&completed_at=not.is.null&order=attempt.desc`,
          { headers },
        );
        if (!res.ok) throw new Error("load_failed");
        const data: PlaythroughRow[] = await res.json();
        let g = given ?? null;
        if (!g) {
          const ch = await fetch(`${SUPA_URL}/rest/v1/chapters?select=interactive_graph&id=eq.${chapterId}`, { headers }).then((r) => r.json());
          g = normalizeGraph(ch?.[0]?.interactive_graph);
        }
        if (!cancelled) { setRows(data); setGraph(g); }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, userId]);

  if (failed) return <p className="text-sm text-muted-foreground">Case reports are unavailable right now.</p>;
  if (!rows || !graph) return <p className="case-label text-[9px]">Retrieving reports…</p>;

  const list = rows.filter((r) => r.attempt !== excludeAttempt);
  if (list.length === 0) return <p className="text-sm text-muted-foreground">No other closed attempts on file.</p>;

  return (
    <div className="space-y-5">
      {list.map((r) => (
        <div key={r.id} className="case-file p-4 sm:p-5">
          <CaseReport
            graph={graph}
            decisions={r.interactive_decisions || []}
            attempt={r.attempt}
            endingNodeId={r.ending_node}
            completedAt={r.completed_at}
            finalAnswer={r.final_answer}
            answeredAt={r.answered_at}
            feedback={r.admin_feedback}
            feedbackAt={r.feedback_at}
            full
          />
        </div>
      ))}
    </div>
  );
};

export default CaseReport;
