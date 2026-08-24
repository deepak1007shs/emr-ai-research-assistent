import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reviewSpecSchema } from "@/lib/protocol/schema";
import { buildDocx } from "@/lib/render/docx";
import { build } from "@/lib/render/markdown";

export const runtime = "nodejs";

/** Turns "Anju thesis protocol.docx" into "anju-thesis-protocol-review". */
function slugify(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "protocol"}-review`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const format = request.nextUrl.searchParams.get("format") ?? "md";

  if (format !== "md" && format !== "docx") {
    return NextResponse.json({ error: "format must be md or docx." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select("spec, markdown, status, protocols ( filename )")
    .eq("id", id)
    .single();

  // RLS makes another user's review indistinguishable from a missing one.
  if (error || !data) {
    return NextResponse.json({ error: "Review not found." }, { status: 404 });
  }
  if (data.status !== "complete" || !data.spec) {
    return NextResponse.json({ error: "That review is not finished." }, { status: 409 });
  }

  const parsed = reviewSpecSchema.safeParse(data.spec);
  if (!parsed.success) {
    return NextResponse.json({ error: "That review is stored in an old format." }, { status: 422 });
  }

  const protocolRef = data.protocols as unknown as { filename: string } | null;
  const name = slugify(protocolRef?.filename ?? "protocol");

  if (format === "md") {
    const markdown = data.markdown ?? build(parsed.data);
    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}.md"`,
      },
    });
  }

  const buffer = await buildDocx(parsed.data);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${name}.docx"`,
    },
  });
}
