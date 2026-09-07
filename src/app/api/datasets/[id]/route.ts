import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** The cleaned workbook, or the file as it arrived with `?original=1`. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: row } = await supabase
    .from("datasets")
    .select("filename, storage_path, cleaned_path, status")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "No such dataset." }, { status: 404 });

  const original = request.nextUrl.searchParams.get("original") === "1";
  const path = original ? row.storage_path : row.cleaned_path;
  if (!path) {
    return NextResponse.json(
      { error: original ? "The original file is not stored." : "This dataset has not been cleaned." },
      { status: 404 },
    );
  }

  const file = await supabase.storage.from("datasets").download(path);
  if (file.error || !file.data) {
    return NextResponse.json({ error: "The file could not be read back." }, { status: 500 });
  }

  const name = original ? row.filename : row.filename.replace(/\.[^.]+$/, "") + " (cleaned).xlsx";
  return new NextResponse(await file.data.arrayBuffer(), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
    },
  });
}

/** Removes a dataset and both of its files. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: row } = await supabase
    .from("datasets")
    .select("storage_path, cleaned_path")
    .eq("id", id)
    .maybeSingle();

  const paths = [row?.storage_path, row?.cleaned_path].filter((p): p is string => Boolean(p));
  if (paths.length) await supabase.storage.from("datasets").remove(paths);
  await supabase.from("datasets").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}
