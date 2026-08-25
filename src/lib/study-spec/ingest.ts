import Anthropic from "@anthropic-ai/sdk";
import { createRequire } from "node:module";
import { loadKnowledge } from "../protocol/knowledge.ts";
import { EFFORT, MODEL } from "../protocol/analyze.ts";
import type { TokenUsage } from "../protocol/pricing.ts";
import type { ExtractedProtocol } from "../protocol/extract.ts";
import {
  STAGE1_SCHEMA,
  STAGE1B_SCHEMA,
  STAGE1C_SCHEMA,
  STAGE2_SCHEMA,
  STAGE3_SCHEMA,
} from "./ingest-schema.ts";
import type { StudySpec } from "./types.ts";

const require = createRequire(import.meta.url);
const { validate } = require("./validate_study_spec.js") as {
  validate: (spec: unknown, options?: { final?: boolean }) => {
    ok: boolean;
    findings: { code: string; severity: string; path: string; message: string }[];
  };
};

/**
 * Stage 0: protocol in, draft study spec out.
 *
 * The model's output shape is deliberately flatter than the stored spec, because
 * strict structured outputs cannot express optional keys. `normalise()` converts
 * one into the other, and the gate then judges the result. A failed gate is fed
 * back once, because its messages already say what to do.
 *
 * The draft is never final. It is a starting point for the investigator to sign
 * off, and it fails G0 until they do.
 */

export class IngestError extends Error {
  // Declared and assigned rather than a constructor parameter property: Node's
  // strip-only TypeScript mode, which the CLI runs under, rejects those.
  readonly findings: unknown[];

  constructor(message: string, findings: unknown[] = []) {
    super(message);
    this.name = "IngestError";
    this.findings = findings;
  }
}

const NONE = new Set(["", "none", "n/a", "not applicable"]);
const clean = (v?: string) => (v && !NONE.has(v.trim().toLowerCase()) ? v.trim() : undefined);
const list = (v?: string[]) => (v && v.length ? v : undefined);

type ModelSpec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Turns the model's flat shape into the spec the gate and renderers expect. */
export function normalise(model: ModelSpec, specVersion = "0.1.0"): StudySpec {
  const designDetail: Record<string, string> = {};
  for (const entry of model.study?.design_detail ?? []) {
    if (entry?.key) designDetail[entry.key] = entry.value ?? "";
  }

  const variables = (model.variables ?? []).map((v: ModelSpec) => {
    const derived = v.role === "derived";
    const collected = v.crf?.collected === true && !derived;

    return {
      id: v.id,
      label: v.label,
      role: v.role,
      data_type: v.data_type,
      subtype: clean(v.subtype) ?? "unspecified",
      ...(clean(v.unit) ? { unit: clean(v.unit) } : {}),
      ...(list(v.categories) ? { categories: v.categories } : {}),
      ...(clean(v.reference_level) ? { reference_level: clean(v.reference_level) } : {}),
      ...(clean(v.definition_source) ? { definition_source: clean(v.definition_source) } : {}),
      ...(clean(v.definition_reference) ? { definition_reference: clean(v.definition_reference) } : {}),
      ...(derived && list(v.derived_from) ? { derived_from: v.derived_from } : {}),
      ...(derived && clean(v.derivation) ? { derivation: clean(v.derivation) } : {}),
      ...(derived && clean(v.derivation_kind) ? { derivation_kind: clean(v.derivation_kind) } : {}),
      ...(collected
        ? {
            crf: {
              section_id: v.crf.section_id,
              order: v.crf.order ?? 1,
              field_type: clean(v.crf.field_type) ?? "text",
              response: v.crf.response || "________",
              ...(list(v.crf.options) ? { options: v.crf.options } : {}),
              ...(clean(v.crf.mask) ? { mask: clean(v.crf.mask) } : {}),
            },
          }
        : {}),
    };
  });

  const objectives = (model.objectives ?? []).map((o: ModelSpec) => ({
    id: o.id,
    tier: o.tier,
    question: o.question,
    outcome_ids: o.outcome_ids ?? [],
    ...(clean(o.comparison_type) ? { comparison_type: o.comparison_type } : {}),
    ...(clean(o.margin) ? { margin: clean(o.margin) } : {}),
    ...(o.tier === "primary" && o.estimand ? { estimand: o.estimand } : {}),
  }));

  const outcomes = (model.outcomes ?? []).map((o: ModelSpec) => ({
    id: o.id,
    label: o.label,
    tier: o.tier,
    definition: o.definition,
    instrument: o.instrument,
    timepoint_id: o.timepoint_id,
    data_type: o.data_type,
    subtype: clean(o.subtype) ?? "unspecified",
    ...(clean(o.unit) ? { unit: clean(o.unit) } : {}),
    ...(clean(o.summary_statistic) ? { summary_statistic: o.summary_statistic } : {}),
    ...(clean(o.domain) ? { domain: o.domain } : {}),
    source_variable_ids: o.source_variable_ids ?? [],
  }));

  const analyses = (model.analyses ?? []).map((a: ModelSpec) => ({
    id: a.id,
    objective_id: a.objective_id,
    outcome_id: a.outcome_id,
    unadjusted_test: a.unadjusted_test,
    ...(clean(a.adjusted_model) ? { adjusted_model: a.adjusted_model } : {}),
    ...(list(a.covariate_ids) ? { covariate_ids: a.covariate_ids } : {}),
    ...(clean(a.effect_measure) ? { effect_measure: a.effect_measure } : {}),
    ...(list(a.table_ids) ? { table_ids: a.table_ids } : {}),
    ...(typeof a.paired === "boolean" ? { paired: a.paired } : {}),
    ...(clean(a.ph_check) ? { ph_check: a.ph_check } : {}),
  }));

  const tables = (model.tables ?? []).map((t: ModelSpec) => ({
    id: t.id,
    number: t.number,
    block: t.block,
    title: t.title,
    kind: t.kind,
    row_variable_ids: t.row_variable_ids ?? [],
    columns: t.columns ?? [],
    ...(clean(t.test_applied) ? { test_applied: t.test_applied } : {}),
    ...(list(t.reference_rows) ? { reference_rows: t.reference_rows } : {}),
    ...(clean(t.footnote) ? { footnote: t.footnote } : {}),
  }));

  return {
    spec_version: specVersion,
    study: {
      title: model.study.title,
      design: model.study.design,
      design_detail: designDetail,
      framework: model.study.framework,
      guideline: model.study.guideline,
      setting: model.study.setting,
      ...(model.study.centres ? { centres: model.study.centres } : {}),
      population: model.study.population,
      ...(list(model.study.groups) ? { groups: model.study.groups } : {}),
      ...(clean(model.study.claim_strength) ? { claim_strength: model.study.claim_strength } : {}),
    },
    timepoints: model.timepoints ?? [],
    eligibility: {
      inclusion: model.eligibility?.inclusion ?? [],
      exclusion: model.eligibility?.exclusion ?? [],
    },
    objectives,
    outcomes,
    variables,
    analyses,
    tables,
    crf_sections: model.crf_sections ?? [],
    sample_size: model.sample_size,
    ...(list(model.populations) ? { populations: model.populations } : {}),
    ...(list(model.multiplicity) ? { multiplicity: model.multiplicity } : {}),
    ...(list(model.sensitivity_analyses) ? { sensitivity_analyses: model.sensitivity_analyses } : {}),
    ...(model.missing_data ? { missing_data: model.missing_data } : {}),
    open_items: model.open_items ?? [],
  } as StudySpec;
}

const ROLE = `You are a senior medical research methodologist and trial statistician.
You are converting a protocol into a single machine-readable study specification, from
which a case record form, a statistical analysis plan and a set of shell tables will be
generated automatically. Whatever you leave out will simply be missing from all three.

Where the protocol is wrong, encode the CORRECTED study, not its mistakes: this object
defines the study as it will now be run. Where the protocol is silent, choose the
standard answer a methodologist would choose, and record the choice in open_items so the
guide can see it and object.`;

const STAGES = [
  {
    key: "stage1",
    schema: STAGE1_SCHEMA,
    note: "Classifying the design and the population",
    instruction: `Build the first part of the specification: what kind of study this is.

Classify the design with Reference 1 and record in design_detail the facts that
design requires: a case-control needs its matching variables and ratio, a cluster
trial its ICC and cluster size, a cohort its follow-up schedule and censoring
rule, any randomised design its sequence generation, allocation concealment and
blinding.

Then the time points (ids beginning tp_), each with a real window: "day 30" is
unusable, "day 30 +/- 3" is a protocol. Then eligibility (ids beginning elg_),
as discrete checkable criteria that leave no gap between inclusion and exclusion.`,
  },
  {
    key: "stage1b",
    schema: STAGE1B_SCHEMA,
    note: "Turning objectives into outcomes",
    instruction: `Now the questions the study asks.

Exactly one primary objective, phrased as a question. The primary objective needs
all five ICH E9(R1) estimand attributes, including the intercurrent-event strategy
that says what happens when a patient stops treatment, gets rescue therapy or dies
before the endpoint.

Then the outcomes, exactly one primary. Give each its definition, instrument, the
time point it is measured at, its data type and subtype, and the summary statistic
a table will carry. You will name the variables in a later step, so give each
outcome the source_variable_ids you intend to create, beginning var_.

Ids begin obj_ and out_.`,
  },
  {
    key: "stage1c",
    schema: STAGE1C_SCHEMA,
    note: "Reproducing the sample size and the analysis rules",
    instruction: `Now the size of the study and the rules the analysis runs under.

Reproduce the sample size the protocol states: the formula, every input with the
source it came from, alpha, power, the attrition allowance and the resulting n. It
must be powered on the primary outcome. Where the protocol gives no source for a
number, say so rather than inventing one.

Then the analysis populations (ids pop_, exactly one primary, required for any
interventional design), the multiplicity rule for each outcome family, any
sensitivity analyses (ids sen_), the missing-data plan, and anything the guide
must still decide as open_items (ids open_).`,
  },
  {
    key: "stage2",
    schema: STAGE2_SCHEMA,
    note: "Deciding what the form collects and what is computed",
    instruction: `Now the variables and the form.

Every variable an outcome names must exist here, and every variable must be either
CAPTURED (crf.collected true, with a section, a field type and an answer space) or
DERIVED (role derived, with derived_from, a formula and a kind; crf.collected false).

Collect raw and rich. Dates rather than durations. The reading rather than a
yes/no. A score's items rather than its total. The number rather than the band.
Any value that can be computed must be derived, never a box someone fills in.

Also give every variable used as a categorical predictor a reference_level, and
give every clinical category set its definition_source and definition_reference
(quote the protocol, or name the standard: ISGPS, Clavien-Dindo, CDC, KDIGO, ASA).

Create the crf_sections, ids beginning sec_, one per baseline block and one per
follow-up visit, each tied to a timepoint you already defined.`,
  },
  {
    key: "stage3",
    schema: STAGE3_SCHEMA,
    note: "Writing the analyses and the tables",
    instruction: `Finally the analyses and the tables.

One analysis per outcome, ids beginning ana_. Never put a mediator or a collider
in a covariate list: adjusting for one removes the effect being measured. A Cox
model must declare its proportional-hazards check.

Then the tables, ids beginning tbl_, numbered contiguously from 1, blocks in order
(descriptive, primary, secondary, exploratory, sensitivity), sensitivity last.
Never label a column Model 1 or Model 2. Put unadjusted and adjusted side by side,
each with a 95% CI, and name the test applied on every analytical table.`,
  },
] as const;

function protocolBlock(protocol: ExtractedProtocol): Anthropic.ContentBlockParam {
  if (protocol.kind === "pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: protocol.base64 },
    };
  }
  return {
    type: "text",
    text: `<protocol filename="${protocol.filename}">\n${protocol.text}\n</protocol>`,
  };
}

export type IngestResult = {
  spec: StudySpec;
  findings: { code: string; severity: string; path: string; message: string }[];
  repaired: boolean;
  model: string;
  usage: TokenUsage;
};

/**
 * Runs the three stages in order, each seeing what the one before produced, then
 * validates the assembled specification and repairs it once if the gate objects.
 */
export async function draftStudySpec(
  protocol: ExtractedProtocol,
  options: {
    onProgress?: (note: string) => void;
    onUsage?: (usage: TokenUsage) => void;
    /** Stages already completed, so an interrupted run resumes instead of restarting. */
    resume?: Record<string, unknown>;
    /** Fires after each stage, so the caller can checkpoint it. */
    onStage?: (key: string, merged: Record<string, unknown>) => void;
  } = {},
): Promise<IngestResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new IngestError("ANTHROPIC_API_KEY is not set.");
  }

  // A stage can stream for many minutes, and the default socket timeout cuts it
  // off mid-response. Retries cover a connection that drops before first byte.
  const client = new Anthropic({ timeout: 30 * 60 * 1000, maxRetries: 3 });
  const knowledge = loadKnowledge();
  const totals: TokenUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
  let lastModel = MODEL;

  async function ask(
    schema: Record<string, unknown>,
    instruction: string,
    soFar: Record<string, unknown> | null,
    stageName = "a stage",
  ): Promise<Record<string, unknown>> {
    const content: Anthropic.ContentBlockParam[] = [protocolBlock(protocol)];
    if (soFar) {
      content.push({
        type: "text",
        text: `What you have decided so far, which the rest must be consistent with:\n${JSON.stringify(soFar)}`,
      });
    }
    content.push({ type: "text", text: instruction });

    const spent = { ...totals };
    const stream = client.messages.stream({
      model: MODEL,
      // The variables stage is the largest output by far, one entry per variable
      // with its form field, so every stage gets the full streaming ceiling.
      max_tokens: 64000,
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT, format: { type: "json_schema", schema } },
      system: [
        { type: "text", text: ROLE },
        { type: "text", text: knowledge, cache_control: { type: "ephemeral", ttl: "1h" } },
      ],
      messages: [{ role: "user", content }],
    });

    stream.on("streamEvent", (event) => {
      if (event.type === "message_delta") {
        options.onUsage?.({
          ...spent,
          output_tokens: spent.output_tokens + (event.usage.output_tokens ?? 0),
        });
      }
    });

    const message = await stream.finalMessage();
    lastModel = message.model;
    totals.input_tokens += message.usage.input_tokens;
    totals.output_tokens += message.usage.output_tokens;
    totals.cache_creation_input_tokens += message.usage.cache_creation_input_tokens ?? 0;
    totals.cache_read_input_tokens += message.usage.cache_read_input_tokens ?? 0;

    if (message.stop_reason === "max_tokens") {
      throw new IngestError(
        `The "${stageName}" stage was cut off before it finished. The protocol may define more variables than one response can carry.`,
      );
    }
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return JSON.parse(text) as Record<string, unknown>;
  }

  let model: Record<string, unknown> = { ...(options.resume ?? {}) };
  const done = new Set(Object.keys(model).length ? (model.__stages as string[]) ?? [] : []);

  for (const stage of STAGES) {
    if (done.has(stage.key)) {
      options.onProgress?.(`${stage.note} (already done)`);
      continue;
    }
    options.onProgress?.(stage.note);
    // Each stage sees the running result, so the chain stays consistent.
    const part = await ask(
      stage.schema,
      stage.instruction,
      Object.keys(model).length ? model : null,
      stage.note,
    );
    model = { ...model, ...part };
    done.add(stage.key);
    model.__stages = [...done];
    // Checkpoint immediately: these stages are slow and expensive, and a socket
    // that drops on stage four must not discard stages one to three.
    options.onStage?.(stage.key, model);
  }

  delete model.__stages;

  options.onProgress?.("Checking the specification");
  let spec = normalise(model);
  let result = validate(spec);
  let repaired = false;

  if (!result.ok) {
    const errors = result.findings.filter((f) => f.severity === "ERROR");
    options.onProgress?.(`Fixing ${errors.length} problem(s) the gate found`);
    // The gate's messages already say what to do, so hand them straight back.
    const repairInstruction = `The specification was rejected by the validator. Return the
analyses and tables again, corrected so that these problems are gone. Change nothing else.

${errors.map((f) => `${f.code} at ${f.path}: ${f.message}`).join("\n")}`;
    try {
      const fixed = await ask(STAGE3_SCHEMA, repairInstruction, model, "repair");
      spec = normalise({ ...model, ...fixed });
      result = validate(spec);
      repaired = true;
    } catch {
      // A failed repair leaves the original draft and its findings intact.
    }
  }

  return { spec, findings: result.findings, repaired, model: lastModel, usage: totals };
}
