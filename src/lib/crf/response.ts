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

/** Pre-printed options, a unit, or a ruled blank. */
export function responseFor(field: CrfField): string {
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
