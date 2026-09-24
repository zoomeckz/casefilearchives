// Runs after `vite build` (postbuild hook).
// Emits real, crawlable HTML files for every published chapter into dist/,
// so Googlebot's first fetch sees chapter text instead of an empty SPA shell.
// React still mounts into #root and replaces the prerendered markup for users.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://www.thefivethrones.com";
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
  if (opts.image) {
    head = head.replace(
      /<meta property="og:image" content="[^"]*"\s*\/?>/i,
      `<meta property="og:image" content="${esc(opts.image)}">`,
    );
  }
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

async function main() {
  const distIndex = resolve("dist/index.html");
  if (!existsSync(distIndex)) {
    console.warn("prerender: dist/index.html missing — skipping");
    return;
  }
  const shell = readFileSync(distIndex, "utf8");
  const chapters = await fetchChapters();
  if (!chapters.length) {
    console.warn("prerender: no published stories found — skipping");
    return;
  }

  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i];
    const prev = chapters[i - 1];
    const next = chapters[i + 1];
    const canonical = `${BASE_URL}/chapters/${c.chapter_number}`;
    const body = sanitize(c.content ?? "");
    const plain = stripTags(body);
    const description =
      (plain.slice(0, 155).trim() || `${c.title} — a standalone story by ${AUTHOR}.`) +
      (plain.length > 155 ? "…" : "");
    const title = `${c.title} — Case File`;

    const markup = [
      `<article>`,
      `<h1>${esc(c.title)}</h1>`,
      c.published_at
        ? `<p><time datetime="${esc(c.published_at)}">${esc(c.published_at.slice(0, 10))}</time> · by ${esc(AUTHOR)}</p>`
        : "",
      body,
      `<nav>`,
      prev ? `<a href="/chapters/${prev.chapter_number}">Newer: ${esc(prev.title)}</a>` : "",
      `<a href="/chapters">All stories</a>`,
      next ? `<a href="/chapters/${next.chapter_number}">Older: ${esc(next.title)}</a>` : "",
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
      isPartOf: { "@type": "CreativeWorkSeries", name: "Case File", url: `${BASE_URL}/chapters` },
      inLanguage: "en",
      wordCount: plain.split(" ").filter(Boolean).length,
    };

    const page = injectBody(
      renderHead(shell, { title, description, canonical, image: c.cover_image_url, jsonLd }),
      markup,
    );
    const dir = resolve(`dist/chapters/${c.chapter_number}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, "index.html"), page);
  }

  // Crawlable chapter index so no chapter page is an orphan.
  const listMarkup = [
    `<h1>All Stories — Case File</h1>`,
    `<ul>`,
    ...chapters.map(
      (c) =>
        `<li><a href="/chapters/${c.chapter_number}">${esc(c.title)}</a></li>`,
    ),
    `</ul>`,
  ].join("\n");
  const listJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Case File stories",
    itemListElement: chapters.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.title,
      url: `${BASE_URL}/chapters/${c.chapter_number}`,
    })),
  };
  const listPage = injectBody(
    renderHead(shell, {
      title: `Stories — Case File, standalone fiction by ${AUTHOR}`,
      description: `Read ${chapters.length} free standalone stories by ${AUTHOR}. Unrelated stories. Uncomfortable possibilities.`,
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
