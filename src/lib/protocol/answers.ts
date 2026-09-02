import type { ActionSpec, Consequence } from "./schema.ts";

/**
 * The investigator's decisions, as one block of prose.
 *
 * The boxes are for the human: one per blocker, so nothing is skipped by
 * accident. The model still reads prose, because prose is what it reads best,
 * and because an answer is a decision rather than a field value. This is where
 * the one becomes the other.
 *
 * Answers are keyed by index into the action list. A review is immutable once
 * complete, so those indices do not shift under an answer already written.
 */

export type IssueAnswers = Record<string, string>;

export function parseIssueAnswers(value: unknown): IssueAnswers {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: IssueAnswers = {};
  for (const [key, answer] of Object.entries(value as Record<string, unknown>)) {
    if (typeof answer === "string" && answer.trim()) out[key] = answer.trim();
  }
  return out;
}

/**
 * Folds the per-issue answers and the general box into the single block the
 * builders already read. Returns null when nothing has been answered, so a
 * caller can tell "no decisions" from "an empty decision".
 */
export function composeAnswers(
  general: string | null | undefined,
  issueAnswers: unknown,
  actions: ActionSpec | null | undefined,
): string | null {
  const answers = parseIssueAnswers(issueAnswers);
  const rows = actions?.issues_table?.rows ?? [];
  const parts: string[] = [];

  // In the order the action list puts them, which is the order of priority.
  rows.forEach((row, index) => {
    const answer = answers[String(index)];
    if (!answer) return;
    const [area, issue] = row;
    parts.push(`Issue ${index + 1} (${area}): ${issue}\nDecision: ${answer}`);
  });

  // An answer whose issue has gone is still the investigator's decision, so it
  // is carried rather than dropped.
  for (const [key, answer] of Object.entries(answers)) {
    const index = Number(key);
    if (Number.isInteger(index) && index >= 0 && index < rows.length) continue;
    parts.push(`Decision: ${answer}`);
  }

  const rest = (general ?? "").trim();
  if (rest) parts.push(rest);

  return parts.length ? parts.join("\n\n") : null;
}

/**
 * The decisions, wrapped for the model.
 *
 * Every builder says the same thing in the same words: these are decisions, and
 * they outrank the protocol. Said once here, so a builder cannot say it more
 * weakly, or forget to say it at all.
 *
 * Returns null when there is nothing to say, so a caller adds no empty block.
 */
export function decisionsBlock(
  answers: string | null | undefined,
  /** What the decisions govern: "plan", "form", "tables". */
  document: string,
): string | null {
  const text = (answers ?? "").trim();
  if (!text) return null;

  return `The investigator has reviewed this protocol and made the following decisions.
Where any conflicts with the protocol, the decision wins, and the ${document} must
describe the study as decided rather than as written.

<investigator_decisions>
${text}
</investigator_decisions>`;
}

/**
 * The blockers the review raised that nobody has answered.
 *
 * The decisions block above carries what the investigator typed, and until now
 * that was the only way a review reached a builder. Nobody has ever typed
 * anything: fifty-nine issues, forty-three of them blockers, none answered. So
 * every plan, form and set of tables this application has produced was built
 * from the protocol as written rather than as reviewed.
 *
 * These are not decisions and must not be presented as any. They are what the
 * review found, unresolved, for the document to address or to say why it does
 * not apply. Nothing is invented on the investigator's behalf.
 */
export function unresolvedBlock(
  consequences: Consequence[],
  /** What the document is: "plan", "form", "tables". */
  document: string,
): string | null {
  const open = consequences.filter((c) => c.kind !== "none" && c.target.trim());
  if (!open.length) return null;

  return `The protocol was reviewed and these were raised. They have not been
answered, so they are not decisions: they are what the review found. Address
each one in the ${document}, or say in the ${document} why it does not apply.
Do not invent a value, a variable or a definition the protocol does not carry;
where something is missing, the ${document} says it is missing.

<unresolved_from_the_review>
${open
  .map((c, i) => `${i + 1}. ${c.issue}\n   This concerns: ${c.target}`)
  .join("\n\n")}
</unresolved_from_the_review>`;
}

/** Which of the review's consequences bear on one document. */
export function consequencesFor(
  consequences: Consequence[] | undefined,
  affects: "sap" | "crf" | "tables",
): Consequence[] {
  return (consequences ?? []).filter((c) => c.affects === affects && c.kind !== "none");
}
