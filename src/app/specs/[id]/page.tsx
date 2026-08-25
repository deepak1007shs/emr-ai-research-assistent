import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { SpecDecisions, SpecFindings } from "@/components/spec-decisions";
import { UsagePanel } from "@/components/usage-panel";
import type { StudySpec } from "@/lib/study-spec/types";
import { gateSpec } from "@/lib/study-spec/gate";
import { RepairSpecButton } from "@/components/repair-spec-button";
import type { TokenUsage } from "@/lib/protocol/pricing";

export const metadata = { title: "Study specification — SAP Builder" };

const DOCUMENTS = [
  ["crf", "Case Record Form"],
  ["sap", "Statistical Analysis Plan"],
  ["tables", "Shell Tables"],
] as const;

export default async function SpecPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: row } = await supabase
    .from("study_specs")
    .select("id, status, error, spec, validation, model, usage, signed_at, protocols ( filename )")
    .eq("id", id)
    .single();

  if (!row) notFound();

  const protocol = row.protocols as unknown as { filename: string } | null;
  // Re-run the gate rather than trusting what it said when this was drafted.
  // A guard that has since been corrected must not leave stale errors blocking
  // a specification that is now valid.
  const gate = row.spec ? gateSpec(row.spec) : { findings: [], errors: [] };
  const findings = gate.findings;
  const errors = gate.errors;
  const signed = row.status === "signed" || row.status === "locked";

  if (row.status === "failed") {
    return (
      <>
        <SiteHeader email={user.email} />
        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
          <h1 className="text-xl font-semibold">Drafting failed</h1>
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">
            {row.error ?? "No reason was recorded."}
          </p>
          <Link href="/" className="mt-6 inline-block text-sm text-accent underline underline-offset-2">
            Back to protocols
          </Link>
        </main>
      </>
    );
  }

  if (!row.spec) {
    return (
      <>
        <SiteHeader email={user.email} />
        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
          <h1 className="text-xl font-semibold">This specification is still being drafted</h1>
          <p className="mt-2 text-sm text-muted">Reload the page in a minute.</p>
        </main>
      </>
    );
  }

  const spec = row.spec as StudySpec;

  return (
    <>
      <SiteHeader email={user.email} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <Link href="/" className="text-xs text-accent underline underline-offset-2">
          &larr; All protocols
        </Link>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Study specification</h1>
        <p className="mt-1 text-sm text-muted">
          {spec.study.title}
          {protocol?.filename ? ` — from ${protocol.filename}` : ""}
        </p>
        <p className="mt-1 text-xs text-muted">
          Version {spec.spec_version} ·{" "}
          {signed
            ? `signed${row.signed_at ? ` on ${new Date(row.signed_at).toLocaleDateString()}` : ""}`
            : "draft, not yet signed"}
        </p>

        {row.usage && (
          <div className="mt-6">
            <UsagePanel usage={row.usage as TokenUsage} model={row.model} />
          </div>
        )}

        <div className="mt-8">
          <SpecFindings findings={findings} />
        </div>

        <div className="mt-8">
          <SpecDecisions spec={spec} />
        </div>

        <section className="mt-10 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-base font-semibold">Documents</h2>

          {errors.length > 0 ? (
            <>
              <p className="mt-2 text-sm text-danger">
                {errors.length} error{errors.length === 1 ? "" : "s"} must be fixed before any
                document can be built. A document generated from a specification that fails
                the gate would be used as though someone had checked it.
              </p>
              <p className="mt-2 text-sm text-muted">
                Most findings are mechanical. Try the free repair first; it costs nothing and
                usually clears them.
              </p>
              <div className="mt-3">
                <RepairSpecButton specId={row.id} />
              </div>
            </>
          ) : signed ? (
            <>
              <p className="mt-2 text-sm text-muted">
                All three are rendered from this specification, so they cannot disagree with
                one another. Edit the specification and rebuild; never edit a document.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {DOCUMENTS.map(([key, label]) => (
                  <a
                    key={key}
                    href={`/api/specs/${row.id}/export?doc=${key}`}
                    className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white"
                  >
                    {label} (.docx)
                  </a>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted">
                Nothing renders until you sign this off. Read the decisions above first.
              </p>
              <form action={`/api/specs/${row.id}/sign`} method="post" className="mt-4">
                <button
                  type="submit"
                  className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white"
                >
                  I have read the decisions — sign off
                </button>
              </form>
            </>
          )}
        </section>
      </main>
    </>
  );
}
