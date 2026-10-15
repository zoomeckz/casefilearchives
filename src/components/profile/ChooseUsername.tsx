import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Readers who signed up with Google start with the name on their Google account.
 * Until they pick a username (or keep that one), profiles.name_chosen is false and
 * they are offered the choice: a banner on every page and a card on their profile.
 * The first pick is free; after that the usual once-a-month limit applies.
 */

const listeners = new Set<() => void>();
/** Tells every open prompt that the reader has chosen. */
const announceChosen = () => listeners.forEach((fn) => fn());

/** null while loading, or when the database has no name_chosen column yet. */
export function useNameChosen(userId?: string | null) {
  const [chosen, setChosen] = useState<boolean | null>(null);
  useEffect(() => {
    setChosen(null);
    if (!userId) return;
    let cancelled = false;
    (supabase.from("profiles") as any).select("name_chosen").eq("user_id", userId).maybeSingle()
      .then(({ data, error }: any) => {
        if (!cancelled && !error && data && typeof data.name_chosen === "boolean") setChosen(data.name_chosen);
      });
    const onChosen = () => setChosen(true);
    listeners.add(onChosen);
    return () => { cancelled = true; listeners.delete(onChosen); };
  }, [userId]);
  return chosen;
}

type Check = { state: "idle" | "checking" | "free" | "taken"; name?: string };

export const ChooseUsername: React.FC<{
  userId: string;
  currentName: string;
  onDone?: (name: string) => void;
  className?: string;
}> = ({ userId, currentName, onDone, className = "" }) => {
  const [name, setName] = useState("");
  const [check, setCheck] = useState<Check>({ state: "idle" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim().replace(/\s+/g, " ");

  // Live availability check while typing.
  useEffect(() => {
    if (!trimmed || trimmed.toLowerCase() === currentName.trim().toLowerCase()) { setCheck({ state: "idle" }); return; }
    setCheck({ state: "checking" });
    const t = window.setTimeout(async () => {
      const { data } = await (supabase as any).rpc("cf_name_status", { _name: trimmed });
      if (!data) { setCheck({ state: "idle" }); return; }
      setCheck({ state: data.available ? "free" : "taken", name: data.name });
    }, 350);
    return () => window.clearTimeout(t);
  }, [trimmed, currentName]);

  const save = async (keep: boolean) => {
    setBusy(true);
    setError(null);
    const patch = keep ? { name_chosen: true } : { name: trimmed, name_chosen: true };
    const { error: err } = await (supabase.from("profiles") as any).update(patch).eq("user_id", userId);
    setBusy(false);
    if (err) {
      setError(/name_taken|duplicate key/i.test(err.message || "") ? "That username is already taken. Choose another one." : err.message || "Couldn't save. Try again.");
      return;
    }
    announceChosen();
    onDone?.(keep ? currentName : trimmed);
  };

  const canSave = !!trimmed && !busy && check.state !== "taken" && check.state !== "checking";

  return (
    <section className={`case-file p-5 sm:p-6 ${className}`}>
      <p className="case-label text-[9px] mb-2">Choose your username</p>
      <p className="text-sm text-muted-foreground mb-4">
        Right now you appear as <span className="text-foreground font-medium">{currentName}</span> on your file, comments and forum posts.
        Pick the name you want readers to see. This first choice is free; after that you can change it once a month.
      </p>
      <form className="flex flex-col sm:flex-row gap-2" onSubmit={(e) => { e.preventDefault(); if (canSave) void save(false); }}>
        <input
          type="text"
          value={name}
          maxLength={40}
          autoComplete="nickname"
          placeholder="Username"
          aria-label="Username"
          onChange={(e) => { setError(null); setName(e.target.value); }}
          className="flex-1 min-w-0 px-3 py-2 bg-background border border-border text-foreground focus:outline-none focus:border-primary"
        />
        <button type="submit" disabled={!canSave}
          className="shrink-0 whitespace-nowrap px-5 py-2 bg-primary hover:bg-primary/85 disabled:opacity-50 text-primary-foreground text-sm">
          {busy ? "Saving…" : "Save username"}
        </button>
      </form>
      <div className="mt-2 min-h-[1.25rem] text-xs">
        {error ? <span className="text-destructive">{error}</span>
          : check.state === "checking" ? <span className="text-muted-foreground">Checking…</span>
          : check.state === "taken" ? <span className="text-destructive">“{check.name}” is already taken.</span>
          : check.state === "free" ? <span className="text-emerald-500">“{check.name}” is available.</span>
          : null}
      </div>
      <button type="button" disabled={busy} onClick={() => void save(true)}
        className="mt-1 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50">
        Keep “{currentName}”
      </button>
    </section>
  );
};

/** Small banner shown on other pages until the reader has chosen. */
export const ChooseUsernameBanner: React.FC<{ userId: string; currentName: string; onChoose: () => void }> = ({ userId, currentName, onChoose }) => {
  const chosen = useNameChosen(userId);
  const key = `cf-username-later:${userId}`;
  const [later, setLater] = useState(() => { try { return sessionStorage.getItem(key) === "1"; } catch { return false; } });
  if (chosen !== false || later) return null;
  return (
    <div role="status" className="fixed z-40 bottom-4 left-4 right-4 sm:left-auto sm:max-w-sm bg-card border border-border shadow-2xl p-4 text-sm">
      <p className="font-medium text-foreground mb-1">Choose your username</p>
      <p className="text-muted-foreground mb-3">You currently appear as “{currentName}”. Pick the name readers see on your file and posts.</p>
      <div className="flex gap-2">
        <button type="button" onClick={onChoose} className="whitespace-nowrap px-4 py-1.5 bg-primary hover:bg-primary/85 text-primary-foreground text-xs">Choose username</button>
        <button type="button" onClick={() => { try { sessionStorage.setItem(key, "1"); } catch { /* ignore */ } setLater(true); }}
          className="whitespace-nowrap px-4 py-1.5 border border-border hover:border-foreground/50 text-xs">Later</button>
      </div>
    </div>
  );
};
