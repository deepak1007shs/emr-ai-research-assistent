import { z } from "zod";

/**
 * Two schemas live here, on purpose.
 *
 * `ModelReview` is what Claude returns. It uses named object fields because a
 * strict JSON Schema guides generation far better with keys than with tuples.
 *
 * `ReviewSpec` is what the renderers consume. It is the tuple-based shape from
 * the original `build_review_md.js` spec, so a spec produced here renders
 * through either builder unchanged.
 *
 * `toReviewSpec()` converts one into the other.
 */

export const SUBTITLE = "Design · Objectives · Outcomes · Sample Size · Key Issues";

/** The short companion document: the blockers only, as a numbered action table. */
export const ACTION_SUBTITLE = "Issues & Required Changes";

export const VERDICTS = ["Correct", "Partial", "Wrong formula", "Absent"] as const;

// ---------------------------------------------------------------------------
// What the model returns
// ---------------------------------------------------------------------------

const objectivePair = z.object({
  objective: z.string().min(1),
  outcome: z.string().min(1),
});

export const modelReviewSchema = z.object({
  protocol_line: z.string().min(1),
  title: z.object({
    as_written: z.string().min(1),
    suggestions: z.array(z.string().min(1)),
  }),
  type: z.object({
    classification: z.string().min(1),
    suggestions: z.array(z.string().min(1)),
  }),
  peco: z.object({
    framework: z.enum(["PICO", "PECO"]),
    intro: z.string(),
    rows: z
      .array(z.object({ element: z.string().min(1), content: z.string().min(1) }))
      .min(4),
  }),
  objectives: z.object({
    primary: objectivePair,
    secondary: z.array(objectivePair),
    exploratory: z.array(z.object({ text: z.string().min(1), outcome: z.string().min(1) })),
  }),
  sample_size: z.object({
    what_they_did: z.string().min(1),
    verdict: z.string().min(1),
    issues: z.array(z.string().min(1)),
  }),
  key_issues: z
    .array(z.object({ heading: z.string().min(1), body: z.string().min(1) }))
    .min(1),
  footer: z.string(),
  /** The short action document. Array order is the priority — there is no severity field. */
  action_items: z.array(
    z.object({
      area: z.string().min(1),
      issue: z.string().min(1),
      change: z.string().min(1),
    }),
  ),
});

export type ModelReview = z.infer<typeof modelReviewSchema>;

// ---------------------------------------------------------------------------
// What the renderers consume
// ---------------------------------------------------------------------------

export type ReviewSpec = {
  subtitle: string;
  protocol_line: string;
  title: { as_written: string; suggestions: string[] };
  type: { classification: string; suggestions: string[] };
  peco: { framework: "PICO" | "PECO"; intro: string; rows: [string, string][] };
  objectives: {
    primary: { objective: string; outcome: string };
    secondary: { objective: string; outcome: string }[];
    exploratory: { text: string; outcome: string }[];
  };
  sample_size: { what_they_did: string; verdict: string; issues: string[] };
  key_issues: [string, string][];
  footer: string;
  /**
   * The optional compact variant. Never generated here — the model always
   * produces the narrative sections — but accepted so a spec.json written by
   * the existing tooling renders through this app unchanged.
   */
  snapshot?: { rows: [string, string][] };
  issues_table?: {
    intro?: string;
    legend?: string;
    rows: [string, string, string, string][];
  };
};

const pair = z.tuple([z.string(), z.string()]);

/**
 * `.strict()` matters here: the skill spec forbids a variables section, so a
 * spec carrying `variables` is rejected rather than silently ignored.
 */
export const reviewSpecSchema = z
  .object({
    subtitle: z.string().min(1),
    protocol_line: z.string(),
    title: z.object({ as_written: z.string(), suggestions: z.array(z.string()) }).strict(),
    type: z.object({ classification: z.string(), suggestions: z.array(z.string()) }).strict(),
    peco: z
      .object({
        framework: z.enum(["PICO", "PECO"]),
        intro: z.string(),
        rows: z.array(pair),
      })
      .strict(),
    objectives: z
      .object({
        primary: z.object({ objective: z.string(), outcome: z.string() }).strict(),
        secondary: z.array(z.object({ objective: z.string(), outcome: z.string() }).strict()),
        exploratory: z.array(z.object({ text: z.string(), outcome: z.string() }).strict()),
      })
      .strict(),
    sample_size: z
      .object({
        what_they_did: z.string(),
        verdict: z.string(),
        issues: z.array(z.string()),
      })
      .strict(),
    key_issues: z.array(pair),
    footer: z.string(),
    snapshot: z.object({ rows: z.array(pair) }).strict().optional(),
    issues_table: z
      .object({
        intro: z.string().optional(),
        legend: z.string().optional(),
        rows: z.array(z.tuple([z.string(), z.string(), z.string(), z.string()])),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * The short action document.
 *
 * A spec of its own rather than extra fields on the review spec: the builder
 * renders `issues_table` *above* Section 1, so one spec carrying both would put
 * the action table on top of the full review. Two specs, two documents.
 */
export type ActionSpec = {
  subtitle: string;
  protocol_line: string;
  issues_table: { rows: [string, string, string, string][] };
  footer: string;
};

const actionRow = z.tuple([z.string(), z.string(), z.string(), z.string()]);

export const actionSpecSchema = z
  .object({
    subtitle: z.string().min(1),
    protocol_line: z.string(),
    issues_table: z.object({ rows: z.array(actionRow) }).strict(),
    footer: z.string(),
  })
  .strict();

export function toReviewSpec(model: ModelReview): ReviewSpec {
  return {
    subtitle: SUBTITLE,
    protocol_line: model.protocol_line,
    title: model.title,
    type: model.type,
    peco: {
      framework: model.peco.framework,
      intro: model.peco.intro,
      rows: model.peco.rows.map((r) => [r.element, r.content] as [string, string]),
    },
    objectives: model.objectives,
    sample_size: model.sample_size,
    key_issues: model.key_issues.map((i) => [i.heading, i.body] as [string, string]),
    footer: model.footer,
    // `snapshot` and `issues_table` are deliberately left unset — see ActionSpec.
  };
}

export function toActionSpec(model: ModelReview): ActionSpec {
  return {
    subtitle: ACTION_SUBTITLE,
    protocol_line: model.protocol_line,
    issues_table: {
      // The rank *is* the priority column; the array order carries it.
      rows: model.action_items.map(
        (a, i) => [a.area, a.issue, a.change, String(i + 1)] as [string, string, string, string],
      ),
    },
    footer:
      "The blockers only, in the order they should be addressed. The full Protocol Understanding & Review document carries the reasoning behind each one, along with the smaller corrections not listed here.",
  };
}

// ---------------------------------------------------------------------------
// JSON Schema for output_config.format
//
// Hand-written rather than derived, because strict structured outputs require
// `additionalProperties: false` and every key listed in `required` on every
// object. Nothing is optional; absent content is an empty string or array.
// `schema.test.ts` asserts this stays in step with `modelReviewSchema`.
// ---------------------------------------------------------------------------

const str = { type: "string" } as const;
const strArray = { type: "array", items: str } as const;

function obj<T extends Record<string, unknown>>(properties: T) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  } as const;
}

export const MODEL_REVIEW_JSON_SCHEMA = obj({
  protocol_line: {
    ...str,
    description: "Rich, not a filename: the title in quotes, the degree, the candidate, the department and institution, the guide where named, and what else was reviewed alongside the protocol.",
  },
  title: obj({
    as_written: { ...str, description: "The title verbatim, including its errors." },
    suggestions: {
      ...strArray,
      description:
        "Only what is needed: spelling, design missing from the title, over-claiming wording. The LAST entry must begin 'Suggested full title: ' and give the whole corrected title as one sentence.",
    },
  }),
  type: obj({
    classification: {
      ...str,
      description:
        "Three or four sentences: the exact design, the allocation ratio or sampling structure, why the frame is PICO or PECO, and the reporting guideline with any relevant extension.",
    },
    suggestions: {
      ...strArray,
      description:
        "Quote the protocol's own contradictory wording so the student can find the line.",
    },
  }),
  peco: obj({
    framework: { type: "string", enum: ["PICO", "PECO"] },
    intro: { ...str, description: "One or two sentences saying why this frame applies to this design." },
    rows: {
      type: "array",
      description:
        "Exactly four rows: P — Population; then I — Intervention (PICO) or E — Exposure (PECO); then C — Comparator; then O — Outcome. Carry real detail — the actual eligibility criteria, the actual regimen — not a one-line summary.",
      items: obj({ element: str, content: str }),
    },
  }),
  objectives: obj({
    primary: obj({
      objective: str,
      outcome: {
        ...str,
        description:
          "The full chain: what is measured, instrument, time point, units, domain, variable type. Where the protocol leaves something undefined, open with 'NOTE — ' and say exactly how to define it.",
      },
    }),
    secondary: { type: "array", items: obj({ objective: str, outcome: str }) },
    exploratory: { type: "array", items: obj({ text: str, outcome: str }) },
  }),
  sample_size: obj({
    what_they_did: {
      ...str,
      description:
        "Reproduce the actual calculation: the cited source, every input value, the formula, and the resulting n.",
    },
    verdict: {
      ...str,
      description:
        "A judgement, not a label. Begin with Correct, PARTLY correct, Wrong formula, or Absent, then one or two sentences saying what is right and what is wrong.",
    },
    issues: strArray,
  }),
  key_issues: {
    type: "array",
    description: "Most important first. A short heading plus one full plain-language paragraph that names the problem, points to where it is, and gives the fix. A protocol with real problems warrants 8-12 of these.",
    items: obj({ heading: str, body: str }),
  },
  action_items: {
    type: "array",
    description:
      "The short action document: BLOCKERS ONLY, most critical first, typically 5-10 rows. A blocker invalidates the study if left alone, or an examiner or ethics committee will certainly raise it. Every row must correspond to a key_issues entry or a sample_size.issues entry — this is a compression of the long review, never a separate opinion. Do not pad to reach a number.",
    items: obj({
      area: {
        ...str,
        description: "Two or three words, e.g. 'Sample size', 'Ethics', 'Randomisation', 'Primary outcome'.",
      },
      issue: { ...str, description: "The problem in one sentence." },
      change: {
        ...str,
        description:
          "An imperative instruction the researcher can act on, not a description of the problem. Write 'Choose one primary outcome and define it as the 30-day Clavien-Dindo >= II rate', not 'The primary outcome is unclear'.",
      },
    }),
  },
  footer: {
    ...str,
    description:
      "The closing line: who it was prepared for, what Sections 1-5 versus Section 6 contain, and the design classification with its reporting guideline.",
  },
});
