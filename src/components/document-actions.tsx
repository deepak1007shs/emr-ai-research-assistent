import type { ReactNode } from "react";

/**
 * The bar above a document: download it, or build it again.
 *
 * It does not print. What prints is the document underneath, which is the point
 * of reading it here first.
 */
export function DocumentActions({
  href,
  label,
  alsoHref,
  alsoLabel,
  children,
}: {
  href: string;
  label: string;
  /** A second format of the same document, where one exists. */
  alsoHref?: string;
  alsoLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="no-print flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        <a href={href} className="btn btn-primary">
          {label}
        </a>
        {alsoHref && (
          <a href={alsoHref} className="btn btn-quiet">
            {alsoLabel}
          </a>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}
