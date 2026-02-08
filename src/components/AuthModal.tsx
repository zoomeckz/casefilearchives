import React, { useState } from "react";
import { Icons } from "@/lib/icons";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { dbAuth } from "@/lib/dbFetch";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
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
      const { error } = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (error) throw error;
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

        const { data, error: authError } = await dbAuth('signup', {
          email: formData.email,
          password: formData.password,
          name: formData.name,
        });

        if (authError) throw new Error(authError);

        // If signup returns a session, set it
        if (data?.access_token) {
          await supabase.auth.setSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
          });
        }
      } else {
        const { data, error: authError } = await dbAuth('signin', {
          email: formData.email,
          password: formData.password,
        });

        if (authError) throw new Error(authError);

        // Set the session in supabase client
        if (data?.access_token) {
          await supabase.auth.setSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
          });
        }
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
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-stone-900 rounded-2xl shadow-2xl w-full max-w-md p-8 border border-stone-700 animate-fade-in">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-stone-500 hover:text-stone-300"
        >
          <Icons.Close />
        </button>

        <h2 className="font-display text-2xl text-amber-100 mb-2">
          {mode === "login" ? "Welcome Back" : "Join the Community"}
        </h2>
        <p className="text-stone-400 mb-6">
          {mode === "login"
            ? "Sign in to comment and track your reading progress"
            : "Create an account to get started"}
        </p>

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-3 bg-white hover:bg-gray-100 disabled:bg-gray-200 disabled:cursor-not-allowed text-gray-800 rounded-lg font-medium transition-colors mb-6"
        >
          <Icons.Google className="w-5 h-5" />
          Continue with Google
        </button>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-stone-700"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-stone-900 text-stone-500">or</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="block text-stone-300 text-sm mb-2">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full px-4 py-3 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-sky-500 transition-colors"
                placeholder="Your name"
                disabled={loading}
              />
            </div>
          )}

          <div>
            <label className="block text-stone-300 text-sm mb-2">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="w-full px-4 py-3 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-sky-500 transition-colors"
              placeholder="your@email.com"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-stone-300 text-sm mb-2">
              Password
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              className="w-full px-4 py-3 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-sky-500 transition-colors"
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:bg-sky-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="text-center text-stone-400 mt-6">
          {mode === "login"
            ? "Don't have an account? "
            : "Already have an account? "}
          <button
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="text-sky-400 hover:text-sky-300"
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
