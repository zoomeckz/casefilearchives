import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Source-level guardrail for home-page section alignment.
 *
 * Why source-level instead of rendered DOM: HomePage is an integration-heavy
 * component (router, i18n, async data fetches). A render test would either be
 * flaky or require a giant harness that gets out of date. The actual bug we
 * keep hitting is mechanical — somebody changes the content alignment of a
 * section but forgets the matching `<SectionHeader align="...">`. Catching
 * that in the source is faster, more deterministic, and harder to bypass.
 *
 * The test enforces two rules:
 *   1. Every section heading on the home page MUST go through SectionHeader
 *      (no inline <h2 className="font-display ...">). This prevents drift in
 *      typography tokens between sections.
 *   2. Each declared (heading-content) pair must use compatible alignment.
 */

const HOMEPAGE = fs.readFileSync(
  path.resolve(__dirname, "HomePage.tsx"),
  "utf8",
);

describe("HomePage section alignment", () => {
  it("uses SectionHeader for every section heading (no raw <h2>)", () => {
    // The shared typography token combo that used to be inlined. If somebody
    // adds a section with this snippet again instead of <SectionHeader/>,
    // alignment will silently drift — fail loudly here.
    const inlineHeadingPattern =
      /<h2[^>]*className="[^"]*font-display[^"]*uppercase[^"]*tracking-\[0\.2em\]/;
    expect(HOMEPAGE).not.toMatch(inlineHeadingPattern);
  });

  it("declares the Latest Chapters heading with left alignment", () => {
    // The chapters list is a vertical column of left-aligned rows, so its
    // header must also be left-aligned.
    const match = HOMEPAGE.match(
      /<SectionHeader\s+align="(\w+)"[^>]*>\s*\{t\("home\.latestChapters"\)\}/,
    );
    expect(match, "Latest Chapters SectionHeader not found").not.toBeNull();
    expect(match![1]).toBe("left");
  });

  it("declares the Latest Discussions heading with center alignment", () => {
    // The forum cards are centered; a left-aligned heading would float off
    // to the side of the column. Lock the pairing in.
    const match = HOMEPAGE.match(
      /<SectionHeader\s+align="(\w+)"[^>]*>\s*\{t\("home\.latestDiscussions"\)\}/,
    );
    expect(match, "Latest Discussions SectionHeader not found").not.toBeNull();
    expect(match![1]).toBe("center");
  });
});