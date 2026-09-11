import { createClient } from "@/lib/supabase/server";
import { BuildButton } from "@/components/build-button";
import { Breadcrumb } from "@/components/breadcrumb";
import { DocumentToolbar } from "@/components/document-toolbar";
import { NotBuilt } from "@/components/not-built";
import { SapDocument } from "@/components/sap-document";
import { UsagePanel } from "@/components/usage-panel";
import type { SapBuild } from "@/lib/sap/build";
import type { TokenUsage } from "@/lib/protocol/pricing";

export const metadata = {
  title: "Statistical Analysis Plan — EMR AI Research Assistant",
};

const DESCRIPTION =
  "The question decomposed, every objective written as a question, one analysis row per objective, and every empty results table the thesis will carry. The protocol is read once; everything after that is fixed rules, so building it twice gives the same document.";

export default async function SapPage({ params }: PageProps<"/protocols/[id]/sap">) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: plan }, { data: protocolRow }] = await Promise.all([
    supabase
      .from("sap_plans")
      .select("id, status, error, facts, plan, markdown, model, usage, created_at")
      .eq("protocol_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("protocols").select("filename").eq("id", id).maybeSingle(),
  ]);

  const filename = protocolRow?.filename ?? "this protocol";

  if (!plan) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-[var(--sheet-w)]">
          <NotBuilt kind="Statistical Analysis Plan" description={DESCRIPTION}>
            <BuildButton kind="sap" protocolId={id} exists={false} />
          </NotBuilt>
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

  const failing = build.checks.filter((check) => !check.pass);

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
        alsoHref={`/api/documents/sap/${plan.id}?format=md`}
        alsoLabel="Markdown"
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
          {plan.usage && (
            <UsagePanel usage={plan.usage as TokenUsage} model={plan.model} />
          )}

          {failing.length > 0 && (
            <section className="no-print card p-4">
              <h2 className="text-sm font-semibold">
                {failing.length === 1
                  ? "One check did not pass"
                  : `${failing.length} checks did not pass`}
              </h2>
              <p className="mt-1 text-xs text-muted">
                The plan is still here to read and to download. Each line names
                what failed and what would fix it.
              </p>
              <ul className="mt-3 space-y-2">
                {failing.map((check) => (
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
