import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildSapDocx } from "@/lib/render/sap-docx";
import { buildSapMarkdown } from "@/lib/render/sap-md";
import type { SapSpec } from "@/lib/sap/types";
import { tableNumbers, type ShellTablesSpec } from "@/lib/tables/types";

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
    .from("sap_plans")
    .select("spec, protocol_id, protocols ( filename )")
    .eq("id", id)
    .single();

  // RLS makes someone else's plan indistinguishable from a missing one.
  if (error || !data?.spec) {
    return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }

  const protocol = data.protocols as unknown as { filename: string } | null;
  // The shell tables own the numbering once they exist, so the downloaded plan
  // points at the table a reader will actually find.
  const { data: shells } = await supabase
    .from("shell_tables")
    .select("spec")
    .eq("protocol_id", data.protocol_id)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const numbers = tableNumbers((shells?.spec as ShellTablesSpec | undefined) ?? null);
  const name = slugify(protocol?.filename ?? "study");

  // The short plan is the same plan, cut to what a statistician works from:
  // the objectives, the outcomes and the analysis map. Not a summary of the
  // full one, which would be a second document that could disagree with it.
  const short = request.nextUrl.searchParams.get("doc") === "short";
  const variant = short ? ("short" as const) : ("full" as const);
  const suffix = short ? "statistical-analysis-plan-short" : "statistical-analysis-plan";

  // Markdown for reading in a terminal or pasting into an email; Word for
  // handing over. Both come from the same spec, so they cannot disagree.
  if (request.nextUrl.searchParams.get("format") === "md") {
    return new Response(
      buildSapMarkdown(data.spec as SapSpec, numbers, {
        variant,
        shells: (shells?.spec as ShellTablesSpec | undefined) ?? null,
      }),
      {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${name}-${suffix}.md"`,
        },
      },
    );
  }

  // The tables are Section 6 of this document now, and the spec was already
  // fetched above for the numbering, so nothing new is read to print them.
  const buffer = await buildSapDocx(data.spec as SapSpec, numbers, {
    variant,
    shells: (shells?.spec as ShellTablesSpec | undefined) ?? null,
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${name}-${suffix}.docx"`,
    },
  });
}
