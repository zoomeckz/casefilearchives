import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AuthUser } from "@/hooks/useAuth";
import { ProfileFrame } from "@/components/ProfileFrame";
import { CommendationBadge } from "@/components/commendations/CommendationBadge";
import { useCommendations } from "@/components/commendations/CommendationsProvider";
import {
  CATEGORY_LABELS, CATEGORY_ORDER, COMMENDATIONS, FRAME_LABELS, ROMAN,
  cfApi, clearanceFor, pointsFor, progressFor, type Commendation,
} from "@/lib/commendations";
import "@/components/commendations/commendations.css";

interface Props {
  user: AuthUser;
  refreshUser?: () => void;
}

const RECENT_MS = 24 * 3600 * 1000;

export const CommendationsPage: React.FC<Props> = ({ user, refreshUser }) => {
  const { unlocked, stats, ready, refresh } = useCommendations();
  const [frame, setFrame] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const loadOwn = useCallback(async () => {
    try {
      const d = await cfApi.dossier(user.id);
      if (!d) return;
      setFrame(d.selected_frame);
      setTitle(d.settings?.selected_title ?? null);
      setPinned(d.settings?.pinned ?? []);
    } catch { /* not available yet */ }
  }, [user.id]);

  useEffect(() => { void loadOwn(); void refresh(); }, [loadOwn]); // eslint-disable-line react-hooks/exhaustive-deps

  const points = pointsFor(unlocked.keys());
  const clearance = clearanceFor(points);
  const unlockedFrames = COMMENDATIONS.filter((c) => c.frame && unlocked.has(c.key));
  const unlockedTitles = COMMENDATIONS.filter((c) => c.rewardTitle && unlocked.has(c.key));
  const nextPct = clearance.next ? ((points - clearance.min) / (clearance.next.min - clearance.min)) * 100 : 100;

  const byCategory = useMemo(
    () => CATEGORY_ORDER.map((cat) => ({ cat, items: COMMENDATIONS.filter((c) => c.category === cat) })),
    [],
  );

  const chooseFrame = async (f: string | null) => {
    setSaving(true);
    try {
      await cfApi.setFrame(user.id, f);
      setFrame(f);
      refreshUser?.();
      toast.success(f ? `${FRAME_LABELS[f] || f} frame issued to your file` : "Frame removed");
    } catch (e: any) {
      toast.error(e.message === "frame_locked" ? "That frame is still classified." : "Could not update your frame.");
    } finally { setSaving(false); }
  };

  const chooseTitle = async (t: string | null) => {
    setSaving(true);
    try {
      await cfApi.saveSettings(user.id, { selected_title: t });
      setTitle(t);
      toast.success(t ? `Title set: ${t}` : "Title removed");
    } catch (e: any) {
      toast.error(e.message === "title_locked" ? "That title is still classified." : "Could not update your title.");
    } finally { setSaving(false); }
  };

  const togglePin = async (key: string) => {
    const next = pinned.includes(key) ? pinned.filter((k) => k !== key) : [...pinned, key].slice(-3);
    setPinned(next);
    try { await cfApi.saveSettings(user.id, { pinned: next }); }
    catch { toast.error("Could not update your showcase."); void loadOwn(); }
  };

  return (
    <div className="min-h-screen py-10 sm:py-16 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <header className="border-l-4 border-primary pl-6 mb-10">
          <p className="case-label text-[9px] mb-2">Personnel file / commendations</p>
          <h1 className="font-display text-4xl sm:text-5xl text-foreground uppercase">Commendations</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm sm:text-base">
            Every commendation raises your clearance. Some issue frames and titles for your personnel file.
          </p>
        </header>

        {/* Clearance */}
        <section className="case-file p-5 sm:p-7 mb-10 grid gap-6 md:grid-cols-[auto_1fr] items-center">
          <div className="flex items-center gap-5">
            <ProfileFrame avatarUrl={user.avatarUrl} name={user.name} frame={frame} size={84} />
            <div className="relative w-24 h-24 flex items-center justify-center border-4 border-primary text-primary rotate-[-6deg] cf-stamp-in">
              <span className="font-display text-4xl">{ROMAN[clearance.level]}</span>
              <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-card px-1 case-label !text-primary text-[8px] whitespace-nowrap">Clearance</span>
            </div>
          </div>
          <div>
            <p className="case-label text-[9px]">Current clearance</p>
            <p className="font-display text-2xl sm:text-3xl text-foreground uppercase">{clearance.name}</p>
            <div className="mt-3 h-2 bg-secondary overflow-hidden">
              <div className="h-full bg-primary cf-fill" style={{ width: `${Math.min(100, nextPct)}%` }} />
            </div>
            <div className="flex flex-wrap justify-between gap-2 mt-2 case-label text-[9px]">
              <span>{points} merit points · {unlocked.size}/{COMMENDATIONS.length} commendations</span>
              <span>{clearance.next ? `${clearance.next.min - points} to ${ROMAN[clearance.next.level]} · ${clearance.next.name}` : "Highest clearance"}</span>
            </div>
          </div>
        </section>

        {/* Issued rewards */}
        <section className="grid gap-6 lg:grid-cols-2 mb-14">
          <div className="case-file p-5">
            <p className="case-label text-[9px] mb-4">Frames</p>
            <div className="flex flex-wrap gap-4">
              <FrameChoice active={!frame} label="None" disabled={saving} onClick={() => chooseFrame(null)}>
                <ProfileFrame avatarUrl={user.avatarUrl} name={user.name} frame={null} size={52} />
              </FrameChoice>
              {COMMENDATIONS.filter((c) => c.frame).map((c) => {
                const owned = unlocked.has(c.key);
                return (
                  <FrameChoice key={c.key} active={frame === c.frame} label={FRAME_LABELS[c.frame!] || c.frame!}
                    locked={!owned} hint={owned ? undefined : `Requires ${c.title}`} disabled={saving || !owned}
                    onClick={() => chooseFrame(c.frame!)}>
                    <ProfileFrame avatarUrl={user.avatarUrl} name={user.name} frame={c.frame!} size={52} />
                  </FrameChoice>
                );
              })}
            </div>
          </div>
          <div className="case-file p-5">
            <p className="case-label text-[9px] mb-4">Titles</p>
            <div className="flex flex-wrap gap-2">
              <TitleChip active={!title} disabled={saving} onClick={() => chooseTitle(null)}>No title</TitleChip>
              {COMMENDATIONS.filter((c) => c.rewardTitle).map((c) => {
                const owned = unlocked.has(c.key);
                return (
                  <TitleChip key={c.key} active={title === c.rewardTitle} disabled={saving || !owned} locked={!owned}
                    hint={owned ? undefined : `Requires ${c.title}`} onClick={() => chooseTitle(c.rewardTitle!)}>
                    {c.rewardTitle}
                  </TitleChip>
                );
              })}
            </div>
            {unlockedFrames.length === 0 && unlockedTitles.length === 0 && (
              <p className="text-xs text-muted-foreground mt-4">Frames and titles are issued with certain commendations.</p>
            )}
          </div>
        </section>

        {!ready && <p className="case-label text-[10px] mb-6">Retrieving your file…</p>}

        {byCategory.map(({ cat, items }) => (
          <section key={cat} className="mb-12">
            <div className="flex items-end justify-between border-b border-border pb-3 mb-6">
              <h2 className="font-display text-2xl text-foreground uppercase">{CATEGORY_LABELS[cat]}</h2>
              <span className="case-label text-[9px]">{items.filter((c) => unlocked.has(c.key)).length}/{items.length}</span>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((c, i) => (
                <CommendationCard
                  key={c.key}
                  c={c}
                  index={i}
                  unlockedAt={unlocked.get(c.key) || null}
                  progress={progressFor(c.key, stats)}
                  pinned={pinned.includes(c.key)}
                  onPin={() => togglePin(c.key)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

const FrameChoice: React.FC<{
  active: boolean; label: string; locked?: boolean; hint?: string; disabled?: boolean; onClick: () => void; children: React.ReactNode;
}> = ({ active, label, locked, hint, disabled, onClick, children }) => (
  <button type="button" onClick={onClick} disabled={disabled} title={hint}
    className={`flex flex-col items-center gap-2 p-2 border transition-colors ${active ? "border-primary bg-primary/10" : "border-transparent hover:border-border"} ${locked ? "opacity-35 grayscale cursor-not-allowed" : ""}`}>
    {children}
    <span className="case-label text-[8px]">{locked ? "Classified" : label}</span>
  </button>
);

const TitleChip: React.FC<{
  active: boolean; locked?: boolean; hint?: string; disabled?: boolean; onClick: () => void; children: React.ReactNode;
}> = ({ active, locked, hint, disabled, onClick, children }) => (
  <button type="button" onClick={onClick} disabled={disabled} title={hint}
    className={`case-label text-[10px] px-3 py-2 border transition-colors ${active ? "border-primary !text-primary bg-primary/10" : "border-border hover:border-foreground/50"} ${locked ? "opacity-40 cursor-not-allowed" : ""}`}>
    {locked ? <span className="cf-redacted">{children}</span> : children}
  </button>
);

const CommendationCard: React.FC<{
  c: Commendation;
  index: number;
  unlockedAt: string | null;
  progress: { current: number; max: number } | null;
  pinned: boolean;
  onPin: () => void;
}> = ({ c, index, unlockedAt, progress, pinned, onPin }) => {
  const unlocked = !!unlockedAt;
  const recent = unlocked && Date.now() - Date.parse(unlockedAt!) < RECENT_MS;
  const rewards = [c.frame && `${FRAME_LABELS[c.frame]} frame`, c.rewardTitle && `“${c.rewardTitle}” title`].filter(Boolean) as string[];

  return (
    <article
      className={`case-file p-5 flex gap-4 cf-rise ${unlocked ? "cf-sheen" : ""}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="shrink-0 relative">
        <CommendationBadge commendation={c} unlocked={unlocked} size={76} stamp={recent} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-lg leading-tight text-foreground">
            {unlocked
              ? <span className={recent ? "cf-declassify" : ""}>{c.title}</span>
              : <span className="cf-redacted">{c.title}</span>}
          </h3>
          <span className="case-label text-[8px] shrink-0">+{c.points}</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{c.description}</p>

        {!unlocked && progress && progress.max > 1 && (
          <div className="mt-3">
            <div className="h-1.5 bg-secondary overflow-hidden">
              <div className="h-full bg-primary/70 cf-fill" style={{ width: `${(progress.current / progress.max) * 100}%` }} />
            </div>
            <p className="case-label text-[8px] mt-1">{progress.current} / {progress.max}</p>
          </div>
        )}

        {rewards.length > 0 && (
          <p className={`case-label text-[8px] mt-3 ${unlocked ? "!text-foreground/80" : ""}`}>Issues: {rewards.join(" · ")}</p>
        )}

        {unlocked && (
          <div className="flex items-center justify-between gap-2 mt-3">
            <span className="case-label text-[8px] !text-primary">
              Declassified {new Date(unlockedAt!).toLocaleDateString()}
            </span>
            <button type="button" onClick={onPin} className={`case-label text-[8px] border px-2 py-1 transition-colors ${pinned ? "border-primary !text-primary" : "border-border hover:border-foreground/50"}`}>
              {pinned ? "Pinned" : "Pin to profile"}
            </button>
          </div>
        )}
      </div>
    </article>
  );
};

export default CommendationsPage;
