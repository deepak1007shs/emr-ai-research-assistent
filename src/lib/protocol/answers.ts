import type { ActionSpec } from "./schema.ts";

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
