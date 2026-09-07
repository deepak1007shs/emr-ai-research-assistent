import type { SupabaseClient } from "@supabase/supabase-js";
import { readCsv, readWorkbook } from "./read.ts";
import { profile } from "./profile.ts";
import { interpretDataset } from "./interpret.ts";
import { clean } from "./clean.ts";
import { buildWorkbook } from "./workbook.ts";
import { columnsForPlan } from "../crf/columns.ts";
import type { SapRegistry } from "../sap/types.ts";
import type { Finding } from "../sap/validate.ts";
import type { TokenUsage } from "../protocol/pricing.ts";
import type { Grid } from "./types.ts";

/**
 * Reads an attached dataset again, against a plan that now exists.
 *
 * A sheet attached before there was a plan was mapped to nothing, because there
 * were no variables to map it to: its columns kept names of their own. Once the
 * plan is written, the same sheet can be matched to the variables the plan
 * declares, and only then can anything say which of them the data does not
 * hold.
 *
 * Done here rather than asked of the investigator, because the step is easy to
 * forget and forgetting it is silent: the tables would report that nothing is
 * missing, which is not the same as nothing being missing.
 */

export type Remapped = {
  /** Variable id to the column that holds it. Empty for a variable with none. */
  columns: Record<string, string>;
  findings: Finding[];
  usage: TokenUsage;
};

export async function remapDataset(
  db: SupabaseClient,
  dataset: { id: string; filename: string; storage_path: string | null },
  sap: SapRegistry,
  options: { signal?: AbortSignal; onProgress?: (note: string) => void } = {},
): Promise<Remapped | null> {
  if (!dataset.storage_path) return null;

  const file = await db.storage.from("datasets").download(dataset.storage_path);
  if (file.error || !file.data) return null;

  const bytes = Buffer.from(await file.data.arrayBuffer());
  const isCsv = /\.csv$/i.test(dataset.filename);

  options.onProgress?.("Matching the collected data to the plan");

  const grid: Grid = isCsv
    ? readCsv(bytes.toString("utf8"), dataset.filename)
    : await readWorkbook(bytes);

  const guessed = profile(grid, 0);
  const read = await interpretDataset(grid, guessed, sap, { signal: options.signal });

  const cleaned = clean(grid, read.headerRow, read.interpretation, {
    columns: columnsForPlan(sap),
  });

  const workbook = await buildWorkbook(cleaned);
  const cleanedPath = dataset.storage_path.replace(/[^/]+$/, "cleaned.xlsx");
  await db.storage.from("datasets").upload(cleanedPath, workbook, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    upsert: true,
  });

  // Which variable each column holds, as the model matched them. A variable
  // with no entry is one the data does not contain, and that is what the plan's
  // findings and the shell tables are about to say.
  const columns: Record<string, string> = {};
  for (const mapped of read.interpretation.columns) {
    if (!mapped.variable_id) continue;
    columns[mapped.variable_id] = cleaned.headers[mapped.index] ?? mapped.clean_name;
  }

  await db
    .from("datasets")
    .update({
      cleaned_path: cleanedPath,
      header_row: read.headerRow,
      row_count: cleaned.rows.length,
      profile: profile(grid, read.headerRow),
      mapping: read.interpretation,
      findings: cleaned.findings,
      change_count: cleaned.changes.length,
      model: read.model,
      usage: read.usage,
    })
    .eq("id", dataset.id);

  return { columns, findings: missingFindings(sap, columns), usage: read.usage };
}

/**
 * A variable the plan declares and no column holds.
 *
 * Decided here by comparing two lists rather than asked of a model, because it
 * is a set difference and a model asked for one will sometimes get it wrong.
 */
export function missingFindings(
  sap: SapRegistry,
  columns: Record<string, string>,
): Finding[] {
  return (sap.variables ?? [])
    .filter((variable) => !columns[variable.id])
    .map((variable) => ({
      code: "DATA10",
      severity: "WARN" as const,
      message: `The plan declares "${variable.label}" and no column of the collected data holds it. Every analysis using it is unrunnable until the value is collected or the objective is changed.`,
    }));
}
