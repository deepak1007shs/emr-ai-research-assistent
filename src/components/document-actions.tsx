import type { ReactNode } from "react";

/**
 * The bar above a document: download it, or build it again.
 *
 * It does not print. What prints is the document underneath, which is the point
 * of reading it here first.
 */

export type Download = {
  href: string;
  label: string;
  /** A second format of the same document, where one exists. */
  alsoHref?: string;
  alsoLabel?: string;
  /** One line saying what this cut of the document contains. */
  note?: string;
};

function DownloadRow({ download, primary }: { download: Download; primary: boolean }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <a href={download.href} className={primary ? "btn btn-primary" : "btn btn-quiet"}>
          {download.label}
        </a>
        {download.alsoHref && (
          <a href={download.alsoHref} className="btn btn-quiet">
            {download.alsoLabel}
          </a>
        )}
      </div>
      {download.note && <p className="text-xs text-muted">{download.note}</p>}
    </div>
  );
}

export function DocumentActions({
  href,
  label,
  alsoHref,
  alsoLabel,
  note,
  /** A second cut of the same document, such as the short plan. */
  second,
  children,
}: Download & { second?: Download; children?: ReactNode }) {
  return (
    <div className="no-print flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-3">
        <DownloadRow download={{ href, label, alsoHref, alsoLabel, note }} primary />
        {second && <DownloadRow download={second} primary={false} />}
      </div>
      <div>{children}</div>
    </div>
  );
}
