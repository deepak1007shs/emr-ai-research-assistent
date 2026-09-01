import { createClient } from "@/lib/supabase/server";
import { loadCurrent } from "@/lib/workspace/document";
import { loadVersions } from "@/lib/workspace/versions";
import { tableNumbers } from "@/lib/tables/types";
import { SapPreview } from "@/components/sap-preview";
import { ReviewRail } from "@/components/review-rail";
import { ChatDock } from "@/components/chat-dock";
import { DocumentToolbar } from "@/components/document-toolbar";
import { BuildButton } from "@/components/build-button";
import { NotBuilt } from "@/components/not-built";
import { VersionList } from "@/components/version-list";
import { Breadcrumb } from "@/components/breadcrumb";
import type { SapSpec } from "@/lib/sap/types";
import type { ShellTablesSpec } from "@/lib/tables/types";

export const metadata = { title: "Statistical Analysis Plan — EMR AI Research Assistant" };

const DESCRIPTION =
  "Your objectives rewritten as answerable questions, and the analysis map that links each one to its outcomes, its predictors and the tables it will fill. The analysis is planned from the data type and the comparison, so the same study always gives the same plan.";

export default async function SapPage({ params }: PageProps<"/protocols/[id]/sap">) {
  const { id } = await params;
  const supabase = await createClient();

  const [plan, shells, review, versions, protocol] = await Promise.all([
    loadCurrent<SapSpec>(supabase, "sap_plans", id),
    loadCurrent<ShellTablesSpec>(supabase, "shell_tables", id),
    supabase
      .from("reviews")
      .select("id")
      .eq("protocol_id", id)
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadVersions(supabase, "sap", id),
    supabase.from("protocols").select("filename").eq("id", id).maybeSingle(),
  ]);

  const filename = (protocol.data as { filename?: string } | null)?.filename ?? "Protocol";

  if (!plan) {
    return (
      <>
        <Breadcrumb protocol={filename} page="Analysis plan" />
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
          <NotBuilt kind="Statistical Analysis Plan" description={DESCRIPTION}>
            <BuildButton kind="sap" protocolId={id} reviewId={review.data?.id} exists={false} />
          </NotBuilt>
        </div>
      </>
    );
  }

  // A document whose own checks found something must not wear the same
  // badge as one that passed them.
  const problems = plan.findings.some((finding) => finding.severity === "ERROR");

  return (
    <>
      <Breadcrumb protocol={filename} page="Analysis plan" />

      <DocumentToolbar
        title="Analysis plan"
        status={problems ? "needs fixing" : "built"}
        meta={[
          `${plan.spec.analyses?.length ?? 0} analyses`,
          `${versions.length} version${versions.length === 1 ? "" : "s"} · built ${new Date(
            plan.createdAt,
          ).toLocaleDateString()}`,
        ]}
        downloadHref={`/api/sap/${plan.id}/export`}
        alsoHref={`/api/sap/${plan.id}/export?doc=short`}
        alsoLabel="Short plan"
      >
        <BuildButton
          kind="sap"
          protocolId={id}
          reviewId={review.data?.id}
          exists
          rebuildLabel="Rebuild"
        />
      </DocumentToolbar>

      <div className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-1 overflow-y-auto py-6 pb-10">
          {/* Once the shell tables exist they own the numbering, so the plan
              prints the number the reader will actually find. */}
          <SapPreview spec={plan.spec} tableNumbers={tableNumbers(shells?.spec)} />
          <div className="mx-auto mt-6 w-full max-w-[var(--sheet-w)] px-6">
            <VersionList kind="sap" versions={versions} />
          </div>
        </section>

        <ReviewRail findings={plan.findings}>
          <ChatDock protocolId={id} document="sap" />
        </ReviewRail>
      </div>
    </>
  );
}
