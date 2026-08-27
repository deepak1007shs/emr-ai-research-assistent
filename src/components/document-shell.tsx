import type { ReactNode } from "react";

/**
 * The paper a document is read on.
 *
 * A sheet, centred, with the chrome outside it. The document is read here
 * before it is downloaded, so the page carries the document's own title block
 * and nothing of the application's.
 */

export function DocumentShell({
  kind,
  title,
  subtitle,
  children,
}: {
  /** The document's own eyebrow: SECTION 6 - SHELL TABLES. */
  kind: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[var(--sheet-w)] px-6">
      <article className="sheet px-[3.75rem] pt-14 pb-16">
        <p className="eyebrow mb-6.5">{kind}</p>
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 mb-8.5 text-sm text-ink-3">{subtitle}</p>}
        <div className={subtitle ? "" : "mt-8.5"}>{children}</div>
      </article>
    </div>
  );
}

/** A part of a document, with the space between parts the design gives. */
export function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-base font-bold tracking-tight text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function DocHeading({ children }: { children: ReactNode }) {
  return <h3 className="eyebrow mt-4 mb-1.5">{children}</h3>;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-xs leading-relaxed text-ink-3">{children}</p>;
}

/**
 * A table set as print sets one: a rule above the head, a rule below it, and a
 * hairline under every row. No vertical rules, no fill.
 */
export function DocTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {headers.map((head, i) => (
              <th
                key={i}
                className="border-t-[1.5px] border-b border-t-ink border-b-ink px-2.5 py-2 text-xs font-bold whitespace-nowrap text-ink"
                style={{ textAlign: i === 0 ? "left" : "center" }}
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
  /** An empty cell in a shell table: present, and visibly unfilled. */
  placeholder,
}: {
  children?: ReactNode;
  bold?: boolean;
  span?: number;
  indent?: boolean;
  centre?: boolean;
  placeholder?: boolean;
}) {
  return (
    <td
      colSpan={span}
      className={[
        "border-b border-line-2 px-2.5 py-1.75 align-top",
        bold ? "font-semibold" : "",
        indent ? "pl-6" : "",
        centre ? "text-center" : "",
        placeholder ? "text-ink-4" : "text-ink",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </td>
  );
}

/** The Item / Your study shape the glance and the PICOT box both use. */
export function FactTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map(([label, value], i) => (
            <tr key={i}>
              <Td bold>{label}</Td>
              <Td>{value}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A bold lead-in then the text, as the rules read. */
export function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="mt-2 text-xs leading-relaxed text-ink">
      <span className="font-semibold">{label}</span> {children}
    </p>
  );
}
