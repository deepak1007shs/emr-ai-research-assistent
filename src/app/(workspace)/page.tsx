import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "@/components/upload-form";
import { UsageTotal } from "@/components/usage-panel";
import type { TokenUsage } from "@/lib/protocol/pricing";

export const metadata = { title: "New protocol — SAP Builder" };

/**
 * Uploading, in the middle of the workspace.
 *
 * The same place the documents are read, so starting the next study does not
 * mean leaving the one you are working on: the rail stays, and the protocol you
 * had open is still one click away.
 */
export default async function UploadPage() {
  const supabase = await createClient();

  const { data: reviews } = await supabase
    .from("reviews")
    .select("model, usage")
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          Protocol Understanding &amp; Review
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Upload a thesis protocol, synopsis, or research proposal. You get back its
          design, PICO/PECO, objectives and outcomes, a sample-size verdict, and the
          issues to fix, each with the exact correction. From there you answer the
          issues and build the analysis plan, the case report form and the shell tables.
        </p>
      </header>

      <UploadForm />

      <section className="card p-4">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
          What happens next
        </h2>
        <ol className="mt-3 space-y-2 text-xs leading-relaxed">
          {[
            "The review reads the protocol and lists the blockers, in the order to fix them.",
            "You answer each blocker in its own box. Your answers outrank the protocol.",
            "The Statistical Analysis Plan turns the objectives into answerable questions and picks each test.",
            "The Case Report Form collects the raw data the plan needs, and nothing it can calculate.",
            "The Shell Tables lay out every table the thesis will report, with the cells empty.",
          ].map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-accent text-[0.6rem] font-semibold text-accent-foreground">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        {reviews && reviews.length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            <UsageTotal
              rows={reviews.map((r) => ({
                model: r.model,
                usage: (r.usage as TokenUsage | null) ?? null,
              }))}
            />
          </div>
        )}
      </section>
    </div>
  );
}
