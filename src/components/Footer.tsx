import React from "react";

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-stone-800/50 py-12 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <p className="font-display text-lg text-amber-100 mb-2">Sedorium</p>
        <p className="text-stone-500 text-sm mb-6">
          A fantasy epic of druids, kingdoms, and ancient power.
        </p>
        <div className="flex justify-center gap-6 text-stone-500 text-sm">
          <span>© 2024</span>
          <span>·</span>
          <button className="hover:text-sky-400 transition-colors">
            About
          </button>
          <span>·</span>
          <button className="hover:text-sky-400 transition-colors">
            Contact
          </button>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
