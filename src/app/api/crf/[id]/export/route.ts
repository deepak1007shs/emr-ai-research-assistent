import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildCrfDocx } from "@/lib/render/crf-docx";
import type { CrfSpec } from "@/lib/crf/types";

export const runtime = "nodejs";

function slugify(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  return (
    base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "study"
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("crf_forms")
    .select("spec, protocols ( filename )")
    .eq("id", id)
    .single();

  // RLS makes someone else's form indistinguishable from a missing one.
  if (error || !data?.spec) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  const protocol = data.protocols as unknown as { filename: string } | null;

  // Two documents with two readers. The form is what the data collector fills
  // in; the plan is the evidence for the supervisor that the form collects
  // everything the analysis needs and nothing it does not. They were one file,
  // and the collector had to page through the evidence to reach the first
  // question.
  const plan = request.nextUrl.searchParams.get("doc") === "plan";
  const variant = plan ? ("plan" as const) : ("form" as const);
  const suffix = plan ? "data-collection-plan" : "case-record-form";

  const buffer = await buildCrfDocx(data.spec as CrfSpec, variant);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${slugify(protocol?.filename ?? "study")}-${suffix}.docx"`,
    },
  });
}
