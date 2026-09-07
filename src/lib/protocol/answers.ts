import type { ActionSpec, Consequence } from "./schema.ts";
import type { DatasetProfile } from "../data/types.ts";

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

/** How many columns a plan is shown before the block starts saying so instead. */
const COLUMNS_SHOWN = 250;

/**
 * The dataset, described for whoever is writing the plan.
 *
 * The rows are never sent. What a plan needs is which columns exist, what is in
 * them and how much is missing, and that is a few hundred words whether the
 * study has fifty patients or five thousand.
 *
 * The instruction at the end is the point of the whole block. A plan that
 * quietly declared only what the spreadsheet happened to contain would read as
 * though the study were going perfectly, and would hide the one thing this
 * comparison can say that nothing else can: that the protocol promised
 * something nobody collected, and an objective is at risk because of it.
 */
export function dataBlock(profile: DatasetProfile | null | undefined): string | null {
  if (!profile?.columns?.length) return null;

  const shown = profile.columns.slice(0, COLUMNS_SHOWN);
  const omitted = profile.columns.length - shown.length;

  const lines = shown.map((column) => {
    const missing = `${column.missing} of ${column.missing + column.filled} missing`;
    const values = column.distinct.length
      ? `; values: ${column.distinct
          .slice(0, 10)
          .map((d) => `${d.value} (${d.count})`)
          .join(", ")}${column.distinctTotal > 10 ? `, and ${column.distinctTotal - 10} more` : ""}`
      : "";
    return `- "${column.header || `column ${column.index + 1}`}": ${column.looks}, ${missing}${values}`;
  });

  return `Data has already been collected for this study. The sheet has ${profile.rowCount} rows
and these columns:

${lines.join("\n")}${
    omitted
      ? `\n\nand ${omitted} further columns, not listed here. The sheet has ${profile.columns.length} columns in all.`
      : ""
  }

Write the plan the protocol calls for, not the plan this sheet happens to allow.
Where the protocol calls for a variable and no column holds it, declare the
variable anyway and say plainly that the data does not contain it. A plan
trimmed to fit the spreadsheet hides the one thing worth knowing here, which is
that an objective cannot be answered with what was collected.`;
}
