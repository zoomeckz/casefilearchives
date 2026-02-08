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
            Hey — I'm <strong className="text-foreground">Sam Nowroozi Larki</strong>, 
            the writer behind Sedorium. In my spare time, I draw from real-life experiences, 
            anime, music, and other mediums to build a world that feels alive — 
            one that's as raw and unpredictable as the things that inspire it. 
            My goal is to create something vivid, layered, and unapologetically immersive.
          </p>
          <p>
            Sedorium is an ongoing fantasy series that blends dark themes with deep 
            world-building and characters you won't forget. New chapters are published 
            when they're ready — quality over quantity, always.
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
