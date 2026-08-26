import { createClient } from "@/lib/supabase/server";
import { loadCurrent } from "@/lib/workspace/document";
import { SapPreview } from "@/components/sap-preview";
import { FindingsPanel } from "@/components/findings-panel";
import { BuildButton } from "@/components/build-button";
import { NotBuilt } from "@/components/not-built";
import { DocumentActions } from "@/components/document-actions";
import type { SapSpec } from "@/lib/sap/types";
import type { ShellTablesSpec } from "@/lib/tables/types";
import { tableNumbers } from "@/lib/tables/types";

export const metadata = { title: "Statistical Analysis Plan — SAP Builder" };

const DESCRIPTION =
  "Your objectives rewritten as answerable questions, and the analysis map that links each one to its outcome, its predictors and the table it will fill. The test is chosen from the data type and the comparison, so the same study always gives the same plan.";

export default async function SapPage({ params }: PageProps<"/protocols/[id]/sap">) {
  const { id } = await params;
  const supabase = await createClient();

  const [plan, shells, review] = await Promise.all([
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
  ]);

  if (!plan) {
    return (
      <NotBuilt kind="Statistical Analysis Plan" description={DESCRIPTION}>
        <BuildButton kind="sap" protocolId={id} reviewId={review.data?.id} exists={false} />
      </NotBuilt>
    );
  }

  return (
    <div className="space-y-6">
      <DocumentActions href={`/api/sap/${plan.id}/export`} label="Download SAP (.docx)">
        <BuildButton
          kind="sap"
          protocolId={id}
          reviewId={review.data?.id}
          exists
          rebuildLabel="Rebuild with my answers"
        />
      </DocumentActions>
      <FindingsPanel findings={plan.findings} />
      {/* Once the shell tables exist they own the numbering, so the plan
          prints the number the reader will actually find. */}
      <SapPreview spec={plan.spec} tableNumbers={tableNumbers(shells?.spec)} />
    </div>
  );
}
