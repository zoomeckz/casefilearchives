import React from "react";
import { SectionHeader } from "@/components/SectionHeader";

/**
 * Lightweight in-app "Storybook" page for `<SectionHeader />`.
 *
 * Why an in-app page instead of installing Storybook: the project doesn't ship
 * Storybook (would add ~60MB and a parallel build), and the only thing we need
 * to verify is that the three alignment variants render correctly relative to
 * a column of mock content. A dedicated route gives us that with zero new
 * dependencies and is reachable at `/dev/section-header` in any environment.
 *
 * Each demo deliberately renders a column of left-flushed rows underneath the
 * heading so a misaligned header is immediately visible.
 */
const MockRows: React.FC = () => (
  <div className="flex flex-col gap-2">
    {[1, 2, 3].map((i) => (
      <div
        key={i}
        className="rounded-md border border-border bg-card/50 px-4 py-3 text-sm text-foreground/80"
      >
        Sample content row {i}
      </div>
    ))}
  </div>
);

const Demo: React.FC<{
  align: "left" | "center" | "right";
  label: string;
}> = ({ align, label }) => (
  <section className="rounded-lg border border-border/60 bg-card/30 p-6">
    <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground/60">
      align="{align}"
    </p>
    <SectionHeader align={align} subtitle="Subtitle inherits the same alignment.">
      {label}
    </SectionHeader>
    <MockRows />
  </section>
);

const SectionHeaderStory: React.FC = () => (
  <div className="min-h-screen bg-background text-foreground">
    <div className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="font-display text-2xl text-foreground">
          SectionHeader — alignment story
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Visual reference for the three alignment variants. Use this page when
          adjusting <code>SectionHeader</code> to confirm the heading sits flush
          with the content column it controls.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <Demo align="left" label="Left-aligned heading" />
        <Demo align="center" label="Centered heading" />
        <Demo align="right" label="Right-aligned heading" />
      </div>
    </div>
  </div>
);

export default SectionHeaderStory;