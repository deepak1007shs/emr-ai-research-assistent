import type { SupabaseClient } from "@supabase/supabase-js";
import { actionSpecSchema } from "../protocol/schema.ts";
import { composeAnswers } from "../protocol/answers.ts";

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

  if (!review) return { reviewId: null, answers: null };

  const actions = actionSpecSchema.safeParse(review.action_spec);

  return {
    reviewId: review.id,
    answers: composeAnswers(
      review.answers,
      review.issue_answers,
      actions.success ? actions.data : null,
    ),
  };
}
