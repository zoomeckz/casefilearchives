/** URL slug from a story title. Keep in sync with scripts/ and edge functions. */
export function slugify(title: string): string {
  return (title || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Public path for a story. Legacy chapters keep their numeric address. */
export function storyPath(ch: { title: string; chapterNumber: number; isArchived?: boolean }): string {
  const slug = slugify(ch.title);
  if (ch.isArchived || !slug) return `/chapters/${ch.chapterNumber}`;
  return `/stories/${slug}`;
}
