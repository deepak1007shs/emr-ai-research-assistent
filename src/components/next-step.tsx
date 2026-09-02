import Link from "next/link";
import { BuildButton } from "@/components/build-button";

/**
 * Where to go once the issues have been answered.
 *
 * Each document can still be built from its own page, which is right: that page
 * shows what it will produce before you pay for it. But the three run in a
 * fixed order - the form and the tables are both built from the plan - so
 * building them one at a time meant three visits, three clicks, and a tab that
 * had to stay open through all of it. One press does the three in order now,
 * and stopping watching does not stop the work.
 */
export function NextStep({
  protocolId,
  built,
}: {
  protocolId: string;
  /** True once a plan exists, so the button offers a rebuild rather than a build. */
  built?: boolean;
}) {
  return (
    <section className="no-print card p-5">
      <h2 className="text-sm font-semibold">Next: build the three documents</h2>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Answer what you can above first. Your decisions outrank the protocol, so a document
        built after them describes the study as corrected rather than as written. The plan
        comes first: the form and the tables are both built from it, which is the order
        this runs them in.
      </p>

      <div className="mt-4">
        <BuildButton
          kind="documents"
          protocolId={protocolId}
          exists={built}
          rebuildLabel="Build all three again"
        />
      </div>

      <p className="mt-4 text-xs text-muted">Or build them one at a time:</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link href={`/protocols/${protocolId}/sap`} className="btn btn-quiet">
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
