import React from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";

export type ReadingMode = "dark" | "sepia" | "light";

const modes: { id: ReadingMode; label: string; bg: string; fg: string }[] = [
  { id: "dark", label: "Dark", bg: "hsl(24 10% 4%)", fg: "hsl(33 10% 83%)" },
  { id: "sepia", label: "Sepia", bg: "hsl(39 30% 90%)", fg: "hsl(24 20% 15%)" },
  { id: "light", label: "Light", bg: "hsl(0 0% 98%)", fg: "hsl(0 0% 10%)" },
];

interface ReadingModeSelectorProps {
  mode: ReadingMode;
  setMode: (mode: ReadingMode) => void;
}

export const ReadingModeSelector: React.FC<ReadingModeSelectorProps> = ({ mode, setMode }) => {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs">Mode:</span>
      {modes.map(m => (
        <button
          key={m.id}
          onClick={() => setMode(m.id)}
          className={`w-7 h-7 rounded-full border-2 transition-all ${
            mode === m.id ? "border-primary scale-110" : "border-border hover:border-primary/50"
          }`}
          style={{ background: m.bg }}
          title={m.label}
        />
      ))}
    </div>
  );
};

export const getReadingModeStyles = (mode: ReadingMode): React.CSSProperties => {
  switch (mode) {
    case "sepia":
      return { background: "hsl(39 30% 90%)", color: "hsl(24 20% 15%)" };
    case "light":
      return { background: "hsl(0 0% 98%)", color: "hsl(0 0% 10%)" };
    default:
      return {};
  }
};

export function useReadingMode() {
  return useLocalStorage<ReadingMode>("reading-mode", "dark");
}
