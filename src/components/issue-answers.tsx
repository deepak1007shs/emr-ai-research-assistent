"use client";

import { useState } from "react";

/**
 * Where the investigator answers the issues the review raised.
 *
 * One box rather than one per issue: the answers are read by a model, and free
 * prose lets someone answer one issue or all twelve in their own words. What
 * matters is that they are decisions, so they are labelled as such and they
 * override the protocol when the specification is built.
 */
export function IssueAnswers({
  reviewId,
  issues,
  initial,
}: {
  reviewId: string;
  issues: [string, string][];
  initial: string | null;
}) {
  const [answers, setAnswers] = useState(initial ?? "");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    setSaved("saving");
    try {
      const response = await fetch(`/api/reviews/${reviewId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      setSaved(response.ok ? "saved" : "error");
    } catch {
      setSaved("error");
    }
  }

  return (
    <section className="no-print rounded-xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold">Your answers to these issues</h2>
      <p className="mt-1 text-sm text-muted">
        Answer as many as you want to, in your own words. These are treated as
        decisions rather than notes: where an answer contradicts the protocol, the
        answer is what the study will do. They are saved against this review.
      </p>

      {issues.length > 0 && (
        <ol className="mt-4 space-y-1 text-xs text-muted">
          {issues.map(([heading], i) => (
            <li key={i}>
              {i + 1}. {heading}
            </li>
          ))}
        </ol>
      )}

      <textarea
        value={answers}
        onChange={(e) => {
          setAnswers(e.target.value);
          setSaved("idle");
        }}
        rows={8}
        placeholder={
          "For example:\n\n1. The primary outcome is the intraoperative conversion rate.\n2. Power the study on that, not on length of stay.\n4. ASA III patients are excluded; inclusion is ASA I to II."
        }
        className="mt-4 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saved === "saving"}
          className="rounded-lg border border-border px-3 py-2 text-xs font-medium disabled:opacity-50"
        >
          {saved === "saving" ? "Saving..." : "Save answers"}
        </button>
        {saved === "saved" && (
          <span className="text-xs text-muted">
            Saved. They will be used when the documents are built.
          </span>
        )}
        {saved === "error" && (
          <span className="text-xs text-danger">Could not save. Try again.</span>
        )}
      </div>
    </section>
  );
}
