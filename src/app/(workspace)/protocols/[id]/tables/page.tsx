import { createClient } from "@/lib/supabase/server";
import { loadCurrent } from "@/lib/workspace/document";
import { loadVersions } from "@/lib/workspace/versions";
import { tableNumberIn } from "@/lib/workspace/findings";
import { TablesPreview } from "@/components/tables-preview";
import { ReviewRail } from "@/components/review-rail";
import { ChatDock } from "@/components/chat-dock";
import { DocumentToolbar } from "@/components/document-toolbar";
import { BuildButton } from "@/components/build-button";
import { needsFirst } from "@/lib/jobs/plan";
import { NotBuilt } from "@/components/not-built";
import { VersionList } from "@/components/version-list";
import { Breadcrumb } from "@/components/breadcrumb";
import type { ShellTablesSpec } from "@/lib/tables/types";
import type { SapSpec } from "@/lib/sap/types";

export const metadata = { title: "Shell Tables — EMR AI Research Assistant" };

const DESCRIPTION =
  "Every table the study will report, with the cells empty: the baseline and descriptive tables, then the primary outcome, the secondary outcomes, and anything exploratory. Where an analysis is adjusted, the unadjusted and adjusted effects sit side by side so a reader can see what the adjustment did.";

export default async function TablesPage({ params }: PageProps<"/protocols/[id]/tables">) {
  const { id } = await params;
  const supabase = await createClient();

  const [tables, plan, versions, protocol] = await Promise.all([
    loadCurrent<ShellTablesSpec>(supabase, "shell_tables", id),
    loadCurrent<SapSpec>(supabase, "sap_plans", id),
    loadVersions(supabase, "tables", id),
    supabase.from("protocols").select("filename").eq("id", id).maybeSingle(),
  ]);

  const filename = (protocol.data as { filename?: string } | null)?.filename ?? "Protocol";
  const blocked = plan ? null : needsFirst("tables");

  if (!tables) {
    return (
      <>
        <Breadcrumb protocol={filename} page="Shell tables" />
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
          <NotBuilt kind="Shell Tables" description={DESCRIPTION}>
            <BuildButton kind="tables" protocolId={id} exists={false} blockedReason={blocked} />
          </NotBuilt>
        </div>
      </>
    );
  }

  const stale = Boolean(plan && tables.sapId !== plan.id);
  // What the review rail points at, so the reader can mark the same tables.
  const flagged = new Set(
    tables.findings.map((f) => tableNumberIn(f.message)).filter((n): n is number => n !== null),
  );

  // A document whose own checks found something must not wear the same
  // badge as one that passed them.
  const problems = tables.findings.some((finding) => finding.severity === "ERROR");

  return (
    <>
      <Breadcrumb protocol={filename} page="Shell tables" />

      <DocumentToolbar
        title="Shell tables"
        status={stale ? "outdated" : problems ? "needs fixing" : "built"}
        meta={[
          `${tables.spec.tables?.length ?? 0} tables`,
          `${versions.length} version${versions.length === 1 ? "" : "s"} · built ${new Date(
            tables.createdAt,
          ).toLocaleDateString()}`,
          stale ? "built from an earlier analysis plan" : null,
        ].filter((m): m is string => Boolean(m))}
        // The tables are Section 6 of the analysis plan now, so the download
        // is the plan. One document to sign rather than two carrying the same
        // tables and able to disagree.
        downloadHref={plan ? `/api/sap/${plan.id}/export` : undefined}
        downloadLabel={plan ? "Download the plan (tables are Section 6)" : undefined}
      >
        <BuildButton
          kind="tables"
          protocolId={id}
          exists
          blockedReason={blocked}
          rebuildLabel="Rebuild"
        />
      </DocumentToolbar>

      <div className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-1 overflow-y-auto py-6 pb-10">
          <TablesPreview spec={tables.spec} flagged={flagged} />
          <div className="mx-auto mt-6 w-full max-w-[var(--sheet-w)] px-6">
            <VersionList kind="tables" versions={versions} />
          </div>
        </section>

        <ReviewRail findings={tables.findings}>
          <ChatDock protocolId={id} document="tables" />
        </ReviewRail>
      </div>
    </>
  );
}
