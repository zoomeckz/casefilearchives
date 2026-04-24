import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { detectLanguageFromPath } from "@/i18n";

const SUPABASE_URL = "https://iiezbdlmikvgxjlozwlc.supabase.co";
const SEO_META_URL = `${SUPABASE_URL}/functions/v1/dynamic-seo-meta`;
const SITE_URL = "https://sedorium.lovable.app";

interface SeoMeta {
  title: string;
  description: string;
  keywords: string[];
  totalChapters: number;
  chapters: Array<{ number: number; title: string; url: string; publishedAt?: string }>;
  schemas: {
    book: unknown;
    website: unknown;
    breadcrumb: unknown;
  };
}

interface ChapterMeta {
  chapter_number: number;
  title: string;
  content: string;
  published_at: string | null;
  updated_at: string | null;
}

function setMeta(name: string, content: string, attr: "name" | "property" = "name") {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setJsonLd(id: string, data: unknown) {
  let el = document.head.querySelector<HTMLScriptElement>(`script[data-seo-id="${id}"]`);
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.setAttribute("data-seo-id", id);
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Bulgarian translations of the site-wide meta. We translate the human-readable
 * fields locally because the dynamic-seo-meta edge function only returns English.
 * This keeps `/bg/` pages indexable in Bulgarian without an extra round-trip.
 */
const BG_META = {
  title: "Седориум — Тъмно фентъзи от Сам Новрузи Ларки | The Five Thrones",
  description:
    "Прочети Седориум — безплатно тъмно фентъзи за разбити престоли. Нова глава всеки петък. Кодекс с герои, места и предания.",
};

function isBg(pathname: string): boolean {
  return detectLanguageFromPath(pathname) === "bg";
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function buildExcerpt(content: string, maxChars = 155): string {
  const text = stripHtml(content);
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 100 ? slice.slice(0, lastSpace) : slice).trimEnd() + "…";
}

async function applySiteMeta(pathname: string): Promise<void> {
  const res = await fetch(SEO_META_URL, { cache: "no-store" });
  if (!res.ok) return;
  const meta: SeoMeta = await res.json();

  const bg = isBg(pathname);
  const title = bg ? BG_META.title : meta.title;
  const description = bg ? BG_META.description : meta.description;
  const canonical = bg ? `${SITE_URL}/bg/` : `${SITE_URL}/`;

  document.title = title;
  setMeta("description", description);
  setMeta("keywords", meta.keywords.join(", "));
  setMeta("og:title", title, "property");
  setMeta("og:description", description, "property");
  setMeta("og:url", canonical, "property");
  setMeta("og:locale", bg ? "bg_BG" : "en_US", "property");
  setMeta("twitter:title", title);
  setMeta("twitter:description", description);
  setCanonical(canonical);

  setJsonLd("book", meta.schemas.book);
  setJsonLd("website", meta.schemas.website);
  setJsonLd("breadcrumb", meta.schemas.breadcrumb);
}

async function applyChapterMeta(chapterNumber: number, pathname: string): Promise<boolean> {
  // Fetch the specific chapter from PostgREST directly (public table, RLS allows everyone)
  const url =
    `${SUPABASE_URL}/rest/v1/chapters` +
    `?select=chapter_number,title,content,published_at,updated_at` +
    `&chapter_number=eq.${chapterNumber}` +
    `&limit=1`;

  const res = await fetch(url, {
    headers: {
      apikey:
        // public anon key (publishable) — same as in client.ts
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpZXpiZGxtaWt2Z3hqbG96d2xjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNTg5NjcsImV4cCI6MjA4NTczNDk2N30.y344r25H1VH0f2RBvfEt_RHWBWb0yjGAvKqLE5qLFGU",
    },
    cache: "no-store",
  });
  if (!res.ok) return false;
  const rows: ChapterMeta[] = await res.json();
  const ch = rows[0];
  if (!ch) return false;

  const excerpt = buildExcerpt(ch.content, 155);
  const bg = isBg(pathname);
  const fullTitle = bg
    ? `Глава ${ch.chapter_number}: ${ch.title} — Седориум | The Five Thrones`
    : `Chapter ${ch.chapter_number}: ${ch.title} — Sedorium | The Five Thrones`;
  const description = bg
    ? `Прочети Глава ${ch.chapter_number}: ${ch.title} от Седориум — The Five Thrones, безплатно тъмно фентъзи от Сам Новрузи Ларки.`
    : excerpt ||
      `Read Chapter ${ch.chapter_number}: ${ch.title} from Sedorium — The Five Thrones, a free dark fantasy web novel by Sam Nowroozi Larki.`;
  const canonical = bg
    ? `${SITE_URL}/bg/chapters/${ch.chapter_number}`
    : `${SITE_URL}/chapters/${ch.chapter_number}`;

  document.title = fullTitle;
  setMeta("description", description);
  setMeta("og:type", "article", "property");
  setMeta("og:title", fullTitle, "property");
  setMeta("og:description", description, "property");
  setMeta("og:url", canonical, "property");
  setMeta("og:locale", bg ? "bg_BG" : "en_US", "property");
  setMeta("twitter:title", fullTitle);
  setMeta("twitter:description", description);
  setCanonical(canonical);

  // Per-chapter Article schema
  setJsonLd("chapter-article", {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `Chapter ${ch.chapter_number}: ${ch.title}`,
    description,
    url: canonical,
    inLanguage: bg ? "bg" : "en",
    isAccessibleForFree: true,
    isPartOf: {
      "@type": "Book",
      name: "Sedorium — The Five Thrones",
      url: SITE_URL,
    },
    datePublished: ch.published_at,
    dateModified: ch.updated_at || ch.published_at,
    author: { "@type": "Person", name: "Sam Nowroozi Larki" },
    mainEntityOfPage: canonical,
  });

  return true;
}

function clearChapterArticleSchema() {
  const el = document.head.querySelector('script[data-seo-id="chapter-article"]');
  if (el) el.remove();
}

/**
 * Refreshes <title>, meta tags, and JSON-LD schemas based on the current route.
 * - On a chapter route (/chapters/:n) → fetches that chapter and sets per-chapter SEO.
 * - On any other route → uses site-wide SEO from dynamic-seo-meta.
 *
 * Re-runs on every route change so single-page-app navigation keeps SEO accurate.
 */
export function useDynamicSeo() {
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const chapterMatch = location.pathname.match(/^\/(?:bg\/)?chapters\/(\d+)$/);
        if (chapterMatch) {
          const num = parseInt(chapterMatch[1], 10);
          const ok = await applyChapterMeta(num, location.pathname);
          if (cancelled) return;
          if (!ok) await applySiteMeta(location.pathname);
        } else {
          clearChapterArticleSchema();
          await applySiteMeta(location.pathname);
        }
      } catch (err) {
        console.warn("Dynamic SEO refresh failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);
}
