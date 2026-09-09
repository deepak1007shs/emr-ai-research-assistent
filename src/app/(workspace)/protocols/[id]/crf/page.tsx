import { createClient } from "@/lib/supabase/server";
import { loadCurrent } from "@/lib/workspace/document";
import { loadVersions } from "@/lib/workspace/versions";
import { CrfPreview } from "@/components/crf-preview";
import { ReviewRail } from "@/components/review-rail";
import { ChatDock } from "@/components/chat-dock";
import { DocumentToolbar } from "@/components/document-toolbar";
import { BuildButton } from "@/components/build-button";
import { needsFirst } from "@/lib/jobs/plan";
import { NotBuilt } from "@/components/not-built";
import { VersionList } from "@/components/version-list";
import { Breadcrumb } from "@/components/breadcrumb";
import type { CrfSpec } from "@/lib/crf/types";
import type { SapSpec } from "@/lib/sap/types";

export const metadata = { title: "Case Record Form — EMR AI Research Assistant" };

const DESCRIPTION =
  "The data collection plan first: every element against every visit, so a guide can see at a glance what is collected when. Then the form itself, collecting raw values rather than calculated ones, with every option pre-printed and every number carrying its unit.";

export default async function CrfPage({ params }: PageProps<"/protocols/[id]/crf">) {
  const { id } = await params;
  const supabase = await createClient();

  const [form, plan, versions, protocol] = await Promise.all([
    loadCurrent<CrfSpec>(supabase, "crf_forms", id),
    loadCurrent<SapSpec>(supabase, "sap_plans", id),
    loadVersions(supabase, "crf", id),
    supabase.from("protocols").select("filename").eq("id", id).maybeSingle(),
  ]);

  const filename = (protocol.data as { filename?: string } | null)?.filename ?? "Protocol";
  const blocked = plan ? null : needsFirst("crf");

  if (!form) {
    return (
      <>
        <Breadcrumb protocol={filename} page="Case report form" />
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
          <NotBuilt kind="Case Record Form" description={DESCRIPTION}>
            <BuildButton
              kind="crf"
              protocolId={id}
              exists={false}
              blockedReason={blocked}
            />
          </NotBuilt>
        </div>
      </>
    );
  }

  const stale = Boolean(plan && form.sapId !== plan.id);

  // A document whose own checks found something must not wear the same
  // badge as one that passed them.
  const problems = form.findings.some((finding) => finding.severity === "ERROR");

  return (
    <>
      <Breadcrumb protocol={filename} page="Case report form" />

      <DocumentToolbar
        title="Case report form"
        status={stale ? "outdated" : problems ? "needs fixing" : "built"}
        meta={[
          `${form.spec.sections?.length ?? 0} sections`,
          `${versions.length} version${versions.length === 1 ? "" : "s"} · built ${new Date(
            form.createdAt,
          ).toLocaleDateString()}`,
          stale ? "built from an earlier analysis plan" : null,
        ].filter((m): m is string => Boolean(m))}
        downloadHref={`/api/crf/${form.id}/export`}
        alsoHref={`/api/crf/${form.id}/export?doc=plan`}
        alsoLabel="Collection plan"
      >
        <BuildButton
          kind="crf"
          protocolId={id}
          exists
          blockedReason={blocked}
          rebuildLabel="Rebuild"
        />
      </DocumentToolbar>

      <div className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-1 overflow-y-auto py-6 pb-10">
          <CrfPreview spec={form.spec} />
          <div className="mx-auto mt-6 w-full max-w-[var(--sheet-w)] px-6">
            <VersionList kind="crf" versions={versions} />
          </div>
        </section>

        <ReviewRail findings={form.findings}>
          <ChatDock protocolId={id} document="crf" />
        </ReviewRail>
      </div>
    </>
  );
}
