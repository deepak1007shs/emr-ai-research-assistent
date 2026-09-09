import type { SapSpec } from "../sap/types.ts";
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
 *
 * Nothing prints these today. The house documents go from the lettered family
 * heading straight to "Table N.", and what these lines said is said elsewhere:
 * the population and the missing-data handling by the sensitivity table's rows
 * and footnote, the test and its fallback by every table's own footnote. The
 * one thing they said that nothing else says is the multiplicity rule, which is
 * why this is kept rather than deleted: printing it again is one line in each
 * renderer.
 */

const DESCRIPTIVE =
  "One table per measured block, summarised by group. Descriptive only, with no inferential claim.";

const SECONDARY =
  "Supportive and hypothesis-generating; effect estimates with 95% confidence intervals; denominators are the sub-group and differ from the primary.";

const EXPLORATORY =
  "Exploratory and not powered; no confirmatory claim; nominal 95% confidence intervals; a positive finding needs prospective validation.";

/** The four families, in the order the blueprint prints them. */
export const BLOCK_ORDER: TableBlock[] = ["descriptive", "primary", "secondary", "exploratory"];

/**
 * The four family headings, lettered as the house documents letter them.
 *
 * The letter is the reader's handle on the block: "the B tables" is how the
 * primary outcome gets referred to in a supervision, and a heading without one
 * gives them nothing to say.
 */
export const BLOCK_HEADING: Record<TableBlock, string> = {
  descriptive: "A. Descriptive characteristics",
  primary: "B. Primary outcome",
  secondary: "C. Secondary outcomes",
  exploratory: "D. Exploratory analyses",
};

export function blockNote(
  block: TableBlock,
  spec: ShellTablesSpec,
  /**
   * The plan, where the tables were stored before they carried the population
   * line. Composing it here means every plan already in the database gains the
   * line on its next download, rather than only the ones rebuilt after this.
   */
  sap?: SapSpec,
): string {
  const said: string[] = [];

  if (block === "descriptive") said.push(DESCRIPTIVE);

  // Who is analysed and on what denominator, in front of the first result
  // rather than behind it.
  if (block === "primary") {
    const population = spec.analysis_population || (sap ? populationLine(sap) : undefined);
    if (population) said.push(population);
  }

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

/**
 * "Analysis population: ..." as the house blueprint prints it above the primary
 * block.
 *
 * Built from the populations the plan already declares rather than asked for
 * again, so the line and the plan cannot disagree. The first population is the
 * one named: a plan lists them in the order it relies on them, and the primary
 * analysis runs on the first.
 *
 * The missing-data rule is stated rather than pointed at. There is no Section 4
 * in the house format for a cross-reference to land in, and a reference that
 * outlives what it refers to is how a plan starts lying.
 */
export function populationLine(sap: SapSpec): string | undefined {
  const [primary] = sap.populations ?? [];
  if (!primary?.name?.trim()) return undefined;

  const definition = primary.definition?.trim();
  const missing = sap.rules?.missing_data?.trim();
  return [
    `${primary.name.trim()}${definition ? ` - ${definition}` : ""}`,
    missing ? `Missing data: ${missing}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
