import { createClient } from "@/lib/supabase/server";
import { BuildButton } from "@/components/build-button";
import { CrfDocument } from "@/components/crf-document";
import { DocumentToolbar } from "@/components/document-toolbar";
import { NotBuilt } from "@/components/not-built";
import { crfBlockers, crfWarnings, type CrfForm } from "@/lib/crf/build";
import { needsFirst } from "@/lib/jobs/plan";

export const metadata = { title: "Case Record Form — EMR AI Research Assistant" };

const DESCRIPTION =
  "The form the data collector fills in, built from the analysis plan rather than from the protocol. It captures exactly what the plan's tables report: not less, not extra, and never a value the plan calculates.";

const PARTS = [
  {
    name: "Form and subject identifiers",
    detail: "The study ID, the dates, and who filled the form in.",
  },
  {
    name: "One section per block the study records",
    detail:
      "Demographics, history, examination, measurements - each in the words the measure dictionary uses.",
  },
  {
    name: "One sub-section per follow-up visit",
    detail:
      "Every repeated measure written again in each visit that takes it, with the visit's own date.",
  },
  {
    name: "Four columns, numbered from 1 in every section",
    detail: "S.No., the field, its type, and a blank answer space. No response is pre-filled.",
  },
];

export default async function CrfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: form }, { data: plan }] = await Promise.all([
    supabase
      .from("crf_forms")
      .select("id, form, markdown, sap_id, status, error, created_at")
      .eq("protocol_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("sap_plans")
      .select("id")
      .eq("protocol_id", id)
      .eq("status", "ready")
      .not("plan", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const blocked = needsFirst("crf", { sap: Boolean(plan?.id) });

  if (!form) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-[var(--sheet-w)]">
          <NotBuilt
            kind="Case Record Form"
            description={DESCRIPTION}
            parts={PARTS}
            note="It costs nothing to build: no model call, only the plan's own objects."
          >
            <BuildButton
              kind="crf"
              protocolId={id}
              exists={false}
              blockedReason={blocked}
            />
          </NotBuilt>
        </div>
      </div>
    );
  }

  if (form.status === "failed" || !form.form) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-[var(--sheet-w)] space-y-4">
          <h1 className="text-xl font-semibold tracking-tight">Case Record Form</h1>
          <p className="pill bg-danger-soft text-danger">
            {form.error ?? "The form was not built."}
          </p>
          <BuildButton kind="crf" protocolId={id} exists blockedReason={blocked} />
        </div>
      </div>
    );
  }

  const built = form.form as CrfForm;
  const failing = crfBlockers(built);
  const warned = crfWarnings(built);
  // A form built from a plan that has since been rebuilt is not wrong, but it
  // was checked against tables that may have changed.
  const stale = Boolean(plan?.id && form.sap_id !== plan.id);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
      <div className="mx-auto w-full max-w-[var(--sheet-w)] space-y-5">
        <DocumentToolbar
          title="Case Record Form"
          status={stale ? "outdated" : failing.length ? "needs fixing" : "built"}
          meta={[
            `${built.counts.sections} sections`,
            `${built.counts.fields} fields`,
            stale ? "built from an earlier analysis plan" : null,
          ].filter(Boolean)}
          downloadHref={`/api/documents/crf/${form.id}?format=docx`}
          downloadLabel="Download the form"
          also={[{ href: `/api/documents/crf/${form.id}?format=md`, label: "Markdown" }]}
        >
          <BuildButton
            kind="crf"
            protocolId={id}
            exists
            rebuildLabel="Build it again"
            blockedReason={blocked}
          />
        </DocumentToolbar>

        {/* No usage panel. There is no model call, so there is no cost to break
            down, and a panel reading $0.00 asserts that a call was made and was
            free. */}
        <p className="text-xs text-muted">
          Built from the analysis plan by rules. No model call, so building it again
          costs nothing and gives the same form.
        </p>

        {failing.length > 0 && (
          <section className="card space-y-2 p-4">
            <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
              {failing.length} {failing.length === 1 ? "finding" : "findings"} to settle
            </h2>
            <ul className="space-y-2 text-xs">
              {failing.map((check) => (
                <li key={check.id}>
                  <span className="font-semibold">{check.id}</span> — {check.message}
                  {check.failing.length > 0 && (
                    <span className="text-muted"> ({check.failing.join(", ")})</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {warned.length > 0 && (
          <section className="card space-y-2 p-4">
            <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
              Worth a look
            </h2>
            <ul className="space-y-2 text-xs">
              {warned.map((check) => (
                <li key={check.id}>
                  <span className="font-semibold">{check.id}</span> — {check.message}
                </li>
              ))}
            </ul>
          </section>
        )}

        {built.todos.length > 0 && (
          <section className="card space-y-2 p-4">
            <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
              Open items
            </h2>
            <ul className="list-disc space-y-1.5 pl-4 text-xs">
              {built.todos.map((todo, i) => (
                <li key={i}>{todo}</li>
              ))}
            </ul>
          </section>
        )}

        <CrfDocument form={built} />
      </div>
    </div>
  );
}
