import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { actionSpecSchema, reviewSpecSchema } from "@/lib/protocol/schema";
import { ActionTable } from "@/components/action-table";
import { ReviewDocument } from "@/components/review-document";
import { UsagePanel } from "@/components/usage-panel";
import { DocumentButtons } from "@/components/document-buttons";
import { IssueAnswers } from "@/components/issue-answers";
import type { TokenUsage } from "@/lib/protocol/pricing";
import { SiteHeader } from "@/components/site-header";

export const metadata = { title: "Review — SAP Builder" };

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: review } = await supabase
    .from("reviews")
    .select(
      "id, protocol_id, status, error, markdown, spec, action_spec, answers, model, usage, created_at, protocols ( filename )",
    )
    .eq("id", id)
    .single();

  // RLS makes someone else's review indistinguishable from a missing one.
  if (!review) notFound();

  const protocol = review.protocols as unknown as
    | { filename: string }
    | { filename: string }[]
    | null;
  const filename = Array.isArray(protocol) ? protocol[0]?.filename : protocol?.filename;

  if (review.status === "failed") {
    return (
      <>
        <SiteHeader email={user.email} />
        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
          <h1 className="text-xl font-semibold">This review failed</h1>
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">
            {review.error ?? "No reason was recorded."}
          </p>
          <Link href="/" className="mt-6 inline-block text-sm text-accent underline underline-offset-2">
            Try another protocol
          </Link>
        </main>
      </>
    );
  }

  // One specification per protocol: if one already exists, link to it rather
  // than paying to draft a second.
  const { data: existingSpec } = await supabase
    .from("study_specs")
    .select("id, status")
    .eq("protocol_id", review.protocol_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const existingSpecId = existingSpec?.id ?? null;
  const specSigned = existingSpec?.status === "signed" || existingSpec?.status === "locked";

  const parsed = reviewSpecSchema.safeParse(review.spec);
  // Reviews produced before the action document existed simply have no action
  // list — the section and its buttons are hidden rather than offering a
  // download that would fail.
  const actionParsed = actionSpecSchema.safeParse(review.action_spec);
  const actions = actionParsed.success ? actionParsed.data : null;

  if (review.status !== "complete" || !parsed.success) {
    return (
      <>
        <SiteHeader email={user.email} />
        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
          <h1 className="text-xl font-semibold">This review is still running</h1>
          <p className="mt-2 text-sm text-muted">Reload the page in a minute.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader email={user.email} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <div className="no-print mb-8">
          <Link href="/" className="text-xs text-accent underline underline-offset-2">
            ← All reviews
          </Link>
          {filename && <p className="mt-1 truncate text-xs text-muted">{filename}</p>}

          <div className="mt-4 space-y-3">
            {actions && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted">
                  Action list — the blockers only
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/api/reviews/${review.id}/export?doc=actions&format=docx`}
                    className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white"
                  >
                    Download action list (.docx)
                  </a>
                  <a
                    href={`/api/reviews/${review.id}/export?doc=actions&format=md`}
                    className="rounded-lg border border-border px-3 py-2 text-xs font-medium"
                  >
                    .md
                  </a>
                </div>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted">Full review</p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/api/reviews/${review.id}/export?doc=review&format=docx`}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-medium"
                >
                  Download full review (.docx)
                </a>
                <a
                  href={`/api/reviews/${review.id}/export?doc=review&format=md`}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-medium"
                >
                  .md
                </a>
              </div>
            </div>
          </div>
        </div>

        {review.usage && (
          <div className="mb-8">
            <UsagePanel usage={review.usage as TokenUsage} model={review.model} />
          </div>
        )}

        {actions && (
          <div className="mb-8">
            <ActionTable spec={actions} />
          </div>
        )}

        <div className="mb-8">
          <IssueAnswers
            reviewId={review.id}
            issues={parsed.data.key_issues}
            initial={review.answers}
          />
        </div>

        <div className="mb-10">
          <DocumentButtons
            protocolId={review.protocol_id}
            reviewId={review.id}
            specId={existingSpecId}
            signed={specSigned}
          />
        </div>

        <ReviewDocument spec={parsed.data} />

        {review.markdown && (
          <details className="no-print mt-12 rounded-xl border border-border bg-surface px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">
              View the raw Markdown
            </summary>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-background p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {review.markdown}
            </pre>
          </details>
        )}
      </main>
    </>
  );
}
