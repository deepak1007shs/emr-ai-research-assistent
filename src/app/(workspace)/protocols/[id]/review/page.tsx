import { createClient } from "@/lib/supabase/server";
import { actionSpecSchema, reviewSpecSchema } from "@/lib/protocol/schema";
import { ActionTable } from "@/components/action-table";
import { ReviewDocument } from "@/components/review-document";
import { UsagePanel } from "@/components/usage-panel";
import { IssueAnswers } from "@/components/issue-answers";
import { NotBuilt } from "@/components/not-built";
import { BuildButton } from "@/components/build-button";
import { DeleteReview } from "@/components/delete-review";
import { parseIssueAnswers } from "@/lib/protocol/answers";
import { Breadcrumb } from "@/components/breadcrumb";
import { DocumentToolbar } from "@/components/document-toolbar";
import type { TokenUsage } from "@/lib/protocol/pricing";

export const metadata = { title: "Protocol Review — EMR AI Research Assistant" };

const REVIEW_DESCRIPTION =
  "What the protocol settles, what it leaves open, and the issues an examiner would raise. It is the first of the four documents and the only one that reads the protocol critically; the analysis plan is written against your answers to it.";

export default async function ReviewPage({ params }: PageProps<"/protocols/[id]/review"> ) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: review } = await supabase
    .from("reviews")
    .select(
      "id, status, error, markdown, spec, action_spec, answers, issue_answers, model, usage, created_at, protocols ( filename )",
    )
    .eq("protocol_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // The review comes first: nothing below it can be built until it exists, so
  // this page offers it rather than sending the user back to the upload form.
  if (!review) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-[var(--sheet-w)]">
          <NotBuilt kind="Protocol Review" description={REVIEW_DESCRIPTION}>
            <BuildButton kind="review" protocolId={id} exists={false} />
          </NotBuilt>
        </div>
      </div>
    );
  }

  if (review.status === "failed") {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
      <section className="card mx-auto max-w-[var(--sheet-w)] p-6">
        <h1 className="text-base font-semibold">This review failed</h1>
        <p className="pill mt-3 bg-danger-soft text-danger">
          {review.error ?? "No reason was recorded."}
        </p>
        <div className="mt-4">
          <BuildButton kind="review" protocolId={id} exists={false} />
        </div>
      </section>
      </div>
    );
  }

  const protocol = review.protocols as unknown as
    | { filename: string }
    | { filename: string }[]
    | null;
  const filename =
    (Array.isArray(protocol) ? protocol[0]?.filename : protocol?.filename) ?? "this protocol";

  const parsed = reviewSpecSchema.safeParse(review.spec);
  if (review.status !== "complete" || !parsed.success) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
      <section className="card mx-auto max-w-[var(--sheet-w)] p-6">
        <h1 className="text-base font-semibold">This review is still running</h1>
        <p className="mt-1.5 text-sm text-ink-3">
          It runs on the server, so you can close this tab and come back to it.
        </p>
        {/* Picks the running build back up and shows where it has got to, even
            in a tab that was not open when it started. */}
        <div className="mt-4">
          <BuildButton kind="review" protocolId={id} exists={false} />
        </div>
      </section>
      </div>
    );
  }

  // Reviews produced before the action document existed simply have no action
  // list; the section is hidden rather than offering a download that would fail.
  const actionParsed = actionSpecSchema.safeParse(review.action_spec);
  const actions = actionParsed.success ? actionParsed.data : null;

  return (
    <>
      <Breadcrumb protocol={filename} page="Protocol review" />

      <DocumentToolbar
        title="Protocol review"
        status="built"
        meta={[
          `${parsed.data.key_issues.length} issues`,
          `reviewed ${new Date(review.created_at).toLocaleDateString()}`,
        ]}
        downloadHref={`/api/reviews/${review.id}/export?doc=review&format=docx`}
        downloadLabel="Download the review"
        alsoHref={
          actions ? `/api/reviews/${review.id}/export?doc=actions&format=docx` : undefined
        }
        alsoLabel="Action list"
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto w-full max-w-[var(--sheet-w)] space-y-6">

      {review.usage && (
        <UsagePanel usage={review.usage as TokenUsage} model={review.model} />
      )}

      {actions && <ActionTable spec={actions} />}

      <IssueAnswers
        reviewId={review.id}
        actions={actions}
        issues={parsed.data.key_issues}
        initialGeneral={review.answers}
        initialIssueAnswers={parseIssueAnswers(review.issue_answers)}
      />

      <DeleteReview
        reviewId={review.id}
        filename={filename}
        hasAnswers={Boolean(review.answers) || Boolean(review.issue_answers)}
      />

      <ReviewDocument spec={parsed.data} />

      {review.markdown && (
        <details className="no-print card px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">View the raw Markdown</summary>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-background p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {review.markdown}
          </pre>
        </details>
      )}
            </div>
      </div>
    </>
  );
}
