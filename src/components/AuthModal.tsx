import React, { useState } from "react";
import { Icons } from "@/lib/icons";
import { lovable } from "@/integrations/lovable/index";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string, name: string) => Promise<void>;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onSignIn,
  onSignUp,
}) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!formData.email || !formData.password) {
        throw new Error("Please fill in all fields");
      }

      if (mode === "register") {
        if (!formData.name) {
          throw new Error("Please enter your name");
        }
        await onSignUp(formData.email, formData.password, formData.name);
      } else {
        await onSignIn(formData.email, formData.password);
      }

      setFormData({ email: "", password: "", name: "" });
      setLoading(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Auth error:", err);
      setError(err.message || "An error occurred");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-foreground/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="case-file relative bg-card w-full max-w-md p-8 animate-fade-in">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <Icons.Close />
        </button>

        <p className="case-label text-[9px] mb-2">Identity verification</p>
        <h2 className="font-display text-2xl text-foreground mb-2 uppercase">
          {mode === "login" ? "Welcome Back" : "Join the Community"}
        </h2>
        <p className="text-muted-foreground mb-6">
          {mode === "login"
            ? "Sign in to save stories and contribute to reader statistics"
            : "Create an account to save your reading history and preferences"}
        </p>

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

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="block text-foreground text-sm mb-2">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full px-4 py-3 bg-background border border-border rounded-none text-foreground focus:outline-none focus:border-primary transition-colors"
                placeholder="Your name"
                disabled={loading}
              />
            </div>
          )}

          <div>
            <label className="block text-foreground text-sm mb-2">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="w-full px-4 py-3 bg-background border border-border rounded-none text-foreground focus:outline-none focus:border-primary transition-colors"
              placeholder="your@email.com"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-foreground text-sm mb-2">
              Password
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              className="w-full px-4 py-3 bg-background border border-border rounded-none text-foreground focus:outline-none focus:border-primary transition-colors"
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-none font-medium uppercase tracking-widest transition-colors"
          >
            {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="text-center text-muted-foreground mt-6">
          {mode === "login"
            ? "Don't have an account? "
            : "Already have an account? "}
          <button
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="text-primary hover:text-primary/80"
            disabled={loading}
          >
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
};

export default AuthModal;
