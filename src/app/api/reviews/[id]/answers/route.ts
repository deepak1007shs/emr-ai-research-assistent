import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseIssueAnswers } from "@/lib/protocol/answers";

/**
 * Saves the investigator's decisions against a review.
 *
 * The general box and the per-issue boxes are stored separately and folded
 * together only when a document is built, so an answer stays attached to the
 * issue it settles.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    answers?: string;
    issueAnswers?: unknown;
  };

  const issueAnswers = parseIssueAnswers(body.issueAnswers);

  const { error } = await supabase
    .from("reviews")
    .update({
      answers: (body.answers ?? "").trim() || null,
      issue_answers: Object.keys(issueAnswers).length ? issueAnswers : null,
      answers_updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ saved: true });
}
