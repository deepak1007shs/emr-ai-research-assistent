import Link from "next/link";

/**
 * Where to go once the issues have been answered.
 *
 * The three documents are built from their own pages, which is right: each one
 * shows what it will produce before you pay for it. But a review that ends with
 * nothing to press leaves the investigator to work out that the rail is the way
 * on, so it is said here instead.
 */
export function NextStep({ protocolId }: { protocolId: string }) {
  return (
    <section className="no-print card p-5">
      <h2 className="text-sm font-semibold">Next: build the three documents</h2>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Answer what you can above first. Your decisions outrank the protocol, so a document
        built after them describes the study as corrected rather than as written. The plan
        comes first: the form and the tables are built from it.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/protocols/${protocolId}/sap`} className="btn btn-primary">
          Statistical Analysis Plan
        </Link>
        <Link href={`/protocols/${protocolId}/crf`} className="btn btn-quiet">
          Case Report Form
        </Link>
        <Link href={`/protocols/${protocolId}/tables`} className="btn btn-quiet">
          Shell Tables
        </Link>
      </div>
    </section>
  );
}
