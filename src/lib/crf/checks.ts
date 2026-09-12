import type {
  CheckResult,
  CrfField,
  CrfSection,
  CrfTrace,
  FactsSheet,
  ShellTable,
  Variable,
  VariableName,
} from "../study/types.ts";
import { responseFor } from "./response.ts";

/**
 * Step 8's own checks, and Gate C.
 *
 * The ids and their wording come from the registry, which has carried them
 * since the rebuild with nothing producing them. What they ask is the one thing
 * a finished form cannot show you: whether it captures exactly what the tables
 * need - not less, not extra - and whether anything on it is a value the
 * analysis is supposed to compute.
 *
 * Every one is arithmetic over the stored traces. The deleted builder checked
 * the same things by matching a field's wording against a variable's, and its
 * own comment records what that cost; a trace is what a link looks like when it
 * is stored rather than recovered.
 */

const ok = (id: string, message: string): CheckResult => ({
  id,
  pass: true,
  failing: [],
  message,
});

/** The house wording, in the order it is printed. CRF-2 reads this. */
const TERMS: [RegExp, string[]][] = [
  [/^(yes|no)$/i, ["Yes", "No"]],
  [/^(male|female)$/i, ["Male", "Female"]],
  [/^(present|absent)$/i, ["Present", "Absent"]],
  [/^(done|not done)$/i, ["Done", "Not done"]],
];

export type CrfCheckInput = {
  facts: FactsSheet;
  variables: Variable[];
  tables: ShellTable[];
  sections: CrfSection[];
  fields: CrfField[];
  traces: Record<string, CrfTrace[]>;
};

/* ---- Step 8: the form is a form ------------------------------------- */

export function step8Checks(input: CrfCheckInput): CheckResult[] {
  const { variables, sections, fields } = input;
  const byName = new Map(variables.map((v) => [v.name, v]));
  const results: CheckResult[] = [];
  const name = (field: CrfField) => `${field.section}${field.sno} ${field.label}`;

  /* CRF-1: four things, in the order the rule states them. */
  const codes = new Set(sections.map((section) => section.code));
  const misnumbered: string[] = [];
  for (const section of sections) {
    const mine = fields.filter((field) => field.section === section.code);
    const wanted = mine.map((_, i) => i + 1);
    if (JSON.stringify(mine.map((f) => f.sno)) !== JSON.stringify(wanted)) {
      misnumbered.push(section.code);
    }
  }
  const headless = sections.filter((section) => !section.title.trim());
  const homeless = fields.filter((field) => !codes.has(field.section));
  // A response cell holds blanks, boxes, the options and a unit. Anything else
  // is an answer somebody has been given rather than asked for.
  const prefilled = fields.filter((field) => {
    const drawn = responseFor(field);
    // Order matters, and twice it was wrong. Anything that contains a slash -
    // the date mask, a unit like g/dL - has to go before the punctuation is
    // stripped, or it is no longer there to match: "(DD/MM/YYYY)" became
    // "(DDMMYYYY)" and every date read as pre-filled, then "g/dL" became "gdL"
    // and every laboratory value did.
    // Longest option first. Joined in the order they are printed, "II" is
    // removed from inside "III" and the leftover "I" reads as a value somebody
    // wrote in: a Bethesda category failed on a form with nothing wrong.
    const options = [...(field.options ?? [])].sort((a, b) => b.length - a.length);
    const emptied = drawn
      .replace(/\(DD\/MM\/YYYY\)/g, "")
      .replace(field.unit ? new RegExp(escape(field.unit), "g") : /(?!)/g, "")
      .replace(new RegExp(options.map((o) => escape(o)).join("|") || "(?!)", "g"), "")
      .replace(/[_☐/]/g, "")
      .replace(/Other:|\s+/g, "");
    return emptied.length > 0;
  });
  // A measured value is written down as it was measured. Offered as bands it
  // cannot be re-banded afterwards, and the mean of a band is not a mean.
  const banded = fields.filter((field) => {
    const variable = byName.get(field.source_variable as VariableName);
    return (
      variable !== undefined &&
      ["continuous", "count"].includes(variable.type) &&
      field.type !== "number"
    );
  });

  const crf1 = [
    ...misnumbered.map((code) => `section ${code}: numbering`),
    ...headless.map((section) => `section ${section.code}: no heading`),
    ...homeless.map((field) => `${name(field)}: no section`),
    ...prefilled.map((field) => `${name(field)}: pre-filled`),
    ...banded.map((field) => `${name(field)}: banded`),
  ];
  results.push(
    crf1.length === 0
      ? ok("CRF-1", "Numbering restarts at 1 in every section, every section has a heading, no response is pre-filled, and no continuous variable is banded.")
      : {
          id: "CRF-1",
          pass: false,
          failing: crf1,
          message: `${crf1.join("; ")}. A form is filled in by somebody who has never read the plan, and each of these is a place they would have to guess.`,
        },
  );

  /* CRF-2: the same words every time. */
  const drifted = fields.flatMap((field) => {
    const options = field.options ?? [];
    if (options.length !== 2) return [];
    const match = TERMS.find(([pattern]) => options.every((o) => pattern.test(o)));
    if (!match) return [];
    return JSON.stringify(options) === JSON.stringify(match[1])
      ? []
      : [`${name(field)}: ${options.join(" / ")}`];
  });
  results.push(
    drifted.length === 0
      ? ok("CRF-2", "Option wording is taken from the fixed terminology list.")
      : {
          id: "CRF-2",
          pass: false,
          failing: drifted,
          message: `${drifted.join("; ")} is worded differently from the house list, which writes Yes before No and Male before Female. Two runs of one study should not word the same question two ways.`,
        },
  );

  return results;
}

/* ---- Gate C: the form against the tables ----------------------------- */

export function gateC(input: CrfCheckInput): CheckResult[] {
  const { variables, tables, fields, traces } = input;
  const byName = new Map(variables.map((v) => [v.name, v]));
  const results: CheckResult[] = [];

  const captured = new Map<VariableName, Set<string>>();
  for (const field of fields) {
    if (field.source_variable === "infrastructure") continue;
    const at = captured.get(field.source_variable) ?? new Set<string>();
    if (field.timepoint) at.add(field.timepoint);
    captured.set(field.source_variable, at);
  }

  /** Every raw variable a value rests on, derived values expanded. */
  const rawOf = (name: VariableName, seen = new Set<VariableName>()): VariableName[] => {
    const variable = byName.get(name);
    if (!variable || seen.has(name)) return [];
    if (variable.crf) return [name];
    return variable.derived_from.flatMap((input) =>
      rawOf(input, new Set([...seen, name])),
    );
  };

  /* C7-1 not less. */
  const missing: string[] = [];
  for (const table of tables) {
    if (table.fit_table_of) continue;
    for (const used of table.variables) {
      for (const raw of rawOf(used)) {
        if (!captured.has(raw)) missing.push(`T${table.number}: ${raw}`);
      }
    }
  }
  results.push(
    missing.length === 0
      ? ok("C7-1", "Every raw variable a table needs has a field, at every time point the table needs it.")
      : {
          id: "C7-1",
          pass: false,
          failing: [...new Set(missing)],
          message: `${[...new Set(missing)].join("; ")} is used by a table and collected by no field. The table has a title and a grid, and nothing that could ever fill it.`,
        },
  );

  /* C7-2 not extra. */
  const stray = fields.filter((field) => {
    if (field.source_variable === "infrastructure") return false;
    return (traces[`${field.section}:${field.sno}`] ?? []).length === 0;
  });
  results.push(
    stray.length === 0
      ? ok("C7-2", "Every field that is not capture infrastructure traces to a table, or to a raw part of a derived value a table needs.")
      : {
          id: "C7-2",
          pass: false,
          failing: stray.map((field) => `${field.section}${field.sno} ${field.label}`),
          message: `${stray.map((f) => f.label).join(", ")} is on the form and feeds no table. Every field is work somebody does for every participant.`,
        },
  );

  /* C7-3 covariates and stratifiers. */
  const adjusters = new Set<VariableName>();
  for (const variable of variables) {
    const keys = Object.keys(variable.roles);
    if (keys.some((key) => key.startsWith("adjust:"))) adjusters.add(variable.name);
  }
  const unheld = [...adjusters].flatMap((name) =>
    rawOf(name).filter((raw) => !captured.has(raw)),
  );
  results.push(
    unheld.length === 0
      ? ok("C7-3", "Every adjustment covariate and every stratifier used in an adjusted table has a field.")
      : {
          id: "C7-3",
          pass: false,
          failing: [...new Set(unheld)],
          message: `${[...new Set(unheld)].join(", ")} is held constant by a model and collected by nothing. The model cannot be fitted as written.`,
        },
  );

  /* C7-4 nothing derived. */
  const computed = fields.filter((field) => {
    const variable = byName.get(field.source_variable as VariableName);
    return variable !== undefined && !variable.crf;
  });
  results.push(
    computed.length === 0
      ? ok("C7-4", "No derived value is captured as a field; its raw inputs are.")
      : {
          id: "C7-4",
          pass: false,
          failing: computed.map((field) => field.source_variable),
          message: `${computed.map((f) => f.label).join(", ")} is calculated at analysis and asked for on the form. Somebody would compute it at the bedside, and the two numbers would disagree.`,
        },
  );

  return results;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
