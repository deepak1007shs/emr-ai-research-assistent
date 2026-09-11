import type { ReactNode } from "react";
import { DownloadIcon } from "./icons";

/**
 * The bar above the document: what it is, how it stands, and what you can do
 * with it.
 *
 * It does not print. What prints is the document underneath, which is the point
 * of reading it here first.
 */

export type Status = "built" | "needs fixing" | "outdated" | "not built";

const STATUS: Record<Status, { label: string; className: string }> = {
  built: { label: "Built", className: "bg-ok-50 text-ok" },
  // A document whose own checks failed must not wear the same badge as one
  // that passed them. It is still downloadable, and the findings beside it say
  // what is wrong; what it may not do is look finished.
  "needs fixing": { label: "Needs fixing", className: "bg-warn-50 text-warn" },
  outdated: { label: "Outdated", className: "bg-amber-50 text-amber" },
  "not built": { label: "Not built", className: "bg-line-2 text-ink-3" },
};

export function DocumentToolbar({
  title,
  status,
  /** The short facts under the title: counts, version, when it was built. */
  meta,
  downloadHref,
  downloadLabel = "Download .docx",
  /** Other things the same document can be taken away as. */
  also = [],
  children,
}: {
  title: string;
  status: Status;
  meta?: ReactNode[];
  downloadHref?: string;
  downloadLabel?: string;
  /** A list rather than one, because a plan has a short form as well as a
   *  Markdown form, and both belong beside the document they come from. */
  also?: { href: string; label: string }[];
  /** The rebuild control, which knows how to stream. */
  children?: ReactNode;
}) {
  const pill = STATUS[status];

  return (
    <div className="no-print flex shrink-0 flex-wrap items-center gap-3.5 border-b border-line bg-surface px-5 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2.25">
          <h1 className="text-lg font-semibold tracking-tight text-ink">{title}</h1>
          <span
            className={`inline-flex h-5 items-center rounded-full px-2 text-2xs font-semibold ${pill.className}`}
          >
            {pill.label}
          </span>
        </div>
        {meta && meta.length > 0 && (
          <div className="mt-0.75 flex flex-wrap items-center gap-1.75 text-xs text-ink-3">
            {meta.map((item, i) => (
              <span key={i} className="flex items-center gap-1.75">
                {i > 0 && (
                  <span aria-hidden className="text-line-3">
                    ·
                  </span>
                )}
                {item}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1" />

      <div className="flex flex-wrap items-center gap-2">
        {children}
        {also.map((item) => (
          <a key={item.href} href={item.href} className="btn btn-quiet">
            {item.label}
          </a>
        ))}
        {downloadHref && (
          <a href={downloadHref} className="btn btn-primary">
            <DownloadIcon />
            {downloadLabel}
          </a>
        )}
      </div>
    </div>
  );
}
