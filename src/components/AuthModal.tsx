import React, { useState } from "react";
import { Icons } from "@/lib/icons";
import { generateId } from "@/lib/data";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (user: any) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLogin,
}) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
  });
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!formData.email || !formData.password) {
      setError("Please fill in all fields");
      return;
    }

    if (mode === "register" && !formData.name) {
      setError("Please enter your name");
      return;
    }

    // Simulate authentication
    const user = {
      id: generateId(),
      email: formData.email,
      name: mode === "register" ? formData.name : formData.email.split("@")[0],
      isAdmin: formData.email.includes("admin"),
      avatar: null,
    };

    onLogin(user);
    onClose();
  };

  const handleGoogleLogin = () => {
    // Simulate Google OAuth
    const user = {
      id: generateId(),
      email: "user@gmail.com",
      name: "Google User",
      isAdmin: false,
      avatar: null,
    };
    onLogin(user);
    onClose();
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
            ? "Sign in to comment and join discussions"
            : "Create an account to get started"}
        </p>

        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-gray-100 text-gray-800 rounded-lg font-medium transition-colors mb-6"
        >
          <Icons.Google />
          Continue with Google
        </button>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-stone-700"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="px-3 bg-stone-900 text-stone-500 text-sm">or</span>
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
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-medium transition-colors"
          >
            {mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="text-center text-stone-400 mt-6">
          {mode === "login"
            ? "Don't have an account? "
            : "Already have an account? "}
          <button
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="text-sky-400 hover:text-sky-300"
          >
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
};

export default AuthModal;
