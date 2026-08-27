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

/** A part of a document, headed as the .docx heads it. */
export function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-base font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function DocHeading({ children }: { children: ReactNode }) {
  return <h3 className="eyebrow mt-4 mb-1.5">{children}</h3>;
}

/** The italic notes the .docx prints under a table or a section. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-sm leading-relaxed text-ink-3 italic">{children}</p>;
}

/**
 * A table drawn the way the .docx draws one.
 *
 * Every cell carries all four borders in a hairline, the header row is bold and
 * centred from the second column, and the cell padding matches the Word
 * renderer's margins. What is read here is what is downloaded, so the two are
 * not allowed to look like different documents.
 */
export function DocTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm text-ink">
        <thead>
          <tr>
            {headers.map((head, i) => (
              <th
                key={i}
                className="border border-ink px-2.5 py-1.5 align-top text-sm font-bold"
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
        "border border-ink px-2.5 py-1.5 align-top",
        bold ? "font-bold" : "",
        indent ? "pl-6" : "",
        centre ? "text-center" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* A cell with nothing in it still has to hold its height. An empty shell
          table is a grid of empty boxes, which is what it should look like. */}
      {children ?? "\u00a0"}
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
