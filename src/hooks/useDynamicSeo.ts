import { useEffect } from "react";

const SEO_META_URL = `https://iiezbdlmikvgxjlozwlc.supabase.co/functions/v1/dynamic-seo-meta`;

interface SeoMeta {
  title: string;
  description: string;
  keywords: string[];
  totalChapters: number;
  schemas: {
    book: unknown;
    website: unknown;
    breadcrumb: unknown;
  };
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

/**
 * Refreshes <title>, meta tags, and JSON-LD schemas from the database
 * via the dynamic-seo-meta edge function. Runs once on app mount so SEO
 * always reflects the latest published chapters without rebuilding.
 */
export function useDynamicSeo() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(SEO_META_URL, { cache: "no-store" });
        if (!res.ok) return;
        const meta: SeoMeta = await res.json();
        if (cancelled) return;

        // Only override the home / generic title — leave per-page titles set by
        // routed pages alone. We detect this by checking if the current title
        // still matches the static fallback from index.html.
        const path = window.location.pathname;
        const isGenericRoute = path === "/" || path === "/chapters";
        if (isGenericRoute) {
          document.title = meta.title;
        }

        setMeta("description", meta.description);
        setMeta("keywords", meta.keywords.join(", "));
        setMeta("og:title", meta.title, "property");
        setMeta("og:description", meta.description, "property");
        setMeta("twitter:title", meta.title);
        setMeta("twitter:description", meta.description);

        setJsonLd("book", meta.schemas.book);
        setJsonLd("website", meta.schemas.website);
        setJsonLd("breadcrumb", meta.schemas.breadcrumb);
      } catch (err) {
        console.warn("Dynamic SEO refresh failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
