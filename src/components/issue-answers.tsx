"use client";

import { useState } from "react";
import type { ActionSpec } from "@/lib/protocol/schema";

/**
 * Where the investigator settles the issues before the documents are built.
 *
 * A box per blocker, so nothing is skipped by accident, and a general box for
 * everything that does not belong to one numbered issue. Both are folded into
 * one block of prose before a model sees them: the boxes are for the human.
 *
 * These are decisions, not notes. Where an answer contradicts the protocol, the
 * answer is what the study will do.
 */

type Saved = "idle" | "saving" | "saved" | "error";

export function IssueAnswers({
  reviewId,
  actions,
  issues,
  initialGeneral,
  initialIssueAnswers,
}: {
  reviewId: string;
  /** The action list: the blockers, in the order to address them. */
  actions: ActionSpec | null;
  /** The long review's issues, shown when there is no action list. */
  issues: [string, string][];
  initialGeneral: string | null;
  initialIssueAnswers: Record<string, string>;
}) {
  const [general, setGeneral] = useState(initialGeneral ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>(initialIssueAnswers);
  const [saved, setSaved] = useState<Saved>("idle");

  // Called from a blur, which happens after the state it reads has settled, so
  // it always sends what is on screen.
  async function save() {
    setSaved("saving");
    try {
      const response = await fetch(`/api/reviews/${reviewId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: general, issueAnswers: answers }),
      });
      setSaved(response.ok ? "saved" : "error");
    } catch {
      setSaved("error");
    }
  }

  const rows = actions?.issues_table?.rows ?? [];
  const answered = Object.values(answers).filter((a) => a.trim()).length;

  return (
    <section className="no-print card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Your decisions on these issues</h2>
        {rows.length > 0 && (
          <span className="text-xs text-muted">
            {answered} of {rows.length} answered
          </span>
        )}
      </div>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Answer as many as you want to, in your own words. These are treated as decisions rather
        than notes: where an answer contradicts the protocol, the answer is what the study will do.
        They are saved as you go, and used when the plan, the form and the tables are built.
      </p>

      {rows.length > 0 ? (
        <ol className="mt-4 space-y-4">
          {rows.map((row, index) => {
            const [area, issue, change] = row;
            const key = String(index);
            return (
              <li key={index} className="grid gap-2 md:grid-cols-[1fr_1fr] md:gap-4">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                    {index + 1}. {area}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed">{issue}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    <span className="font-semibold">Do this:</span> {change}
                  </p>
                </div>
                <textarea
                  value={answers[key] ?? ""}
                  onChange={(e) => {
                    setAnswers((current) => ({ ...current, [key]: e.target.value }));
                    setSaved("idle");
                  }}
                  onBlur={save}
                  rows={3}
                  placeholder="Your decision on this one"
                  className="field resize-y leading-relaxed"
                  aria-label={`Your decision on issue ${index + 1}, ${area}`}
                />
              </li>
            );
          })}
        </ol>
      ) : (
        issues.length > 0 && (
          <ol className="mt-4 space-y-1 text-xs text-muted">
            {issues.map(([heading], i) => (
              <li key={i}>
                {i + 1}. {heading}
              </li>
            ))}
          </ol>
        )
      )}

      <label className="mt-5 block">
        <span className="text-xs font-semibold tracking-wide text-muted uppercase">
          Anything else
        </span>
        <textarea
          value={general}
          onChange={(e) => {
            setGeneral(e.target.value);
            setSaved("idle");
          }}
          onBlur={save}
          rows={4}
          placeholder={
            "Decisions that do not belong to one numbered issue.\nFor example: follow-up is 30 days; ASA III patients are excluded."
          }
          className="field mt-1.5 resize-y leading-relaxed"
        />
      </label>

      <p className="mt-2 text-xs text-muted" aria-live="polite">
        {saved === "saving" && "Saving..."}
        {saved === "saved" && "Saved. They will be used when the documents are built."}
        {saved === "error" && <span className="text-danger">Could not save. Try again.</span>}
        {saved === "idle" && "Saved automatically when you leave a box."}
      </p>
    </section>
  );
}
