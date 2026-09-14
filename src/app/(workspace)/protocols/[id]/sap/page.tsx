import { createClient } from "@/lib/supabase/server";
import { BuildButton } from "@/components/build-button";
import { Breadcrumb } from "@/components/breadcrumb";
import { DocumentToolbar } from "@/components/document-toolbar";
import { NotBuilt } from "@/components/not-built";
import { SapDocument } from "@/components/sap-document";
import { GateAStopped } from "@/components/gate-a-stopped";
import type { FactsSheet } from "@/lib/study/types";
import { UsagePanel } from "@/components/usage-panel";
import { blockers, warnings, type SapBuild } from "@/lib/sap/build";
import type { TokenUsage } from "@/lib/protocol/pricing";
import { isStalled, planToShow } from "@/lib/jobs/plan";
import { buildableFromReading } from "@/lib/sap/stored";
import { BuildFromReading } from "@/components/build-from-reading";

export const metadata = {
  title: "Statistical Analysis Plan — EMR AI Research Assistant",
};

const DESCRIPTION =
  "The protocol is read once, into a sheet of facts. Everything after that is fixed rules over those facts, so building the plan twice gives the same document, down to the number of tables.";

/** The sections of the finished plan, in the order it prints them. */
const PARTS = [
  {
    name: "PICOT or PECO",
    detail: "the clinical question decomposed, and the one sentence it assembles to.",
  },
  {
    name: "Section 1, objectives",
    detail: "the aim, the hypothesis, and every objective as a question with a fixed id.",
  },
  {
    name: "Analysis Map",
    detail: "one row per objective: its outcome, its predictors, its test and the table it fills.",
  },
  {
    name: "Section 6, shell tables",
    detail: "every empty results table the thesis will carry, numbered and pinned to that count.",
  },
  {
    name: "Open items",
    detail: "every decision the plan will not take on your behalf, each one marked in the document.",
  },
];

export default async function SapPage({ params }: PageProps<"/protocols/[id]/sap">) {
  const { id } = await params;
  const supabase = await createClient();

  const COLUMNS = "id, status, error, facts, plan, markdown, model, usage, created_at";
  const [{ data: newest }, { data: finished }, { data: job }, { data: protocolRow }] =
    await Promise.all([
      supabase
        .from("sap_plans")
        .select(COLUMNS)
        .eq("protocol_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // The newest plan that finished, for when the newest build did not.
      supabase
        .from("sap_plans")
        .select(COLUMNS)
        .eq("protocol_id", id)
        .eq("status", "ready")
        .not("plan", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Whether a plan build is running now, which the row alone cannot say.
      supabase
        .from("jobs")
        .select("status, updated_at")
        .eq("protocol_id", id)
        .in("kind", ["sap", "both"])
        .eq("status", "running")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("protocols").select("filename").eq("id", id).maybeSingle(),
    ]);

  const shown = planToShow(newest, Boolean(job && !isStalled(job)), Boolean(finished));
  const plan = shown === "previous" ? finished : newest;

  const filename = protocolRow?.filename ?? "this protocol";

  if (!plan) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-[var(--sheet-w)]">
          <NotBuilt
            kind="Statistical Analysis Plan"
            description={DESCRIPTION}
            parts={PARTS}
            note="One call to the model, then eight steps of rules. It runs on the server, so you can close this tab and come back to it."
          >
            <BuildButton kind="sap" protocolId={id} exists={false} />
          </NotBuilt>
        </div>
      </div>
    );
  }

  if (shown === "stopped") {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <section className="card mx-auto max-w-[var(--sheet-w)] p-6">
          <h1 className="text-base font-semibold">The last build was stopped</h1>
          <p className="mt-1.5 text-sm text-ink-3">
            It was stopped before it finished, and no earlier plan was built for
            this protocol. Building again picks up what the stopped build had
            already paid for, where there is anything to pick up.
          </p>
          <div className="mt-4">
            <BuildButton kind="sap" protocolId={id} exists={false} />
          </div>
        </section>
      </div>
    );
  }

  // Stopped at Gate A under a rule since corrected: the reading passes now, so
  // the plan is built from it, and the protocol is not read or paid for again.
  // Shown in place of the Gate A card, which would list no failing check.
  if (buildableFromReading(plan)) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <section className="card mx-auto max-w-[var(--sheet-w)] space-y-3 p-6">
          <h1 className="text-base font-semibold">This reading can now be built into a plan</h1>
          <p className="max-w-prose text-sm text-ink-3">
            Gate A stopped this plan when the protocol was read, under a check that
            has since been corrected. The reading passes it now. The plan is built
            from the reading already stored: the protocol is not read again, and
            nothing is charged.
          </p>
          <BuildFromReading planId={plan.id} />
          <div className="border-t border-line pt-3">
            <BuildButton kind="sap" protocolId={id} exists rebuildLabel="Read the protocol again instead (billed)" />
          </div>
        </section>
      </div>
    );
  }

  // Stopped at Gate A: the protocol was read and paid for, the facts are kept,
  // and the page shows what they say beside the checks that stopped it.
  if (plan.status === "failed" && plan.facts && !plan.plan) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-[var(--sheet-w)] space-y-4">
          <GateAStopped facts={plan.facts as FactsSheet} />
          {/* Above the cost panel, where it is seen: below it, it was missed. */}
          <BuildButton kind="sap" protocolId={id} exists rebuildLabel="Read the protocol again" />
          {plan.usage && (
            <UsagePanel usage={plan.usage as TokenUsage} model={plan.model} what="plan" />
          )}
        </div>
      </div>
    );
  }

  if (plan.status === "failed" || !plan.plan || !plan.facts) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <section className="card mx-auto max-w-[var(--sheet-w)] p-6">
          <h1 className="text-base font-semibold">
            {plan.status === "failed" ? "This plan failed" : "This plan is still running"}
          </h1>
          {plan.status === "failed" ? (
            <p className="pill mt-3 bg-danger-soft text-danger">
              {plan.error ?? "No reason was recorded."}
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-ink-3">
              It runs on the server, so you can close this tab and come back to it.
            </p>
          )}
          <div className="mt-4">
            <BuildButton kind="sap" protocolId={id} exists={false} />
          </div>
        </section>
      </div>
    );
  }

  // The row holds the build with its facts split off, because the facts are the
  // one thing a model produced and are worth their own column.
  const build = {
    ...(plan.plan as Omit<SapBuild, "facts">),
    facts: plan.facts,
  } as SapBuild;

  const failing = blockers(build);
  const warned = warnings(build);

  return (
    <>
      <Breadcrumb protocol={filename} page="Analysis plan" />

      <DocumentToolbar
        title="Statistical analysis plan"
        status={failing.length ? "needs fixing" : "built"}
        meta={[
          `${build.pinned.tables} tables`,
          `${build.todos.length} open items`,
          `built ${new Date(plan.created_at).toLocaleDateString()}`,
        ]}
        downloadHref={`/api/documents/sap/${plan.id}?format=docx`}
        downloadLabel="Download the plan"
        also={[
          {
            href: `/api/documents/sap/${plan.id}?format=docx&variant=short`,
            label: "Short plan (.docx)",
          },
          { href: `/api/documents/sap/${plan.id}?format=md`, label: "Markdown" },
        ]}
      >
        <BuildButton
          kind="sap"
          protocolId={id}
          exists
          rebuildLabel="Build the plan again"
        />
      </DocumentToolbar>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto w-full max-w-[var(--sheet-w)] space-y-6">
          {shown === "previous" && (
            <p className="no-print card p-4 text-sm">
              The last build was stopped before it finished. This is the plan
              built on {new Date(plan.created_at).toLocaleDateString()}.
            </p>
          )}

          {plan.usage && (
            <UsagePanel usage={plan.usage as TokenUsage} model={plan.model} what="plan" />
          )}

          {(failing.length > 0 || warned.length > 0) && (
            <section className="no-print card p-4">
              <h2 className="text-sm font-semibold">
                {failing.length === 0
                  ? warned.length === 1
                    ? "One thing worth a look"
                    : `${warned.length} things worth a look`
                  : failing.length === 1
                    ? "One check did not pass"
                    : `${failing.length} checks did not pass`}
              </h2>
              <p className="mt-1 text-xs text-muted">
                The plan is still here to read and to download. Each line names
                what failed and what would fix it.
              </p>
              <ul className="mt-3 space-y-2">
                {[...failing, ...warned].map((check) => (
                  <li key={check.id} className="text-xs">
                    <span className="font-mono font-semibold">{check.id}</span>{" "}
                    {check.message}
                    {check.failing.length > 0 && (
                      <span className="text-muted"> ({check.failing.join(", ")})</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {build.todos.length > 0 && (
            <section className="no-print card p-4">
              <h2 className="text-sm font-semibold">
                {build.todos.length} things the plan will not decide for you
              </h2>
              <p className="mt-1 text-xs text-muted">
                Each of these is marked in the document. Where the protocol is
                silent the plan writes the house default and says so; where a
                value would have to be invented, it asks instead.
              </p>
              <ul className="mt-3 list-disc space-y-1.5 pl-5">
                {build.todos.map((todo) => (
                  <li key={todo} className="text-xs">
                    {todo}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <SapDocument build={build} />

          {plan.markdown && (
            <details className="no-print card px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium">
                View the raw Markdown
              </summary>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-background p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                {plan.markdown}
              </pre>
            </details>
          )}
        </div>
      </div>
    </>
  );
}
