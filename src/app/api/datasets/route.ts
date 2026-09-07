import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DatasetError, readCsv, readWorkbook } from "@/lib/data/read";
import { guessHeaderRow, profile } from "@/lib/data/profile";
import { interpretDataset } from "@/lib/data/interpret";
import { clean } from "@/lib/data/clean";
import { buildWorkbook } from "@/lib/data/workbook";
import { columnsByVariable } from "@/lib/crf/columns";
import type { SapRegistry } from "@/lib/sap/types";
import type { CrfSpec } from "@/lib/crf/types";
import type { Grid } from "@/lib/data/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Takes a spreadsheet somebody has already filled in and gives back a clean one.
 *
 * The file is read here rather than in a job, for the reason the protocol
 * upload gives: a file that cannot be read should be a plain refusal on the
 * page the user is looking at, not a failure discovered later in a job they
 * have walked away from.
 *
 * The original is kept as well as the cleaned copy. The change log is only
 * evidence if the thing it describes is still there to be checked against.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const form = await request.formData();
  const protocolId = form.get("protocolId");
  const file = form.get("file");

  if (typeof protocolId !== "string" || !protocolId) {
    return NextResponse.json({ error: "Which protocol is this data for?" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a .xlsx or .csv file." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";

  let grid: Grid;
  try {
    grid = isCsv ? readCsv(bytes.toString("utf8"), file.name) : await readWorkbook(bytes);
  } catch (error) {
    const message =
      error instanceof DatasetError ? error.message : "That file could not be read.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (grid.rows.length < 2) {
    return NextResponse.json(
      { error: "That sheet has no rows under its headings." },
      { status: 400 },
    );
  }

  const { data: row, error: insertError } = await supabase
    .from("datasets")
    .insert({
      protocol_id: protocolId,
      owner: user.id,
      filename: file.name,
      mime: file.type || (isCsv ? "text/csv" : "application/vnd.ms-excel"),
      status: "pending",
    })
    .select("id")
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const storagePath = `${user.id}/${row.id}/${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("datasets")
    .upload(storagePath, bytes, { contentType: file.type || "text/csv", upsert: true });
  if (uploadError) {
    // Without the original the change log is a claim rather than evidence, so
    // this fails now rather than producing a cleaned sheet nobody can check.
    await supabase.from("datasets").delete().eq("id", row.id);
    return NextResponse.json(
      { error: `The file could not be stored: ${uploadError.message}` },
      { status: 500 },
    );
  }
  await supabase.from("datasets").update({ storage_path: storagePath }).eq("id", row.id);

  try {
    // The plan, where there is one. Without it every column keeps a name of its
    // own; with it, columns take the datasheet names the plan and the form
    // already use, and the three documents and the spreadsheet agree.
    const { data: sapRow } = await supabase
      .from("sap_plans")
      .select("spec")
      .eq("protocol_id", protocolId)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sap = (sapRow?.spec as SapRegistry | undefined) ?? null;

    const { data: crfRow } = await supabase
      .from("crf_forms")
      .select("spec")
      .eq("protocol_id", protocolId)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const guessed = profile(grid, guessHeaderRow(grid));
    const read = await interpretDataset(grid, guessed, sap);

    // The model may place the headings on a different row from the guess. The
    // columns do not move when it does, so the mapping still holds by index.
    const settled = profile(grid, read.headerRow);
    const cleaned = clean(grid, read.headerRow, read.interpretation, {
      columns: columnsByVariable(crfRow?.spec as CrfSpec | undefined),
    });

    const workbook = await buildWorkbook(cleaned);
    const cleanedPath = `${user.id}/${row.id}/cleaned.xlsx`;
    await supabase.storage.from("datasets").upload(cleanedPath, workbook, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: true,
    });

    await supabase
      .from("datasets")
      .update({
        status: "ready",
        cleaned_path: cleanedPath,
        sheet: grid.sheet,
        header_row: read.headerRow,
        row_count: cleaned.rows.length,
        profile: settled,
        mapping: read.interpretation,
        findings: cleaned.findings,
        change_count: cleaned.changes.length,
        model: read.model,
        usage: read.usage,
      })
      .eq("id", row.id);

    return NextResponse.json({
      datasetId: row.id,
      rows: cleaned.rows.length,
      columns: cleaned.headers.length,
      changes: cleaned.changes.length,
      findings: cleaned.findings.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The dataset could not be cleaned.";
    // Recorded rather than lost: the upload stands, and the reason it failed is
    // on the row rather than only in a log nobody reads.
    await supabase.from("datasets").update({ status: "failed", error: message }).eq("id", row.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
