import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What the left rail knows.
 *
 * Every protocol the user owns, each with the state of its four documents. The
 * rail is rendered by the layout, which App Router does not re-render when you
 * move between the documents of one protocol, so this runs once per protocol
 * rather than once per document.
 *
 * "Current" is resolved the way the rest of the app resolves it: the artifact
 * tables are insert-only, so the newest ready row wins.
 */

export type DocKind = "review";

export const DOC_LABEL: Record<DocKind, string> = {
  review: "Protocol Review",
};

/** The short form, for the rail where the protocol name already takes the width. */
export const DOC_SHORT: Record<DocKind, string> = {
  review: "Review",
};

export const DOC_ORDER: DocKind[] = ["review"];

export type DocState = {
  kind: DocKind;
  id: string | null;
  /** Present but built from an older analysis plan, so its wording may disagree. */
  stale: boolean;
  /** Built before the investigator last changed their decisions. */
  behindAnswers: boolean;
  /** Errors and warnings recorded when it was built. */
  errors: number;
  warnings: number;
};

export type ProtocolRow = {
  id: string;
  filename: string;
  created_at: string;
  documents: Record<DocKind, DocState>;
};


/** The newest row per protocol, from a list already ordered newest first. */
function newestByProtocol<T extends { protocol_id: string }>(rows: T[] | null): Map<string, T> {
  const latest = new Map<string, T>();
  for (const row of rows ?? []) {
    if (!latest.has(row.protocol_id)) latest.set(row.protocol_id, row);
  }
  return latest;
}

export async function loadRail(supabase: SupabaseClient): Promise<ProtocolRow[]> {
  const [protocols, reviews] = await Promise.all([
    supabase.from("protocols").select("id, filename, created_at").order("created_at", { ascending: false }),
    supabase
      .from("reviews")
      .select("id, protocol_id, answers_updated_at")
      .eq("status", "complete")
      .order("created_at", { ascending: false }),
  ]);

  const latestReview = newestByProtocol(
    reviews.data as unknown as {
      protocol_id: string;
      id: string;
      answers_updated_at: string | null;
    }[],
  );
  return ((protocols.data as { id: string; filename: string; created_at: string }[] | null) ?? []).map(
    (protocol) => {
      const review = latestReview.get(protocol.id) ?? null;

      return {
        id: protocol.id,
        filename: protocol.filename,
        created_at: protocol.created_at,
        documents: {
          review: {
            kind: "review" as const,
            id: review?.id ?? null,
            stale: false,
            behindAnswers: false,
            errors: 0,
            warnings: 0,
          },
        },
      };
    },
  );
}

