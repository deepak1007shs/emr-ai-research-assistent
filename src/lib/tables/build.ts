import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { explainApiError } from "../protocol/api-error.ts";
import { decisionsBlock } from "../protocol/answers.ts";
import { EFFORT, MODEL } from "../protocol/analyze.ts";
import type { TokenUsage } from "../protocol/pricing.ts";
import type { SapSpec } from "../sap/types.ts";
import type { CrfSpec } from "../crf/types.ts";
import type { Finding } from "../sap/validate.ts";
import type { ShellTable, ShellTablesSpec } from "./types.ts";
import { buildAnalyticTables, mergeTables } from "./blocks.ts";
import { validateTables } from "./validate.ts";

/**
 * Builds every table the study will report, with the cells empty.
 *
 * Reads the analysis plan for what must be reported and the case report form for
 * what will exist to report it with. A shell table is the same table a filled one
 * will be, so the columns and the row order are decided here rather than after
 * the data arrive.
 *
 * The document has two halves. The analytic tables are built from the plan by
 * `blocks.ts`, because their shape is a consequence of the analysis row and not
 * a judgement. The model lays out the other half, where judgement is what is
 * actually needed: which baseline variables belong in the descriptive table,
 * which time points a repeated measure was taken at, which categories a
 * distribution has. The two are merged and numbered here, which is the only
 * point at which anyone knows how many tables there are.
 */

export class TablesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TablesError";
  }
}

const KNOWLEDGE_PATH = path.join(
  process.cwd(),
  "src",
  "lib",
  "tables",
  "knowledge",
  "shell-tables.md",
);

let knowledge: string | null = null;

/**
 * What the model is told about laying out a table.
 *
 * This used to be the protocol-review knowledge: five files about critiquing a
 * protocol, none of which mentions a shell table. The model was being taught the
 * wrong subject and then asked to lay out tables anyway.
 */
function loadTablesKnowledge(): string {
  if (!knowledge) knowledge = fs.readFileSync(KNOWLEDGE_PATH, "utf8");
  return knowledge;
}

const str = { type: "string" } as const;
const strArray = { type: "array", items: str } as const;

function obj<T extends Record<string, unknown>>(properties: T, description?: string) {
  return {
    type: "object",
    ...(description ? { description } : {}),
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  } as const;
}

export const TABLES_JSON_SCHEMA = obj({
  groups: {
    ...strArray,
    description:
      "How the comparison groups are named in every column header, e.g. Converted and Completed. One entry for a single-group study. Every table in the document uses this wording, so write each arm the way the protocol names it.",
  },
  tables: {
    type: "array",
    description:
      "Only the descriptive, distribution and repeated-measure tables. The analytic tables are built from the plan and are not yours to write. Number yours from 1 in the order you print them; they are renumbered once both halves are merged.",
    items: obj({
      number: { type: "integer" },
      block: { type: "string", enum: ["descriptive", "primary", "secondary", "exploratory"] },
      role: {
        type: "string",
        enum: ["descriptive", "distribution", "repeated"],
        description:
          "descriptive for a baseline table, distribution for one outcome's categories, repeated for a measure recorded at several time points.",
      },
      outcome_id: {
        ...str,
        description:
          "The id of the outcome this table reports, from the analysis plan. Empty for a descriptive table.",
      },
      fills: {
        ...strArray,
        description:
          "The objective ids this table reports. Set it on a distribution or repeated table so the plan knows where its analysis is printed. Empty for a descriptive table.",
      },
      title: {
        ...str,
        description:
          "The full title, which MUST end with the denominator in brackets: 'Demographic profile by conversion status (n = 125)'. Use the study's sample size. A table without its n cannot be read on its own.",
      },
      columns: {
        ...strArray,
        description:
          "For a baseline table: Variable, then one column per group with its n, then Total, then P value. For a repeated table: Timepoint, then one column per group. Use the group wording from the groups list. Any column reporting an effect estimate carries a 95% CI.",
      },
      rows: {
        type: "array",
        description:
          "A variable with sub-parts becomes a heading row followed by indented rows: 'Age (years)' as a heading, then 'Mean +/- SD'; 'Sex' as a heading, then each level. A single-line variable is one plain row.",
        items: obj({
          variable_id: {
            ...str,
            description:
              "The id of the variable this row reports, from the analysis plan. Set it on the heading row of a variable, or on a plain single-line row. Empty for a sub-row such as 'Mean +/- SD' or a category name.",
          },
          label: {
            ...str,
            description:
              "Used when variable_id is empty. When variable_id is set, leave this empty: the wording comes from the plan.",
          },
          kind: {
            type: "string",
            enum: ["variable", "category"],
            description: "variable for a variable, category for one of its levels or a time point.",
          },
          heading: { type: "boolean", description: "True for a variable heading that spans the table." },
          indent: { type: "boolean", description: "True for a sub-row under a heading." },
        }),
      },
      test_applied: {
        ...str,
        description:
          "The test, copied from the analysis plan. Required wherever the table carries a p-value column. Never choose one yourself. Empty for a purely descriptive one.",
      },
      footnote: { ...str, description: "Reference categories, or what the denominator is. Empty when not needed." },
    }),
  },
});

const ROLE = `You are a senior medical statistician laying out the tables a thesis will report.

You are writing shell tables: the same tables the results will fill, but with the
cells empty. Everything a filled table carries must be decided now - the columns,
the row order, the denominator in the title, the test named underneath - so that
when the data arrive nothing is left to choose.

You lay out one half of the document. The analytic tables, which report each
outcome's incidence, its crude and adjusted effect, its subgroups and its
sensitivity analyses, are built from the analysis plan by rule and are already
written. Do not write them, do not number against them, and do not duplicate
them. Your half is the descriptive tables, the category distributions, and any
measure recorded at several time points, because those need what the plan cannot
supply: a judgement about which baseline variables matter and what the time
points were.

The baseline table comes first and describes who was in the study, by group, with
no significance testing implied beyond the p-value column.

Refer to every variable and every outcome by the id the analysis plan gave it,
and do not retype its wording. The plan, the case report form and these tables all
point at the same ids, so a variable named once is named the same in all three.

Never name a statistical test yourself. The plan carries the test it chose on
every analysis row, together with what it ruled out and why; copy it.

Every title ends with its denominator in brackets.

Keep the tables simple to read. A table a supervisor cannot follow at a glance
will be redrawn by hand, and then it no longer matches the plan.`;

export type TablesResult = {
  spec: ShellTablesSpec;
  findings: Finding[];
  model: string;
  usage: TokenUsage;
};

export async function buildTablesSpec(
  sap: SapSpec,
  crf: CrfSpec | null,
  options: {
    answers?: string | null;
    onProgress?: (note: string) => void;
    onUsage?: (usage: TokenUsage) => void;
  } = {},
): Promise<TablesResult> {
  if (!process.env.ANTHROPIC_API_KEY) throw new TablesError("ANTHROPIC_API_KEY is not set.");

  const client = new Anthropic({ timeout: 30 * 60 * 1000, maxRetries: 3 });

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: `The analysis plan. Every analysis row carries the test the plan chose, the
adjusted model where there is one, what it ruled out, and the estimates its
effect table prints. Those tables are already built. Read the plan for what your
own tables must sit beside and must not repeat:

${JSON.stringify({
        title: sap.title,
        sample_size: sap.sample_size,
        expected_events: sap.expected_events,
        objectives: sap.objectives,
        variables: sap.variables,
        outcomes: sap.outcomes,
        analyses: sap.analyses,
        populations: sap.populations,
        subgroups: sap.subgroups,
        steps: sap.steps,
        rules: {
          effect_estimates: sap.rules?.effect_estimates,
          missing_data: sap.rules?.missing_data,
          multiplicity: sap.rules?.multiplicity,
          significance: sap.rules?.significance,
          continuous_summary: sap.rules?.continuous_summary,
          categorical_summary: sap.rules?.categorical_summary,
        },
      })}`,
    },
  ];

  if (crf) {
    content.push({
      type: "text",
      text: `The case report form, which is what will exist to report with. The baseline
table can only describe variables this form collects:

${JSON.stringify({
  sections: crf.sections.map((s) => ({
    title: s.title,
    fields: s.fields.map((f) => f.variable_id ?? f.label),
  })),
  derived: crf.derived.map((d) => d.variable_id ?? d.name),
})}`,
    });
  }

  const decisions = decisionsBlock(options.answers, "tables");
  if (decisions) content.push({ type: "text", text: decisions });

  content.push({
    type: "text",
    text: `Lay out the descriptive half of this document, cells empty: the baseline
tables covering age, age group where it helps, sex, comorbidity, risk factors,
and any baseline value the protocol singles out, described by group. Then a
distribution table wherever one outcome's categories deserve a table of their
own, and a repeated table wherever a measure was recorded at several time points,
with the time points as rows. Nothing else: the incidence, effect, subgroup and
sensitivity tables are already built from the plan.`,
  });

  options.onProgress?.("Laying out the tables");

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    output_config: { effort: EFFORT, format: { type: "json_schema", schema: TABLES_JSON_SCHEMA } },
    system: [
      { type: "text", text: ROLE },
      { type: "text", text: loadTablesKnowledge(), cache_control: { type: "ephemeral", ttl: "1h" } },
    ],
    messages: [{ role: "user", content }],
  });

  stream.on("streamEvent", (event) => {
    if (event.type === "message_delta") {
      options.onUsage?.({
        input_tokens: 0,
        output_tokens: event.usage.output_tokens ?? 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      });
    }
  });

  let message;
  try {
    message = await stream.finalMessage();
  } catch (error) {
    // Said in words. Without this the raw JSON body reaches the screen.
    const explained = explainApiError(error);
    if (explained) throw new TablesError(explained);
    throw error;
  }
  if (message.stop_reason === "max_tokens") {
    throw new TablesError("The tables were cut off before they finished.");
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const raw = JSON.parse(text) as ShellTablesSpec;

  // The wording is copied from the plan's registry rather than retyped.
  const labels: Record<string, string> = {};
  for (const v of sap.variables ?? []) labels[v.id] = v.label;
  for (const o of sap.outcomes ?? []) labels[o.id] = o.what;

  const described: ShellTable[] = (raw.tables ?? []).map((t) => ({
    ...t,
    outcome_id: t.outcome_id?.trim() || undefined,
    fills: t.fills?.length ? t.fills : undefined,
    test_applied: t.test_applied?.trim() || undefined,
    footnote: t.footnote?.trim() || undefined,
    rows: (t.rows ?? []).map((r) => ({
      variable_id: r.variable_id?.trim() || undefined,
      label: r.label,
      kind: r.kind || undefined,
      heading: r.heading || undefined,
      indent: r.indent || undefined,
    })),
  }));

  const spec: ShellTablesSpec = {
    ...raw,
    title: sap.title,
    labels,
    tables: mergeTables(described, buildAnalyticTables(sap, raw.groups ?? []), sap),
  };

  const { findings } = validateTables(spec, sap);

  return {
    spec,
    findings,
    model: message.model,
    usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
      cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
    },
  };
}
