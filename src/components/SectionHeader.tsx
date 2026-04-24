import React from "react";
import { cn } from "@/lib/utils";

/**
 * SectionHeader — a single source of truth for the small uppercase section
 * titles on the home page (e.g. "Latest Chapters", "Latest Discussions") and
 * any future home/marketing section that needs the same label-style heading.
 *
 * Why this exists: every section heading must visually align with the content
 * it controls. A list of left-aligned rows wants a left-aligned title; a grid
 * of centered cards wants a centered title. Inlining `text-center` /
 * `text-left` in every page is fragile — somebody always forgets, and the
 * heading slides out of alignment with its column. This component forces the
 * choice to be explicit at the call site and keeps the typography identical
 * everywhere.
 *
 * Usage:
 *   <SectionHeader align="left">{t("home.latestChapters")}</SectionHeader>
 *   <SectionHeader align="center">{t("home.latestDiscussions")}</SectionHeader>
 *
 * Pass `align` to match how the content below the heading is laid out — NOT
 * a stylistic preference. The `as` prop lets nested sections downgrade from
 * <h2> to <h3> while keeping the same look.
 */
export type SectionHeaderAlign = "left" | "center" | "right";

interface SectionHeaderProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /**
   * Horizontal alignment that the heading should adopt. Pick the value that
   * matches the content below — if the cards are centered, use `"center"`.
   */
  align?: SectionHeaderAlign;
  /** Heading level. Defaults to `h2` — only override when nesting. */
  as?: "h1" | "h2" | "h3" | "h4";
  /** Optional descriptive text rendered directly under the heading. */
  subtitle?: React.ReactNode;
  /** Extra classes appended to the heading itself (rarely needed). */
  className?: string;
  children: React.ReactNode;
}

const ALIGN_TEXT: Record<SectionHeaderAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

/** Wrapper alignment uses flex so subtitle width hugs the heading on `center`. */
const ALIGN_WRAPPER: Record<SectionHeaderAlign, string> = {
  left: "items-start",
  center: "items-center",
  right: "items-end",
};

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  align = "left",
  as: Tag = "h2",
  subtitle,
  className,
  children,
  ...rest
}) => {
  return (
    <div className={cn("mb-6 flex flex-col gap-1", ALIGN_WRAPPER[align])}>
      <Tag
        className={cn(
          "font-display text-sm uppercase tracking-[0.2em] text-muted-foreground",
          ALIGN_TEXT[align],
          className,
        )}
        {...rest}
      >
        {children}
      </Tag>
      {subtitle ? (
        <p
          className={cn(
            "text-sm text-muted-foreground/70 max-w-prose",
            ALIGN_TEXT[align],
          )}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
};

export default SectionHeader;