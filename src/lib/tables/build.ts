import Anthropic from "@anthropic-ai/sdk";
import { loadKnowledge } from "../protocol/knowledge.ts";
import { decisionsBlock } from "../protocol/answers.ts";
import { EFFORT, MODEL } from "../protocol/analyze.ts";
import type { TokenUsage } from "../protocol/pricing.ts";
import type { SapSpec } from "../sap/types.ts";
import type { CrfSpec } from "../crf/types.ts";
import type { Finding } from "../sap/validate.ts";
import type { ShellTablesSpec } from "./types.ts";
import { validateTables } from "./validate.ts";

/**
 * Builds every table the study will report, with the cells empty.
 *
 * Reads the analysis plan for what must be reported and the case report form for
 * what will exist to report it with. A shell table is the same table a filled one
 * will be, so the columns and the row order are decided here rather than after
 * the data arrive.
 */

export class TablesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TablesError";
  }
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
      "How the comparison groups are named in every column header, e.g. Converted and Completed. One entry for a single-group study.",
  },
  tables: {
    type: "array",
    description:
      "Numbered contiguously from 1, in block order: descriptive first, then primary, then secondary, then exploratory.",
    items: obj({
      number: { type: "integer" },
      block: { type: "string", enum: ["descriptive", "primary", "secondary", "exploratory"] },
      outcome_id: {
        ...str,
        description:
          "The id of the outcome this table reports, from the analysis plan. It must be the outcome of the analysis whose table this is. Empty for a descriptive table.",
      },
      fills: {
        ...strArray,
        description:
          "The objective ids this table reports, e.g. ['P1'] or ['S1','S2'] when one table answers two. Empty for a descriptive table. Every objective in the plan must be filled by exactly one table, and you number the tables yourself: ignore the plan's table_id, which was assigned before anyone knew how many baseline tables there would be.",
      },
      adjusted_for: {
        ...strArray,
        description:
          "For an effect table: the variable ids the adjusted column adjusts for. They must be the predictors the plan lists for this analysis. Empty otherwise.",
      },
      title: {
        ...str,
        description:
          "The full title, which MUST end with the denominator in brackets: 'Demographic profile by conversion status (n = 125)'. Use the study's sample size. A table without its n cannot be read on its own.",
      },
      kind: {
        type: "string",
        enum: ["descriptive", "comparative", "effect", "accuracy", "distribution", "repeated"],
      },
      columns: {
        ...strArray,
        description:
          "For a baseline table: Variable, then one column per group with its n and 'n (%)', then Total, then P value. For an effect table: Predictor, Unadjusted <measure> (95% CI), P value, Adjusted <measure> (95% CI), P value. Never a column called Model 1. Every effect column carries a 95% CI.",
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
          heading: { type: "boolean", description: "True for a variable heading that spans the table." },
          indent: { type: "boolean", description: "True for a sub-row under a heading." },
        }),
      },
      test_applied: {
        ...str,
        description:
          "The test, copied from the analysis plan. Required for any comparative, effect or accuracy table. Empty for a purely descriptive one.",
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

The baseline table comes first and describes who was in the study, by outcome
group, with no significance testing implied beyond the p-value column. Then the
primary outcome. Then the secondary outcomes. Then anything exploratory, marked
as such.

Where an analysis is adjusted, the table shows the unadjusted and the adjusted
effect side by side, each with a 95% confidence interval and its own p value, so
a reader can see what the adjustment did. Never label a column Model 1 or Model 2.

Refer to every variable and every outcome by the id the analysis plan gave it,
and do not retype its wording. The plan, the case report form and these tables all
point at the same ids, so a variable named once is named the same in all three.

You number the tables, not the plan. The plan assigned a table id to each
analysis before it knew how many baseline tables this study needs, so those
numbers are provisional. Number yours from 1 in the order they are printed,
descriptive first, and say in the fills field which objectives each table answers.
Every
objective in the plan gets exactly one table.

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
      text: `The analysis plan. Every row here needs the table it names, and the test
named on that table must be the test the plan chose:

${JSON.stringify({
        title: sap.title,
        sample_size: sap.sample_size,
        expected_events: sap.expected_events,
        objectives: sap.objectives,
        variables: sap.variables,
        outcomes: sap.outcomes,
        analyses: sap.analyses,
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
    text: `Lay out every table this study will report, cells empty. Start with the
baseline and descriptive tables covering age, age group where it helps, sex,
comorbidity, risk factors, and any baseline value the protocol singles out. Then
the primary outcome, then each secondary outcome, then anything exploratory.`,
  });

  options.onProgress?.("Laying out the tables");

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    output_config: { effort: EFFORT, format: { type: "json_schema", schema: TABLES_JSON_SCHEMA } },
    system: [
      { type: "text", text: ROLE },
      { type: "text", text: loadKnowledge(), cache_control: { type: "ephemeral", ttl: "1h" } },
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

  const message = await stream.finalMessage();
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

  const spec: ShellTablesSpec = {
    ...raw,
    title: sap.title,
    labels,
    tables: (raw.tables ?? []).map((t) => ({
      ...t,
      outcome_id: t.outcome_id?.trim() || undefined,
      fills: t.fills?.length ? t.fills : undefined,
      adjusted_for: t.adjusted_for?.length ? t.adjusted_for : undefined,
      test_applied: t.test_applied?.trim() || undefined,
      footnote: t.footnote?.trim() || undefined,
      rows: (t.rows ?? []).map((r) => ({
        variable_id: r.variable_id?.trim() || undefined,
        label: r.label,
        heading: r.heading || undefined,
        indent: r.indent || undefined,
      })),
    })),
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
