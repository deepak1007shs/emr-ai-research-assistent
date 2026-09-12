import type {
  AnalysisRow,
  CrfTrace,
  FactsSheet,
  Rules,
  ShellTable,
  Timepoint,
  Variable,
  VariableName,
} from "../study/types.ts";
import { chainOfObjective } from "../objectives/build.ts";
import { STUDY } from "../variables/build.ts";

/**
 * Steps C1 to C6: which fields the form carries, and why each one is on it.
 *
 * The form is built from the shell tables, never from the protocol's own
 * proforma. That is the whole point of Step 8, and the written process shows
 * what the shortcut costs: a form drafted from the proforma of the worked
 * example had no visit dates, no tablet counts and no dietary pattern, and
 * carried five items - education, husband's occupation, blood group, blood
 * pressure, stool for ova and cysts - that no table uses. Both halves are
 * invisible in a finished form, which is why they are arithmetic here.
 *
 * Nothing in this file writes a label or chooses a section. It answers one
 * question per variable: is it captured, at which visits, and for which table.
 * C7 to C12 turn that into a document.
 *
 * The five rules, in the order the process gives them:
 *
 * | Step | What it does |
 * |---|---|
 * | C1 | every variable any Section 6 table uses, with the visits it needs |
 * | C2 | raw or derived, read off `Variable.crf` |
 * | C3 | each derived value replaced by its raw parts, at the parts' visits |
 * | C4 | every adjustment covariate and every stratifier |
 * | C5 | capture infrastructure: the five kinds rule 5 names, and no others |
 * | C6 | anything that traces to none of the above is not a field |
 */

/** One field, before C7 gives it a section and C11 a number. */
export type FieldNeed = {
  /** The variable captured, or "infrastructure" for a field that analyses nothing. */
  source: VariableName | "infrastructure";
  /** Set for an infrastructure field, which has no variable to take a label from. */
  label: string | null;
  variable: Variable | null;
  /** Every visit this field is written at, in the schedule's order. */
  timepoints: Timepoint[];
  /** What the tables need it at. A subset of `timepoints` where all is well. */
  needed: Timepoint[];
  traces: CrfTrace[];
  /**
   * The answers, for an infrastructure field that has a fixed list of them.
   * A field with a variable takes its options from the variable instead.
   */
  options: string[] | null;
};

export type FieldList = {
  needs: FieldNeed[];
  /** Variables no table uses. C6 drops them; they are listed as evidence. */
  dropped: VariableName[];
  todos: string[];
};

export type FieldInput = {
  facts: FactsSheet;
  variables: Variable[];
  tables: ShellTable[];
  analysis: AnalysisRow[];
  rules: Rules;
};

/* ---- infrastructure, rule 5 ------------------------------------------ */

/**
 * The five kinds of identifier the skill allows, and nothing else.
 *
 * "Administrative identifiers (Name, Study ID, dates, form-completed-by, reader
 * ID) are allowed even though they are not analysis variables - they are
 * capture infrastructure." Everything outside that list has to trace to a table
 * like any other field, so a consent date, a randomisation number and a
 * sign-off block are not added here: no table uses them, and the skill does not
 * name them. The house form carries them, and that is a house decision.
 *
 * A reader ID is added only where readers score fields. The Facts Sheet records
 * no such thing, so no study reaches that branch yet; when one does, it will be
 * because the reading says so and not because a label looked like a reader.
 */
const STUDY_ID = "Subject study ID";
const COMPLETED_BY = "Form completed by";
const COMPLETION = "Study completion status";
const COMPLETION_OPTIONS = ["Completed", "Withdrew", "Lost to follow-up"];

const enrolmentLabel = (label: string) => `Date of enrolment (${label.toLowerCase()})`;
const VISIT_DATE = "Date of visit";

/* ---- the field list --------------------------------------------------- */

export function buildFieldList(input: FieldInput): FieldList {
  const { facts, variables, tables, analysis, rules } = input;
  const byName = new Map(variables.map((v) => [v.name, v]));
  const order = (times: Iterable<Timepoint>) => {
    const wanted = new Set(times);
    return facts.timepoints.filter((t) => wanted.has(t));
  };

  const found = new Map<VariableName, { traces: CrfTrace[]; needed: Set<Timepoint> }>();

  const record = (name: VariableName, trace: CrfTrace, times: Timepoint[]) => {
    const entry = found.get(name) ?? { traces: [], needed: new Set<Timepoint>() };
    // What a table needs is what it reports and the study records, which is not
    // the same as the span of its outcome chain. The arm is a column group of a
    // table covering four visits and is written down once, at randomisation;
    // asked for at all four it became a field the study never fills and a
    // Gate C failure against a form that was right.
    const measured = byName.get(name)?.timepoints ?? [];
    const at = times.filter((time) => measured.includes(time));
    const wanted = at.length ? at : measured.slice(0, 1);
    // The same variable reaches the same table by more than one route - a row
    // label and a column group, a covariate of two models - and the form is not
    // interested in the second one.
    const already = entry.traces.some((t) => JSON.stringify(t) === JSON.stringify(trace));
    if (!already) entry.traces.push(trace);
    for (const time of wanted) entry.needed.add(time);
    found.set(name, entry);
  };

  /**
   * C2 and C3 in one walk: a derived value is not a field, its raw parts are.
   *
   * The recursion matters. A ratio of two changes is derived from two derived
   * values, and stopping at the first level would put a change from baseline on
   * the form. `Variable.crf` is already false for every derived variable, so
   * this asks the variable list rather than a list of words like "change" and
   * "ratio".
   */
  const capture = (
    name: VariableName,
    trace: CrfTrace,
    times: Timepoint[],
    seen: Set<VariableName> = new Set(),
  ) => {
    const variable = byName.get(name);
    // A name the dictionary does not define is Gate A's business, not the
    // form's. It cannot become a field: nothing knows its type or its unit.
    if (!variable || seen.has(name)) return;

    if (!variable.crf) {
      for (const part of variable.derived_from) {
        // At the part's own visits, not the result's. A change from day 0 to
        // week 6 is one number at week 6, and capturing it there would ask for
        // the baseline reading at the final visit.
        const at = byName.get(part)?.timepoints ?? [];
        capture(
          part,
          "table" in trace ? { ...trace, via: name } : trace,
          at.length ? at : times,
          new Set([...seen, name]),
        );
      }
      return;
    }

    record(name, trace, times);
  };

  /* ---- C1: everything the tables use -------------------------------- */
  for (const table of tables) {
    // A fit table reports diagnostics of a model, not data anybody collects.
    if (table.fit_table_of) continue;

    const times = tableTimes(facts, table);
    const used = new Set<VariableName>([
      ...table.variables,
      ...table.rows.map((row) => row.variable).filter((v): v is VariableName => Boolean(v)),
    ]);
    for (const name of used) capture(name, { table: table.number }, times);
  }

  /* ---- C4: covariates and stratifiers -------------------------------- */
  // Read from the Analysis Map and not from the table, because an adjusted
  // model's covariates are a property of the row: the plan holds baseline
  // haemoglobin in the haemoglobin model and baseline ferritin in the ferritin
  // one, and a table that prints "adjusted" names neither.
  for (const row of analysis) {
    const table = row.adjusted?.table || row.unadjusted?.table || "";
    if (!table) continue;
    for (const covariate of row.adjusted?.covariates ?? []) {
      const at = covariate.at
        ? [covariate.at]
        : (byName.get(covariate.var)?.timepoints.slice(0, 1) ?? []);
      capture(covariate.var, { table, as: "covariate", at: covariate.at }, at);
    }
    for (const predictor of row.predictors) {
      const at = byName.get(predictor)?.timepoints.slice(0, 1) ?? [];
      capture(predictor, { table, as: "stratifier", at: at[0] ?? null }, at);
    }
  }

  /* ---- C1.5: what defines a row without being printed in one --------- */
  // The sensitivity table's rows are sentences: "the per-protocol set in place
  // of the intention-to-treat set" needs whatever defines adherence, and no row
  // label names it. Read from the roles, never by searching those sentences for
  // variable names - the row that says "with the influential observations
  // removed" would match nothing however hard it were read.
  const sensitivity = tables.find((t) => t.kind === "sensitivity");
  if (sensitivity) {
    for (const variable of variables) {
      if (variable.roles[STUDY] !== "population_definition") continue;
      capture(variable.name, { table: sensitivity.number }, variable.timepoints);
    }
  }

  /* ---- C5: capture infrastructure ------------------------------------ */
  const infrastructure: FieldNeed[] = [];
  const infra = (label: string, timepoints: Timepoint[], traces: CrfTrace[] = []) => {
    infrastructure.push({
      source: "infrastructure",
      label,
      variable: null,
      timepoints,
      needed: [],
      traces: traces.length ? traces : [{ infrastructure: true }],
      options: null,
    });
  };

  const first = facts.timepoints[0];
  const firstVisit = facts.visit_schedule.find((v) => v.timepoint === first);
  const later = facts.visit_schedule.filter((v) => v.timepoint !== first);

  infra(STUDY_ID, first ? [first] : []);

  // The dates the study needs. A model of the rate of change is fitted on the
  // time of each reading, and no protocol records that as a measure: the
  // process's own worked check fails its first draft for exactly this and adds
  // a visit date to every follow-up sub-section. Where such a model exists the
  // dates carry its table number, so Gate C can see what they are for.
  const timed = tables.filter((t) => t.kind === "rate_of_change");
  const forTime: CrfTrace[] = timed.map((t) => ({ table: t.number }));
  if (firstVisit) infra(enrolmentLabel(firstVisit.label), [firstVisit.timepoint], forTime);
  for (const visit of later) {
    infra(VISIT_DATE, [visit.timepoint], forTime);
  }

  infra(COMPLETED_BY, first ? [first] : []);

  // Who finished the study and who did not. It is on the form for the same
  // reason the visit dates are: the plan's primary block opens with an analysis
  // population line and a flow from screened to analysed, and neither can be
  // filled from a form that never asks. The process document's own worked form
  // carries it at the last visit for that reason and marks it inferred.
  const last = facts.timepoints[facts.timepoints.length - 1];
  if (last && last !== first && rules.population_line.trim()) {
    infrastructure.push({
      source: "infrastructure",
      label: COMPLETION,
      variable: null,
      timepoints: [last],
      needed: [],
      traces: [{ infrastructure: true }],
      options: [...COMPLETION_OPTIONS],
    });
  }

  /* ---- C6: the list, and what it leaves out --------------------------- */
  const needs: FieldNeed[] = [];
  for (const variable of variables) {
    const entry = found.get(variable.name);
    if (!entry) continue;
    const needed = order(entry.needed);
    // Captured wherever the study records it. A variable whose visits the
    // schedule does not give is captured where the tables ask for it instead,
    // which is the only thing left to go on.
    const timepoints = variable.timepoints.length ? variable.timepoints : needed;
    needs.push({
      source: variable.name,
      label: null,
      variable,
      timepoints: order(timepoints),
      needed,
      traces: entry.traces,
      options: null,
    });
  }

  const dropped = variables
    .filter((v) => v.crf && !found.has(v.name) && v.roles[STUDY] !== "administrative")
    .map((v) => v.name);

  // An identifier the protocol records and the skill does not name. It is not
  // dropped silently: rule 5 allows five kinds, this is a sixth, and whether a
  // hospital number belongs on the form is a decision for the investigator.
  const todos: string[] = [];
  const identifiers = variables.filter((v) => v.roles[STUDY] === "administrative");
  for (const variable of identifiers) {
    infra(variable.label, variable.timepoints, [{ infrastructure: true }]);
  }
  if (identifiers.length) {
    todos.push(
      `The form carries ${identifiers
        .map((v) => v.label.toLowerCase())
        .join(", ")} as capture infrastructure, beside the subject study ID. Confirm each is wanted, or drop it: it identifies a record and answers no analysis.`,
    );
  }

  return { needs: [...infrastructure, ...needs], dropped, todos };
}

/**
 * The visits a table reports at.
 *
 * Read from the outcome chain of the objectives the table fills, which is where
 * the time points live, and not from the table's own rows: a summary table
 * prints "at Day 0" and "at Week 6" in its row labels, and a check that read
 * those words would find nothing in a table whose rows are "Slope, FCM".
 *
 * A descriptive table has no objective and is baseline by construction. An
 * exploratory table has an objective with no chain of its own, and falls back
 * to wherever the variable is measured.
 */
function tableTimes(facts: FactsSheet, table: ShellTable): Timepoint[] {
  if (!table.fills.length) return facts.timepoints.slice(0, 1);
  const times = new Set<Timepoint>();
  for (const id of table.fills) {
    for (const time of chainOfObjective(facts, id)?.time ?? []) times.add(time);
  }
  return facts.timepoints.filter((time) => times.has(time));
}
