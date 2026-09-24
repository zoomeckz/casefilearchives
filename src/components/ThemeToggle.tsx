import React, { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem("case-file-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("case-file-theme", theme);
  }, [theme]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className="h-9 w-9 rounded-none border border-border text-muted-foreground hover:text-foreground"
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
};
