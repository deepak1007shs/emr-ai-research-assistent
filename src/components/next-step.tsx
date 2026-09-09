import Link from "next/link";
import { BuildButton } from "@/components/build-button";

/**
 * Where to go once the issues have been answered.
 *
 * Each document can still be built from its own page, which is right: that page
 * shows what it will produce before you pay for it. But they run in a fixed
 * order - the tables and the form are both built from the plan - so building
 * them one at a time meant three visits, three clicks, and a tab that had to
 * stay open through all of it. One press does them in order now, and stopping
 * watching does not stop the work.
 *
 * There used to be a third link here, to a Shell Tables page. The tables are
 * Section 6 of the plan and have had no page of their own since; the link was
 * left behind and went nowhere.
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
      <h2 className="text-sm font-semibold">Next: build the plan and the form</h2>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Answer what you can above first. Your decisions outrank the protocol, so a document
        built after them describes the study as corrected rather than as written. The plan
        comes first: its shell tables are Section 6 of it, and the form collects exactly
        what those tables report, which is the order this runs them in.
      </p>

      <div className="mt-4">
        <BuildButton
          kind="documents"
          protocolId={protocolId}
          exists={built}
          rebuildLabel="Build them again"
        />
      </div>

      <p className="mt-4 text-xs text-muted">Or open one and build it from there:</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link href={`/protocols/${protocolId}/sap`} className="btn btn-quiet">
          Statistical Analysis Plan
        </Link>
        <Link href={`/protocols/${protocolId}/crf`} className="btn btn-quiet">
          Case Record Form
        </Link>
      </div>
    </section>
  );
}
