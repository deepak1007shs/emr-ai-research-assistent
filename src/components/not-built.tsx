import type { ReactNode } from "react";

/**
 * A document that does not exist yet.
 *
 * The page says what the document is before offering to build it, because the
 * decision to spend a few minutes and a little money is easier to make when you
 * know what comes back. It used to say that in one paragraph, which is the
 * least useful shape for the question a reader actually has: not "what is this"
 * but "what will I be looking at".
 *
 * So the sections are listed, in the order the finished document prints them.
 * A reader who has seen one of these before can skip the list; a reader who has
 * not now knows what the button buys.
 */

export type Part = {
  /** The section's name, as the finished document heads it. */
  name: string;
  /** One line saying what is in it. */
  detail: string;
};

export function NotBuilt({
  kind,
  description,
  parts = [],
  note,
  children,
}: {
  kind: string;
  description: string;
  /** The sections of the finished document, in printing order. */
  parts?: Part[];
  /** What to expect of the build itself: how long, where it runs. */
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="card p-6 sm:p-7">
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="text-lg font-semibold tracking-tight text-ink">{kind}</h1>
        <span className="inline-flex h-5 items-center rounded-full bg-line-2 px-2 text-2xs font-semibold text-ink-3">
          Not built
        </span>
      </div>

      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
        {description}
      </p>

      {parts.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-lg border border-line">
          <p className="border-b border-line bg-surface-sunken px-3.5 py-2 text-2xs font-semibold tracking-wide text-ink-3 uppercase">
            What it contains
          </p>
          <ol className="divide-y divide-line">
            {parts.map((part, i) => (
              <li
                key={part.name}
                className="flex items-baseline gap-3 px-3.5 py-2.5"
              >
                <span className="tnum w-4 shrink-0 text-xs font-semibold text-ink-4">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="text-sm font-medium text-ink">{part.name}</span>
                  <span className="ml-1.5 text-sm text-muted">{part.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        {children}
        {note && <p className="max-w-prose text-xs text-ink-3">{note}</p>}
      </div>
    </section>
  );
}
