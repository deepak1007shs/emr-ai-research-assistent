import Anthropic from "@anthropic-ai/sdk";
import { loadKnowledge } from "../protocol/knowledge.ts";
import { EFFORT, MODEL } from "../protocol/analyze.ts";
import type { TokenUsage } from "../protocol/pricing.ts";
import type { ExtractedProtocol } from "../protocol/extract.ts";
import type { SapSpec } from "../sap/types.ts";
import type { Finding } from "../sap/validate.ts";
import type { CrfSpec } from "./types.ts";
import { validateCrf } from "./validate.ts";

/**
 * Builds the case report form from the protocol and the analysis plan.
 *
 * The plan comes first on purpose: every field must trace back to something the
 * study needs, and every outcome and confounder the plan names must have a
 * field. The gate checks both directions afterwards.
 */

export class CrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrfError";
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

const FIELD = obj({
  label: { ...str, description: "The label as it appears on the form." },
  type: {
    type: "string",
    enum: ["Number", "Date", "Single-select", "Multi-select", "Single-select + text", "Text", "Text / Date"],
  },
  options: { ...strArray, description: "Every allowed answer, for a select. Empty otherwise." },
  unit: { ...str, description: "Required for a Number: years, cm, mmHg, minutes. Empty otherwise." },
  primary_outcome: { type: "boolean", description: "True only for the study's primary outcome field." },
  note: { ...str, description: "A short qualifier such as 'If yes, ...'. Empty when not needed." },
});

export const CRF_JSON_SCHEMA = obj({
  institution: { ...str, description: "Department and institution, as one line." },
  visits: {
    ...strArray,
    description:
      "The study's contacts with the patient, in order: Baseline (Pre-op), Intra-op, Day 1-3, Discharge, 1 Month. Only real contacts the protocol has.",
  },
  capture_pattern: {
    ...str,
    description:
      "One line saying whether data is captured prospectively, retrospectively, or both, and which parts are which.",
  },
  data_elements: {
    type: "array",
    description:
      "The rows of the collection grid, at element level rather than field level: 'Demographic details' is one row. Ordered to follow the patient journey.",
    items: obj({
      element: str,
      visits: { ...strArray, description: "The visits where this element is collected. Must be visits named above." },
    }),
  },
  roll_call: {
    type: "array",
    description:
      "Every analytic role, confirmed to have a field. List confounders one by one, never as 'etc'. The field must be the EXACT label of a field on the form, so the claim can be checked.",
    items: obj({
      role: { type: "string", enum: ["exposure", "primary_outcome", "secondary_outcome", "confounder"] },
      variable: str,
      field: { ...str, description: "The exact label of the field that captures it." },
      where: { ...str, description: "The visit at which it is captured." },
    }),
  },
  collected_once: { ...strArray, description: "Elements captured a single time for the whole study." },
  collected_repeatedly: {
    ...strArray,
    description: "Elements captured again at each visit because the value can change.",
  },
  identifiers: {
    type: "array",
    description:
      "The fixed first block: study subject ID, CR number, initials, date of birth, date of enrollment, CRF version, completed by.",
    items: FIELD,
  },
  sections: {
    type: "array",
    description:
      "Lettered A onward and named by topic. One section per visit for anything collected repeatedly, so each visit's section stands alone.",
    items: obj({
      letter: { ...str, description: "A, B, C..." },
      title: { ...str, description: "The topic, e.g. Demographics & Identification." },
      visit: { ...str, description: "Which visit this section is filled at." },
      fields: { type: "array", items: FIELD },
      note: {
        ...str,
        description:
          "Printed under the table, e.g. 'Body mass index is calculated from height and weight. Do not enter it here.' Empty when not needed.",
      },
    }),
  },
  derived: {
    type: "array",
    description:
      "Values computed during analysis, never fields. Their ingredients MUST all be fields on the form. Length of stay comes from two dates; BMI from height and weight; a band from the number it was banded from; a score from its items.",
    items: obj({
      name: str,
      from: { ...strArray, description: "The exact labels of the fields it is computed from." },
      how: str,
    }),
  },
});

const ROLE = `You are a senior clinical research methodologist building a case report form.

Work in the order the discipline requires. First decide what data the study needs,
how often each item is captured, at which visit, and how it is obtained. Only then
turn that plan into fields.

Two rules govern what goes on the form.

Every variable the analysis plan names must have a field. An outcome nobody
collects cannot be measured, and a confounder nobody records cannot be adjusted
for. List confounders one by one.

The form collects raw and rich data, never computed values. Dates rather than
durations. The reading rather than a yes or no. A score's items rather than its
total. The number rather than the band. Anything that can be calculated is listed
separately as a calculated value, with the fields it comes from.

Pre-print every option with a box. Show the unit on every number. Give every date
a mask. A field a data collector has to interpret is a field two collectors will
fill differently.`;

export type CrfResult = {
  spec: CrfSpec;
  findings: Finding[];
  model: string;
  usage: TokenUsage;
};

export async function buildCrfSpec(
  protocol: ExtractedProtocol,
  sap: SapSpec,
  options: {
    answers?: string | null;
    onProgress?: (note: string) => void;
    onUsage?: (usage: TokenUsage) => void;
  } = {},
): Promise<CrfResult> {
  if (!process.env.ANTHROPIC_API_KEY) throw new CrfError("ANTHROPIC_API_KEY is not set.");

  const client = new Anthropic({ timeout: 30 * 60 * 1000, maxRetries: 3 });

  const content: Anthropic.ContentBlockParam[] = [
    protocol.kind === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: protocol.base64 } }
      : { type: "text", text: `<protocol filename="${protocol.filename}">\n${protocol.text}\n</protocol>` },
    {
      type: "text",
      text: `The analysis plan for this study, which the form must serve. Every outcome
and every confounder here needs a field:

${JSON.stringify({ objectives: sap.objectives, variables: sap.variables, analyses: sap.analyses })}`,
    },
  ];

  const answers = (options.answers ?? "").trim();
  if (answers) {
    content.push({
      type: "text",
      text: `The investigator's decisions, which override the protocol where they conflict:

<investigator_decisions>
${answers}
</investigator_decisions>`,
    });
  }

  content.push({
    type: "text",
    text: `Build the data-collection plan and the case report form. Name the visits
first, then the grid of elements against them, then the roll-call, then the
sections and their fields.`,
  });

  options.onProgress?.("Planning the data collection");

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: { effort: EFFORT, format: { type: "json_schema", schema: CRF_JSON_SCHEMA } },
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
    throw new CrfError("The form was cut off before it finished.");
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const raw = JSON.parse(text) as CrfSpec;

  // Empty strings are the schema's way of saying "not applicable".
  const tidyField = (f: CrfSpec["identifiers"][number]) => ({
    ...f,
    options: f.options?.length ? f.options : undefined,
    unit: f.unit?.trim() || undefined,
    note: f.note?.trim() || undefined,
    primary_outcome: f.primary_outcome || undefined,
  });

  const spec: CrfSpec = {
    ...raw,
    title: sap.title,
    identifiers: (raw.identifiers ?? []).map(tidyField),
    sections: (raw.sections ?? []).map((s) => ({
      ...s,
      note: s.note?.trim() || undefined,
      fields: (s.fields ?? []).map(tidyField),
    })),
  };

  const { findings } = validateCrf(spec, sap);

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
