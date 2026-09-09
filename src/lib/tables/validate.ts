import type { ShellTable, ShellTablesSpec } from "./types.ts";
import { adjustedIds } from "./types.ts";
import { hasContrast, isToken, planOf, unbuildableRoles } from "./blocks.ts";
import { designRule } from "./design-tables.ts";
import type { SapRegistry } from "../sap/types.ts";
import { outcomeIndex, variableIndex } from "../sap/types.ts";
import type { Finding } from "../sap/validate.ts";

/**
 * Checks the shell tables against the analysis plan they report.
 *
 * The plan already says which analysis each table reports. These guards make
 * that a fact rather than an intention: an analysis with no table would never
 * be reported, and a table no analysis fills would never be filled.
 *
 * They also hold the line the rule table draws. A plan that chose a risk ratio
 * because the outcome is common, whose table then prints an odds ratio, has
 * quietly undone the one decision the plan existed to make.
 */

const CI = /95%\s*ci/i;
/**
 * A column that names an effect estimate.
 *
 * The acronyms are matched case-sensitively and the words are not, because "or"
 * is an English word and "OR" is an odds ratio. Written as one case-insensitive
 * alternation, this called every column containing "or" an effect estimate -
 * harmless while the only columns were "Measure" and "Estimate", and not
 * harmless now that a group name is a column of a table carrying estimates.
 */
const EFFECT_ACRONYM = /\b(OR|RR|HR|NNT|NNH)\b/;
const EFFECT_WORD =
  /\b(odds ratio|risk ratio|hazard ratio|rate ratio|risk difference|mean difference|difference|number needed)\b/i;
const isEffect = (text: string) => EFFECT_ACRONYM.test(text) || EFFECT_WORD.test(text);
const P_VALUE = /p[- ]?value/i;
const INTERACTION = /interaction\s*p/i;

/**
 * The estimate families a table can name.
 *
 * Used to compare what a table prints against what the plan chose. Comparing
 * whole strings would not work: the plan says "Risk ratio" and a column says
 * "Crude: risk ratio (95% CI)".
 */
const ESTIMATES: ReadonlyArray<readonly [string, RegExp[]]> = [
  // The written-out name is matched whatever its case, because a plan writes
  // "Odds ratio" and a column writes "crude odds ratio". The abbreviation is
  // matched case sensitively, because "or" is also an English word.
  ["odds ratio", [/\bodds ratios?\b/i, /\bORs?\b/]],
  ["risk ratio", [/\brisk ratios?\b/i, /\bRRs?\b/]],
  ["hazard ratio", [/\bhazard ratios?\b/i, /\bHRs?\b/]],
  ["rate ratio", [/\brate ratios?\b/i]],
  ["risk difference", [/\brisk differences?\b/i]],
  ["mean difference", [/\bmean differences?\b/i]],
  ["median difference", [/\bmedian differences?\b/i]],
  ["number needed to treat", [/\bnumber needed to treat\b/i, /\bNNTs?\b/]],
];

function families(texts: string[]): Set<string> {
  const found = new Set<string>();
  for (const text of texts) {
    for (const [name, patterns] of ESTIMATES) {
      if (patterns.some((pattern) => pattern.test(text))) found.add(name);
    }
  }
  return found;
}

/**
 * A table that carries an effect estimate.
 *
 * `outcome` is here because it carries the estimates as its right-hand columns,
 * beside the counts they were computed from. It used to be two tables and only
 * the second was checked.
 */
const EFFECT_ROLES = new Set([
  "outcome",
  "predictors",
  "effect_unadjusted",
  "effect_adjusted",
  "subgroup",
  "sensitivity",
]);
/** A table that reports a comparison, and must therefore name its test. */
const TESTED_ROLES = new Set([...EFFECT_ROLES, "summary", "accuracy"]);

export function validateTables(
  spec: ShellTablesSpec,
  sap?: SapRegistry,
): { ok: boolean; findings: Finding[] } {
  const out: Finding[] = [];
  const error = (code: string, message: string) => out.push({ code, severity: "ERROR", message });
  const warn = (code: string, message: string) => out.push({ code, severity: "WARN", message });

  const tables = [...(spec.tables ?? [])].sort((a, b) => a.number - b.number);

  if (!tables.length) {
    error("TBL00", "There are no tables.");
    return { ok: false, findings: out };
  }

  /* ---- numbering and block order ----------------------------------- */

  tables.forEach((t, i) => {
    if (t.number !== i + 1) {
      error("TBL01", `Table ${t.number} is in position ${i + 1}. Number them contiguously from 1.`);
    }
  });

  const order = ["descriptive", "primary", "secondary", "exploratory"];
  let seen = -1;
  for (const t of tables) {
    const rank = order.indexOf(t.block);
    if (rank < seen) {
      error(
        "TBL02",
        `Table ${t.number} is ${t.block}, but a later block has already begun. Order them descriptive, primary, secondary, exploratory.`,
      );
      break;
    }
    seen = Math.max(seen, rank);
  }

  if (!tables.some((t) => t.block === "descriptive")) {
    error("TBL03", "There is no baseline table. Every study reports who was in it before reporting what happened to them.");
  }
  if (!tables.some((t) => t.block === "primary")) {
    error("TBL04", "There is no table for the primary outcome.");
  }

  /* ---- each table -------------------------------------------------- */

  for (const t of tables) {
    if (t.columns.length < 2) {
      error("TBL05", `Table ${t.number} has fewer than two columns.`);
    }
    if (!t.rows.length) {
      error("TBL06", `Table ${t.number} has no rows.`);
    }
    if (t.rows.length && t.rows.every((r) => r.heading)) {
      error("TBL07", `Table ${t.number} has only headings and no rows to fill.`);
    }
    if (!/\(n\s*=/.test(t.title)) {
      warn("TBL08", `Table ${t.number} does not carry its denominator. A table without "(n = ...)" cannot be read alone.`);
    }

    if (TESTED_ROLES.has(t.role) && !t.test_applied) {
      error("TBL09", `Table ${t.number} reports a comparison but does not name the test applied.`);
    }
    if (t.role === "descriptive" && !t.test_applied && P_VALUE.test(t.columns.join(" "))) {
      warn("TBL10", `Table ${t.number} has a p-value column but names no test.`);
    }

    for (const column of t.columns) {
      if (/^model\s*\d/i.test(column.trim())) {
        error(
          "TBL11",
          `Table ${t.number} has a column called "${column}". A model column says what it holds constant, not what number it is.`,
        );
      }
      if (isEffect(column) && !CI.test(column) && !P_VALUE.test(column)) {
        error(
          "TBL12",
          `Table ${t.number} reports "${column}" without a 95% CI. An effect size without an interval says nothing about precision.`,
        );
      }
    }

    // A table whose rows are estimates needs the interval somewhere, and on
    // that shape of table the interval is a column.
    if (t.rows.some((r) => r.kind === "measure") && !t.columns.some((c) => CI.test(c))) {
      error(
        "TBL12",
        `Table ${t.number} reports estimates as rows but has no 95% CI column. An effect size without an interval says nothing about precision.`,
      );
    }

    if (t.role === "effect_adjusted") {
      const models = t.models ?? [];
      if (!models.length) {
        error(
          "TBL11",
          `Table ${t.number} reports an adjusted effect but names no models, so a reader cannot tell what each column holds constant.`,
        );
      }
      models.forEach((m) => {
        if (!m.adds.length) {
          error(
            "TBL11",
            `Table ${t.number} has a model called "${m.name}" that holds nothing constant, so it is not an adjusted estimate.`,
          );
        }
      });
    }

    if (t.role === "effect_adjusted") {
      // Either an unadjusted column on the same row, or an unadjusted table
      // reporting the same objective. Both let a reader see what the
      // adjustment did; neither being present does not.
      const joined = t.columns.join(" ").toLowerCase();
      const beside =
        joined.includes("unadjusted") ||
        tables.some(
          (o) =>
            (o.role === "outcome" || o.role === "predictors" || o.role === "effect_unadjusted") &&
            (o.fills ?? []).some((id) => (t.fills ?? []).includes(id)),
        );
      if (!beside) {
        error(
          "TBL13",
          `Table ${t.number} reports an adjusted effect with no unadjusted table beside it. A reader cannot see what the adjustment did.`,
        );
      }
    }

    if (t.role === "subgroup" && !t.columns.some((c) => INTERACTION.test(c))) {
      error(
        "TBL22",
        `Table ${t.number} reports subgroups but has no interaction p column. Effect modification is read from an interaction term, never from the p value within each subgroup.`,
      );
    }
  }

  /* ---- against the analysis plan ------------------------------------ */

  if (sap) {
    const byVariable = variableIndex(sap);
    const byOutcome = outcomeIndex(sap);
    const nameOf = (id: string) =>
      byVariable.get(id)?.label ?? byOutcome.get(id)?.what ?? spec.labels?.[id] ?? id;

    // The tables document owns the numbering, and says which analyses each of
    // its tables answers. The plan's own table_id was assigned before anyone
    // knew how many baseline tables the study needed, so it is not checked
    // against a number: it is checked against this.
    // An objective is often answered by several analysis rows, one per outcome:
    // three binary secondary outcomes under S2, an ordinal one under S3. A map
    // from objective to a single analysis silently kept the last of them, and
    // then judged every table against the wrong row.
    type Analysis = NonNullable<SapRegistry["analyses"]>[number];
    const analysesOf = new Map<string, Analysis[]>();
    for (const a of sap.analyses ?? []) {
      for (const id of a.objective_ids ?? []) {
        analysesOf.set(id, [...(analysesOf.get(id) ?? []), a]);
      }
    }

    /** The analyses a table reports: its objectives, narrowed by its outcome. */
    const analysesFor = (t: ShellTable): Analysis[] => {
      const claimed = (t.fills ?? []).flatMap((id) => analysesOf.get(id) ?? []);
      if (!t.outcome_id) return claimed;
      const matching = claimed.filter((a) => (a.outcome_ids ?? []).includes(t.outcome_id!));
      // Nothing matching is itself a finding, reported by TBL16 below.
      return matching.length ? matching : claimed;
    };

    // An objective is reported by a block of tables, not by one: the incidence,
    // the crude effect, the adjusted model, the subgroups, the sensitivity
    // analyses. What must not repeat is the job, not the objective.
    const byRole = new Map<string, ShellTable>();
    const reported = new Set<string>();
    for (const t of tables) {
      for (const objectiveId of t.fills ?? []) {
        reported.add(objectiveId);
        // Two tables may do the same job under one objective when they report
        // different outcomes, which is how three secondary outcomes answered
        // the same way are printed.
        const key = `${objectiveId}:${t.role}:${t.job ?? ""}:${t.outcome_id ?? t.title}`;
        const already = byRole.get(key);
        if (already) {
          error(
            "TBL19",
            `${objectiveId} reports ${
              t.outcome_id ? `"${nameOf(t.outcome_id)}"` : "the same thing"
            } twice the same way, in Table ${already.number} and Table ${t.number}. Two tables under one objective must either report different outcomes or do different jobs, so either the plan has the same analysis twice or one of these tables is redundant.`,
          );
        } else {
          byRole.set(key, t);
        }
      }
    }

    for (const analysis of sap.analyses ?? []) {
      for (const objectiveId of analysis.objective_ids ?? []) {
        if (!reported.has(objectiveId)) {
          error(
            "TBL14",
            `No table reports ${objectiveId}, so that analysis would never be reported.`,
          );
        }
      }
    }

    for (const t of tables) {
      const filled = analysesFor(t);
      if (t.block !== "descriptive" && !filled.length) {
        warn(
          "TBL15",
          `Table ${t.number} reports no analysis in the plan. Either an analysis is missing, or the table is.`,
        );
      }

      // Every row that claims a variable must claim one the plan declared.
      for (const row of t.rows) {
        if (row.variable_id && !byVariable.has(row.variable_id)) {
          error(
            "REF08",
            `Table ${t.number} has a row for ${row.variable_id}, which the analysis plan does not declare.`,
          );
        }
      }

      if (t.outcome_id && !byOutcome.has(t.outcome_id)) {
        error(
          "REF09",
          `Table ${t.number} reports ${t.outcome_id}, which is not an outcome in the analysis plan.`,
        );
      }

      // The table and the analyses it reports must be about the same outcome.
      if (t.outcome_id) {
        for (const a of filled) {
          if (!(a.outcome_ids ?? []).includes(t.outcome_id)) {
            error(
              "TBL16",
              `Table ${t.number} reports "${nameOf(t.outcome_id!)}", but ${(a.objective_ids ?? []).join(", ")}, which it says it fills, measures "${(a.outcome_ids ?? []).map(nameOf).join(", ")}".`,
            );
          }
        }
      }

      // The estimate a table prints is the plan's decision, already made. A
      // table that names another one has undone it: an odds ratio on a common
      // outcome is not a risk ratio, and overstates the effect.
      if (EFFECT_ROLES.has(t.role)) {
        const planned = filled.flatMap((a) => planOf(a).measures);
        if (planned.length) {
          const allowed = families(planned);
          const named = families([
            ...t.columns,
            ...t.rows.filter((r) => r.kind === "measure").map((r) => r.label),
          ]);
          const stray = [...named].filter((f) => !allowed.has(f));
          if (stray.length) {
            const why = filled.map((a) => planOf(a).avoid).find(Boolean);
            error(
              "TBL20",
              `Table ${t.number} reports ${stray.join(" and ")}, which is not what the plan chose for this outcome (${planned.join("; ")}).${why ? ` The plan rules it out: ${why}.` : ""}`,
            );
          }
        }
      }

      // The whole point of merging three tables into one was that a reader
      // sees the counts and the estimate computed from them side by side. A
      // merged table missing either half has undone the merge without saying
      // so, and reads like a complete table.
      // A table whose job is "overall" reports one group and compares nothing,
      // so there is no estimate for it to be missing. Without this it was
      // judged against a contrast analysis of the same outcome that a different
      // table reports.
      if (t.role === "outcome" && !t.job?.startsWith("overall")) {
        const comparisons = filled.filter((a) => hasContrast(a) && planOf(a).measures.length);
        if (comparisons.length) {
          // An estimate may be a column, in the grouped layout, or a row, where
          // there are no groups to put across the top: a correlation, an
          // agreement, a post-hoc across many groups. Reading only the columns
          // reported those tables as carrying no estimate at all.
          const inColumns = families(t.columns);
          const inRows = families(
            t.rows.filter((r) => r.kind === "measure").map((r) => r.label),
          );
          if (!inColumns.size && !inRows.size) {
            error(
              "TBL29",
              `Table ${t.number} reports ${nameOf(t.outcome_id ?? "") || "an outcome"} but none of the estimates the plan chose (${comparisons.flatMap((a) => planOf(a).measures).join("; ")}). The counts and the effect computed from them belong in the same table.`,
            );
          }
          // Only where the estimates are columns: that is the grouped layout,
          // and the groups are what the estimate was computed from.
          if (inColumns.size) {
            const counts = t.columns
              .slice(1)
              .filter((c) => !isEffect(c) && !CI.test(c) && !P_VALUE.test(c));
            if (!counts.length) {
              error(
                "TBL29",
                `Table ${t.number} reports estimates but has no column holding the counts they were computed from. A reader cannot check a risk ratio against nothing.`,
              );
            }
          }
        }
      }

      // A plan that marks an outcome skewed and then reports a mean has
      // disagreed with itself, and the table is where it shows: the cell says
      // median and the line under it says mean difference. Naveen's length of
      // stay is marked skewed and carries a mean difference.
      for (const a of filled) {
        if (!a.skewed) continue;
        const parametric = [...planOf(a).measures, planOf(a).test ?? ""].join(" ");
        if (/\bmean (difference|\(SD\))/i.test(parametric)) {
          warn(
            "TBL30",
            `Table ${t.number} reports ${nameOf(t.outcome_id ?? "") || "an outcome"}, which the plan marks as skewed, and the plan names a mean for it (${planOf(a).measures.join("; ")}). A skewed distribution is described by a median and an interquartile range, and compared by a rank method.`,
          );
        }
      }

      // A machine token is not the name of an estimate. One plan named
      // "descriptive_cross_tabulation_only" as its measure, meaning it had none
      // to report; printed as a column it read "Crude
      // descriptive_cross_tabulation_only (95% CI)". It is dropped before it
      // reaches the page, and said here so the plan is fixed rather than the
      // symptom hidden.
      for (const a of filled) {
        for (const measure of a.measures ?? []) {
          if (!isToken(measure)) continue;
          warn(
            "TBL31",
            `The plan names "${measure}" as an estimate for ${nameOf(t.outcome_id ?? "") || "this outcome"}, which is a code rather than the name of one. Table ${t.number} reports the outcome without it. Give the estimate its name, or say the analysis reports no estimate.`,
          );
        }
      }

      // A ratio with no absolute measure beside it.
      //
      // The rule this application reproduces gives the absolute measure
      // alongside any ratio, and the reason is arithmetic rather than style:
      // an odds ratio of 2.4 on an outcome that happens to 2% of people is a
      // risk difference of about three in a hundred, and only one of those two
      // numbers tells a reader what the study found. Quoted alone, a ratio
      // reads as the size of an effect it is not.
      //
      // A warning, because a ratio-only table is occasionally right - an
      // estimation objective with no comparison group to difference against -
      // and only the investigator knows when.
      const RATIOS = ["odds ratio", "risk ratio", "hazard ratio", "rate ratio"];
      const ABSOLUTE = ["risk difference", "mean difference", "median difference", "number needed to treat"];
      const said = families([
        ...t.columns,
        ...t.rows.filter((r) => r.kind === "measure").map((r) => r.label),
      ]);
      const ratio = RATIOS.filter((name) => said.has(name));
      if (ratio.length && !ABSOLUTE.some((name) => said.has(name))) {
        warn(
          "TBL32",
          `Table ${t.number} reports ${ratio.join(" and ")} with no absolute measure beside it. A ratio says how many times more likely, not how much more likely: give the risk or prevalence difference, or the number needed to treat, so a reader can see the size of the effect and not only its direction.`,
        );
      }

      // An adjusted column must hold constant what the plan said it would.
      const adjusted = adjustedIds(t);
      if (adjusted.length) {
        for (const id of adjusted) {
          const variable = byVariable.get(id);
          if (!variable) {
            error(
              "REF10",
              `Table ${t.number} adjusts for ${id}, which the analysis plan does not declare.`,
            );
            continue;
          }
          if (variable.role === "mediator" || variable.role === "collider") {
            error(
              "TBL17",
              `Table ${t.number} adjusts for "${variable.label}", which is a ${variable.role}. Adjusting for it removes part of the effect the study is trying to measure.`,
            );
          }
        }
        const plannedIds = new Set(
          filled.flatMap((a) => [...(a.exposure_ids ?? []), ...(a.adjust_for_ids ?? [])]),
        );
        const extra = filled.length ? adjusted.filter((id) => !plannedIds.has(id)) : [];
        if (extra.length) {
          warn(
            "TBL18",
            `Table ${t.number} adjusts for ${extra.map(nameOf).join(", ")}, which ${filled
              .flatMap((a) => a.objective_ids ?? [])
              .join(" or ")} does not list as a predictor. Either the plan or the table is out of date.`,
          );
        }
      }
    }

    /* ---- the primary outcome gets a block, not a table -------------- */

    const rolesFor = (objectiveId: string) =>
      new Set(
        tables.filter((t) => (t.fills ?? []).includes(objectiveId)).map((t) => t.role),
      );

    for (const objective of sap.objectives ?? []) {
      if (objective.tier !== "primary") continue;
      const [analysis] = analysesOf.get(objective.id) ?? [];
      if (!analysis) continue;
      const roles = rolesFor(objective.id);

      // What the design owes, so a cohort is not judged against a trial's
      // document and a diagnostic study is not judged against either.
      const owed = new Set(designRule(sap.design_family).roles);
      const wanted: [string, boolean, string][] = [
        [
          "outcome",
          !owed.has("outcome") ||
            roles.has("outcome") ||
            // The other way round: predictors down the side, the outcome's
            // groups across the top. It reports the same thing.
            roles.has("predictors") ||
            roles.has("repeated") ||
            // Documents built before the three tables were merged into one.
            roles.has("summary") ||
            roles.has("distribution"),
          "how many patients in each group had the outcome, with the denominators the effect is computed from, and the crude effect beside them",
        ],
        [
          "effect_adjusted",
          !owed.has("effect_adjusted") ||
            roles.has("effect_adjusted") ||
            !(analysis.adjust_for_ids ?? []).length ||
            Boolean(analysis.no_adjustment_reason),
          "the effect with the confounders the plan named held constant",
        ],
      ];

      for (const [role, satisfied, what] of wanted) {
        if (!satisfied) {
          error(
            "TBL21",
            `The primary outcome (${objective.id}) has no ${role.replace(/_/g, " ")} table, so the document never reports ${what}.`,
          );
        }
      }
    }

    /* ---- what the design owes the document -------------------------- */

    const rule = designRule(sap.design_family);

    // A randomised design's baseline table carries no significance test. The
    // groups differ by chance alone, so a p value there tests the
    // randomisation and not the study.
    if (!rule.baselineP) {
      for (const t of tables) {
        if (t.role === "descriptive" && t.columns.some((c) => P_VALUE.test(c))) {
          error(
            "TBL24",
            `Table ${t.number} tests the baseline balance of a ${rule.design.replace(/_/g, " ")}. Allocation was random, so a p value here tests the randomisation rather than the study. Report the arms side by side and let the reader see the balance.`,
          );
        }
      }
    }

    // A table the design requires that no builder in this version can draw.
    // Said out loud, because a document silently missing the table its design
    // is judged on is worse than one that admits the gap.
    const missing = unbuildableRoles(sap).filter(
      (role) => !tables.some((t) => t.role === role),
    );
    if (missing.length) {
      warn(
        "TBL25",
        `A ${rule.design.replace(/_/g, " ")} is expected to report ${missing
          .map((role) => role.replace(/_/g, " "))
          .join(", ")}, which this version does not yet lay out. ${rule.check}`,
      );
    }

    // A design that is read for effect modification and a plan that prespecifies
    // none. Subgroups cannot be invented here: choosing them after the design is
    // known but before the data arrive is the investigator's job, and choosing
    // them afterwards is the thing subgroup analysis is distrusted for.
    if (rule.roles.includes("subgroup") && !(sap.subgroups ?? []).length) {
      warn(
        "TBL23",
        `A ${rule.design.replace(/_/g, " ")} is read for effect modification, but the plan prespecifies no subgroups, so there is nothing to tabulate. Name them in the plan, or say that none are planned.`,
      );
    }

    /* ---- the house skeleton ----------------------------------------- */

    const filled = new Set(
      tables.filter((t) => t.block === "descriptive").map((t) => t.slot).filter(Boolean),
    );

    for (const t of tables) {
      if (t.block === "descriptive" && !t.slot) {
        error(
          "TBL26",
          `Table ${t.number} is a baseline table but does not say which of the seven descriptive slots it fills. Without it nobody can see which part of the skeleton is missing.`,
        );
      }
    }

    // A slot the study plainly owes. Demography is owed by every study; the
    // theatre table only by one that goes to theatre, which is what the design
    // catalogue already knows.
    if (tables.some((t) => t.block === "descriptive") && !filled.has("A1")) {
      warn("TBL27", "There is no A1 demography table. Every study describes who was in it.");
    }
    const surgical = /surg|operat|resection|excision/i.test(
      [sap.title, (sap as { design?: string }).design].filter(Boolean).join(" "),
    );
    if (surgical && !filled.has("A7")) {
      warn(
        "TBL27",
        "This is a surgical or procedural study with no A7 table of what was found and done in theatre, which is the part a reader turns to first.",
      );
    }

    // An objective's intent decides whether it owes an adjusted estimate.
    for (const objective of sap.objectives ?? []) {
      if (objective.tier !== "secondary" || !objective.intent) continue;
      const roles = new Set(
        tables.filter((t) => (t.fills ?? []).includes(objective.id)).map((t) => t.role),
      );
      const analyses = (sap.analyses ?? []).filter((a) =>
        (a.objective_ids ?? []).includes(objective.id),
      );
      const adjusts = analyses.some((a) => (a.adjust_for_ids ?? []).length);

      if (objective.intent === "causal" && adjusts && !roles.has("effect_adjusted")) {
        error(
          "TBL28",
          `${objective.id} asks what caused something and names confounders, but no table holds them constant. A causal question answered by a crude estimate is not answered.`,
        );
      }
      if (objective.intent === "descriptive" && roles.has("effect_adjusted")) {
        warn(
          "TBL28",
          `${objective.id} asks how much, not what caused it, and carries an adjusted estimate. An adjusted model beneath a descriptive question claims more than the question asked.`,
        );
      }
    }

    if ((sap.subgroups ?? []).length && !tables.some((t) => t.role === "subgroup")) {
      error(
        "TBL23",
        `The plan names ${sap.subgroups!.length} subgroup analysis${sap.subgroups!.length === 1 ? "" : "es"} but no table reports one, so they would never appear.`,
      );
    }
    if ((sap.populations ?? []).length > 1 && !tables.some((t) => t.role === "sensitivity")) {
      warn(
        "TBL23",
        `The plan names ${sap.populations!.length} analysis populations but no sensitivity table compares them. A conclusion that holds in only one population is one the data will not carry.`,
      );
    }

    // A non-inferiority trial that names only one analysis population.
    //
    // The one design where the per-protocol set is not supportive. A treatment
    // that looks non-inferior only because non-adherence pulled both arms
    // towards each other has been flattered by the analysis, and the two sets
    // are co-primary for that reason. Matched on the names a plan actually
    // uses, so this is a warning: only the investigator can confirm that a set
    // called something else is the one meant.
    if (sap.design_family === "non_inferiority_trial") {
      const named = (sap.populations ?? []).map((p) => p.name.toLowerCase());
      const has = (re: RegExp) => named.some((n) => re.test(n));
      const treated = has(/intention[- ]to[- ]treat|\bitt\b|full analysis set/);
      const adherent = has(/per[- ]protocol|\bpp\b/);

      if (!treated || !adherent) {
        warn(
          "TBL34",
          `This is a non-inferiority trial and the plan names ${
            named.length === 1 ? "one analysis population" : `${named.length} analysis populations`
          }, ${
            !treated && !adherent
              ? "neither an intention-to-treat set nor a per-protocol set"
              : !treated
                ? "with no intention-to-treat set among them"
                : "with no per-protocol set among them"
          }. Non-inferiority is claimed on both together: non-adherence pulls the arms towards each other, so an intention-to-treat analysis alone can make an inferior treatment look non-inferior.`,
        );
      }
    }

    // A declared variable that no table reports.
    //
    // The other direction of "not extra, not less", and the direction nothing
    // checked. The case report form refuses to collect what no analysis uses;
    // the tables did not refuse to leave a declared variable unreported, so a
    // variable could be collected on the form, declared in the plan, and
    // printed nowhere. It is then either an analysis nobody wrote or a field
    // nobody needed, and only the investigator knows which.
    //
    // Administrative variables are exempt for the reason they are exempt on the
    // form: an identifier structures the data and is not a result.
    const onSomeTable = new Set<string>();
    const labelled = new Set<string>();
    for (const t of tables) {
      for (const row of t.rows ?? []) {
        if (row.variable_id) onSomeTable.add(row.variable_id);
        // Many rows carry a label and no id, so a variable can be reported
        // under its own name and still look absent by id alone.
        if (row.label) labelled.add(row.label.trim().toLowerCase());
      }
      // A covariate is reported by being held constant, not by being a row.
      for (const model of t.models ?? []) {
        for (const id of model.adds ?? []) onSomeTable.add(id);
      }
      // An outcome is reported by the table that reports it, which names it
      // rather than listing it as a row.
      if (t.outcome_id) {
        onSomeTable.add(t.outcome_id);
        for (const id of byOutcome.get(t.outcome_id)?.source_variable_ids ?? []) {
          onSomeTable.add(id);
        }
      }
    }

    // What a derived value is computed from. Height and weight are collected so
    // a body mass index can be checked against them, and the two dates so a
    // length of stay can be; none of the three belongs in a table of its own,
    // and demanding one would be asking the plan to report its arithmetic.
    const ingredients = new Set(
      (sap.variables ?? []).flatMap((v) => v.derived_from ?? []),
    );

    // What an analysis compares heads the columns rather than filling a row.
    // The stored plans showed it: "Trial arm" was called unreported by a study
    // whose every table split its columns by it.
    //
    // Only where it is the analysis's one exposure. An analysis naming sixteen
    // is a predictor set, and a predictor set belongs in the rows of the model
    // table; exempting those would hide the very thing this looks for.
    const compared = new Set(
      (sap.analyses ?? [])
        .filter((a) => (a.exposure_ids ?? []).length === 1)
        .map((a) => a.exposure_ids[0]),
    );

    for (const variable of sap.variables ?? []) {
      if (onSomeTable.has(variable.id)) continue;
      if (compared.has(variable.id)) continue;
      if (labelled.has(variable.label.trim().toLowerCase())) continue;
      if (ingredients.has(variable.id)) continue;
      if (variable.role === "mediator" || variable.role === "collider") continue;
      warn(
        "TBL33",
        `The plan declares "${variable.label}" and no table reports it. Either an analysis is missing, or the variable is: a value collected and never reported costs the person filling the form and tells the reader nothing.`,
      );
    }
  }

  return { ok: !out.some((f) => f.severity === "ERROR"), findings: out };
}
