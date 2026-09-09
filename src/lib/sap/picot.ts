import type { SapSpec } from "./types.ts";

/**
 * The clinical question decomposed, in the rows the house blueprint fixes.
 *
 * The heading is `PICOT/PECO` whichever framework the study uses, and the
 * element letters do not change with it: the blueprint's own observational
 * example still reads `I  Intervention / Exposure`. One shape means a reader
 * who has seen one of these plans can read the next without re-learning the
 * table, which is the whole point of a house format.
 *
 * Composed here rather than in each renderer, because the screen, the Word file
 * and the Markdown all print it and three copies of a fixed table are three
 * things that can drift apart.
 */

export const PICOT_HEADING = "PICOT/PECO";

/** The blueprint's three columns: the letter, the element, the study's answer. */
export const PICOT_COLUMNS = ["", "Element", "For this study"];

export type PicotRow = [letter: string, element: string, value: string];

const ELEMENTS: [string, string][] = [
  ["P", "Population"],
  ["I", "Intervention"],
  ["C", "Comparator / Control"],
  ["O", "Outcome"],
  ["T", "Time / Type of study"],
];

export function picotRows(picot: NonNullable<SapSpec["picot"]>): PicotRow[] {
  // The letter stays I in both frames; the word follows the design. A trial
  // assigns an intervention and an observational study finds an exposure, and
  // the house documents name whichever the study did.
  const second = picot.framework === "PICOT" ? "Intervention" : "Intervention / Exposure";
  const values = [
    picot.population,
    picot.intervention_or_exposure,
    picot.comparator,
    picot.outcome,
    picot.time,
  ];
  return ELEMENTS.map(([letter, element], i) => [
    letter,
    letter === "I" ? second : element,
    values[i] ?? "",
  ]);
}
