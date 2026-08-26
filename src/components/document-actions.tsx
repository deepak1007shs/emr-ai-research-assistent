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
  children,
}: {
  href: string;
  label: string;
  children?: ReactNode;
}) {
  return (
    <div className="no-print flex flex-wrap items-start justify-between gap-3">
      <a href={href} className="btn btn-primary">
        {label}
      </a>
      <div>{children}</div>
    </div>
  );
}
