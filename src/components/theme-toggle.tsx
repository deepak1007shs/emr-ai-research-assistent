"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "./icons";

/**
 * Light or dark, by choice.
 *
 * The choice is written to `data-theme` on the document element and remembered
 * in localStorage. The stored value is applied before first paint by the script
 * in the root layout, so the document element is the source of truth and this
 * component only reads it.
 */

export type Theme = "light" | "dark";

export const THEME_KEY = "sap-builder-theme";

/**
 * Applied before the page paints. Kept as a string so it can be inlined by the
 * root layout, and deliberately small: it runs before anything else.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

const CHANGED = "sap-theme-change";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}

const read = (): Theme =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";

/** Light, because that is the default the stylesheet declares. */
const readOnServer = (): Theme => "light";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, readOnServer);
  const next: Theme = theme === "dark" ? "light" : "dark";

  function choose() {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // A browser with storage blocked still gets the theme for this page.
    }
    window.dispatchEvent(new Event(CHANGED));
  }

  return (
    <button
      type="button"
      onClick={choose}
      className="flex size-[1.875rem] shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink-3 transition-colors hover:bg-bg hover:text-ink-2"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
