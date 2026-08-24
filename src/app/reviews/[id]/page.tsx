import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { reviewSpecSchema } from "@/lib/protocol/schema";
import { ReviewDocument } from "@/components/review-document";
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
    .select("id, status, error, markdown, spec, model, usage, created_at, protocols ( filename )")
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

  const parsed = reviewSpecSchema.safeParse(review.spec);
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
        <div className="no-print mb-8 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Link href="/" className="text-xs text-accent underline underline-offset-2">
              ← All reviews
            </Link>
            {filename && <p className="mt-1 truncate text-xs text-muted">{filename}</p>}
          </div>
          <div className="flex gap-2">
            <a
              href={`/api/reviews/${review.id}/export?format=docx`}
              className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white"
            >
              Download .docx
            </a>
            <a
              href={`/api/reviews/${review.id}/export?format=md`}
              className="rounded-lg border border-border px-3 py-2 text-xs font-medium"
            >
              Download .md
            </a>
          </div>
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
