import React, { useState } from "react";
import { Icons } from "@/lib/icons";
import { lovable } from "@/integrations/lovable/index";
import { dbAuthEmail } from "@/lib/dbFetch";
import i18n from "i18next";
const t = (k: string) => i18n.t(`ui.${k}`);

const NAME_MAX = 40;
const PASSWORD_MIN = 8;

type SignUpResult = void | { needsConfirmation?: boolean; alreadyRegistered?: boolean };

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string, name: string) => Promise<SignUpResult>;
}

/** login / register; "forgot" asks for a reset link; "sent" tells the reader to check their inbox. */
type Mode = "login" | "register" | "forgot" | "sent";

/** Server messages in plain words. */
function friendly(message: string): { text: string; unconfirmed?: boolean } {
  if (/email not confirmed/i.test(message)) return { text: "Confirm your email address first. We sent you a link when you registered.", unconfirmed: true };
  if (/invalid login credentials/i.test(message)) return { text: "Wrong email or password." };
  if (/already registered|already exists/i.test(message)) return { text: "An account with this email already exists. Sign in instead, or reset your password." };
  if (/password should be at least|weak password/i.test(message)) return { text: `Choose a longer password (at least ${PASSWORD_MIN} characters).` };
  if (/rate limit|too many|security purposes/i.test(message)) return { text: "Too many attempts. Wait a minute and try again." };
  if (/invalid.*email|unable to validate email/i.test(message)) return { text: "That email address doesn't look right." };
  return { text: message };
}

/** Usernames are unique (ignoring capitals). Null when the check is unavailable. */
async function nameStatus(name: string): Promise<{ name: string; available: boolean } | null> {
  try {
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/cf_name_status`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ _name: name }),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onSignIn,
  onSignUp,
}) => {
  const [mode, setMode] = useState<Mode>("login");
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
  });
  const [error, setError] = useState("");
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [notice, setNotice] = useState("");
  const [sentKind, setSentKind] = useState<"confirm" | "reset">("confirm");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const go = (next: Mode) => {
    setMode(next);
    setError("");
    setNotice("");
    setUnconfirmed(false);
  };

  const close = () => {
    go("login");
    onClose();
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setLoading(true);
    try {
      const result: any = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result?.error) throw result.error;
      if (!result?.redirected) window.location.reload();
    } catch (err: any) {
      setError(err.message || "Failed to sign in with Google");
      setLoading(false);
    }
  };

  const resendConfirmation = async () => {
    if (!formData.email) return;
    setLoading(true);
    const { error: err } = await dbAuthEmail("resend", formData.email.trim());
    setLoading(false);
    if (err) setError(friendly(err).text);
    else { setError(""); setUnconfirmed(false); setNotice("A new confirmation link is on its way. Check your inbox (and the spam folder)."); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setUnconfirmed(false);
    setLoading(true);
    const email = formData.email.trim();

    try {
      if (mode === "forgot") {
        if (!email) throw new Error("Enter the email address you registered with.");
        const { error: err } = await dbAuthEmail("recover", email);
        if (err) throw new Error(err);
        setSentKind("reset");
        setMode("sent");
        setLoading(false);
        return;
      }

      if (!email || !formData.password) {
        throw new Error("Please fill in all fields");
      }

      if (mode === "register") {
        const name = formData.name.trim();
        if (!name) throw new Error("Please enter your name");
        const status = await nameStatus(name.slice(0, NAME_MAX));
        if (status && !status.available) throw new Error(`The username “${status.name}” is already taken. Choose another one.`);
        if (formData.password.length < PASSWORD_MIN) throw new Error(`Choose a password of at least ${PASSWORD_MIN} characters.`);
        const result = await onSignUp(email, formData.password, name.slice(0, NAME_MAX));
        if (result && result.alreadyRegistered) {
          throw new Error("An account with this email already exists. Sign in instead, or reset your password.");
        }
        if (result && result.needsConfirmation) {
          // No session until the email address is confirmed: say so instead of closing quietly.
          setFormData({ ...formData, password: "" });
          setSentKind("confirm");
          setMode("sent");
          setLoading(false);
          return;
        }
      } else {
        await onSignIn(email, formData.password);
      }

      setFormData({ email: "", password: "", name: "" });
      setLoading(false);
      onSuccess();
      close();
    } catch (err: any) {
      console.error("Auth error:", err);
      const f = friendly(err.message || "An error occurred");
      setError(f.text);
      setUnconfirmed(!!f.unconfirmed);
      setLoading(false);
    }
  };

  const field = "w-full px-4 py-3 bg-background border border-border rounded-none text-foreground focus:outline-none focus:border-primary transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-foreground/70 backdrop-blur-sm"
        onClick={close}
      />
      <div className="case-file relative bg-card w-full max-w-md p-8 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button
          onClick={close}
          aria-label="Close"
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <Icons.Close />
        </button>

        <p className="case-label text-[9px] mb-2">{t('identity')}</p>

        {mode === "sent" ? (
          <div aria-live="polite">
            <h2 id="auth-title" className="font-display text-2xl text-foreground mb-2 uppercase">Check your inbox</h2>
            <p className="text-muted-foreground mb-4">
              {sentKind === "confirm"
                ? <>We sent a confirmation link to <span className="text-foreground break-all">{formData.email.trim()}</span>. Open it to activate your account; it signs you in and brings you back here.</>
                : <>If an account exists for <span className="text-foreground break-all">{formData.email.trim()}</span>, a link to choose a new password is on its way.</>}
            </p>
            <p className="text-xs text-muted-foreground mb-6">Nothing after a few minutes? Check the spam folder.</p>
            {notice && <p className="text-sm text-foreground mb-4">{notice}</p>}
            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            <div className="flex flex-wrap gap-3">
              {sentKind === "confirm" && (
                <button type="button" onClick={resendConfirmation} disabled={loading}
                  className="px-4 py-2 border border-border text-sm hover:border-primary hover:text-primary disabled:opacity-50">
                  {loading ? "Sending…" : "Send the link again"}
                </button>
              )}
              <button type="button" onClick={() => go("login")} className="px-4 py-2 bg-primary text-primary-foreground text-sm uppercase tracking-widest">
                Back to sign in
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 id="auth-title" className="font-display text-2xl text-foreground mb-2 uppercase">
              {mode === "login" ? "Welcome Back" : mode === "register" ? "Join the Community" : "Reset your password"}
            </h2>
            <p className="text-muted-foreground mb-6">
              {mode === "login"
                ? "Sign in to save stories and contribute to reader statistics"
                : mode === "register"
                  ? "Create an account to save your reading history and preferences"
                  : "Enter the email you registered with and we'll send you a link to choose a new password."}
            </p>

            {mode !== "forgot" && (
              <>
                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 py-3 bg-foreground hover:bg-foreground/85 disabled:opacity-50 text-background rounded-none font-medium transition-colors mb-6"
                >
                  <Icons.Google className="w-5 h-5" />
                  Continue with Google
                </button>

                <div className="relative mb-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-card text-muted-foreground">or</span>
                  </div>
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {mode === "register" && (
                <div>
                  <label htmlFor="auth-name" className="block text-foreground text-sm mb-2">{t('name')}</label>
                  <input
                    id="auth-name"
                    type="text"
                    autoComplete="nickname"
                    maxLength={NAME_MAX}
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className={field}
                    placeholder={t('yourName')}
                    disabled={loading}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Your unique username, shown on comments and forum posts. You can change it once a month.</p>
                </div>
              )}

              <div>
                <label htmlFor="auth-email" className="block text-foreground text-sm mb-2">{t('email')}</label>
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className={field}
                  placeholder="your@email.com"
                  disabled={loading}
                />
              </div>

              {mode !== "forgot" && (
                <div>
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <label htmlFor="auth-password" className="block text-foreground text-sm">
                      Password
                    </label>
                    {mode === "login" && (
                      <button type="button" onClick={() => go("forgot")} className="text-xs text-muted-foreground hover:text-primary" disabled={loading}>
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input
                    id="auth-password"
                    type="password"
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                    minLength={mode === "register" ? PASSWORD_MIN : undefined}
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    className={field}
                    placeholder="••••••••"
                    disabled={loading}
                  />
                  {mode === "register" && <p className="text-[11px] text-muted-foreground mt-1">At least {PASSWORD_MIN} characters.</p>}
                </div>
              )}

              {error && (
                <div className="text-sm" aria-live="assertive">
                  <p className="text-red-400">{error}</p>
                  {unconfirmed && (
                    <button type="button" onClick={resendConfirmation} disabled={loading} className="mt-2 text-primary hover:text-primary/80">
                      Send the confirmation link again
                    </button>
                  )}
                </div>
              )}
              {notice && <p className="text-sm text-foreground" aria-live="polite">{notice}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-none font-medium uppercase tracking-widest transition-colors"
              >
                {loading ? "Please wait..." : mode === "login" ? "Sign In" : mode === "register" ? "Create Account" : "Send reset link"}
              </button>
            </form>

            <p className="text-center text-muted-foreground mt-6">
              {mode === "forgot" ? (
                <button onClick={() => go("login")} className="text-primary hover:text-primary/80" disabled={loading}>Back to sign in</button>
              ) : (
                <>
                  {mode === "login"
                    ? "Don't have an account? "
                    : "Already have an account? "}
                  <button
                    onClick={() => go(mode === "login" ? "register" : "login")}
                    className="text-primary hover:text-primary/80"
                    disabled={loading}
                  >
                    {mode === "login" ? "Sign up" : "Sign in"}
                  </button>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
