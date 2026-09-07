import Anthropic from "@anthropic-ai/sdk";
import { EFFORT, MODEL } from "../protocol/analyze.ts";
import { explainApiError } from "../protocol/api-error.ts";
import type { TokenUsage } from "../protocol/pricing.ts";
import type { SapRegistry } from "../sap/types.ts";
import type { DatasetProfile, Grid, Interpretation } from "./types.ts";
import { DatasetError } from "./read.ts";

/**
 * The three questions about a sheet that only judgement can answer.
 *
 * Which row holds the headers, which column is which variable in the plan, and
 * which spellings in a column are one category. Nothing else is asked, and
 * nothing else is accepted: the model never returns a cell, so every
 * transformation is applied by code from these answers and the same file cleans
 * the same way twice.
 *
 * It is shown the profile and the first few rows, never the data. A study of
 * five thousand patients costs what a study of fifty costs.
 */

const str = { type: "string" } as const;

function obj<T extends Record<string, unknown>>(properties: T, description?: string) {
  return {
    type: "object",
    ...(description ? { description } : {}),
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  } as const;
}

/**
 * The schema is built per call so the variable ids are a closed list.
 *
 * An id the plan does not declare is then impossible rather than merely
 * discouraged. The roll-call was asked for an id in prose, invented seven, and
 * reported seven fields as missing from a form that had all of them.
 */
export function interpretationSchema(variableIds: string[]) {
  return obj({
    header_row: {
      type: "integer",
      description:
        "The row holding the column headings, counting from 0. Sheets often open with the study's name and a blank line, and the headings are the first row that names things rather than recording them.",
    },
    columns: {
      type: "array",
      description: "One entry per column of the sheet, in order, including any you cannot place.",
      items: obj({
        index: { type: "integer", description: "The column's position, from 0." },
        variable_id: {
          type: "string",
          enum: ["", ...variableIds],
          description:
            "The analysis plan's id for the variable this column holds, or empty where the plan declares nothing for it. Only the ids listed are allowed.",
        },
        clean_name: {
          ...str,
          description:
            "A short lower-case name for the column when the plan claims none: age_yrs, hb_gdl, op_duration_min. Carry the unit where the unit matters. Empty when variable_id is set, because the plan's own datasheet name is used then.",
        },
        meaning: {
          ...str,
          description: "One sentence for the data dictionary: what this column holds.",
        },
        unit: { ...str, description: "The unit, where the values have one. Empty otherwise." },
        categories: {
          type: "array",
          description:
            "The distinct values that mean one thing, grouped. 'M', 'male' and 'Male' are one category written three ways; give the form it should print and every spelling seen. Empty for a number, a date or free text. Never invent a category the column does not contain, and never turn one into a number: the sheet stays text.",
          items: obj({
            canonical: { ...str, description: "The one spelling to print, in clinical wording." },
            spellings: {
              type: "array",
              items: str,
              description: "Every spelling seen in the column that means this, including the canonical one.",
            },
          }),
        },
      }),
    },
  });
}

const ROLE = `You are preparing a dataset somebody has already collected so that it can be analysed.

You answer three questions and nothing else. You never rewrite a value: the
cleaning is done by code from your answers, so that the same file always cleans
the same way.

1. Which row holds the column headings.
2. Which column holds which variable from the analysis plan, where there is one.
   A column the plan does not declare is not a failure: mark it empty and give it
   a clean name. Never guess a mapping you are not confident of, because a wrong
   one silently analyses the wrong column.
3. Which distinct values in a column are the same category written differently.
   Group only what is genuinely the same. "Right" and "Left" are two categories,
   not two spellings of one. Where a value is ambiguous, leave it out of every
   group: it will be reported to the investigator rather than changed.

Categories stay words. Do not map them to numbers, and do not invent a category
that does not appear in the values you were shown.`;

export type InterpretResult = {
  interpretation: Interpretation;
  headerRow: number;
  model: string;
  usage: TokenUsage;
};

export async function interpretDataset(
  grid: Grid,
  profile: DatasetProfile,
  sap: SapRegistry | null,
  options: {
    /** Stops the request where it is, when a build is stopped mid-read. */
    signal?: AbortSignal;
    onProgress?: (note: string) => void;
    onUsage?: (usage: TokenUsage) => void;
  } = {},
): Promise<InterpretResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new DatasetError("ANTHROPIC_API_KEY is not set.");
  }

  const variables = sap?.variables ?? [];
  const client = new Anthropic({ timeout: 30 * 60 * 1000, maxRetries: 3 });

  // The top of the sheet verbatim, so the header row can be judged, and the
  // profile for everything else. The rows themselves are never sent.
  const top = grid.rows
    .slice(0, 12)
    .map((row, i) => `${i}: ${row.map((c) => c || "-").join(" | ")}`)
    .join("\n");

  const registry = variables.length
    ? `The analysis plan declares these variables. Map a column to one only where
you are confident it is the same thing.

${variables
  .map((v) => `- ${v.id}: "${v.label}" (${v.data_type}${v.unit_coding ? `, ${v.unit_coding}` : ""})`)
  .join("\n")}`
    : `There is no analysis plan yet, so no column maps to a variable. Leave every
variable_id empty and give each column a clean name of your own.`;

  options.onProgress?.("Reading the sheet's columns");

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: EFFORT,
      format: { type: "json_schema", schema: interpretationSchema(variables.map((v) => v.id)) },
    },
    system: [{ type: "text", text: ROLE }],
    messages: [
      {
        role: "user",
        content: `The first rows of the sheet, as they are:

${top}

${registry}

Each column, and what is in it:

${profile.columns
  .map(
    (c) =>
      `[${c.index}] "${c.header}" - ${c.looks}, ${c.filled} filled, ${c.missing} empty${
        c.missingMarkers.length ? ` (markers seen: ${c.missingMarkers.join(", ")})` : ""
      }\n    values: ${c.distinct.map((d) => `${d.value} (${d.count})`).join(", ") || "none"}${
        c.distinctTotal > c.distinct.length ? `, and ${c.distinctTotal - c.distinct.length} more` : ""
      }`,
  )
  .join("\n")}`,
      },
    ],
  }, { signal: options.signal });

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
    const explained = explainApiError(error);
    throw new DatasetError(explained ?? "Reading the sheet's columns failed.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new DatasetError("Reading the sheet's columns was cut off before it finished.");
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = JSON.parse(text) as { header_row?: number; columns?: Interpretation["columns"] };

  return {
    // A header row outside the sheet is not usable, so the guess stands.
    headerRow:
      typeof parsed.header_row === "number" &&
      parsed.header_row >= 0 &&
      parsed.header_row < grid.rows.length
        ? parsed.header_row
        : profile.headerRow,
    interpretation: { columns: parsed.columns ?? [] },
    model: message.model,
    usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
      cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
    },
  };
}
