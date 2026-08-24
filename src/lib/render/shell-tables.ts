import { indexSpec, type ShellTable, type StudySpec, type Variable } from "../study-spec/types.ts";
import { h1, h2, italic, para, table, title, toBuffer, versionStamp, type Block } from "./docx-kit.ts";

/**
 * The shell tables: every table the study will report, with the cells empty.
 *
 * Row labels carry their summary statistic, so a reader knows what will go in
 * the cell before any data exists. A categorical variable becomes one row per
 * level, which is how the counts are actually reported.
 */

const BLOCK_ORDER = ["descriptive", "primary", "secondary", "exploratory", "sensitivity"] as const;

const BLOCK_HEADING: Record<string, string> = {
  descriptive: "Descriptive characteristics",
  primary: "Primary outcome",
  secondary: "Secondary outcomes",
  exploratory: "Exploratory outcomes",
  sensitivity: "Sensitivity analyses",
};

/** How a continuous or count variable will be summarised. */
function summaryFor(v: Variable, spec: StudySpec): string {
  const outcome = spec.outcomes.find((o) => (o.source_variable_ids ?? []).includes(v.id));
  if (outcome?.summary_statistic) return outcome.summary_statistic;
  if (v.data_type === "continuous" || v.data_type === "count") return "mean (SD)";
  return "n (%)";
}

/**
 * One row label per line that will be reported.
 *
 * "Age (years), median (IQR)" for a number; "Male, n (%)" and "Female, n (%)"
 * for a category set, with the reference level marked.
 */
function rowLabels(v: Variable, spec: StudySpec, referenceRows: string[]): string[] {
  const isReference = referenceRows.includes(v.id);

  if (v.categories?.length) {
    return v.categories.map((category) => {
      const ref = isReference && category === v.reference_level ? " (reference)" : "";
      return `${v.label}: ${category}, n (%)${ref}`;
    });
  }

  const unit = v.unit ? ` (${v.unit})` : "";
  return [`${v.label}${unit}, ${summaryFor(v, spec)}`];
}

function renderTable(t: ShellTable, spec: StudySpec, ix: ReturnType<typeof indexSpec>): Block[] {
  const blocks: Block[] = [];
  blocks.push(h2(`Table ${t.number}. ${t.title}`));

  const rows: string[][] = [];
  for (const varId of t.row_variable_ids) {
    const v = ix.variables.get(varId);
    if (!v) continue;
    for (const label of rowLabels(v, spec, t.reference_rows ?? [])) {
      // Empty cells: this is a shell, not a result.
      rows.push([label, ...t.columns.slice(1).map(() => "")]);
    }
  }

  blocks.push(table(t.columns, rows));

  if (t.test_applied) {
    blocks.push(italic(`Test applied: ${t.test_applied}.`));
  } else if (t.kind === "descriptive" && !t.footnote) {
    // Only when the spec has not already said so in its own words.
    blocks.push(italic("Test applied: descriptive only; no significance testing."));
  }

  if (t.footnote) blocks.push(italic(t.footnote));
  return blocks;
}

export async function buildShellTablesDocx(spec: StudySpec): Promise<Buffer> {
  const ix = indexSpec(spec);
  const doc: Block[] = [];

  doc.push(title("Shell Tables"));
  doc.push(para(spec.study.title));
  doc.push(versionStamp(spec.spec_version, "Shell tables"));
  doc.push(
    para(
      "Every table the study will report, with the cells left empty. Each row states the summary statistic it will carry, so the analysis has nothing left to decide once the data arrive.",
    ),
  );

  const ordered = [...spec.tables].sort((a, b) => a.number - b.number);

  for (const block of BLOCK_ORDER) {
    const inBlock = ordered.filter((t) => t.block === block);
    if (!inBlock.length) continue;

    doc.push(h1(BLOCK_HEADING[block]));
    if (block === "exploratory") {
      doc.push(
        italic(
          "Exploratory analyses are hypothesis-generating. They are not powered and must not be reported as confirmatory findings.",
        ),
      );
    }
    for (const t of inBlock) doc.push(...renderTable(t, spec, ix));
  }

  const multiplicity = spec.multiplicity ?? [];
  if (multiplicity.length) {
    doc.push(h1("Multiplicity"));
    for (const m of multiplicity) {
      doc.push(para(`${m.family}: ${m.method}. ${m.note ?? ""}`));
    }
  }

  return toBuffer(doc);
}
