import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  DEFAULT_LANGUAGE,
  detectLanguageFromPath,
  withLanguagePrefix,
  type SupportedLanguage,
} from "@/i18n";

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
 * Per-language overrides for site-wide meta. The `dynamic-seo-meta` edge
 * function returns English; for any other supported language we look up a
 * translation here. Languages with no entry simply fall back to English (so
 * adding a new locale never breaks SEO — translations can ship later).
 */
const SITE_META_BY_LANG: Partial<Record<SupportedLanguage, { title: string; description: string }>> = {
  bg: {
    title: "Седориум — Тъмно фентъзи от Сам Новрузи Ларки | The Five Thrones",
    description:
      "Прочети Седориум — безплатно тъмно фентъзи за разбити престоли. Нова глава всеки петък. Кодекс с герои, места и предания.",
  },
  es: {
    title: "Sedorium — Fantasía oscura de Sam Nowroozi Larki | The Five Thrones",
    description:
      "Lee Sedorium — fantasía oscura gratuita sobre tronos rotos. Nuevo capítulo cada viernes. Códex de personajes, lugares y leyendas.",
  },
  hi: {
    title: "Sedorium — Sam Nowroozi Larki की डार्क फैंटेसी | The Five Thrones",
    description:
      "Sedorium पढ़ें — टूटे सिंहासनों की मुफ़्त डार्क फैंटेसी। हर शुक्रवार नया अध्याय। पात्रों, स्थानों और किंवदंतियों का कोडेक्स।",
  },
  ar: {
    title: "Sedorium — فانتازيا مظلمة بقلم Sam Nowroozi Larki | The Five Thrones",
    description:
      "اقرأ Sedorium — فانتازيا مظلمة مجانية عن العروش المحطمة. فصل جديد كل يوم جمعة. موسوعة الشخصيات والأماكن والأساطير.",
  },
  ja: {
    title: "Sedorium — Sam Nowroozi Larki のダークファンタジー | The Five Thrones",
    description:
      "Sedorium を読む — 砕かれた玉座を巡る無料のダークファンタジー。毎週金曜に新章公開。登場人物、場所、伝承のコーデックス。",
  },
  ko: {
    title: "Sedorium — Sam Nowroozi Larki의 다크 판타지 | The Five Thrones",
    description:
      "Sedorium을 읽어보세요 — 부서진 왕좌를 둘러싼 무료 다크 판타지. 매주 금요일 새 챕터 공개. 인물·장소·전승의 코덱스.",
  },
  zh: {
    title: "Sedorium — Sam Nowroozi Larki 的黑暗奇幻 | The Five Thrones",
    description:
      "阅读 Sedorium —— 关于破碎王座的免费黑暗奇幻。每周五更新新章节。人物、地点与传说的索引典藏。",
  },
};

/** Per-language chapter-meta builder. Add a builder when localising chapter SEO. */
const CHAPTER_META_BY_LANG: Partial<
  Record<
    SupportedLanguage,
    (n: number, title: string) => { fullTitle: string; description: string }
  >
> = {
  bg: (n, title) => ({
    fullTitle: `Глава ${n}: ${title} — Седориум | The Five Thrones`,
    description: `Прочети Глава ${n}: ${title} от Седориум — The Five Thrones, безплатно тъмно фентъзи от Сам Новрузи Ларки.`,
  }),
  es: (n, title) => ({
    fullTitle: `Capítulo ${n}: ${title} — Sedorium | The Five Thrones`,
    description: `Lee el Capítulo ${n}: ${title} de Sedorium — The Five Thrones, fantasía oscura gratuita de Sam Nowroozi Larki.`,
  }),
  hi: (n, title) => ({
    fullTitle: `अध्याय ${n}: ${title} — Sedorium | The Five Thrones`,
    description: `Sedorium का अध्याय ${n}: ${title} पढ़ें — Sam Nowroozi Larki की मुफ़्त डार्क फैंटेसी, The Five Thrones।`,
  }),
  ar: (n, title) => ({
    fullTitle: `الفصل ${n}: ${title} — Sedorium | The Five Thrones`,
    description: `اقرأ الفصل ${n}: ${title} من Sedorium — The Five Thrones، فانتازيا مظلمة مجانية بقلم Sam Nowroozi Larki.`,
  }),
  ja: (n, title) => ({
    fullTitle: `第${n}章：${title} — Sedorium | The Five Thrones`,
    description: `Sedorium 第${n}章「${title}」を読む — Sam Nowroozi Larki が綴る無料のダークファンタジー、The Five Thrones。`,
  }),
  ko: (n, title) => ({
    fullTitle: `${n}장: ${title} — Sedorium | The Five Thrones`,
    description: `Sedorium ${n}장 「${title}」 — Sam Nowroozi Larki의 무료 다크 판타지, The Five Thrones를 읽어보세요.`,
  }),
  zh: (n, title) => ({
    fullTitle: `第 ${n} 章：${title} — Sedorium | The Five Thrones`,
    description: `阅读 Sedorium 第 ${n} 章《${title}》—— Sam Nowroozi Larki 创作的免费黑暗奇幻 The Five Thrones。`,
  }),
};

/** OG locale tag (BCP 47 with underscore) per language. Defaults to en_US. */
const OG_LOCALE_BY_LANG: Record<SupportedLanguage, string> = {
  en: "en_US",
  bg: "bg_BG",
  es: "es_ES",
  hi: "hi_IN",
  ar: "ar_AR",
  ja: "ja_JP",
  ko: "ko_KR",
  zh: "zh_CN",
};

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

  const lang = detectLanguageFromPath(pathname);
  const override = SITE_META_BY_LANG[lang];
  const title = override?.title ?? meta.title;
  const description = override?.description ?? meta.description;
  // Home-page canonical: default language ends with `/`, non-default languages
  // use the bare prefix (`/bg`) — matching the static fallback in index.html
  // and the sitemap, so Google sees one consistent URL per locale.
  const canonical = `${SITE_URL}${withLanguagePrefix("/", lang)}`;

  document.title = title;
  setMeta("description", description);
  setMeta("keywords", meta.keywords.join(", "));
  setMeta("og:title", title, "property");
  setMeta("og:description", description, "property");
  setMeta("og:url", canonical, "property");
  setMeta("og:locale", OG_LOCALE_BY_LANG[lang] ?? OG_LOCALE_BY_LANG[DEFAULT_LANGUAGE], "property");
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
  const lang = detectLanguageFromPath(pathname);
  const builder = CHAPTER_META_BY_LANG[lang];
  const fullTitle = builder
    ? builder(ch.chapter_number, ch.title).fullTitle
    : `Chapter ${ch.chapter_number}: ${ch.title} — Sedorium | The Five Thrones`;
  const description = builder
    ? builder(ch.chapter_number, ch.title).description
    : excerpt ||
      `Read Chapter ${ch.chapter_number}: ${ch.title} from Sedorium — The Five Thrones, a free dark fantasy web novel by Sam Nowroozi Larki.`;
  const canonical = `${SITE_URL}${withLanguagePrefix(`/chapters/${ch.chapter_number}`, lang)}`;

  document.title = fullTitle;
  setMeta("description", description);
  setMeta("og:type", "article", "property");
  setMeta("og:title", fullTitle, "property");
  setMeta("og:description", description, "property");
  setMeta("og:url", canonical, "property");
  setMeta("og:locale", OG_LOCALE_BY_LANG[lang] ?? OG_LOCALE_BY_LANG[DEFAULT_LANGUAGE], "property");
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
    inLanguage: lang,
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
        // Match `/chapters/:n` after stripping any language prefix so this
        // works for every supported locale automatically.
        const chapterMatch = location.pathname
          .replace(/^\/[a-z]{2}(?=\/)/, "")
          .match(/^\/chapters\/(\d+)$/);
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
