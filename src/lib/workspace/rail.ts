import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What the left rail knows.
 *
 * Every protocol the user owns, each with the state of its documents. The
 * rail is rendered by the layout, which App Router does not re-render when you
 * move between the documents of one protocol, so this runs once per protocol
 * rather than once per document.
 *
 * "Current" is resolved the way the rest of the app resolves it: the artifact
 * tables are insert-only, so the newest ready row wins.
 */

export type DocKind = "review" | "sap" | "crf";

export const DOC_LABEL: Record<DocKind, string> = {
  review: "Protocol Review",
  sap: "Analysis Plan",
  crf: "Case Record Form",
};

/** The short form, for the rail where the protocol name already takes the width. */
export const DOC_SHORT: Record<DocKind, string> = {
  review: "Review",
  sap: "Plan",
  crf: "Form",
};

// The order they are made in, which is also the order they are read in: the
// review says what is wrong, the plan says what will be analysed, the form
// collects what the plan's tables report.
export const DOC_ORDER: DocKind[] = ["review", "sap", "crf"];

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
  const [protocols, reviews, plans, forms] = await Promise.all([
    supabase.from("protocols").select("id, filename, created_at").order("created_at", { ascending: false }),
    supabase
      .from("reviews")
      .select("id, protocol_id, answers_updated_at")
      .eq("status", "complete")
      .order("created_at", { ascending: false }),
    supabase
      .from("sap_plans")
      .select("id, protocol_id, plan")
      .eq("status", "ready")
      .not("plan", "is", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("crf_forms")
      .select("id, protocol_id, sap_id, form")
      .eq("status", "ready")
      .not("form", "is", null)
      .order("created_at", { ascending: false }),
  ]);

  const latestReview = newestByProtocol(
    reviews.data as unknown as {
      protocol_id: string;
      id: string;
      answers_updated_at: string | null;
    }[],
  );
  const latestPlan = newestByProtocol(
    plans.data as unknown as {
      protocol_id: string;
      id: string;
      plan: { checks?: { pass: boolean }[]; todos?: string[] } | null;
    }[],
  );

  const latestForm = newestByProtocol(
    forms.data as unknown as {
      protocol_id: string;
      id: string;
      sap_id: string | null;
      form: { checks?: { pass: boolean }[]; todos?: string[] } | null;
    }[],
  );

  return ((protocols.data as { id: string; filename: string; created_at: string }[] | null) ?? []).map(
    (protocol) => {
      const review = latestReview.get(protocol.id) ?? null;
      const plan = latestPlan.get(protocol.id) ?? null;
      const form = latestForm.get(protocol.id) ?? null;
      const failing = (plan?.plan?.checks ?? []).filter((c) => !c.pass).length;
      const formFailing = (form?.form?.checks ?? []).filter((c) => !c.pass).length;

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
          sap: {
            kind: "sap" as const,
            id: plan?.id ?? null,
            stale: false,
            behindAnswers: false,
            // A failing check is an error the investigator has to resolve; an
            // open item is a question, and there are usually several.
            errors: failing,
            warnings: plan?.plan?.todos?.length ?? 0,
          },
          crf: {
            kind: "crf" as const,
            id: form?.id ?? null,
            // The first use of this field since the rebuild typed it: a form
            // built from a plan that has since been rebuilt says so, rather
            // than being read as current.
            stale: Boolean(plan && form && form.sap_id !== plan.id),
            behindAnswers: false,
            errors: formFailing,
            warnings: form?.form?.todos?.length ?? 0,
          },
        },
      };
    },
  );
}

