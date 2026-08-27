"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useSyncExternalStore } from "react";

/**
 * The breadcrumb, rendered into the global header.
 *
 * The header is in the layout, which does not re-render when you move between
 * documents, and only the page knows which protocol and document are open. So
 * the page renders the crumb into a slot the header leaves for it.
 */

function subscribe(onChange: () => void) {
  window.addEventListener("sap-breadcrumb", onChange);
  return () => window.removeEventListener("sap-breadcrumb", onChange);
}

const slot = () => document.getElementById("workspace-breadcrumb");

export function Breadcrumb({ protocol, page }: { protocol: string; page: string }) {
  // The slot lives in a layout that mounts first, but on the very first client
  // render it is not in the tree this component can see, so it is read from the
  // DOM and re-read once after mount.
  const host = useSyncExternalStore(
    subscribe,
    () => slot(),
    () => null,
  );

  useEffect(() => {
    window.dispatchEvent(new Event("sap-breadcrumb"));
  }, []);

  if (!host) return null;

  return createPortal(
    <nav className="flex min-w-0 items-center gap-1.75 text-sm text-ink-3">
      <span className="max-w-[16rem] truncate">{protocol}</span>
      <span aria-hidden className="text-line-3">
        /
      </span>
      <span className="font-semibold text-ink">{page}</span>
    </nav>,
    host,
  );
}
