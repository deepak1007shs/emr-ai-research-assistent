import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { explainApiError } from "../protocol/api-error.ts";
import { decisionsBlock, unresolvedBlock } from "../protocol/answers.ts";
import type { Consequence } from "../protocol/schema.ts";
import { DOCUMENT_MAX_TOKENS, EFFORT, MODEL } from "../protocol/analyze.ts";
import type { TokenUsage } from "../protocol/pricing.ts";
import type { SapSpec } from "../sap/types.ts";
import { columnsForPlan } from "../crf/columns.ts";
import type { ExtractedProtocol } from "../protocol/extract.ts";
import { checkTableCoverage } from "./coverage.ts";
import type { Finding } from "../sap/validate.ts";
import type { ShellTable, ShellTablesSpec } from "./types.ts";
import { buildAnalyticTables, mergeTables } from "./blocks.ts";
import { assignSlots, descriptiveSlots } from "./slots.ts";
import { designRule } from "./design-tables.ts";
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
  outcome_categories: {
    type: "array",
    description:
      "The categories of every categorical outcome in the analysis plan, in the order they should print. A binary outcome needs no entry unless its two levels are worth naming. Leave the array empty where no outcome is categorical. These become the rows of that outcome's table; you do not draw that table.",
    items: obj({
      outcome_id: { ...str, description: "The outcome's id, from the analysis plan." },
      categories: {
        ...strArray,
        description:
          "Every level the outcome can take, e.g. E. coli, K. pneumoniae, P. aeruginosa, Other. Clinical wording, not codes.",
      },
    }),
  },
  outcome_timepoints: {
    type: "array",
    description:
      "The time points every repeated measure was recorded at, in order. These become the rows of that outcome's table, with the groups across the top, which is the table a mixed model is read from. Leave the array empty where nothing is measured more than once. The plan records the timing as prose, so this is the only place the points exist as a list.",
    items: obj({
      outcome_id: { ...str, description: "The outcome's id, from the analysis plan." },
      timepoints: {
        ...strArray,
        description:
          "Each point as it will print: Baseline, 5 minutes, 10 minutes, 15 minutes. Where the protocol gives a rule rather than a list, write the points the rule produces.",
      },
    }),
  },
  groups: {
    ...strArray,
    description:
      "How the comparison groups are named in every column header, e.g. Converted and Completed. One entry for a single-group study. Every table in the document uses this wording, so write each arm the way the protocol names it.",
  },
  tables: {
    type: "array",
    description:
      "Only the descriptive and repeated-measure tables. Every table that reports an outcome is built from the plan and is not yours to write. Number yours from 1 in the order you print them; they are renumbered once both halves are merged.",
    items: obj({
      number: { type: "integer" },
      block: { type: "string", enum: ["descriptive", "primary", "secondary", "exploratory"] },
      role: {
        type: "string",
        enum: ["descriptive", "repeated"],
        description:
          "descriptive for a baseline table, repeated for a measure recorded at several time points.",
      },
      slot: {
        type: "string",
        enum: ["A1", "A2", "A3", "A4", "A5", "A6", "A7", ""],
        description:
          "Which of the seven descriptive slots this table fills. Required for a descriptive table and empty for any other. Every slot the study has data for should appear, each once; a study with nothing to put in a slot leaves it out rather than printing an empty table. A7 is for surgical and procedural studies only.",
      },
      outcome_id: {
        ...str,
        description:
          "The id of the outcome this table reports, from the analysis plan. Empty for a descriptive table.",
      },
      fills: {
        ...strArray,
        description:
          "The objective ids this table reports. Set it on a repeated table so the plan knows where its analysis is printed. Empty for a descriptive table.",
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
      if_missing: {
        ...str,
        description:
          "What is done for THIS table when a value is not there, decided now rather than when the data arrive. Be specific to the variables in this table: which are structural blanks that leave the denominator rather than counting as missing, which are derived and left missing when an input is, which are expected to exceed 20% missing and are therefore described but not modelled. Where nothing particular applies, say the reduced n is written next to the variable name.",
      },
    }),
  },
});

const ROLE = `You are a senior medical statistician laying out the tables a thesis will report.

You are writing the table plan: what every table the study reports is called,
what is on each of its axes, and what will be reported in it. Everything a
filled table carries must be decided now - the columns, the row order, the
denominator in the title, the test named underneath - so that when the data
arrive nothing is left to choose.

You lay out one half of the document. Every table that reports an outcome is
built from the analysis plan by rule and is already written: one table per
outcome, with the groups across the top, the outcome down the side, and the
estimates and the p value beside the counts they were computed from. Do not
write them, do not number against them, and do not duplicate them. Your half is
the descriptive tables and any measure recorded at several time points, because
those need what the plan cannot supply: a judgement about which baseline
variables matter and what the time points were.

You also supply the categories of each categorical outcome. Those become the
rows of that outcome's table, which code then builds. The plan records them only
as prose - "Binary (dead/alive), reported as a percentage per group" - which
cannot be read as a list, so this is the one place they exist properly.

The baseline table comes first and describes who was in the study, by group, with
no significance testing implied beyond the p-value column.

Refer to every variable and every outcome by the id the analysis plan gave it,
and do not retype its wording. The plan, the case report form and these tables all
point at the same ids, so a variable named once is named the same in all three.

Never name a statistical test yourself. The plan carries the test it chose on
every analysis row, together with what it ruled out and why; copy it.

Every title ends with its denominator in brackets.

Every table also says what will be done when a value is not there. Decide it now,
for the variables in that table, and be specific: a field that only applies to
some patients is a structural blank and leaves the denominator rather than
counting as missing; a derived value is left missing when an input is missing
rather than estimated from the other; a variable expected to exceed twenty per
cent missing is described but not modelled. Handling decided after the data are
seen is a reaction to the results, and reads as one.

Name every table the same way: the statistic, then what is being described, then
the population or the grouping variable. "Distribution of comorbid conditions
among the study population (n = 120)". Never name a table after a statistical
test, and never begin one with "Table showing".

Keep the tables simple to read. A table a supervisor cannot follow at a glance
will be redrawn by hand, and then it no longer matches the plan.`;

/**
 * The conventions that hold for every table in the document.
 *
 * The first four are the plan's own, copied rather than restated, so the
 * blueprint cannot fix a convention the plan did not. The rest are the house
 * rules about what a table may carry, which are the same in every study and
 * which an examiner checks: a p value where nothing is being compared, or a
 * "Test" column inside a table, are both marks against a thesis.
 */
function houseRules(sap: SapSpec): string[] {
  const rules = [
    sap.rules?.normality,
    sap.rules?.continuous_summary,
    sap.rules?.categorical_summary,
    sap.rules?.significance,
    sap.rules?.effect_estimates,
  ]
    .map((r) => r?.trim())
    .filter((r): r is string => Boolean(r));

  rules.push(
    "The denominator is written next to the variable name, not as a separate column and not as a footnote.",
    "Descriptive tables carry no p value. A p value appears only where two or more groups are being compared.",
    "There is no Test column inside any table. The test is stated once, under the table.",
    "Category order is fixed through the document: Yes before No, Male before Female.",
    "Where an expected cell count falls below 5, Fisher exact replaces the chi-square test, or adjacent categories are merged and the merge is stated under the table.",
  );
  return rules;
}

export type TablesResult = {
  spec: ShellTablesSpec;
  findings: Finding[];
  model: string;
  usage: TokenUsage;
};

export async function buildTablesSpec(
  sap: SapSpec,
  /**
   * The protocol, for the read back at the end. Optional so a caller with no
   * stored file still gets its tables, one check short.
   */
  protocol: ExtractedProtocol | null = null,
  options: {
    answers?: string | null;
    /**
     * The review's blockers that nobody answered. Carried whether or not they
     * were, because answering was built as an optional step and has never once
     * been taken.
     */
    unresolved?: Consequence[];
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

  const decisions = decisionsBlock(options.answers, "tables");
  if (decisions) content.push({ type: "text", text: decisions });

  const unresolved = unresolvedBlock(options.unresolved ?? [], "tables");
  if (unresolved) content.push({ type: "text", text: unresolved });

  // What the design owes, and what it forbids. A randomised trial's baseline
  // table carries no p value: the groups differ by chance alone, so a test
  // there tests the randomisation rather than the study.
  const rule = designRule(sap.design_family);
  content.push({
    type: "text",
    text: `The study's design is ${sap.design_family ?? "not classified"}. ${rule.check}

${
      rule.baselineP
        ? "The baseline table may carry a P value column."
        : "The baseline table must carry NO P value column and no significance test. Allocation was random, so a p value there tests the randomisation rather than the study, and an examiner will say so. Report the groups side by side and let the reader see the balance."
    }`,
  });

  content.push({
    type: "text",
    text: `Lay out the descriptive half of this document, cells empty.

The baseline tables fill these seven slots, in this order. Give each table the
slot it fills. Leave a slot out where the study has nothing to put in it, rather
than printing an empty table, and do not put one thing in two slots:

${descriptiveSlots()
      .map((slot) => `- ${slot.slot} ${slot.title}: ${slot.holds}`)
      .join("\n")}

Then a repeated table wherever a measure was recorded at several time points,
with the time points as rows. Nothing else: every table that reports an outcome
is already built from the plan.

Separately, list the categories of every categorical outcome under
outcome_categories, and the time points of every repeated measure under
outcome_timepoints. Those become the rows of that outcome's table. This is the
only place either exists as a list, because the plan records both as prose, so
an outcome left out here is an outcome whose table has one unnamed row.`,
  });

  options.onProgress?.("Laying out the tables");

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: DOCUMENT_MAX_TOKENS,
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

  const raw = JSON.parse(text) as ShellTablesSpec & {
    outcome_categories?: { outcome_id: string; categories: string[] }[];
    outcome_timepoints?: { outcome_id: string; timepoints: string[] }[];
  };

  // The categories of each categorical outcome, which become the rows of its
  // table. Code builds the table; the model only says what the levels are.
  const categories = new Map<string, string[]>();
  for (const entry of raw.outcome_categories ?? []) {
    const id = entry.outcome_id?.trim();
    const levels = (entry.categories ?? []).map((c) => c.trim()).filter(Boolean);
    if (id && levels.length > 1) categories.set(id, levels);
  }

  // The rows of a repeated measure's table. Same reason as the categories: the
  // plan records the timing as prose, and "every 5 minutes during each phase of
  // each session" is not a list of rows.
  const timepoints = new Map<string, string[]>();
  for (const entry of raw.outcome_timepoints ?? []) {
    const id = entry.outcome_id?.trim();
    const points = (entry.timepoints ?? []).map((t) => t.trim()).filter(Boolean);
    if (id && points.length > 1) timepoints.set(id, points);
  }

  // The wording is copied from the plan's registry rather than retyped.
  const labels: Record<string, string> = {};
  for (const v of sap.variables ?? []) labels[v.id] = v.label;
  for (const o of sap.outcomes ?? []) labels[o.id] = o.what;
  // The objectives too, so the coverage check at the end of the document can
  // name what each table answers instead of printing "P1" at a reader.
  for (const o of sap.objectives ?? []) labels[o.id] = o.question;

  const described: ShellTable[] = (raw.tables ?? []).map((t) => ({
    ...t,
    slot: t.slot?.trim() || undefined,
    outcome_id: t.outcome_id?.trim() || undefined,
    fills: t.fills?.length ? t.fills : undefined,
    test_applied: t.test_applied?.trim() || undefined,
    footnote: t.footnote?.trim() || undefined,
    if_missing: t.if_missing?.trim() || undefined,
    rows: (t.rows ?? []).map((r) => ({
      variable_id: r.variable_id?.trim() || undefined,
      label: r.label,
      kind: r.kind || undefined,
      heading: r.heading || undefined,
      indent: r.indent || undefined,
    })),
  }));

  // Absorbed into the outcome tables above; it is not part of the document.
  const rest = { ...raw };
  delete (rest as Record<string, unknown>).outcome_categories;
  delete (rest as Record<string, unknown>).outcome_timepoints;
  const spec: ShellTablesSpec = {
    ...rest,
    title: sap.title,
    labels,
    // Printed once under the block they govern. Copied by code, like the
    // labels, so the tables cannot state a rule the plan does not.
    multiplicity: sap.rules?.multiplicity?.trim() || undefined,
    missing_data: sap.rules?.missing_data?.trim() || undefined,
    rules: houseRules(sap),
    // The plan's own datasheet names, which the form uses for the same
    // variables, so a row of this document, a field of the form and a column of
    // the spreadsheet are matched by name rather than by eye.
    columns: columnsForPlan(sap),
    tables: assignSlots(
      mergeTables(described, buildAnalyticTables(sap, raw.groups ?? [], categories, timepoints), sap),
      (sap.objectives ?? []).map((o) => o.id),
    ),
  };

  const { findings } = validateTables(spec, sap);

  // The document's own coverage check runs both directions between objectives
  // and tables, and code does that in full. This is the direction code cannot
  // do: what the protocol promised to report that never became an objective at
  // all. Caught, so a failure here never loses the tables.
  let coverage: Awaited<ReturnType<typeof checkTableCoverage>> | null = null;
  if (protocol) {
    try {
      coverage = await checkTableCoverage(protocol, spec, {
        onProgress: options.onProgress,
        onUsage: options.onUsage,
      });
    } catch {
      options.onProgress?.(
        "The tables are laid out. The protocol could not be read back against them.",
      );
    }
  }

  const usage = {
    input_tokens: message.usage.input_tokens + (coverage?.usage.input_tokens ?? 0),
    output_tokens: message.usage.output_tokens + (coverage?.usage.output_tokens ?? 0),
    cache_creation_input_tokens:
      (message.usage.cache_creation_input_tokens ?? 0) +
      (coverage?.usage.cache_creation_input_tokens ?? 0),
    cache_read_input_tokens:
      (message.usage.cache_read_input_tokens ?? 0) + (coverage?.usage.cache_read_input_tokens ?? 0),
  };

  return {
    spec,
    findings: [...findings, ...(coverage?.findings ?? [])],
    model: message.model,
    usage,
  };
}
