import fs from "node:fs";
import path from "node:path";
import { parseTable, type Row } from "../analysis/decision-tables.ts";
import type {
  CrfField,
  CrfSection,
  CrfTrace,
  FactsSheet,
  Timepoint,
} from "../study/types.ts";
import { STUDY } from "../variables/build.ts";
import { indexTestsOf, isDiagnostic, referenceOf } from "../study/diagnostic.ts";
import { fieldTypeOf } from "./response.ts";
import type { FieldList, FieldNeed } from "./fields.ts";

/**
 * Steps C7 and C11: the fields grouped into sections, and numbered.
 *
 * Two rules do all of it. A field is placed by what it is for and when it is
 * collected, and a field collected at more than one visit is written once in
 * each: the form follows the data, so a haemoglobin read four times is four
 * fields on four sub-sections and not one field with four boxes.
 *
 * Numbering restarts at 1 in every section, which check CRF-1 insists on. It is
 * the first thing a reader uses to find their place, and a form numbered
 * straight through cannot be reordered without renumbering all of it.
 */

const DIR = path.join(process.cwd(), "src", "lib", "crf");
let sectionRows: Row[] | null = null;

export function sectionTable(): Row[] {
  if (!sectionRows) {
    sectionRows = parseTable(fs.readFileSync(path.join(DIR, "sections.md"), "utf8"));
  }
  return sectionRows;
}

export type Grouped = {
  sections: CrfSection[];
  fields: CrfField[];
  /** Why each field is there, keyed `<section>:<sno>`. Gate C reads it. */
  traces: Record<string, CrfTrace[]>;
  todos: string[];
};

/** The class a field's section is chosen by. */
type Klass =
  | "identifiers"
  | "group"
  | "block"
  | "covariate"
  | "exposure"
  | "index_test"
  | "reference"
  | "outcome"
  | "visit";

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * What a field is for.
 *
 * Read off the roles the variable list already carries and the facts the
 * reading already recorded, in the order the more specific wins. Nothing is
 * decided from a label: the one build that did read labels put a hospital
 * number in the demographics and a reference standard in the index test.
 */
function classOf(
  facts: FactsSheet,
  need: FieldNeed,
  index: Set<string>,
  reference: string | null,
  exposures: Set<string>,
): Klass {
  if (need.source === "infrastructure") return "identifiers";
  const variable = need.variable;
  if (!variable) return "outcome";
  if (variable.name === "arm") return "group";
  if (reference && variable.name === reference) return "reference";
  if (index.has(variable.name)) return "index_test";

  // A measure the dictionary puts in a block is collected with that block,
  // whatever else it also does. Haemoglobin is the primary outcome and a
  // baseline laboratory value, and asking for it in a section of its own left
  // "Baseline haematological profile" holding one field while the value that
  // belongs beside it sat under "Outcome assessment". The block is where the
  // person with the pen will look for it.
  const measure = facts.measures.find((m) => m.name === variable.name);
  if (measure?.block) return "block";

  // A factor under study is one an objective estimates, which the outcome
  // chains now say outright. A role of "exposure" alone is not enough: an
  // exploratory subgroup gives dietary pattern that role, and a dietary pattern
  // asked about in one exploratory question is not what the study is of.
  if (exposures.has(variable.name) && !isDiagnostic(facts)) return "exposure";

  const roles = Object.values(variable.roles);
  if (roles.includes("outcome")) return "outcome";
  if (Object.keys(variable.roles).some((key) => key.startsWith("adjust:"))) {
    return "covariate";
  }
  if (variable.roles[STUDY] === "population_definition") return "outcome";
  return "block";
}

/** The heading a block class takes: the dictionary's own words. */
function blockTitle(facts: FactsSheet, need: FieldNeed): string {
  const measure = facts.measures.find((m) => m.name === need.source);
  return measure?.block ? capitalise(measure.block) : "Other measurements";
}

export function buildSections(facts: FactsSheet, list: FieldList): Grouped {
  const table = sectionTable();
  const rowFor = (key: string) => table.find((row) => row.Key === key);
  const first = facts.timepoints[0] ?? "";
  const labelOf = (code: Timepoint) =>
    facts.visit_schedule.find((visit) => visit.timepoint === code)?.label ?? code;

  const reference = isDiagnostic(facts) ? referenceOf(facts, facts.primary) : null;
  const index = new Set<string>(
    isDiagnostic(facts)
      ? [facts.primary, ...facts.secondary].flatMap((chain) => indexTestsOf(facts, chain))
      : [],
  );

  /* ---- one bucket per section the study turns out to have ----------- */
  type Bucket = {
    title: string;
    order: number;
    /** Set for a follow-up sub-section. */
    timepoint: Timepoint | null;
    needs: { need: FieldNeed; at: Timepoint | null }[];
  };
  const buckets = new Map<string, Bucket>();

  const into = (key: string, title: string, order: number, timepoint: Timepoint | null) => {
    const bucket = buckets.get(key) ?? { title, order, timepoint, needs: [] };
    buckets.set(key, bucket);
    return bucket;
  };

  const exposures = new Set(
    [facts.primary, ...facts.secondary].flatMap((chain) =>
      chain.exposures.map((exposure) => exposure.measure),
    ),
  );

  for (const need of list.needs) {
    const klass = classOf(facts, need, index, reference, exposures);
    const row = rowFor(klass);
    const order = Number(row?.Order ?? "80");
    const title = klass === "block" ? blockTitle(facts, need) : (row?.Section ?? "Other");

    // Where it is collected decides how often it is written. A field taken at
    // the first visit is written once; one taken at a follow-up visit is
    // written in that visit's sub-section, and in every visit that takes it.
    const follow = need.timepoints.filter((time) => time !== first);
    const once = need.timepoints.length === 0 || need.timepoints.includes(first);

    if (once) into(`${klass}:${title}`, title, order, null).needs.push({ need, at: first || null });
    for (const time of follow) {
      const visit = rowFor("visit");
      into(`visit:${time}`, `${visit?.Section ?? "Follow-up visit"}: ${labelOf(time)}`,
        Number(visit?.Order ?? "90"), time).needs.push({ need, at: time });
    }
  }

  /* ---- the order they are printed in, and their letters ------------- */
  const order = [...buckets.entries()].sort((a, b) => {
    if (a[1].order !== b[1].order) return a[1].order - b[1].order;
    const times = facts.timepoints;
    return times.indexOf(a[1].timepoint ?? "") - times.indexOf(b[1].timepoint ?? "");
  });

  const sections: CrfSection[] = [];
  const fields: CrfField[] = [];
  const traces: Grouped["traces"] = {};
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let letter = 0;
  let visitLetter: string | null = null;
  let visitNumber = 0;

  for (const [, bucket] of order) {
    if (!bucket.needs.length) continue;

    // Every follow-up visit is a sub-section of one section, so they share a
    // letter and take a number: G1, G2, G3.
    let code: string;
    if (bucket.timepoint) {
      if (!visitLetter) visitLetter = letters[letter++] ?? "Z";
      visitNumber += 1;
      code = `${visitLetter}${visitNumber}`;
    } else {
      code = letters[letter++] ?? "Z";
    }

    sections.push({ code, title: bucket.title });

    bucket.needs.forEach(({ need, at }, i) => {
      const variable = need.variable;
      const type = fieldTypeOf(variable, need.type);
      const field: CrfField = {
        section: code,
        // C11: restarts at 1 in every section and every sub-section.
        sno: i + 1,
        label: need.label ?? variable?.label ?? String(need.source),
        type,
        unit: variable?.unit ?? null,
        options: need.options ?? variable?.options ?? null,
        source_variable: need.source,
        timepoint: at,
        // Nothing in the Facts Sheet says a field applies to one group only,
        // so nothing here claims one does.
        condition: null,
      };
      fields.push(field);
      traces[`${code}:${field.sno}`] = need.traces;
    });
  }

  return { sections, fields, traces, todos: list.todos };
}
