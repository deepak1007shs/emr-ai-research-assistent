import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildTablesDocx } from "@/lib/render/tables-docx";
import type { ShellTablesSpec } from "@/lib/tables/types";

export const runtime = "nodejs";

function slugify(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  return (
    base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "study"
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("shell_tables")
    .select("spec, protocols ( filename )")
    .eq("id", id)
    .single();

  // RLS makes someone else's tables indistinguishable from missing ones.
  if (error || !data?.spec) {
    return NextResponse.json({ error: "Tables not found." }, { status: 404 });
  }

  const protocol = data.protocols as unknown as { filename: string } | null;
  const buffer = await buildTablesDocx(data.spec as ShellTablesSpec);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${slugify(protocol?.filename ?? "study")}-shell-tables.docx"`,
    },
  });
}
