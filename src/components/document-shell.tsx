import type { ReactNode } from "react";

/**
 * The frame every on-screen document shares.
 *
 * A document is read here before it is downloaded, so the page carries the
 * document's own title block and nothing of the application's. Anything the
 * reader does rather than reads goes in `actions`, which does not print.
 */

export function DocumentShell({
  kind,
  title,
  actions,
  children,
}: {
  /** The document's own banner: STATISTICAL ANALYSIS PLAN, CASE REPORT FORM. */
  kind: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="space-y-6">
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
      <header className="border-b border-border pb-4 text-center">
        <p className="text-xs font-semibold tracking-[0.18em] text-muted uppercase">{kind}</p>
        <h1 className="mt-1.5 text-lg font-semibold text-balance">{title}</h1>
      </header>
      {children}
    </article>
  );
}

/** A numbered or named part of a document. */
export function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function DocHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">{children}</h3>;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted italic leading-relaxed">{children}</p>;
}

/**
 * A table that scrolls inside its own box. Document tables are wide, and a page
 * that scrolls sideways as a whole is unreadable.
 */
export function DocTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {headers.map((head, i) => (
              <th
                key={i}
                className="border border-border bg-surface-sunken px-2.5 py-2 text-left align-bottom font-semibold"
              >
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  children,
  bold,
  span,
  indent,
  centre,
}: {
  children?: ReactNode;
  bold?: boolean;
  span?: number;
  indent?: boolean;
  centre?: boolean;
}) {
  return (
    <td
      colSpan={span}
      className={[
        "border border-border px-2.5 py-1.5 align-top",
        bold ? "font-semibold" : "",
        indent ? "pl-6" : "",
        centre ? "text-center" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </td>
  );
}
