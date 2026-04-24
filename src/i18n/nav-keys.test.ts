import { describe, it, expect } from "vitest";
import en from "./locales/en.json";
import bg from "./locales/bg.json";
import es from "./locales/es.json";
import hi from "./locales/hi.json";
import ar from "./locales/ar.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import zh from "./locales/zh.json";
import {
  NAV_GROUPS,
  COMMUNITY_GROUP_KEY,
  NAV_CHROME_KEYS,
  type NavI18nKey,
} from "./navKeys";

/**
 * Catches the exact bug where "Codex" / "Community" shipped untranslated:
 *   - Every locale must define every `nav.*` key that English has.
 *   - Every key registered in `NAV_GROUPS` must exist in `en.json`.
 *   - Key naming must follow the flat camelCase convention.
 */
const LOCALES = { bg, es, hi, ar, ja, ko, zh } as const;
const CAMEL_CASE = /^[a-z][a-zA-Z0-9]*$/;

describe("i18n nav keys", () => {
  const enNavKeys = Object.keys(en.nav) as NavI18nKey[];

  it("every English nav key is present in every other locale", () => {
    const missing: Record<string, string[]> = {};
    for (const [code, bundle] of Object.entries(LOCALES)) {
      const localeNav = (bundle as { nav: Record<string, string> }).nav ?? {};
      const gone = enNavKeys.filter((k) => !(k in localeNav));
      if (gone.length) missing[code] = gone;
    }
    expect(missing).toEqual({});
  });

  it("no locale defines extra nav keys English doesn't have", () => {
    const extras: Record<string, string[]> = {};
    for (const [code, bundle] of Object.entries(LOCALES)) {
      const localeNav = (bundle as { nav: Record<string, string> }).nav ?? {};
      const extra = Object.keys(localeNav).filter(
        (k) => !(k in (en.nav as Record<string, string>)),
      );
      if (extra.length) extras[code] = extra;
    }
    expect(extras).toEqual({});
  });

  it("every key registered in NAV_GROUPS / chrome resolves to a real English entry", () => {
    const referenced: NavI18nKey[] = [
      ...NAV_GROUPS.primary.map((e) => e.i18nKey),
      ...NAV_GROUPS.community.map((e) => e.i18nKey),
      ...NAV_GROUPS.authed.map((e) => e.i18nKey),
      ...NAV_GROUPS.admin.map((e) => e.i18nKey),
      COMMUNITY_GROUP_KEY,
      ...(Object.values(NAV_CHROME_KEYS) as NavI18nKey[]),
    ];
    const missing = referenced.filter((k) => !(k in (en.nav as Record<string, string>)));
    expect(missing).toEqual([]);
  });

  it("every nav key follows the flat camelCase convention", () => {
    const violations = enNavKeys.filter((k) => !CAMEL_CASE.test(k));
    expect(violations).toEqual([]);
  });

  it("no locale leaves a nav value blank", () => {
    const blanks: Record<string, string[]> = {};
    const all = { en, ...LOCALES } as Record<string, { nav: Record<string, string> }>;
    for (const [code, bundle] of Object.entries(all)) {
      const empty = Object.entries(bundle.nav)
        .filter(([, v]) => typeof v !== "string" || v.trim() === "")
        .map(([k]) => k);
      if (empty.length) blanks[code] = empty;
    }
    expect(blanks).toEqual({});
  });
});
