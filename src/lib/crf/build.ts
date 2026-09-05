import Anthropic from "@anthropic-ai/sdk";
import { loadKnowledge } from "../protocol/knowledge.ts";
import { explainApiError } from "../protocol/api-error.ts";
import { decisionsBlock, unresolvedBlock } from "../protocol/answers.ts";
import type { Consequence } from "../protocol/schema.ts";
import { DOCUMENT_MAX_TOKENS, EFFORT, MODEL } from "../protocol/analyze.ts";
import type { TokenUsage } from "../protocol/pricing.ts";
import type { ExtractedProtocol } from "../protocol/extract.ts";
import type { SapSpec } from "../sap/types.ts";
import type { Finding } from "../sap/validate.ts";
import type { CrfField, CrfSection, CrfSpec } from "./types.ts";
import type { RequiredField } from "./required.ts";
import { requiredDerived, requiredFields, requiredVisits } from "./required.ts";
import { validateCrf } from "./validate.ts";
import { resolveRollCall } from "./roll-call.ts";
import { assignColumnNames } from "./columns.ts";

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
  variable_id: {
    ...str,
    description:
      "How this field is referred to everywhere else on the form. When the analysis plan declares this variable, copy its id EXACTLY: those begin var_ or out_, and inventing one that begins var_ is an error. When the plan does not declare it, because it is a raw ingredient the plan derives from (height and weight when the plan analyses body mass index, the two dates when it analyses length of stay), give it a short key of your own WITHOUT the var_ prefix, such as height_cm. Empty only for a field nothing else refers to.",
  },
  label: {
    ...str,
    description:
      "Always fill this in: it is what prints on the form. When variable_id names a variable in the plan, the plan's wording replaces it, so the two documents cannot disagree.",
  },
  column_name: {
    ...str,
    description:
      "The column this field becomes in the datasheet: age_yrs, sex, dm, asa_grade, op_duration_min, hb_gdl. Lower case, no spaces, under twenty characters, carrying the unit where the unit matters (hb_gdl, not hb). Every field needs one and no two fields may share one, because this is what the analyst matches the spreadsheet against.",
  },
  type: {
    type: "string",
    enum: ["Number", "Date", "Single-select", "Multi-select", "Single-select + text", "Text", "Text / Date"],
  },
  options: { ...strArray, description: "Every allowed answer, for a select. Empty otherwise." },
  unit: { ...str, description: "Required for a Number: years, cm, mmHg, minutes. Empty otherwise." },
  primary_outcome: { type: "boolean", description: "True only for the study's primary outcome field." },
  note: { ...str, description: "A short qualifier such as 'If yes, ...'. Empty when not needed." },
  respondents: {
    ...strArray,
    description:
      "Who answers, where more than one person answers the same question: ['R1','R2'] for two observers reading the same scan. Each gets its own response line, so what each of them said is recorded separately, which is the whole point of an agreement or reliability study. Empty everywhere else, which is almost everywhere.",
  },
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
      "Every analytic role, confirmed to have a field. List confounders one by one, never as 'etc'. Everything here is an id from the analysis plan, so the claim can be checked against the form.",
    items: obj({
      role: { type: "string", enum: ["exposure", "primary_outcome", "secondary_outcome", "confounder"] },
      ref_id: { ...str, description: "The id of the variable or outcome, from the plan." },
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
      "Lettered A onward, grouped by what the field is rather than by when you thought of it. The usual order, keeping only the ones this study has: demographics; the history blocks it takes, each its own section; presenting symptoms; comorbidity and treatment history, where the adjustment covariates live; clinical examination and pre-operative findings; the index test or the study's own measurements, split into parts where one heading covers blocks that share nothing else; and the reference standard or outcome source, which is where the primary outcome is recorded. One section per visit for anything collected repeatedly, so each visit's section stands alone. A collector works down the page in the order the patient is seen, so a form grouped this way is filled in one pass.",
    items: obj({
      letter: {
        ...str,
        description:
          "A, B, C... A letter followed by a digit makes this a part of the section with that letter: H1, H2 and H3 are the three blocks of section H, each its own table under its heading. Use that where one heading covers blocks that share nothing else, such as an index test with its scan details, its direct features and its indirect features. Most sections are a plain letter.",
      },
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
      "Values worked out from other fields: length of stay from two dates, BMI from height and weight, a band from the number it was banded from, a score from its items, an acquisition group from a case definition applied to what was recorded. Each gets a field of its own AND has every ingredient on the form, so the value can be recomputed and checked against what was written down. Say the rule in `how`, and print it beside the field so whoever fills the form applies the same one.",
    items: obj({
      variable_id: {
        ...str,
        description: "The id of the variable this computes, when the plan declares one. Empty otherwise.",
      },
      name: { ...str, description: "The name this calculated value is printed under. Always fill it in." },
      from_variable_ids: {
        ...strArray,
        description:
          "The variable_id of each field it is computed from, exactly as that field carries it. Every one must be a field on this form.",
      },
      how: str,
    }),
  },
});

/**
 * The second pass: only the fields the first one left out.
 *
 * Small on purpose. Asked for one thing it cannot lose the thread of, a model
 * that stopped halfway through a long form finishes the rest.
 */
export const CRF_COMPLETION_SCHEMA = obj({
  sections: {
    type: "array",
    description:
      "One section per group of missing fields, in the order they are collected. Reuse the title of an existing section where the field belongs in one, and it will be merged into it; otherwise give the new section its own title.",
    items: obj({
      title: { ...str, description: "The section heading." },
      visit: {
        ...str,
        description: "The visit this section is filled at, matching one of the visits named. Empty where it is filled once at entry.",
      },
      fields: { type: "array", items: FIELD },
      note: { ...str, description: "Printed under the table. Empty when not needed." },
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

A field that collects a variable the plan analyses carries that variable's id,
copied from the plan. A field that collects a raw ingredient the plan does not
declare carries a short key of your own instead. Both belong on the form: the
plan analyses body mass index, and the form collects height and weight.

The form collects raw and rich data as well as the values worked out from them.
Dates as well as the duration. The reading as well as the yes or no. A score's
items as well as its total. The number as well as the band. Anything that can be
calculated is ALSO listed as a calculated value naming the fields it comes from,
so a reader can see how it was arrived at and check it.

Both, and not one or the other. The ingredients alone lose whatever a person
decided at the bedside, and for a case definition a clinician applies, that
decision is the variable: a study comparing hospital-acquired against
community-acquired infection needs a box saying which this was, and needs the
admission and culture times that the classification was made from.

Refer to every variable by the id the analysis plan gave it, and do not retype its
wording. The plan, this form and the shell tables all point at the same ids, so a
variable named once is named the same in all three documents.

The field type follows the data type the plan gives the variable, and the
application checks that it does:

- binary or ordinal, a single-select with every level pre-printed;
- nominal, a select with every category pre-printed;
- continuous or count, a number with its unit, or the dates a duration is
  computed from;
- time to event, the dates.

Text is for a name, an identifier or a free remark, and for nothing the plan
analyses. If a variable the plan calls categorical has values you cannot print
as options, do not fall back to a text box: the plan has typed it wrongly, and a
composite such as parity in TPAL form is several numeric fields rather than one
of anything.

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
    /**
     * The review's blockers that nobody answered. Carried whether or not they
     * were, because answering was built as an optional step and has never once
     * been taken.
     */
    unresolved?: Consequence[];
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

${JSON.stringify({
        objectives: sap.objectives,
        variables: sap.variables,
        outcomes: sap.outcomes,
        analyses: sap.analyses,
      })}`,
    },
  ];

  const decisions = decisionsBlock(options.answers, "form");
  if (decisions) content.push({ type: "text", text: decisions });

  const unresolved = unresolvedBlock(options.unresolved ?? [], "form");
  if (unresolved) content.push({ type: "text", text: unresolved });

  // The checklist, worked out from the plan rather than asked for. It goes last,
  // nearest the writing, because what a model is told at the end of a long
  // input is what it is still holding when it starts.
  content.push({ type: "text", text: checklistBlock(sap) });

  content.push({
    type: "text",
    text: `Build the data-collection plan and the case report form. Name the visits
first, then the grid of elements against them, then the roll-call, then the
sections and their fields.

Work down the checklist above and do not stop before its last line. A form that
covers the first half of a study is not a shorter form, it is a study that
cannot be analysed.`,
  });

  options.onProgress?.("Planning the data collection");

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: DOCUMENT_MAX_TOKENS,
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

  let message;
  try {
    message = await stream.finalMessage();
  } catch (error) {
    // Said in words. Without this the raw JSON body reaches the screen.
    const explained = explainApiError(error);
    if (explained) throw new CrfError(explained);
    throw error;
  }
  if (message.stop_reason === "max_tokens") {
    throw new CrfError("The form was cut off before it finished.");
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const raw = JSON.parse(text) as CrfSpec;

  // The wording is copied from the plan's registry rather than retyped, so the
  // form cannot call a variable something the plan does not call it.
  const labels: Record<string, string> = {};
  for (const v of sap.variables ?? []) labels[v.id] = v.label;
  for (const o of sap.outcomes ?? []) labels[o.id] = o.what;

  // A field's id is how the rest of the form refers to it. When the plan
  // declares that variable the id is the plan's, and the wording comes from the
  // registry; otherwise it is the form's own key for a raw value the plan
  // derives from, and the field carries its own wording. Both are real ids: a
  // calculated value has to be able to name the fields it is computed from.
  const tidyField = (f: CrfSpec["identifiers"][number]) => {
    const variable_id = f.variable_id?.trim() || undefined;
    return {
      ...f,
      variable_id,
      // A field with no wording prints as a blank line on a paper form, so the
      // registry's wording stands in when the model left the label empty.
      label: f.label?.trim() || (variable_id ? (labels[variable_id] ?? "") : "") || "",
      options: f.options?.length ? f.options : undefined,
      unit: f.unit?.trim() || undefined,
      note: f.note?.trim() || undefined,
      column_name: f.column_name?.trim() || undefined,
      // An empty list means one respondent, which is the ordinary case, and the
      // field then prints exactly as it always has.
      respondents: f.respondents?.length ? f.respondents : undefined,
      primary_outcome: f.primary_outcome || undefined,
    };
  };

  const spec: CrfSpec = {
    ...raw,
    title: sap.title,
    labels,
    identifiers: (raw.identifiers ?? []).map(tidyField),
    sections: nestParts(
      (raw.sections ?? []).map((s) => ({
        ...s,
        note: s.note?.trim() || undefined,
        fields: (s.fields ?? []).map(tidyField),
      })),
    ),
    derived: (raw.derived ?? []).map((d) => {
      const variable_id = d.variable_id?.trim() || undefined;
      return {
        ...d,
        variable_id,
        // A calculated value with no name prints as a blank row.
        name: d.name?.trim() || (variable_id ? (labels[variable_id] ?? variable_id) : ""),
        from_variable_ids: d.from_variable_ids ?? [],
      };
    }),
  };

  // What the checklist asked for and the form did not deliver. Asked once more,
  // for those alone. A form that covers the pre-operative half of a trial is
  // the failure this exists to close, and it is not closed by asking nicely.
  const extra = await completeForm(client, spec, sap, tidyField, options);
  if (extra.sections.length) {
    spec.sections = mergeSections(spec.sections, extra.sections);
  }

  // After the repair pass, so a field added there is named too, and so
  // uniqueness holds across the finished form rather than across half of it.
  const named = assignColumnNames(spec);
  spec.identifiers = named.identifiers;
  spec.sections = named.sections;

  // Which field captures each role is read off the finished form, not asked of
  // the model. After the repair pass, so a field added there is counted.
  spec.roll_call = resolveRollCall(spec, sap);

  const { findings } = validateCrf(spec, sap);

  return {
    spec,
    findings,
    model: message.model,
    usage: {
      input_tokens: message.usage.input_tokens + extra.usage.input_tokens,
      output_tokens: message.usage.output_tokens + extra.usage.output_tokens,
      cache_creation_input_tokens:
        (message.usage.cache_creation_input_tokens ?? 0) + extra.usage.cache_creation_input_tokens,
      cache_read_input_tokens:
        (message.usage.cache_read_input_tokens ?? 0) + extra.usage.cache_read_input_tokens,
    },
  };
}

/**
 * The fields the plan requires, written out for the model to work down.
 *
 * A list it can tick off, rather than a rule it has to keep in mind while
 * writing a long document. The rule was there before and was followed for the
 * first half of a form: this is the same rule in a form that can be checked
 * line by line, and it is checked line by line afterwards.
 */
function checklistBlock(sap: SapSpec): string {
  const fields = requiredFields(sap);
  const derived = requiredDerived(sap);
  const visits = requiredVisits(sap);

  const lines = fields.map(
    (f, i) =>
      `${i + 1}. ${f.variable_id} - "${f.label}" - ${f.data_type}, coded ${f.unit_coding || "as the protocol states"}${
        f.timepoints.length ? `, measured at ${f.timepoints.join(" and ")}` : ""
      }. Needed because ${f.because}.`,
  );

  return `Every field this form must carry, worked out from the plan. There are
${fields.length}. Each one needs a field whose variable_id is the id given here,
and the field type must match the data type:

${lines.join("\n")}

${
    derived.length
      ? `These are calculated, never collected. Put each in the calculated values, naming the fields it comes from, and do NOT give any of them a field of its own:

${derived.map((d) => `- ${d.variable_id} ("${d.label}") from ${d.from_variable_ids.join(", ")}`).join("\n")}`
      : "Nothing in this plan is calculated from other fields."
  }

${
    visits.length
      ? `The plan measures things at these times, so the form needs a section for each: ${visits.join("; ")}.`
      : "Everything is collected once, at entry."
  }

You may add fields the plan does not name only where they are identifiers, or
where they are the raw values a calculated value above is computed from. Nothing
else: a field that answers no question is a box somebody has to fill for
nothing.`;
}

/** Every variable the plan requires that no field and no calculated value covers. */
export function missingFields(spec: CrfSpec, sap: SapSpec): RequiredField[] {
  const captured = new Set<string>();
  const take = (fields: CrfField[] | undefined) => {
    for (const f of fields ?? []) if (f.variable_id) captured.add(f.variable_id);
  };
  take(spec.identifiers);
  for (const section of spec.sections ?? []) {
    take(section.fields);
    // A section's parts hold fields too, and this counted none of them, so a
    // field in one looked missing and was asked for a second time.
    for (const part of section.sections ?? []) take(part.fields);
  }
  // Being listed among the calculated values is not being collected. It used to
  // count here, which is how a study's own exposure came to have no box on the
  // form and nothing to say so.
  return requiredFields(sap).filter((f) => !captured.has(f.variable_id));
}

/**
 * Asks for the fields the form left out, and for nothing else.
 *
 * The whole protocol is not sent again: the plan already said what these
 * variables are, and the question is only where on the form they go. One short
 * call, at medium effort, because the thinking was done in the first one.
 */
async function completeForm(
  client: Anthropic,
  spec: CrfSpec,
  sap: SapSpec,
  tidyField: (f: CrfField) => CrfField,
  options: { onProgress?: (note: string) => void; onUsage?: (usage: TokenUsage) => void },
): Promise<{ sections: CrfSection[]; usage: TokenUsage }> {
  const none = {
    sections: [] as CrfSection[],
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };

  const missing = missingFields(spec, sap);
  if (!missing.length) return none;

  options.onProgress?.(
    `Adding the ${missing.length} field${missing.length === 1 ? "" : "s"} the form left out`,
  );

  const asked = missing
    .map(
      (f) =>
        `- ${f.variable_id} - "${f.label}" - ${f.data_type}, coded ${f.unit_coding || "as the protocol states"}${
          f.timepoints.length ? `, measured at ${f.timepoints.join(" and ")}` : ""
        }. Needed because ${f.because}.`,
    )
    .join("\n");

  const existing = (spec.sections ?? []).map((s) => s.title).join("; ");

  let message;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      // Medium, not high: what to collect was decided in the first call, and
      // all that is left is where on the form it goes.
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: CRF_COMPLETION_SCHEMA },
      },
      system: [{ type: "text", text: ROLE }],
      messages: [
        {
          role: "user",
          content: `A case report form for "${sap.title}" has been built and is missing fields the
analysis plan requires. Its sections so far are: ${existing || "none"}.
Its visits are: ${(spec.visits ?? []).join("; ") || "not yet named"}.

Add these, and only these:

${asked}

Give each one a field whose variable_id is the id above and whose type matches
the data type, with every option pre-printed for a select and the unit shown on
a number. Group them into sections: reuse an existing section title where the
field belongs in one, and give anything collected at a follow-up visit its own
section named for that visit.`,
        },
      ],
    });
  } catch {
    // The first form still stands, and the validators will report what it is
    // missing. A failed second call must not lose the first.
    return none;
  }

  const usage: TokenUsage = {
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
    cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
  };
  options.onUsage?.(usage);

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: { sections?: CrfSection[] };
  try {
    parsed = JSON.parse(text) as { sections?: CrfSection[] };
  } catch {
    return { ...none, usage };
  }

  const sections = (parsed.sections ?? []).map((s) => ({
    letter: "",
    title: s.title,
    visit: s.visit?.trim() || undefined,
    note: s.note?.trim() || undefined,
    fields: (s.fields ?? []).map(tidyField),
  }));

  return { sections, usage };
}

/**
 * Folds the second pass into the first.
 *
 * A section whose title already exists gains the fields; anything else is
 * appended. Letters are re-run at the end so the form still reads A, B, C.
 */
export function mergeSections(existing: CrfSection[], extra: CrfSection[]): CrfSection[] {
  const merged = existing.map((s) => ({ ...s, fields: [...s.fields] }));
  const key = (title: string) => title.trim().toLowerCase();
  const byTitle = new Map(merged.map((s) => [key(s.title), s]));

  for (const section of extra) {
    if (!section.fields.length) continue;
    const already = byTitle.get(key(section.title));
    if (already) {
      const have = new Set(already.fields.map((f) => f.variable_id).filter(Boolean));
      already.fields.push(...section.fields.filter((f) => !f.variable_id || !have.has(f.variable_id)));
    } else {
      merged.push(section);
      byTitle.set(key(section.title), merged[merged.length - 1]);
    }
  }

  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return merged.map((s, i) => ({ ...s, letter: LETTERS[i] ?? String(i + 1) }));
}

/**
 * Folds `H1`, `H2` into section `H`.
 *
 * The model returns the sections flat and says which is a part of which by its
 * letter, because a sub-section carrying the whole field object inside the
 * schema doubled the grammar and the API refused to compile it. The shape the
 * renderers want is nested, so it is nested here, where it costs nothing.
 */
export function nestParts(sections: CrfSection[]): CrfSection[] {
  const parents = new Map<string, CrfSection>();
  const out: CrfSection[] = [];

  for (const section of sections) {
    if (/^[A-Za-z]\d+$/.test(section.letter.trim())) continue;
    const parent = { ...section, sections: undefined as CrfSection[] | undefined };
    parents.set(section.letter.trim().toUpperCase(), parent);
    out.push(parent);
  }

  for (const section of sections) {
    const part = section.letter.trim().match(/^([A-Za-z])(\d+)$/);
    if (!part) continue;
    const parent = parents.get(part[1].toUpperCase());
    // A part whose parent was never declared is kept as a section of its own
    // rather than dropped: a form missing a block is worse than an odd letter.
    if (!parent) {
      out.push(section);
      continue;
    }
    parent.sections = [...(parent.sections ?? []), section];
  }

  return out;
}
