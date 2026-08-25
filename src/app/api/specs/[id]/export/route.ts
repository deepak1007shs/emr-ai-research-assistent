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
} as const satisfies Record<
  string,
  { build: (spec: StudySpec, options?: { notice?: string }) => Promise<Buffer>; suffix: string }
>;

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



  // The document is always produced. What changes is what it says about itself:
  // an unchecked document must never look checked, and one built over unresolved
  // findings must say so on its face rather than be silently withheld.
  const { errors } = gateSpec(data.spec);
  const signed = data.status === "signed" || data.status === "locked";

  const notice = signed
    ? errors.length
      ? `Signed off, but the specification still carries ${errors.length} unresolved finding(s). Read them before using this document.`
      : undefined
    : errors.length
      ? `DRAFT. This specification has not been signed off and carries ${errors.length} unresolved finding(s). Do not submit this document.`
      : "DRAFT. This specification has not been signed off. Read the decisions and sign it before this document is used.";

  const protocol = data.protocols as unknown as { filename: string } | null;
  const { build, suffix } = DOCUMENTS[doc as DocumentKey];
  const buffer = await build(data.spec as StudySpec, { notice });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${slugify(protocol?.filename ?? "study")}-${suffix}.docx"`,
    },
  });
}
