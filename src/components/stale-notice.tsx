/**
 * This document was built from a plan that has since been replaced.
 *
 * It is not wrong on its own terms, but it describes the study using the
 * wording the old plan carried, and the three documents are only linked while
 * they share one registry. Saying so is the whole point of tracking which plan
 * a document came from.
 */
export function StaleNotice({ document }: { document: "form" | "tables" }) {
  return (
    <p className="no-print pill bg-warn-soft text-foreground">
      The Statistical Analysis Plan has been rebuilt since this {document === "form" ? "form" : "set of tables"} was
      made, so the two may name the same variable differently. Build it again to bring them back
      into line.
    </p>
  );
}
