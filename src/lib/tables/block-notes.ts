import type { ShellTablesSpec, TableBlock } from "./types.ts";

/**
 * The line that stands under a block's sub-heading, before its first table.
 *
 * The house blueprint puts four things here and nowhere else: what a
 * descriptive block is for, who is analysed in the primary block, what a
 * secondary result may and may not claim, and the caveat over everything
 * exploratory. Each is a family-level statement, so it belongs under the family
 * heading rather than beneath every table of it. A policy repeated under twenty
 * tables is how a reader learns to skip what is under a table.
 *
 * Composed here from what the plan already declares, so the blueprint cannot
 * state a rule the plan does not, and so the screen and the document say the
 * same words without either of them owning the wording.
 */

const DESCRIPTIVE =
  "One table per measured block, summarised by group. Descriptive only, with no inferential claim.";

const SECONDARY =
  "Supportive and hypothesis-generating; effect estimates with 95% confidence intervals; denominators are the sub-group and differ from the primary.";

const EXPLORATORY =
  "Exploratory and not powered; no confirmatory claim; nominal 95% confidence intervals; a positive finding needs prospective validation.";

/** The four families, in the order the blueprint prints them. */
export const BLOCK_ORDER: TableBlock[] = ["descriptive", "primary", "secondary", "exploratory"];

export const BLOCK_HEADING: Record<TableBlock, string> = {
  descriptive: "Descriptive characteristics",
  primary: "Primary outcome",
  secondary: "Secondary outcomes",
  exploratory: "Exploratory analyses",
};

export function blockNote(block: TableBlock, spec: ShellTablesSpec): string {
  const said: string[] = [];

  if (block === "descriptive") said.push(DESCRIPTIVE);

  // Who is analysed and on what denominator, in front of the first result
  // rather than in a section the reader passed thirty pages ago.
  if (block === "primary" && spec.analysis_population) said.push(spec.analysis_population);

  if (block === "secondary") said.push(SECONDARY);
  if (block === "exploratory") said.push(EXPLORATORY);

  // The multiplicity rule governs the families that make a claim. The
  // descriptive block claims nothing, so a multiplicity rule under it would be
  // a rule about nothing.
  if (block !== "descriptive" && spec.multiplicity) said.push(spec.multiplicity.trim());

  return said.join(" ");
}

/**
 * The one note line that carries a label.
 *
 * The blueprint writes "Analysis population: ..." over the primary block and
 * leaves the other three as plain sentences. Labelling those would read
 * "Exploratory: Exploratory and not powered", which is the label saying what
 * the heading above it already said.
 */
export const BLOCK_NOTE_LABEL: Partial<Record<TableBlock, string>> = {
  primary: "Analysis population",
};
