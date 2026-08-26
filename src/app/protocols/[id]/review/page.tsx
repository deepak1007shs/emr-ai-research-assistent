import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { actionSpecSchema, reviewSpecSchema } from "@/lib/protocol/schema";
import { ActionTable } from "@/components/action-table";
import { ReviewDocument } from "@/components/review-document";
import { UsagePanel } from "@/components/usage-panel";
import { IssueAnswers } from "@/components/issue-answers";
import type { TokenUsage } from "@/lib/protocol/pricing";

export const metadata = { title: "Protocol Review — SAP Builder" };

export default async function ReviewPage({ params }: PageProps<"/protocols/[id]/review"> ) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: review } = await supabase
    .from("reviews")
    .select("id, status, error, markdown, spec, action_spec, answers, model, usage, created_at")
    .eq("protocol_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!review) {
    return (
      <section className="card p-6">
        <h1 className="text-base font-semibold">No review yet</h1>
        <p className="mt-1.5 text-sm text-muted">
          This protocol was uploaded but never reviewed, or its review is still running.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm text-accent underline underline-offset-2">
          Upload it again
        </Link>
      </section>
    );
  }

  if (review.status === "failed") {
    return (
      <section className="card p-6">
        <h1 className="text-base font-semibold">This review failed</h1>
        <p className="pill mt-3 bg-danger-soft text-danger">
          {review.error ?? "No reason was recorded."}
        </p>
      </section>
    );
  }

  const parsed = reviewSpecSchema.safeParse(review.spec);
  if (review.status !== "complete" || !parsed.success) {
    return (
      <section className="card p-6">
        <h1 className="text-base font-semibold">This review is still running</h1>
        <p className="mt-1.5 text-sm text-muted">Reload the page in a minute.</p>
      </section>
    );
  }

  // Reviews produced before the action document existed simply have no action
  // list; the section is hidden rather than offering a download that would fail.
  const actionParsed = actionSpecSchema.safeParse(review.action_spec);
  const actions = actionParsed.success ? actionParsed.data : null;

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap gap-2">
        {actions && (
          <a
            href={`/api/reviews/${review.id}/export?doc=actions&format=docx`}
            className="btn btn-primary"
          >
            Download action list (.docx)
          </a>
        )}
        <a
          href={`/api/reviews/${review.id}/export?doc=review&format=docx`}
          className="btn btn-quiet"
        >
          Download full review (.docx)
        </a>
        <a
          href={`/api/reviews/${review.id}/export?doc=review&format=md`}
          className="btn btn-quiet"
        >
          .md
        </a>
      </div>

      {review.usage && (
        <UsagePanel usage={review.usage as TokenUsage} model={review.model} />
      )}

      {actions && <ActionTable spec={actions} />}

      <IssueAnswers
        reviewId={review.id}
        issues={parsed.data.key_issues}
        initial={review.answers}
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
  );
}
