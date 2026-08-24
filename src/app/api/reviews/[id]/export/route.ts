import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actionSpecSchema, reviewSpecSchema } from "@/lib/protocol/schema";
import { buildDocx } from "@/lib/render/docx";
import { build } from "@/lib/render/markdown";

export const runtime = "nodejs";

/** Turns "Anju thesis protocol.docx" into "anju-thesis-protocol". */
function slugify(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "protocol";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const format = request.nextUrl.searchParams.get("format") ?? "md";
  const doc = request.nextUrl.searchParams.get("doc") ?? "review";

  if (format !== "md" && format !== "docx") {
    return NextResponse.json({ error: "format must be md or docx." }, { status: 400 });
  }
  if (doc !== "review" && doc !== "actions") {
    return NextResponse.json({ error: "doc must be review or actions." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select("spec, markdown, action_spec, action_markdown, status, protocols ( filename )")
    .eq("id", id)
    .single();

  // RLS makes another user's review indistinguishable from a missing one.
  if (error || !data) {
    return NextResponse.json({ error: "Review not found." }, { status: 404 });
  }
  if (data.status !== "complete" || !data.spec) {
    return NextResponse.json({ error: "That review is not finished." }, { status: 409 });
  }

  const isActions = doc === "actions";

  // Reviews produced before the action document existed have no action_spec.
  if (isActions && !data.action_spec) {
    return NextResponse.json(
      {
        error:
          "This review was produced before the action list existed. Run the protocol again to get one.",
      },
      { status: 409 },
    );
  }

  const parsed = isActions
    ? actionSpecSchema.safeParse(data.action_spec)
    : reviewSpecSchema.safeParse(data.spec);

  if (!parsed.success) {
    return NextResponse.json({ error: "That review is stored in an old format." }, { status: 422 });
  }

  const protocolRef = data.protocols as unknown as { filename: string } | null;
  const name = `${slugify(protocolRef?.filename ?? "protocol")}-${
    isActions ? "actions" : "review"
  }`;

  if (format === "md") {
    const stored = isActions ? data.action_markdown : data.markdown;
    return new Response(stored ?? build(parsed.data), {
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
