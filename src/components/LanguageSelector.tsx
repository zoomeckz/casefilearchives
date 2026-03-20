import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icons } from "@/lib/icons";

interface LanguageSelectorProps {
  language: string;
  availableLanguages: { code: string; label: string; flag: string }[];
  onSwitch: (code: string) => void;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  language,
  availableLanguages,
  onSwitch,
}) => {
  const current = availableLanguages.find((l) => l.code === language);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors text-sm">
          <Icons.Globe className="w-4 h-4" />
          <span>{current?.flag}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        {availableLanguages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => onSwitch(lang.code)}
            className={lang.code === language ? "text-primary font-medium" : ""}
          >
            <span className="mr-2">{lang.flag}</span>
            {lang.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
