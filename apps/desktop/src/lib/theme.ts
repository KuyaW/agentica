export type Theme = "light" | "dark";
export type Accent = "lilac" | "mint" | "peach" | "sky" | "rose";

const STORAGE_KEY = "agentica.theme";
const ACCENT_KEY = "agentica.accent";

/** Swatches for the settings picker; each matches its `data-accent` palette. */
export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: "lilac", label: "Lilac", swatch: "#8a78f6" },
  { id: "mint", label: "Mint", swatch: "#63d7b2" },
  { id: "peach", label: "Peach", swatch: "#ffb37a" },
  { id: "sky", label: "Sky", swatch: "#74b9fb" },
  { id: "rose", label: "Rose", swatch: "#f887b5" },
];

/** Window chrome colour per palette, matching the aurora backdrop. */
const ACCENT_BG: Record<Accent, { light: string; dark: string }> = {
  lilac: { light: "#eceafb", dark: "#14111f" },
  mint: { light: "#e9f7f1", dark: "#16211f" },
  peach: { light: "#fcf0e5", dark: "#241b18" },
  sky: { light: "#e7f1fd", dark: "#141b26" },
  rose: { light: "#fdeaf3", dark: "#241722" },
};

/** Stored preference first, then the operating-system default. */
export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage can be unavailable; fall back to the system preference.
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Stored accent first, then the base lilac palette. */
export function readAccent(): Accent {
  try {
    const stored = localStorage.getItem(ACCENT_KEY);
    const match = ACCENTS.find((entry) => entry.id === stored);
    if (match) return match.id;
  } catch {
    // Storage can be unavailable; fall back to the base palette.
  }
  return "lilac";
}

/** Apply a theme and accent to the document and remember them for next launch. */
export function applyTheme(theme: Theme, accent: Accent = readAccent()) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.accent = accent;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      theme === "dark" ? ACCENT_BG[accent].dark : ACCENT_BG[accent].light,
    );
  try {
    localStorage.setItem(STORAGE_KEY, theme);
    localStorage.setItem(ACCENT_KEY, accent);
  } catch {
    // Storage can be unavailable; the choice still applies for this session.
  }
}
