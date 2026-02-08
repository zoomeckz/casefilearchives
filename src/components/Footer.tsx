import React from "react";

interface FooterProps {
  setCurrentPage: (page: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ setCurrentPage }) => {
  return (
    <footer className="border-t border-border/50 py-12 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <p className="font-display text-lg text-accent mb-4">SEDORIUM</p>
        <p className="text-muted-foreground text-sm mb-6">
          Written by Sam Nowroozi Larki
        </p>
        <div className="flex justify-center gap-4 mb-6">
          <a
            href="https://instagram.com/anyonebutsam"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors text-sm"
          >
            Instagram
          </a>
          <span className="text-muted-foreground">·</span>
          <a
            href="https://tiktok.com/@anyonebutsam"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors text-sm"
          >
            TikTok
          </a>
        </div>
        <div className="flex justify-center gap-6 text-muted-foreground text-sm">
          <span>© {new Date().getFullYear()}</span>
          <span>·</span>
          <button onClick={() => setCurrentPage("about")} className="hover:text-primary transition-colors">
            About
          </button>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
