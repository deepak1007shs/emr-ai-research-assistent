import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildSapDocx } from "@/lib/sap/docx";
import type { SapBuild } from "@/lib/sap/build";
import { buildCrfDocx } from "@/lib/crf/docx";
import type { CrfForm } from "@/lib/crf/build";

export const runtime = "nodejs";

/**
 * Removing one document, or one superseded version of one.
 *
 * Every rebuild inserts a row and the newest ready row is the current one, so a
 * version and a document are the same thing here: deleting the newest makes the
 * one before it current again, and deleting the only one leaves nothing built.
 * That is the behaviour a version list wants, and it needs no special case.
 */

const TABLE = {
  review: "reviews",
  sap: "sap_plans",
  crf: "crf_forms",
} as const;

type Kind = keyof typeof TABLE;

/**
 * Downloading a document.
 *
 * `?format=docx` is the Word file the supervisor reads, and
 * `&variant=short` is its first half: the question, the objectives, the
 * outcomes and the analysis map, with no shell tables. `?format=md` is the
 * markdown the row already holds. All of them are rendered from the same
 * stored objects, so a download taken a month later is the document that was
 * checked.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  const format = request.nextUrl.searchParams.get("format") ?? "docx";
  // The short form is the question, the objectives, the outcomes and the
  // analysis map, for the supervisor who wants to agree what is being asked
  // before reading the empty tables.
  const variant =
    request.nextUrl.searchParams.get("variant") === "short" ? "short" : "full";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // The form re-renders from its own stored row and never from the plan, so a
  // form downloaded after its plan was rebuilt is the form that was checked.
  if (kind === "crf") {
    const { data: form } = await supabase
      .from("crf_forms")
      .select("id, form, markdown, protocols ( filename )")
      .eq("id", id)
      .maybeSingle();

    if (!form?.form) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const of = form.protocols as unknown as { filename?: string } | { filename?: string }[] | null;
    const from = (Array.isArray(of) ? of[0]?.filename : of?.filename) ?? "protocol";
    const name = `${from.replace(/\.[^.]+$/, "")} - case record form`;

    if (format === "md") {
      return new NextResponse(form.markdown ?? "", {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}.md"`,
        },
      });
    }

    const file = await buildCrfDocx(form.form as CrfForm);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}.docx"`,
      },
    });
  }

  if (kind !== "sap") {
    return NextResponse.json(
      { error: "Only the analysis plan and the case record form are downloaded from here. The review has its own export." },
      { status: 400 },
    );
  }

  const { data: row } = await supabase
    .from("sap_plans")
    .select("id, facts, plan, markdown, protocols ( filename )")
    .eq("id", id)
    .maybeSingle();

  if (!row?.plan || !row.facts) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const protocol = row.protocols as unknown as { filename?: string } | { filename?: string }[] | null;
  const source =
    (Array.isArray(protocol) ? protocol[0]?.filename : protocol?.filename) ?? "protocol";
  const stem = `${source.replace(/\.[^.]+$/, "")} - analysis plan${
    variant === "short" ? " (summary)" : ""
  }`;

  if (format === "md") {
    return new NextResponse(row.markdown ?? "", {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(stem)}.md"`,
      },
    });
  }

  const build = { ...(row.plan as object), facts: row.facts } as SapBuild;
  const file = await buildSapDocx(build, variant);

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(stem)}.docx"`,
    },
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const table = TABLE[kind as Kind];
  if (!table) {
    return NextResponse.json({ error: "There is no such document." }, { status: 400 });
  }

  // Read it back first, so a missing row is a 404 rather than a silent success:
  // RLS makes someone else's document indistinguishable from a missing one, and
  // "deleted" is the wrong word for either.
  const { data: row } = await supabase.from(table).select("id").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: true });
}
