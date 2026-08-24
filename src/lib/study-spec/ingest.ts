import Anthropic from "@anthropic-ai/sdk";
import { createRequire } from "node:module";
import { loadKnowledge } from "../protocol/knowledge";
import { EFFORT, MODEL } from "../protocol/analyze";
import type { TokenUsage } from "../protocol/pricing";
import type { ExtractedProtocol } from "../protocol/extract";
import { STUDY_SPEC_JSON_SCHEMA } from "./ingest-schema.ts";
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
  constructor(message: string, readonly findings: unknown[] = []) {
    super(message);
    this.name = "IngestError";
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

function userContent(
  protocol: ExtractedProtocol,
  repair?: { previous: string; findings: string },
): Anthropic.MessageParam["content"] {
  const instruction = repair
    ? `The specification you produced was rejected by the validator. Fix exactly these
problems and return the whole corrected specification.

${repair.findings}

Your previous attempt:
${repair.previous}`
    : `Build the study specification for the protocol above ("${protocol.filename}").

Work in this order:
1. Classify the design with Reference 1, and record the facts that design requires.
2. Turn every objective into outcomes, and every outcome into the variables that measure it.
3. Decide for each variable whether it is CAPTURED on the form or DERIVED from captured
   values. Collect raw and rich: dates rather than durations, the reading rather than
   yes/no, the score's items rather than its total, the number rather than the band.
4. Write the analyses, then the tables that report them.
5. Reproduce the sample size with its inputs and their sources.

Every objective needs an outcome, every outcome needs source variables, and every
variable must end in a CRF field, directly or through its derivation chain.`;

  if (protocol.kind === "pdf") {
    return [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: protocol.base64 } },
      { type: "text", text: instruction },
    ];
  }
  return [
    { type: "text", text: `<protocol filename="${protocol.filename}">\n${protocol.text}\n</protocol>` },
    { type: "text", text: instruction },
  ];
}

export type IngestResult = {
  spec: StudySpec;
  findings: { code: string; severity: string; path: string; message: string }[];
  repaired: boolean;
  model: string;
  usage: TokenUsage;
};

export async function draftStudySpec(
  protocol: ExtractedProtocol,
  options: { onProgress?: (note: string) => void } = {},
): Promise<IngestResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new IngestError("ANTHROPIC_API_KEY is not set.");
  }

  const client = new Anthropic();
  const knowledge = loadKnowledge();
  const totals: TokenUsage = {
    input_tokens: 0, output_tokens: 0,
    cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
  };

  async function ask(repair?: { previous: string; findings: string }) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT, format: { type: "json_schema", schema: STUDY_SPEC_JSON_SCHEMA } },
      system: [
        { type: "text", text: ROLE },
        { type: "text", text: knowledge, cache_control: { type: "ephemeral", ttl: "1h" } },
      ],
      messages: [{ role: "user", content: userContent(protocol, repair) }],
    });

    const message = await stream.finalMessage();
    totals.input_tokens += message.usage.input_tokens;
    totals.output_tokens += message.usage.output_tokens;
    totals.cache_creation_input_tokens += message.usage.cache_creation_input_tokens ?? 0;
    totals.cache_read_input_tokens += message.usage.cache_read_input_tokens ?? 0;

    if (message.stop_reason === "max_tokens") {
      throw new IngestError("The specification was cut off before it finished.");
    }
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { text, model: message.model };
  }

  options.onProgress?.("Reading the protocol and drafting the specification");
  const first = await ask();
  let spec = normalise(JSON.parse(first.text));
  let result = validate(spec);
  let repaired = false;

  if (!result.ok) {
    // The gate's messages already say what to do, so hand them straight back.
    options.onProgress?.(`Fixing ${result.findings.filter((f) => f.severity === "ERROR").length} problem(s) the gate found`);
    const findings = result.findings
      .filter((f) => f.severity === "ERROR")
      .map((f) => `${f.code} at ${f.path}: ${f.message}`)
      .join("\n");
    const second = await ask({ previous: JSON.stringify(spec), findings });
    spec = normalise(JSON.parse(second.text));
    result = validate(spec);
    repaired = true;
  }

  return { spec, findings: result.findings, repaired, model: first.model, usage: totals };
}
