import React from "react";

export const AboutPage: React.FC = () => {
  return (
    <div className="min-h-screen py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-display text-4xl text-accent mb-8 text-center">
          About
        </h1>

        <div className="space-y-6 text-foreground/80 leading-relaxed">
          <p>
            Hey — I'm <strong className="text-foreground">AnyoneButSam</strong>, 
            the writer behind Case Files. I draw from real-life experiences, anime,
            music, and other mediums to create standalone situations that feel raw,
            unpredictable, and uncomfortably possible.
          </p>
          <p>
            Every case is independent. There is no required order, shared world, or
            continuity to learn — just a new premise to open and investigate.
          </p>
        </div>

        <div className="mt-12 pt-8 border-t border-border">
          <h2 className="font-display text-xl text-accent mb-6">Connect</h2>
          <div className="flex flex-col gap-4">
            <a
              href="https://instagram.com/anyonebutsam"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-muted-foreground hover:text-primary transition-colors"
            >
              <span className="text-sm">Instagram</span>
              <span className="text-xs text-muted-foreground/60">@anyonebutsam</span>
            </a>
            <a
              href="https://tiktok.com/@anyonebutsam"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-muted-foreground hover:text-primary transition-colors"
            >
              <span className="text-sm">TikTok</span>
              <span className="text-xs text-muted-foreground/60">@anyonebutsam</span>
            </a>
            <a
              href="mailto:sam.nowroozi@gmail.com"
              className="flex items-center gap-3 text-muted-foreground hover:text-primary transition-colors"
            >
              <span className="text-sm">Email</span>
              <span className="text-xs text-muted-foreground/60">sam.nowroozi@gmail.com</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
