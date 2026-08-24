import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { UploadForm } from "@/components/upload-form";
import { UsageTotal } from "@/components/usage-panel";
import type { TokenUsage } from "@/lib/protocol/pricing";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const { data: reviews } = await supabase
    .from("reviews")
    .select("id, status, created_at, model, usage, protocols ( filename )")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <>
      <SiteHeader email={user.email} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">
          Protocol Understanding &amp; Review
        </h1>
        <p className="mt-2 mb-8 text-sm text-muted">
          Upload a thesis protocol, synopsis, or research proposal. You get back its
          design, PICO/PECO, objectives and outcomes, a sample-size verdict, and the
          issues to fix — each with the exact correction.
        </p>

        <UploadForm />

        {reviews && reviews.length > 0 && (
          <section className="mt-14">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">Recent reviews</h2>
              <UsageTotal
                rows={reviews.map((r) => ({
                  model: r.model,
                  usage: (r.usage as TokenUsage | null) ?? null,
                }))}
              />
            </div>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
              {reviews.map((review) => {
                const protocol = review.protocols as unknown as
                  | { filename: string }
                  | { filename: string }[]
                  | null;
                const filename = Array.isArray(protocol)
                  ? protocol[0]?.filename
                  : protocol?.filename;

                return (
                  <li key={review.id}>
                    <Link
                      href={`/reviews/${review.id}`}
                      className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-accent-soft"
                    >
                      <span className="truncate">{filename ?? "Pasted text"}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {review.status === "complete"
                          ? new Date(review.created_at).toLocaleDateString()
                          : review.status}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
