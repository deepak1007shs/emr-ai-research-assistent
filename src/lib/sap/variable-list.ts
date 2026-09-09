import { outcomeIndex, type Role, type SapSpec } from "./types.ts";

/**
 * The master variable list, as the house documents print it.
 *
 * Step 2's output and the backbone of everything after it: the case record form
 * collects this list, the shell tables report it, and the two-way traceability
 * check is run against it. It is printed because a supervisor reading the plan
 * has no other way to see the whole set at once, and "not extra, not less" is a
 * claim about the set rather than about any one row.
 *
 * The Serves column is derived, never asked for. A variable serves the
 * objectives of the analyses that use it, and asking a model to restate that is
 * asking it to disagree with the analysis map two pages up.
 */

export const VARIABLE_LIST_HEADING = "Master Variable List (traceability)";

export const VARIABLE_LIST_COLUMNS = [
  "Variable",
  "Role",
  "Data type",
  "Values / units",
  "Serves",
];

export type VariableListRow = [
  variable: string,
  role: string,
  dataType: string,
  values: string,
  serves: string,
];

/**
 * The plan's own role words, in the wording the house documents use.
 *
 * A mediator and a collider say what they are and that nothing adjusts for
 * them, because that is the whole reason they are on the list: to record a
 * decision not to adjust, which a reader would otherwise take for an omission.
 */
const ROLE_WORD: Record<Role, string> = {
  outcome: "Outcome",
  predictor: "Group / exposure",
  effect_modifier: "Effect modifier",
  confounder: "Covariate / confounder",
  mediator: "Mediator (not adjusted for)",
  collider: "Collider (not adjusted for)",
  descriptor: "Descriptive",
};

export function variableListRows(sap: SapSpec): VariableListRow[] {
  const byOutcome = outcomeIndex(sap);
  const variables = sap.variables ?? [];
  const analyses = sap.analyses ?? [];

  // Which objectives each variable reaches: directly, as an exposure or a
  // covariate, or through an outcome it is the source of.
  const serves = new Map<string, Set<string>>();
  const add = (id: string, objective: string) => {
    const set = serves.get(id) ?? new Set<string>();
    set.add(objective);
    serves.set(id, set);
  };

  for (const row of analyses) {
    const objectives = row.objective_ids ?? [];
    for (const objective of objectives) {
      for (const id of [...(row.exposure_ids ?? []), ...(row.adjust_for_ids ?? [])]) {
        add(id, objective);
      }
      for (const outcomeId of row.outcome_ids ?? []) {
        // An outcome is often a variable in its own right, and often computed
        // from several. Both reach the objective that reports it.
        add(outcomeId, objective);
        for (const id of byOutcome.get(outcomeId)?.source_variable_ids ?? []) {
          add(id, objective);
        }
      }
    }
  }

  // What a derived value is computed from serves whatever the derived value
  // serves, and says so by name: "height" reaching an objective through "body
  // mass index" is clearer than "height" listed against P1 with no path shown.
  const feeds = new Map<string, string[]>();
  for (const variable of variables) {
    for (const id of variable.derived_from ?? []) {
      feeds.set(id, [...(feeds.get(id) ?? []), variable.label]);
    }
  }

  const order: Role[] = [
    "outcome",
    "predictor",
    "effect_modifier",
    "confounder",
    "mediator",
    "collider",
    "descriptor",
  ];

  return [...variables]
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))
    .map((variable) => {
      const objectives = [...(serves.get(variable.id) ?? [])].sort();
      const computed = feeds.get(variable.id) ?? [];

      const said = objectives.length
        ? objectives.join(", ")
        : computed.length
          ? `computes ${computed.join(", ")}`
          : variable.role === "descriptor"
            ? "descriptive only"
            : "not analysed";

      return [
        variable.label,
        `${ROLE_WORD[variable.role]}${(variable.derived_from?.length ?? 0) > 0 ? " (derived)" : ""}`,
        variable.data_type,
        variable.unit_coding,
        said,
      ];
    });
}
