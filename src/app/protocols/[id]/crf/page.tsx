import { createClient } from "@/lib/supabase/server";
import { loadCurrent } from "@/lib/workspace/document";
import { CrfPreview } from "@/components/crf-preview";
import { FindingsPanel } from "@/components/findings-panel";
import { BuildButton } from "@/components/build-button";
import { NotBuilt } from "@/components/not-built";
import { DocumentActions } from "@/components/document-actions";
import { StaleNotice } from "@/components/stale-notice";
import type { CrfSpec } from "@/lib/crf/types";
import type { SapSpec } from "@/lib/sap/types";

export const metadata = { title: "Case Report Form — SAP Builder" };

const DESCRIPTION =
  "The data collection plan first: every element against every visit, so a guide can see at a glance what is collected when. Then the form itself, collecting raw values rather than calculated ones, with every option pre-printed and every number carrying its unit.";

export default async function CrfPage({ params }: PageProps<"/protocols/[id]/crf">) {
  const { id } = await params;
  const supabase = await createClient();

  const [form, plan, review] = await Promise.all([
    loadCurrent<CrfSpec>(supabase, "crf_forms", id),
    loadCurrent<SapSpec>(supabase, "sap_plans", id),
    supabase
      .from("reviews")
      .select("id")
      .eq("protocol_id", id)
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // The form collects what the plan analyses, so without one there is nothing
  // to build it against. The route enforces this too.
  const blocked = plan
    ? null
    : "Build the Statistical Analysis Plan first. The form collects what the plan analyses.";

  if (!form) {
    return (
      <NotBuilt kind="Case Report Form" description={DESCRIPTION}>
        <BuildButton
          kind="crf"
          protocolId={id}
          reviewId={review.data?.id}
          exists={false}
          blockedReason={blocked}
        />
      </NotBuilt>
    );
  }

  const stale = Boolean(plan && form.sapId !== plan.id);

  return (
    <div className="space-y-6">
      <DocumentActions
        href={`/api/crf/${form.id}/export`}
        label="Download the form (.docx)"
      >
        <BuildButton
          kind="crf"
          protocolId={id}
          reviewId={review.data?.id}
          exists
          blockedReason={blocked}
        />
      </DocumentActions>
      {stale && <StaleNotice document="form" />}
      <FindingsPanel findings={form.findings} />
      <CrfPreview spec={form.spec} />
    </div>
  );
}
