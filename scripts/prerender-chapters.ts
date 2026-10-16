// Runs after `vite build` (postbuild hook).
// Emits real, crawlable HTML files for every published chapter into dist/,
// so Googlebot's first fetch sees chapter text instead of an empty SPA shell.
// React still mounts into #root and replaces the prerendered markup for users.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
const slugify = (t: string) => (t || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const BASE_URL = "https://thecasefiles.org";
const SUPABASE_URL = "https://iiezbdlmikvgxjlozwlc.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpZXpiZGxtaWt2Z3hqbG96d2xjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNTg5NjcsImV4cCI6MjA4NTczNDk2N30.y344r25H1VH0f2RBvfEt_RHWBWb0yjGAvKqLE5qLFGU";
const AUTHOR = "AnyoneButSam";

type Chapter = {
  chapter_number: number;
  title: string;
  content: string | null;
  published_at: string | null;
  scheduled_at: string | null;
  updated_at: string | null;
  cover_image_url: string | null;
  tags: string[] | null;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const stripTags = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Keep only inert, content-bearing markup in the prerendered body.
const sanitize = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/ on[a-z]+="[^"]*"/gi, "")
    .replace(/ on[a-z]+='[^']*'/gi, "");

async function fetchChapters(): Promise<Chapter[]> {
  const url =
    `${SUPABASE_URL}/rest/v1/chapters?select=chapter_number,title,content,published_at,scheduled_at,updated_at,cover_image_url,tags` +
    `&is_archived=eq.false&order=published_at.desc`;
  const res = await fetch(url, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
  if (!res.ok) throw new Error(`chapters fetch failed: ${res.status}`);
  const now = Date.now();
  return ((await res.json()) as Chapter[]).filter(
    (c) =>
      c.published_at &&
      new Date(c.published_at).getTime() <= now &&
      (!c.scheduled_at || new Date(c.scheduled_at).getTime() <= now),
  );
}

function renderHead(shell: string, opts: {
  title: string;
  description: string;
  canonical: string;
  image?: string | null;
  jsonLd: unknown;
}) {
  let head = shell;
  head = head.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(opts.title)}</title>`);
  head = head.replace(
    /<meta name="description" content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${esc(opts.description)}">`,
  );
  head = head.replace(
    /<meta property="og:title" content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${esc(opts.title)}">`,
  );
  head = head.replace(
    /<meta property="og:description" content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${esc(opts.description)}">`,
  );
  head = head.replace(
    /<meta property="og:url" content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${esc(opts.canonical)}" />`,
  );
  head = head.replace(
    /<meta property="og:type" content="[^"]*"\s*\/?>/i,
    `<meta property="og:type" content="article" />`,
  );
  head = head.replace(
    /<link rel="canonical" href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${esc(opts.canonical)}" />`,
  );
  // Twitter/X reads its own tags first; left alone they showed the home page for every story.
  head = head.replace(
    /<meta name="twitter:title" content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${esc(opts.title)}">`,
  );
  head = head.replace(
    /<meta name="twitter:description" content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${esc(opts.description)}">`,
  );
  const image = opts.image ? (opts.image.startsWith("http") ? opts.image : `${BASE_URL}${opts.image.startsWith("/") ? "" : "/"}${opts.image}`) : null;
  if (image) {
    const og = `<meta property="og:image" content="${esc(image)}">`;
    head = /<meta property="og:image"/i.test(head)
      ? head.replace(/<meta property="og:image" content="[^"]*"\s*\/?>/i, og)
      : head.replace(/<\/head>/i, `  ${og}\n  </head>`);
    head = head.replace(/<meta name="twitter:card" content="[^"]*"\s*\/?>/i, `<meta name="twitter:card" content="summary_large_image" />`);
    head = head.replace(/<\/head>/i, `  <meta name="twitter:image" content="${esc(image)}">\n  </head>`);
  }
  // The shell's language links point at the home page; here they must point at this page
  // (and its translated versions, which are listed in the sitemap).
  const path = opts.canonical.slice(BASE_URL.length) || "/";
  const alternates = [
    ["en", opts.canonical],
    ...["bg", "ja"].map((l) => [l, `${BASE_URL}/${l}${path === "/" ? "" : path}`]),
    ["x-default", opts.canonical],
  ];
  head = head.replace(/[ \t]*<link rel="alternate" hreflang="[^"]*" href="[^"]*"\s*\/?>\r?\n?/gi, "");
  head = head.replace(
    /<\/head>/i,
    alternates.map(([l, href]) => `  <link rel="alternate" hreflang="${l}" href="${esc(href)}" />`).join("\n") + "\n  </head>",
  );
  return head.replace(
    /<\/head>/i,
    `  <script type="application/ld+json">${JSON.stringify(opts.jsonLd)}</script>\n  </head>`,
  );
}

function injectBody(html: string, markup: string) {
  return html.replace(
    /<div id="root"><\/div>/i,
    `<div id="root"><div id="prerender">${markup}</div></div>`,
  );
}

/** Dispatch chapters by chapter number → their address. Empty before the dispatches migration. */
async function fetchDispatchPaths(): Promise<Map<number, string>> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/chapters?select=chapter_number,dispatch_part,dispatch:dispatches(slug)&story_format=eq.dispatch`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } },
    );
    if (!res.ok) return new Map();
    const rows = (await res.json()) as { chapter_number: number; dispatch_part: number | null; dispatch: { slug: string } | null }[];
    return new Map(rows.filter((r) => r.dispatch?.slug && r.dispatch_part).map((r) => [r.chapter_number, `/dispatches/${r.dispatch!.slug}/${r.dispatch_part}`]));
  } catch {
    return new Map();
  }
}

async function main() {
  const distIndex = resolve("dist/index.html");
  if (!existsSync(distIndex)) {
    console.warn("prerender: dist/index.html missing — skipping");
    return;
  }
  const shell = readFileSync(distIndex, "utf8");
  const chapters = await fetchChapters();
  // Dispatch chapters live under /dispatches/<slug>/<n> and stay out of the story list.
  const dispatchPaths = await fetchDispatchPaths();
  const pathOf = (c: Chapter) => dispatchPaths.get(c.chapter_number) ?? `/stories/${slugify(c.title)}`;
  const stories = chapters.filter((c) => !dispatchPaths.has(c.chapter_number));
  if (!chapters.length) {
    console.warn("prerender: no published stories found — skipping");
    return;
  }

  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i];
    const prev = chapters[i - 1];
    const next = chapters[i + 1];
    const canonical = `${BASE_URL}${pathOf(c)}`;
    const body = sanitize(c.content ?? "");
    const plain = stripTags(body);
    const description =
      (plain.slice(0, 155).trim() || `${c.title} — a standalone story by ${AUTHOR}.`) +
      (plain.length > 155 ? "…" : "");
    const title = `${c.title} — Case Files`;

    const markup = [
      `<article>`,
      `<h1>${esc(c.title)}</h1>`,
      c.published_at
        ? `<p><time datetime="${esc(c.published_at)}">${esc(c.published_at.slice(0, 10))}</time> · by ${esc(AUTHOR)}</p>`
        : "",
      body,
      `<nav>`,
      prev ? `<a href="/stories/${slugify(prev.title)}">Newer: ${esc(prev.title)}</a>` : "",
      `<a href="/chapters">All stories</a>`,
      next ? `<a href="/stories/${slugify(next.title)}">Older: ${esc(next.title)}</a>` : "",
      `</nav>`,
      `</article>`,
    ].join("\n");

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "ShortStory",
      name: c.title,
      keywords: (c.tags ?? []).join(", ") || undefined,
      image: c.cover_image_url ?? undefined,
      headline: c.title,
      url: canonical,
      datePublished: c.published_at,
      dateModified: c.updated_at ?? c.published_at,
      author: { "@type": "Person", name: AUTHOR },
      isPartOf: { "@type": "CreativeWorkSeries", name: "Case Files", url: `${BASE_URL}/chapters` },
      inLanguage: "en",
      wordCount: plain.split(" ").filter(Boolean).length,
    };

    const page = injectBody(
      renderHead(shell, { title, description, canonical, image: c.cover_image_url, jsonLd }),
      markup,
    );
    const dir = resolve(`dist${pathOf(c)}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, "index.html"), page);
  }

  // Crawlable chapter index so no chapter page is an orphan.
  const listMarkup = [
    `<h1>All Stories — Case Files</h1>`,
    `<ul>`,
    ...stories.map(
      (c) =>
        `<li><a href="/stories/${slugify(c.title)}">${esc(c.title)}</a></li>`,
    ),
    `</ul>`,
  ].join("\n");
  const listJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Case Files stories",
    itemListElement: stories.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.title,
      url: `${BASE_URL}/stories/${slugify(c.title)}`,
    })),
  };
  const listPage = injectBody(
    renderHead(shell, {
      title: `Stories — Case Files, standalone fiction by ${AUTHOR}`,
      description: `Read ${stories.length} free standalone stories by ${AUTHOR}. Unrelated stories. Uncomfortable possibilities.`,
      canonical: `${BASE_URL}/chapters`,
      jsonLd: listJsonLd,
    }),
    listMarkup,
  );
  mkdirSync(resolve("dist/chapters"), { recursive: true });
  writeFileSync(resolve("dist/chapters/index.html"), listPage);

  console.log(`prerender: wrote ${chapters.length} story pages + story index`);
}

main().catch((err) => {
  console.warn("prerender: skipped —", err);
});
