import type { CrfField, Variable } from "../study/types.ts";
import type { DataType, FieldType } from "../study/vocabulary.ts";

/**
 * Steps C8 and C9: what kind of answer a field takes, and the space it leaves.
 *
 * The five field types are the spec's: text, number, single-select,
 * multi-select and date. The sixth the reference form uses and the spec does
 * not list - a yes-or-no with a line to write on - is produced only where a
 * variable's own options already carry an "Other" entry, so nothing invents it.
 *
 * The answer strings live here rather than in a markdown decision table, and
 * that is deliberate. `parseTable` trims every cell, and the three spaces
 * between two ballot boxes are the layout: trimmed to one they read as a single
 * choice. A table of counts is what a table of whitespace would have to be, and
 * a count in a file is no easier to argue with than a constant in code.
 */

/** The blank a written answer goes on. */
const WRITTEN = "______________________";
/** The blank a number goes on, short enough to leave room for a unit. */
const NUMERIC = "________";
/** Three spaces, which is what stops two boxes reading as one choice. */
const BETWEEN = "   ";
/** Two spaces before the mask's own note, which sets it apart from the blanks. */
const DATE = "___ / ___ / ______  (DD/MM/YYYY)";
const BOX = "☐";

/**
 * The data type a measure was read as, to the kind of answer a form takes.
 *
 * The skill lists the five field types and Step 2 lists the data types, and
 * nowhere writes the link between them. This is that link, and the one place it
 * is decided: a number is written, a category is ticked, a date has a mask.
 */
const FOR_TYPE: Record<DataType, FieldType> = {
  continuous: "number",
  count: "number",
  binary: "single_select",
  nominal: "single_select",
  ordinal: "single_select",
  date: "date",
  text: "text",
  // A time to an event is collected as the date it happened, never as a
  // duration: a duration is computed from two dates, and a form that asks for
  // it asks somebody to do arithmetic at the bedside.
  time_to_event: "date",
};

const OTHER = /^other\b/i;

/** C8. The field type, from the variable's data type or the field's own. */
export function fieldTypeOf(
  variable: Variable | null,
  declared: FieldType | null,
): FieldType {
  if (variable) {
    const type = FOR_TYPE[variable.type];
    // "☐ No ☐ Yes → specify: ____", which the reference form uses wherever an
    // option list ends in "Other". Produced from the options themselves, so a
    // study whose categories are closed never gets a line to write on.
    if (type === "single_select" && variable.options?.some((o) => OTHER.test(o))) {
      return "single_select_text";
    }
    return type;
  }
  return declared ?? "text";
}

/**
 * C9. The Response cell, which is always blank.
 *
 * Never a value, never a default, never a tick. The guardrail is one line of
 * the skill and the easiest of all of them to break, because a form with an
 * answer already in it looks finished.
 */
export function responseFor(field: Pick<CrfField, "type" | "unit" | "options">): string {
  switch (field.type) {
    case "number":
      return field.unit ? `${NUMERIC} ${field.unit}` : NUMERIC;
    case "date":
      return DATE;
    case "single_select":
    case "multi_select":
      // A line to write on until the categories are stated, never nothing.
      if (hasNoChoices(field)) return WRITTEN;
      return (field.options ?? [])
        .map((option) => `${BOX} ${option}`)
        .join(BETWEEN);
    case "single_select_text": {
      const options = field.options ?? [];
      const plain = options.filter((option) => !OTHER.test(option));
      const line = `${BOX} Other: ${WRITTEN}`;
      return [...plain.map((option) => `${BOX} ${option}`), line].join(BETWEEN);
    }
    default:
      return WRITTEN;
  }
}

/**
 * C9.1. The label, with the instruction a multi-select owes.
 *
 * Added by the renderer and not by the field list, because a per-field
 * instruction is a thing that gets applied to four fields out of five, and the
 * fifth is the one filled in wrong.
 */
/** A choice field is one the form answers by ticking. */
const CHOICE: FieldType[] = ["single_select", "multi_select", "single_select_text"];

/**
 * A choice with fewer than two choices has nothing to tick.
 *
 * The reading leaves categories out where the protocol does not state them, and
 * S2-4 reports that in the plan. The form used to print such a field as an empty
 * cell under "Single-select", which looks finished and cannot be filled in.
 */
export const hasNoChoices = (field: Pick<CrfField, "type" | "options">) =>
  CHOICE.includes(field.type) && (field.options?.length ?? 0) < 2;

export function labelFor(field: Pick<CrfField, "label" | "type" | "options">): string {
  if (hasNoChoices(field)) {
    return `${field.label} **TODO:** the protocol states no categories; list them before the form is used`;
  }
  return field.type === "multi_select"
    ? `${field.label} (tick all that apply)`
    : field.label;
}
