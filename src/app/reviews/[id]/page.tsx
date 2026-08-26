import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Where reviews used to live.
 *
 * Every document of a protocol now shares one workspace, so a link to a review
 * lands on that protocol's review tab. Old links, and anything bookmarked,
 * keep working.
 */
export default async function LegacyReviewPage({ params }: PageProps<"/reviews/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=/reviews/${id}`);

  const { data: review } = await supabase
    .from("reviews")
    .select("protocol_id")
    .eq("id", id)
    .maybeSingle();

  // RLS makes someone else's review indistinguishable from a missing one.
  if (!review) notFound();

  redirect(`/protocols/${review.protocol_id}/review`);
}
