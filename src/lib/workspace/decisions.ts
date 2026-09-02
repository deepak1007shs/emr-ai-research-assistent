import type { SupabaseClient } from "@supabase/supabase-js";
import { actionSpecSchema } from "../protocol/schema.ts";
import { composeAnswers, parseIssueAnswers } from "../protocol/answers.ts";
import type { Consequence } from "../protocol/schema.ts";

/**
 * The investigator's decisions for a protocol, ready for a builder.
 *
 * Every build route needs the same thing: the latest review's answers, folded
 * into one block of prose. Written once here so a route cannot quietly forget
 * a half of it, which is how the shell tables came to be built without any
 * decisions at all.
 */

export type Decisions = {
  reviewId: string | null;
  /** The composed prose, or null when nothing has been decided. */
  answers: string | null;
  /**
   * What the review's blockers require of the documents below it.
   *
   * Carried whether or not anybody answered them, which is the whole point:
   * answering was built as an optional step and has never once been taken, so
   * until now every document was built with nothing from the review at all.
   */
  consequences: Consequence[];
  /** The blockers with no answer written against them, by index. */
  unanswered: Consequence[];
};

export async function loadDecisions(
  supabase: SupabaseClient,
  protocolId: string,
  preferredReviewId?: string | null,
): Promise<Decisions> {
  const query = supabase
    .from("reviews")
    .select("id, answers, issue_answers, action_spec")
    .eq("status", "complete");

  const { data } = preferredReviewId
    ? await query.eq("id", preferredReviewId).maybeSingle()
    : await query
        .eq("protocol_id", protocolId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  const review = data as {
    id: string;
    answers: string | null;
    issue_answers: unknown;
    action_spec: unknown;
  } | null;

  if (!review) return { reviewId: null, answers: null, consequences: [], unanswered: [] };

  const actions = actionSpecSchema.safeParse(review.action_spec);
  const spec = actions.success ? actions.data : null;
  const consequences = spec?.consequences ?? [];

  // Indexed the same as the action rows, which is how the answers are keyed, so
  // a blocker with an answer against it is one the investigator has decided and
  // is carried as a decision rather than as an open question.
  const answered = parseIssueAnswers(review.issue_answers);
  const unanswered = consequences.filter((_, i) => !answered[String(i)]);

  return {
    reviewId: review.id,
    answers: composeAnswers(review.answers, review.issue_answers, spec),
    consequences,
    unanswered,
  };
}
