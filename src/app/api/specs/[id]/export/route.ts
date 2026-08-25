import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildCrfDocx } from "@/lib/render/crf";
import { buildSapDocx } from "@/lib/render/sap";
import { buildShellTablesDocx } from "@/lib/render/shell-tables";
import type { StudySpec } from "@/lib/study-spec/types";
import { gateSpec } from "@/lib/study-spec/gate";

export const runtime = "nodejs";

const DOCUMENTS = {
  crf: { build: buildCrfDocx, suffix: "case-record-form" },
  sap: { build: buildSapDocx, suffix: "statistical-analysis-plan" },
  tables: { build: buildShellTablesDocx, suffix: "shell-tables" },
} as const;

type DocumentKey = keyof typeof DOCUMENTS;

function slugify(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "study"
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const doc = request.nextUrl.searchParams.get("doc") ?? "";

  if (!(doc in DOCUMENTS)) {
    return NextResponse.json(
      { error: `doc must be one of: ${Object.keys(DOCUMENTS).join(", ")}.` },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("study_specs")
    .select("spec, status, validation, protocols ( filename )")
    .eq("id", id)
    .single();

  // RLS makes someone else's spec indistinguishable from a missing one.
  if (error || !data) {
    return NextResponse.json({ error: "Specification not found." }, { status: 404 });
  }
  if (!data.spec) {
    return NextResponse.json({ error: "That specification is still being drafted." }, { status: 409 });
  }

  // Gate G0. A document rendered from an unsigned specification would be used
  // as though someone had checked it, which is the whole failure this prevents.
  if (data.status !== "signed" && data.status !== "locked") {
    return NextResponse.json(
      { error: "This specification has not been signed off yet. Review the decisions and sign it before generating documents." },
      { status: 409 },
    );
  }

  // Re-run the gate here too: a stored snapshot can be stale, and this is the
  // last check before a document goes out.
  const { errors } = gateSpec(data.spec);
  if (errors.length) {
    return NextResponse.json(
      {
        error: `This specification does not pass the gate (${errors.length} error(s)), so no document can be built from it.`,
      },
      { status: 409 },
    );
  }

  const protocol = data.protocols as unknown as { filename: string } | null;
  const { build, suffix } = DOCUMENTS[doc as DocumentKey];
  const buffer = await build(data.spec as StudySpec);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${slugify(protocol?.filename ?? "study")}-${suffix}.docx"`,
    },
  });
}
