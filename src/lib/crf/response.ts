import type { CrfField } from "./types.ts";

/**
 * The answer space a field prints.
 *
 * Kept apart from the Word renderer so the on-screen form can draw the same
 * boxes and rules the printed form does. A data collector should recognise the
 * page they are looking at.
 */

/** An empty ballot box, as the house forms use. */
export const BOX = "☐";

const blank = (n: number) => "_".repeat(n);

/**
 * Pre-printed options, a unit, or a ruled blank.
 *
 * Where more than one person answers the same question, each gets a line of
 * their own, labelled. A single line cannot hold a disagreement, and in an
 * agreement study the disagreement is the result.
 */
export function responseFor(field: CrfField): string {
  const answer = oneAnswer(field);
  if (!field.respondents?.length) return answer;
  return field.respondents.map((who) => `${who}:  ${answer}`).join("\n");
}

function oneAnswer(field: CrfField): string {
  if (field.options?.length) {
    return field.options.map((o) => `${BOX} ${o}`).join("   ");
  }
  switch (field.type) {
    case "Date":
      return `${blank(3)} / ${blank(3)} / ${blank(6)}`;
    case "Text / Date":
      return `v1.0   ${blank(3)} / ${blank(3)} / ${blank(6)}`;
    case "Number":
      return field.unit ? `${blank(8)} ${field.unit}` : blank(8);
    default:
      return blank(field.width === "short" ? 16 : 28);
  }
}
