import { createClient } from "@/lib/supabase/server";
import { loadCurrent } from "@/lib/workspace/document";
import { TablesPreview } from "@/components/tables-preview";
import { FindingsPanel } from "@/components/findings-panel";
import { BuildButton } from "@/components/build-button";
import { NotBuilt } from "@/components/not-built";
import { DocumentActions } from "@/components/document-actions";
import { StaleNotice } from "@/components/stale-notice";
import type { ShellTablesSpec } from "@/lib/tables/types";
import type { SapSpec } from "@/lib/sap/types";

export const metadata = { title: "Shell Tables — SAP Builder" };

const DESCRIPTION =
  "Every table the study will report, with the cells empty: the baseline and descriptive tables, then the primary outcome, the secondary outcomes, and anything exploratory. Where an analysis is adjusted, the unadjusted and adjusted effects sit side by side so a reader can see what the adjustment did.";

export default async function TablesPage({ params }: PageProps<"/protocols/[id]/tables">) {
  const { id } = await params;
  const supabase = await createClient();

  const [tables, plan] = await Promise.all([
    loadCurrent<ShellTablesSpec>(supabase, "shell_tables", id),
    loadCurrent<SapSpec>(supabase, "sap_plans", id),
  ]);

  const blocked = plan
    ? null
    : "Build the Statistical Analysis Plan first. The tables report what the plan analyses.";

  if (!tables) {
    return (
      <NotBuilt kind="Shell Tables" description={DESCRIPTION}>
        <BuildButton kind="tables" protocolId={id} exists={false} blockedReason={blocked} />
      </NotBuilt>
    );
  }

  const stale = Boolean(plan && tables.sapId !== plan.id);

  return (
    <div className="space-y-6">
      <DocumentActions
        href={`/api/tables/${tables.id}/export`}
        label="Download the tables (.docx)"
      >
        <BuildButton kind="tables" protocolId={id} exists blockedReason={blocked} />
      </DocumentActions>
      {stale && <StaleNotice document="tables" />}
      <FindingsPanel findings={tables.findings} />
      <TablesPreview spec={tables.spec} />
    </div>
  );
}
