/**
 * The letter a section prints under.
 *
 * The identifier block is Section A on a printed form, so the first topic
 * section is B and every letter after it shifts down one. The spec keeps its
 * own lettering from A, because that is what the model wrote and what CRF02
 * checks; this is only how it reads on the page.
 *
 * One function, used by the Word renderer and by the screen, so the form a
 * supervisor is handed and the form on screen cite the same letters.
 */

/** Section A is the identifiers; topic sections run B onward. */
export function printedLetter(index: number): string {
  return String.fromCharCode(66 + index);
}

/** "Section B", or "C1" for the first part of section C. */
export function partLabel(index: number, part: number): string {
  return `${printedLetter(index)}${part + 1}`;
}

/** The house separator between a section's letter and its title. */
export const HEADING_DASH = "\u2013";

export const IDENTIFIERS_HEADING = "Section A \u2013 Form and subject identifiers";
