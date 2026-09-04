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
 * The order a date is written in, where the plan does not say.
 *
 * Three blanks say how many numbers to write and nothing about which is which,
 * and a form filled in one order and read in another is the commonest error on
 * a paper record. The plan carries a mask for exactly this and it was printed
 * nowhere. These forms are filled in India, so the default is the one every
 * hospital record there already uses; a plan that states its own is obeyed.
 */
const DEFAULT_MASK = "DD/MM/YYYY";

/** The blanks, then the order to write them in. Two spaces, as the house form has it. */
const dated = (field: CrfField) =>
  `${blank(3)} / ${blank(3)} / ${blank(6)}  (${field.mask?.trim() || DEFAULT_MASK})`;

/**
 * The instruction a field type carries in its own label, or nothing.
 *
 * A multi-select and a single-select print the same row of boxes, so without
 * this the page never says which one allows a second tick. A collector who
 * ticks one box on a multi-select has answered a different question from the
 * one asked, and no check downstream can tell that from the data.
 */
export function labelNoteFor(field: CrfField): string {
  return field.type === "Multi-select" ? "(tick all that apply)" : "";
}

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
      return dated(field);
    case "Text / Date":
      return `v1.0   ${dated(field)}`;
    case "Number":
      return field.unit ? `${blank(8)} ${field.unit}` : blank(8);
    default:
      return blank(field.width === "short" ? 16 : 28);
  }
}
