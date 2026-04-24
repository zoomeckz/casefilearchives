import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionHeader } from "./SectionHeader";

/**
 * These tests pin down the alignment contract of SectionHeader. They exist
 * specifically to catch the kind of regression we kept hitting on the home
 * page — a section's content gets re-laid-out (e.g. a list of left-aligned
 * rows becomes a grid of centered cards) but its heading is left behind.
 * Because every alignment change on this component MUST flow through the
 * `align` prop, asserting the resulting Tailwind class is enough.
 */
describe("SectionHeader", () => {
  it("renders an <h2> by default", () => {
    render(<SectionHeader>Latest Chapters</SectionHeader>);
    const heading = screen.getByRole("heading", { name: "Latest Chapters" });
    expect(heading.tagName).toBe("H2");
  });

  it("supports overriding the heading level via `as`", () => {
    render(<SectionHeader as="h3">Sub-section</SectionHeader>);
    expect(screen.getByRole("heading", { name: "Sub-section" }).tagName).toBe(
      "H3",
    );
  });

  it("defaults to left alignment when `align` is omitted", () => {
    render(<SectionHeader>Default</SectionHeader>);
    const heading = screen.getByRole("heading", { name: "Default" });
    expect(heading).toHaveClass("text-left");
    expect(heading).not.toHaveClass("text-center");
    expect(heading).not.toHaveClass("text-right");
  });

  it.each([
    ["left", "text-left"],
    ["center", "text-center"],
    ["right", "text-right"],
  ] as const)(
    "applies %s alignment when align=\"%s\"",
    (align, expectedClass) => {
      render(<SectionHeader align={align}>Heading</SectionHeader>);
      const heading = screen.getByRole("heading", { name: "Heading" });
      expect(heading).toHaveClass(expectedClass);
      // And only that one — to guarantee mutually exclusive alignment.
      const alignClasses = ["text-left", "text-center", "text-right"];
      for (const cls of alignClasses) {
        if (cls !== expectedClass) expect(heading).not.toHaveClass(cls);
      }
    },
  );

  it("applies the shared typography tokens regardless of alignment", () => {
    render(<SectionHeader align="center">Token Check</SectionHeader>);
    const heading = screen.getByRole("heading", { name: "Token Check" });
    // These four classes ARE the visual identity of every section header.
    // If any drifts, the home page sections will visually diverge.
    expect(heading).toHaveClass("font-display");
    expect(heading).toHaveClass("text-sm");
    expect(heading).toHaveClass("uppercase");
    expect(heading).toHaveClass("tracking-[0.2em]");
    expect(heading).toHaveClass("text-muted-foreground");
  });

  it("renders an optional subtitle below the heading", () => {
    render(
      <SectionHeader subtitle="Every chapter so far">
        Latest Chapters
      </SectionHeader>,
    );
    expect(screen.getByText("Every chapter so far")).toBeInTheDocument();
  });
});