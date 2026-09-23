import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SITE_URL = "https://www.thefivethrones.com";

const META: Record<string, { title: string; description: string }> = {
  "/": {
    title: "Sedorium — Standalone Stories by AnyoneButSam",
    description: "Sedorium: random situations put into story form. Read standalone fiction by AnyoneButSam.",
  },
  "/chapters": {
    title: "Stories — Sedorium",
    description: "Browse standalone Sedorium stories by AnyoneButSam.",
  },
  "/about": {
    title: "About — Sedorium",
    description: "About Sedorium, a collection of standalone stories by AnyoneButSam.",
  },
};

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

export function useDynamicSeo() {
  const location = useLocation();

  useEffect(() => {
    const meta = META[location.pathname] ?? META["/"];
    const canonical = `${SITE_URL}${location.pathname}`;
    document.title = meta.title;
    setMeta("description", meta.description);
    setMeta("og:type", "website", true);
    setMeta("og:title", meta.title, true);
    setMeta("og:description", meta.description, true);
    setMeta("og:url", canonical, true);
    setMeta("twitter:card", "summary");
    setMeta("twitter:title", meta.title);
    setMeta("twitter:description", meta.description);
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = canonical;
  }, [location.pathname]);
}