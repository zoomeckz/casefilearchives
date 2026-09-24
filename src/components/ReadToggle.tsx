import React from "react";
import { Check } from "lucide-react";

interface Props { isRead: boolean; onToggle: () => void; }

export const ReadToggle: React.FC<Props> = ({ isRead, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={isRead}
    className={`inline-flex items-center gap-2 px-4 py-2 border case-label text-[10px] transition-colors ${
      isRead
        ? "bg-success text-success-foreground border-success"
        : "border-border text-muted-foreground hover:text-foreground hover:border-success"
    }`}
  >
    <span className={`flex h-4 w-4 items-center justify-center border ${isRead ? "border-success-foreground" : "border-current"}`}>
      {isRead && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
    {isRead ? "Marked as read" : "Mark as read"}
  </button>
);
