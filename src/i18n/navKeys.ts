/**
 * Single source of truth for navigation entries.
 *
 * Why this file exists:
 *   - Navigation labels used to be sprinkled across `Navigation.tsx` with
 *     hand-typed `t("nav.foo")` strings, which led to "Codex" and
 *     "Community" silently shipping in English on every locale because the
 *     key was either typo'd or the label was hardcoded.
 *   - The registry below pairs each route id with its i18n key. The key
 *     type is derived from the English bundle (`NavI18nKey`), so any time
 *     someone removes a `nav.*` entry from `en.json` TypeScript will fail
 *     this file's compilation — surfacing the breakage at build time.
 *
 * Naming convention (enforced by `nav-keys.test.ts`):
 *   - Flat camelCase keys directly under `nav.*` — no nesting, no kebab.
 *   - Every locale must define every key present in `en.json`'s `nav`
 *     bundle. The test walks all locales and lists missing/extra keys.
 *
 * To add a new nav item:
 *   1. Add the key to `en.json` under `nav.*` (this becomes part of
 *      `NavI18nKey` automatically).
 *   2. Add a translation for the same key to every other locale file —
 *      `nav-keys.test.ts` will fail until you do.
 *   3. Append an entry below in the appropriate `NAV_GROUPS` group.
 */
import en from "./locales/en.json";

export type NavI18nKey = keyof typeof en.nav;

export interface NavEntry {
  /** Stable internal identifier used by router/page state. */
  id: string;
  /** Key under the `nav.*` i18n bundle — typed against the English source. */
  i18nKey: NavI18nKey;
}

/**
 * Grouped so the navigation component can render each cluster (primary
 * tabs, community dropdown, authenticated extras) without re-declaring
 * shapes locally.
 */
export const NAV_GROUPS = {
  primary: [
    { id: "home", i18nKey: "home" },
    { id: "chapters", i18nKey: "chapters" },
    { id: "characters", i18nKey: "codex" },
  ] as const satisfies readonly NavEntry[],
  community: [
    { id: "forum", i18nKey: "forum" },
    { id: "leaderboard", i18nKey: "leaderboard" },
    { id: "world", i18nKey: "worldAtlas" },
  ] as const satisfies readonly NavEntry[],
  /** Visible only to signed-in users. */
  authed: [
    { id: "rewards", i18nKey: "rewards" },
  ] as const satisfies readonly NavEntry[],
  /** Visible only to admins. */
  admin: [
    { id: "admin", i18nKey: "admin" },
  ] as const satisfies readonly NavEntry[],
} as const;

/**
 * The "Community" group label itself is also a nav-bundle key — exposed
 * here so the dropdown trigger pulls from the same registry instead of a
 * hardcoded string (which is exactly the bug that prompted this refactor).
 */
export const COMMUNITY_GROUP_KEY: NavI18nKey = "community";

/** Standalone keys used by the chrome (sign-in/out, profile, language picker). */
export const NAV_CHROME_KEYS = {
  signIn: "signIn",
  signOut: "signOut",
  profile: "profile",
  language: "language",
} as const satisfies Record<string, NavI18nKey>;
