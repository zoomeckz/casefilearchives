import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ProfileFrame } from "@/components/ProfileFrame";
import { CommendationBadge } from "@/components/commendations/CommendationBadge";
import { CaseReports } from "@/components/interactive/CaseReport";
import { dbFetch } from "@/lib/dbFetch";
import { slugify } from "@/lib/slug";
import {
  COMMENDATIONS, COMMENDATION_MAP, PRIVACY_LABELS, ROMAN, CLEARANCE_LEVELS,
  cfApi, formatDuration, type Dossier as DossierData, type DossierLogEntry, type PrivacySection,
  type ProfileSettingsPatch,
} from "@/lib/commendations";
import "@/components/commendations/commendations.css";

interface Props {
  userId: string;
  /** Owner controls (pins, favourite file, privacy). Off on the public view. */
  editable?: boolean;
  /** Rendered over the avatar, e.g. an upload button. */
  avatarAction?: React.ReactNode;
  /** Rendered beside the name, e.g. edit / sign-out buttons. */
  headerActions?: React.ReactNode;
  /** Bump to refetch after the parent edits the profile. */
  refreshKey?: number;
}

const storyHref = (title?: string | null) => (title ? `/stories/${slugify(title)}` : "/chapters");

function relTime(iso: string) {
  const diff = (Date.parse(iso) - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.35, "week"], [12, "month"]];
  let v = diff;
  for (const [n, unit] of steps) {
    if (Math.abs(v) < n) return rtf.format(Math.round(v), unit);
    v /= n;
  }
  return rtf.format(Math.round(v), "year");
}

function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!target) { setV(0); return; }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

const SectionTitle: React.FC<{ kicker: string; title: string; right?: React.ReactNode }> = ({ kicker, title, right }) => (
  <div className="flex items-end justify-between gap-3 border-b border-border pb-3 mb-5">
    <div>
      <p className="case-label text-[9px] mb-1">{kicker}</p>
      <h2 className="font-display text-2xl text-foreground uppercase">{title}</h2>
    </div>
    {right}
  </div>
);

export const Dossier: React.FC<Props> = ({ userId, editable = false, avatarAction, headerActions, refreshKey = 0 }) => {
  const navigate = useNavigate();
  const [data, setData] = useState<DossierData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await cfApi.dossier(userId);
      setData(d);
      setFailed(!d);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { setLoading(true); void load(); }, [load, refreshKey]);

  if (loading) return <p className="case-label text-[10px] py-16 text-center">Retrieving personnel file…</p>;
  if (failed || !data) {
    return (
      <div className="case-file p-8 text-center">
        <p className="case-label text-[10px]">File not found</p>
        <p className="text-muted-foreground text-sm mt-2">This personnel file is unavailable.</p>
      </div>
    );
  }

  const owner = editable && data.is_owner;
  const level = CLEARANCE_LEVELS.find((l) => l.level === data.clearance) || CLEARANCE_LEVELS[0];
  const since = data.created_at ? new Date(data.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : null;
  const agentNo = data.reader_number ? `#${String(data.reader_number).padStart(4, "0")}` : null;

  const save = async (patch: ProfileSettingsPatch) => {
    try {
      await cfApi.saveSettings(data.user_id, patch);
      await load();
    } catch {
      toast.error("Could not update your file.");
    }
  };

  return (
    <div className="space-y-14">
      {/* ── Header ── */}
      <section className="case-file p-6 sm:p-8 cf-rise">
        <div className="flex items-start justify-between gap-3 mb-6">
          <p className="case-label text-[9px]">Personnel file{data.is_owner && !editable ? " / public view" : ""}</p>
          {agentNo && <p className="case-label text-[9px]">Agent {agentNo}</p>}
        </div>
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="relative">
            <ProfileFrame avatarUrl={data.avatar_url} name={data.name} frame={data.selected_frame} size={128} />
            {avatarAction}
          </div>
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <h1 className="font-display text-3xl sm:text-4xl uppercase text-foreground">{data.name}</h1>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
              {data.title && <span className="case-label !text-primary text-[10px] border border-primary px-2 py-1">{data.title}</span>}
              <span className="case-label text-[10px] border border-border px-2 py-1">
                Clearance {ROMAN[level.level]} · {level.name}
              </span>
              <span className="case-label text-[10px]">{data.points} merit points</span>
            </div>
            {since && <p className="case-label text-[9px] mt-3">On file since {since}</p>}
            {headerActions && <div className="mt-5 flex flex-wrap justify-center sm:justify-start gap-3">{headerActions}</div>}
          </div>
          <ClearanceStamp level={level.level} />
        </div>
      </section>

      {/* ── Commendations showcase ── */}
      {data.commendations && (
        <section>
          <SectionTitle
            kicker="Commendations"
            title="Showcase"
            right={owner ? (
              <button onClick={() => navigate("/commendations")} className="case-label text-[9px] hover:text-primary">Manage →</button>
            ) : <span className="case-label text-[9px]">{data.commendations.length}/{COMMENDATIONS.length}</span>}
          />
          <Showcase data={data} owner={owner} />
        </section>
      )}

      {/* ── Case record ── */}
      {data.record && (
        <section>
          <SectionTitle kicker="Statistics" title="Case record" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatTile label="Files read" value={data.record.files_read} i={0} />
            <StatTile label="Decisions filed" value={data.record.decisions} i={1} />
            <StatTile label="Endings reached" value={data.record.endings} i={2} />
            <StatTile label="Reading time" value={data.record.reading_seconds} format={formatDuration} i={3} />
            <StatTile label="Current streak" value={data.record.current_streak} suffix=" d" i={4} />
            <StatTile label="Longest streak" value={data.record.best_streak} suffix=" d" i={5} />
            <StatTile label="Testimonies" value={data.record.comments} i={6} />
            <StatTile label="Theories" value={data.record.theories} i={7} />
          </div>
        </section>
      )}

      {/* ── Interactive history ── */}
      {data.cases && (
        <section>
          <SectionTitle kicker="Interactive cases" title="Case history" />
          {data.cases.length === 0 ? (
            <p className="text-muted-foreground text-sm">No interactive cases opened yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.cases.map((c, i) => (
                <li key={c.chapter_id} className="case-file p-4 sm:p-5 cf-rise" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button onClick={() => navigate(storyHref(c.title))} className="font-display text-xl text-foreground hover:text-primary text-left">{c.title}</button>
                    <span className={`case-label text-[9px] border px-2 py-1 ${c.completed_at ? "border-primary !text-primary" : "border-border"}`}>
                      {c.status === "in_progress" ? "Open" : c.completed_at ? "Closed" : c.status}
                    </span>
                  </div>
                  {c.ending_index ? (
                    <p className="text-sm mt-2">
                      <span className="case-label text-[9px] mr-2">Outcome {c.ending_index} of {c.endings_total}</span>
                      {c.ending_title
                        ? <span className="font-display uppercase text-foreground">{c.ending_title}</span>
                        : <span className="cf-redacted text-sm" title="Close this case yourself to see this outcome">Classified outcome</span>}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-2">Investigation in progress.</p>
                  )}
                  {c.endings_total > 0 && (
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1 h-1.5 bg-secondary overflow-hidden">
                        <div className="h-full bg-primary cf-fill" style={{ width: `${(c.endings_reached / c.endings_total) * 100}%` }} />
                      </div>
                      <span className="case-label text-[8px] shrink-0">{c.endings_reached}/{c.endings_total} outcomes</span>
                    </div>
                  )}
                  {owner && (c.completed_at || c.endings_reached > 0) && <ReportToggle chapterId={c.chapter_id} userId={data.user_id} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="grid gap-14 lg:grid-cols-2">
        {/* ── Statement ── */}
        {data.statement && (
          <section>
            <SectionTitle kicker="In their own words" title="Statement" />
            <Statement data={data} owner={owner} onSave={save} />
          </section>
        )}

        {/* ── Field log ── */}
        {data.log && (
          <section>
            <SectionTitle kicker="Recent activity" title="Field log" />
            <FieldLog entries={data.log} />
          </section>
        )}
      </div>

      {/* ── Activity map ── */}
      {data.activity && data.today && (
        <section>
          <SectionTitle kicker="Last twelve months" title="Activity map" />
          <ActivityMap activity={data.activity} today={data.today} />
        </section>
      )}

      {/* ── Evidence board ── */}
      {data.evidence && (
        <section>
          <SectionTitle kicker="Saved quotes" title="Evidence board" />
          {data.evidence.length === 0 ? (
            <p className="text-muted-foreground text-sm">No evidence filed. Highlight a passage while reading to save it.</p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 pt-2">
              {data.evidence.map((q) => (
                <figure key={q.id} className="cf-evidence relative bg-card border border-border p-5 pt-6 shadow-[4px_4px_0_hsl(var(--foreground)/0.08)]">
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-primary shadow" aria-hidden="true" />
                  <blockquote className="font-display italic text-foreground/85 leading-relaxed">“{q.text}”</blockquote>
                  <figcaption className="mt-4 flex items-center justify-between gap-2">
                    <button onClick={() => navigate(storyHref(q.title))} className="case-label text-[8px] hover:text-primary truncate">
                      {q.title || "Case file"}
                    </button>
                    <span className="case-label text-[8px] shrink-0">{new Date(q.at).toLocaleDateString()}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Privacy ── */}
      {owner && (
        <section>
          <SectionTitle kicker="Access control" title="Who can see your file" />
          <p className="text-sm text-muted-foreground mb-4">
            Your name, frame, title and clearance are always visible. Choose which sections signed-in readers can open.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(PRIVACY_LABELS) as PrivacySection[]).map((s) => {
              const on = data.visibility[s];
              return (
                <label key={s} className="flex items-center justify-between gap-3 border border-border bg-card px-4 py-3 cursor-pointer">
                  <span className="text-sm text-foreground">{PRIVACY_LABELS[s]}</span>
                  <span className="flex items-center gap-2">
                    <span className={`case-label text-[8px] ${on ? "!text-primary" : ""}`}>{on ? "Visible" : "Private"}</span>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => save({ [`show_${s}`]: e.target.checked } as ProfileSettingsPatch)}
                      className="w-4 h-4 accent-[hsl(var(--primary))]"
                    />
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

// ── Pieces ──

/** Owner-only: decisions and written conclusions for every closed attempt of a case. */
const ReportToggle: React.FC<{ chapterId: string; userId: string }> = ({ chapterId, userId }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button onClick={() => setOpen((v) => !v)} className="case-label text-[9px] hover:text-primary" aria-expanded={open}>
        {open ? "Hide case reports ↑" : "View case reports ↓"}
      </button>
      {open && <div className="mt-4"><CaseReports chapterId={chapterId} userId={userId} /></div>}
    </div>
  );
};

const ClearanceStamp: React.FC<{ level: number }> = ({ level }) => (
  <div className="hidden md:flex relative w-24 h-24 items-center justify-center border-4 border-primary text-primary rotate-[-8deg] cf-stamp-in shrink-0" aria-hidden="true">
    <span className="font-display text-4xl">{ROMAN[level]}</span>
    <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-card px-1 case-label !text-primary text-[8px] whitespace-nowrap">Clearance</span>
  </div>
);

const StatTile: React.FC<{ label: string; value: number; i: number; suffix?: string; format?: (n: number) => string }> = ({ label, value, i, suffix = "", format }) => {
  const v = useCountUp(value || 0);
  return (
    <div className="case-file p-4 cf-rise" style={{ animationDelay: `${i * 50}ms` }}>
      <p className="font-display text-3xl text-foreground tabular-nums">{format ? format(v) : `${v}${suffix}`}</p>
      <p className="case-label text-[8px] mt-1">{label}</p>
    </div>
  );
};

const Showcase: React.FC<{ data: DossierData; owner: boolean }> = ({ data, owner }) => {
  const unlocked = new Map((data.commendations || []).map((u) => [u.key, u.unlocked_at]));
  const pinned = (data.pinned || []).filter((k) => unlocked.has(k) && COMMENDATION_MAP[k]);
  const rest = COMMENDATIONS.filter((c) => unlocked.has(c.key) && !pinned.includes(c.key));

  if (unlocked.size === 0) {
    return <p className="text-muted-foreground text-sm">No commendations on file yet.</p>;
  }

  return (
    <div className="space-y-8">
      {pinned.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-3">
          {pinned.map((k, i) => {
            const c = COMMENDATION_MAP[k];
            return (
              <div key={k} className="case-file cf-sheen p-5 flex flex-col items-center text-center cf-rise" style={{ animationDelay: `${i * 90}ms` }}>
                <CommendationBadge commendation={c} unlocked size={104} stamp />
                <p className="font-display text-lg text-foreground mt-3">{c.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{c.description}</p>
                <p className="case-label text-[8px] !text-primary mt-2">Declassified {new Date(unlocked.get(k)!).toLocaleDateString()}</p>
              </div>
            );
          })}
        </div>
      ) : owner ? (
        <p className="text-sm text-muted-foreground">Pin up to three commendations on the Commendations page to feature them here.</p>
      ) : null}
      {rest.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {rest.map((c) => (
            <div key={c.key} className="group relative" title={`${c.title} — ${c.description}`}>
              <CommendationBadge commendation={c} unlocked size={56} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Statement: React.FC<{
  data: DossierData;
  owner: boolean;
  onSave: (patch: { favorite_chapter_id: string | null }) => Promise<void>;
}> = ({ data, owner, onSave }) => {
  const navigate = useNavigate();
  const st = data.statement!;
  const [files, setFiles] = useState<{ id: string; title: string }[] | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!picking || files) return;
    dbFetch<{ id: string; title: string }[]>("chapters", {
      select: "id,title",
      filters: `is_archived=eq.false&published_at=lte.${new Date().toISOString()}`,
      order: "title.asc",
    }).then(({ data: rows }) => setFiles(rows || []));
  }, [picking, files]);

  const socials = [
    st.instagram && { label: "Instagram", value: st.instagram },
    st.tiktok && { label: "TikTok", value: st.tiktok },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="space-y-5">
      {st.bio ? (
        <blockquote className="border-l-4 border-primary pl-4 font-display italic text-lg text-foreground/85 whitespace-pre-line">{st.bio}</blockquote>
      ) : (
        <p className="text-sm text-muted-foreground">{owner ? "Add a statement with “Edit file”." : "No statement given."}</p>
      )}

      {(socials.length > 0 || st.website) && (
        <div className="flex flex-wrap gap-3">
          {socials.map((s) => <span key={s.label} className="case-label text-[9px] border border-border px-2 py-1">{s.label}: {s.value}</span>)}
          {st.website && /^https?:\/\//i.test(st.website) && (
            <a href={st.website} target="_blank" rel="noopener noreferrer nofollow" className="case-label text-[9px] border border-border px-2 py-1 hover:text-primary">Website ↗</a>
          )}
        </div>
      )}

      <div className="case-file p-4">
        <p className="case-label text-[9px] mb-2">Favourite file</p>
        {st.favorite ? (
          <button onClick={() => navigate(storyHref(st.favorite!.title))} className="flex items-center gap-4 text-left w-full group">
            {st.favorite.cover_image_url && <img src={st.favorite.cover_image_url} alt="" className="w-14 h-[70px] object-cover grayscale group-hover:grayscale-0 transition-all" />}
            <span className="font-display text-xl text-foreground group-hover:text-primary">{st.favorite.title}</span>
          </button>
        ) : (
          <p className="text-sm text-muted-foreground">None chosen.</p>
        )}
        {owner && (
          <div className="mt-3">
            {picking ? (
              <select
                autoFocus
                className="w-full px-3 py-2 bg-background border border-border text-foreground text-sm"
                value={st.favorite?.id || ""}
                onChange={async (e) => { await onSave({ favorite_chapter_id: e.target.value || null }); setPicking(false); }}
              >
                <option value="">— No favourite —</option>
                {(files || []).map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
              </select>
            ) : (
              <button onClick={() => setPicking(true)} className="case-label text-[9px] hover:text-primary">Change favourite →</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const LOG_TEXT: Record<DossierLogEntry["type"], string> = {
  comment: "Gave testimony on",
  thread: "Opened a thread:",
  commendation: "Commendation declassified:",
  case_closed: "Closed the case",
  read: "Read",
};

const FieldLog: React.FC<{ entries: DossierLogEntry[] }> = ({ entries }) => {
  const navigate = useNavigate();
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">Nothing logged yet.</p>;
  return (
    <ol className="relative border-l border-border ml-2 space-y-5">
      {entries.map((e, i) => {
        const label = e.type === "commendation" ? COMMENDATION_MAP[e.key || ""]?.title || "Commendation" : e.title || "a case file";
        const go = () => {
          if (e.type === "thread" && e.post_id) navigate(`/forum/${e.post_id}`);
          else if (e.type === "commendation") navigate("/commendations");
          else navigate(storyHref(e.title));
        };
        return (
          <li key={`${e.type}-${e.at}-${i}`} className="pl-5 relative cf-rise" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
            <span className={`absolute -left-[5px] top-1.5 w-[9px] h-[9px] border ${e.type === "commendation" || e.type === "case_closed" ? "bg-primary border-primary" : "bg-card border-foreground/50"}`} />
            <p className="case-label text-[8px]">{relTime(e.at)}</p>
            <p className="text-sm text-foreground mt-0.5">
              {LOG_TEXT[e.type]}{" "}
              <button onClick={go} className="font-display hover:text-primary">{label}</button>
            </p>
            {e.type === "comment" && e.text && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">“{e.text}”</p>}
          </li>
        );
      })}
    </ol>
  );
};

const DAY_MS = 86400000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const ActivityMap: React.FC<{ activity: Record<string, number>; today: string }> = ({ activity, today }) => {
  const scroller = useRef<HTMLDivElement>(null);
  const { weeks, months, max, activeDays } = useMemo(() => {
    const [y, m, d] = today.split("-").map(Number);
    const end = Date.UTC(y, m - 1, d);
    const weekday = (new Date(end).getUTCDay() + 6) % 7; // Monday = 0
    const start = end - (52 * 7 + weekday) * DAY_MS;
    const weeks: { day: string; count: number; future: boolean }[][] = [];
    const months: { col: number; label: string }[] = [];
    let max = 0;
    let activeDays = 0;
    for (let t = start, col = 0; t <= end + 6 * DAY_MS; t += 7 * DAY_MS, col++) {
      const week: { day: string; count: number; future: boolean }[] = [];
      for (let r = 0; r < 7; r++) {
        const ms = t + r * DAY_MS;
        const day = isoDay(ms);
        const count = activity[day] || 0;
        if (ms <= end) { max = Math.max(max, count); if (count) activeDays++; }
        week.push({ day, count, future: ms > end });
      }
      const first = new Date(t);
      if (first.getUTCDate() <= 7) months.push({ col, label: first.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }) });
      weeks.push(week);
    }
    return { weeks, months, max, activeDays };
  }, [activity, today]);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [weeks]);

  const shade = (n: number) => {
    if (!n) return "hsl(var(--secondary))";
    const k = max ? n / max : 0;
    const a = k > 0.75 ? 1 : k > 0.5 ? 0.75 : k > 0.25 ? 0.5 : 0.3;
    return `hsl(var(--primary) / ${a})`;
  };

  return (
    <div className="case-file p-4 sm:p-5">
      <div ref={scroller} className="overflow-x-auto pb-2" data-lenis-prevent>
        <div className="inline-block">
          <div className="relative h-4 ml-6">
            {months.map((m) => (
              <span key={`${m.col}-${m.label}`} className="absolute case-label text-[8px]" style={{ left: m.col * 13 }}>{m.label}</span>
            ))}
          </div>
          <div className="flex gap-[3px]">
            <div className="flex flex-col gap-[3px] mr-1 w-5">
              {["M", "", "W", "", "F", "", ""].map((l, i) => <span key={i} className="case-label text-[7px] h-[10px] leading-[10px]">{l}</span>)}
            </div>
            {weeks.map((w, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {w.map((c) => (
                  <span
                    key={c.day}
                    title={c.future ? undefined : `${c.day}: ${c.count} ${c.count === 1 ? "entry" : "entries"}`}
                    className="block w-[10px] h-[10px] cf-rise"
                    style={{ background: c.future ? "transparent" : shade(c.count), animationDelay: `${wi * 8}ms` }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
        <span className="case-label text-[8px]">{activeDays} active days this year</span>
        <span className="flex items-center gap-1 case-label text-[8px]">
          Less
          {[0, 0.3, 0.5, 0.75, 1].map((a) => (
            <span key={a} className="inline-block w-[10px] h-[10px]" style={{ background: a ? `hsl(var(--primary) / ${a})` : "hsl(var(--secondary))" }} />
          ))}
          More
        </span>
      </div>
    </div>
  );
};

export default Dossier;
