import { stripLanguagePrefix } from "@/i18n";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SITE_URL = "https://thecasefiles.org";

type Meta = { title: string; description: string };

const META: Record<string, Meta> = {
  "/": {
    title: "Case Files — Standalone Stories by AnyoneButSam",
    description: "Unrelated stories. Uncomfortable possibilities. Read standalone fiction by AnyoneButSam.",
  },
  "/chapters": {
    title: "Stories — Case Files",
    description: "Browse the Case Files archive of standalone stories by AnyoneButSam.",
  },
  "/about": {
    title: "About — Case Files",
    description: "About Case Files, a collection of standalone stories by AnyoneButSam.",
  },
  "/forum": {
    title: "Forum — Case Files",
    description: "Theories, questions and discussion about the Case Files stories.",
  },
  "/series": {
    title: "Series — Case Files",
    description: "Case Files stories grouped into series and collections.",
  },
  "/dispatches": {
    title: "Dispatches — Case Files",
    description: "Longer stories by AnyoneButSam, told in chapters.",
  },
};

// Pages inside a section, until the page itself sets something more specific.
const SECTIONS: [RegExp, Meta][] = [
  [/^\/forum\/./, META["/forum"]],
  [/^\/series\/./, META["/series"]],
  [/^\/dispatches\/[^/]+\/?$/, META["/dispatches"]],
  [/^\/user\/./, { title: "Reader profile — Case Files", description: "A reader's personnel file on Case Files." }],
];

// Story pages set their own title and description once the story has loaded (ReaderPage).
// Until then the prerendered values in the HTML stay, so they are never replaced by the home page's.
const STORY = /^\/((stories|chapters)\/.|dispatches\/[^/]+\/\d+)/;

// Accounts, admin and tools: never in search results.
const PRIVATE = /^\/(admin|profile|commendations|reset-password|node-editor|test-case|dev)(\/|$)/;

function setMeta(name: string, content: string, property = false) {
  const attr = property ? "property" : "name";
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attr, name);
    document.head.appendChild(element);
  }
  element.content = content;
}

// The site-wide share image, read once before any page replaces it.
let siteImage: string | null | undefined;
const defaultImage = () => {
  if (siteImage === undefined) siteImage = document.head.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content || null;
  return siteImage;
};

/** Plain text from story HTML, cut for a meta description. */
export function plainExcerpt(html: string, max = 155) {
  const text = (html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

/** Title, description, share preview and indexing for the current page. */
export function setPageSeo({ title, description, image, type = "website", noindex = false }: {
  title: string;
  description: string;
  image?: string | null;
  type?: "website" | "article";
  noindex?: boolean;
}) {
  const fallbackImage = defaultImage();
  document.title = title;
  setMeta("description", description);
  setMeta("og:type", type, true);
  setMeta("og:title", title, true);
  setMeta("og:description", description, true);
  setMeta("twitter:title", title);
  setMeta("twitter:description", description);
  const shareImage = image ? (image.startsWith("http") ? image : `${SITE_URL}${image.startsWith("/") ? "" : "/"}${image}`) : fallbackImage;
  if (shareImage) {
    setMeta("og:image", shareImage, true);
    setMeta("twitter:image", shareImage);
  }
  setMeta("twitter:card", image ? "summary_large_image" : "summary");
  setMeta("robots", noindex ? "noindex, nofollow" : "index, follow");
}

/** Marks a "not found" view so search engines drop it instead of indexing an empty page. */
export function NoIndex({ title }: { title: string }) {
  useEffect(() => {
    setPageSeo({ title, description: "This page could not be found.", noindex: true });
  }, [title]);
  return null;
}

export function useDynamicSeo() {
  const location = useLocation();

  useEffect(() => {
    const path = stripLanguagePrefix(location.pathname);
    const trimmed = location.pathname.length > 1 ? location.pathname.replace(/\/+$/, "") : "/";
    const canonical = `${SITE_URL}${trimmed}`;

    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = canonical;
    setMeta("og:url", canonical, true);

    if (STORY.test(path)) return;

    const known = META[path] ?? SECTIONS.find(([re]) => re.test(path))?.[1];
    if (PRIVATE.test(path)) {
      setPageSeo({ ...(known ?? META["/"]), noindex: true });
    } else if (known) {
      setPageSeo(known);
    } else {
      // An address that doesn't exist.
      setPageSeo({ title: "Page not found — Case Files", description: "This page could not be found.", noindex: true });
    }
  }, [location.pathname]);
}
