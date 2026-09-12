import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "@/components/upload-form";
import { UsageTotal } from "@/components/usage-panel";
import type { TokenUsage } from "@/lib/protocol/pricing";

export const metadata = { title: "New protocol — EMR AI Research Assistant" };

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
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
      <div className="mx-auto w-full max-w-[var(--sheet-w)] space-y-8">
      {/*
        The page a study starts on, so it says what to do and not what the
        first document is called. It read "Protocol Understanding & Review"
        over an upload box - the name of a document nobody has yet - followed
        by four lines of prose describing three documents, with the only
        action on the page below all of it.
      */}
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Start a new protocol</h1>
        <p className="mt-2 text-sm text-muted">
          A thesis protocol, synopsis or research proposal. Three documents come back.
        </p>
      </header>

      <UploadForm />

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          {
            step: "1",
            name: "Protocol Review",
            detail:
              "The design, the PICO or PECO, every objective and outcome, a verdict on the sample size, and each issue with the correction it needs.",
            state: null,
          },
          {
            step: "2",
            name: "Analysis Plan",
            detail:
              "Every objective as an answerable question, the test each one owes, and Section 6: every table the thesis will report, with the cells empty.",
            state: null,
          },
          {
            step: "3",
            name: "Case Record Form",
            detail:
              "The fields that fill those tables, grouped by visit. Nothing the plan can calculate, and nothing no table reports.",
            state: "not built yet",
          },
        ].map((doc) => (
          <article key={doc.name} className="card flex flex-col gap-2 p-4">
            <div className="flex items-baseline gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[0.65rem] font-semibold text-accent-foreground">
                {doc.step}
              </span>
              <h2 className="text-sm font-semibold tracking-tight">{doc.name}</h2>
            </div>
            <p className="text-xs leading-relaxed text-muted">{doc.detail}</p>
            {/*
              Said plainly rather than promised. The page claimed the form was
              one of the three you get back, and the builder it needs is not
              wired to the application yet.
            */}
            {doc.state && (
              <span className="mt-auto w-fit rounded-full border border-border px-2 py-0.5 text-[0.65rem] text-muted">
                {doc.state}
              </span>
            )}
          </article>
        ))}
      </section>

      {reviews && reviews.length > 0 && (
        <section className="card p-4">
          <UsageTotal
            rows={reviews.map((r) => ({
              model: r.model,
              usage: (r.usage as TokenUsage | null) ?? null,
            }))}
          />
        </section>
      )}
      </div>
    </div>
  );
}
