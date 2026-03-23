import React, { useRef } from "react";

interface FormatToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
}

export const FormatToolbar: React.FC<FormatToolbarProps> = ({ textareaRef, value, onChange }) => {
  const wrapSelection = (before: string, after: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.substring(start, end);
    const replacement = selected
      ? `${before}${selected}${after}`
      : `${before}text${after}`;
    const newValue = value.substring(0, start) + replacement + value.substring(end);
    onChange(newValue);
    // Restore cursor after the wrapped text
    setTimeout(() => {
      textarea.focus();
      const cursorPos = selected
        ? start + replacement.length
        : start + before.length;
      const cursorEnd = selected
        ? start + replacement.length
        : start + before.length + 4; // select "text"
      textarea.setSelectionRange(cursorPos, cursorEnd);
    }, 0);
  };

  const insertAtCursor = (text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const newValue = value.substring(0, start) + text + value.substring(start);
    onChange(newValue);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  const buttons = [
    { label: "B", title: "Bold", action: () => wrapSelection("**", "**"), className: "font-bold" },
    { label: "I", title: "Italic", action: () => wrapSelection("*", "*"), className: "italic" },
    { label: "🔗", title: "Link", action: () => insertAtCursor("[link text](https://url)") },
    { label: "🖼️", title: "Image", action: () => insertAtCursor("![description](https://image-url)") },
    { label: "•", title: "Bullet point", action: () => insertAtCursor("\n• "), className: "text-lg" },
  ];

  return (
    <div className="flex items-center gap-1 mb-1">
      {buttons.map((btn) => (
        <button
          key={btn.title}
          type="button"
          title={btn.title}
          onClick={btn.action}
          className={`px-2.5 py-1 rounded text-sm bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border/50 transition-colors ${btn.className || ""}`}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
};

export default FormatToolbar;
