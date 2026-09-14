import type { Role } from "../study/vocabulary.ts";
import type { Variable } from "../study/types.ts";
import { STUDY } from "../variables/build.ts";
import type { SapBuild } from "./build.ts";

/**
 * Section 2, the master variable list, as rows any renderer can print.
 *
 * Step 2 of the written process builds this list and every step after it reads
 * it: Step 4 takes each objective's outcome and covariates from here, Step 6
 * draws its rows from here, Step 8 turns the raw rows into CRF fields, and
 * S2-1 to S2-5 police it. It was built, enforced, and then printed nowhere -
 * the plan that reached an investigator had objectives, a map and tables, and
 * no statement of what the study measures. §1.4 calls this list "the single
 * source of truth" and "the one backbone"; a plan that omits its backbone
 * cannot be checked against the CRF by a reader, only by this code.
 *
 * One module rather than three, because the markdown, the Word file and the
 * screen must show the same list. A renderer that worked out its own rows
 * would be a second place the plan is decided.
 *
 * The seven columns are Step 2.2's seven, in its order.
 */

export const SECTION_2_LINE =
  "Every variable the analysis needs and nothing else, with its role in each objective, what it is measured in and when it is collected. The Case Record Form captures exactly the raw rows of this list, which is what keeps the two documents describing one study.";

export const VARIABLE_HEADINGS = [
  "Variable",
  "Role",
  "Data type",
  "Allowed values / units",
  "Timepoint(s)",
  "Serves objective ID(s)",
  "Derived from",
];

/** The roles in the order 2.3 and 2.4 list them, so two runs print one order. */
const ROLE_ORDER: Role[] = [
  "outcome",
  "exposure",
  "covariate",
  "derived",
  "descriptor",
  "population_definition",
  "administrative",
];

/** Words, never the identifiers code uses. The house rule for every document. */
const words = (text: string) => text.replace(/_/g, " ");

/**
 * What a row serves, from the roles map rather than from the variable's name.
 *
 * The map is keyed by objective id, by `adjust:<id>` where the variable is that
 * objective's covariate, and by `study` for a row that serves the study as a
 * whole. A row keyed only by `study` serves no single objective, so it says
 * what it does serve: the descriptive tables, the analysis populations, or the
 * structure of the dataset. Printing "all" for each of those, as the worked
 * example does for its administrative rows, would claim age answers every
 * question in the plan.
 */
function servesOf(variable: Variable, variables: Variable[]): string {
  const own = (one: Variable) =>
    Object.keys(one.roles)
      .filter((key) => key !== STUDY)
      .map((key) => key.replace(/^adjust:/, ""));

  // A raw input serves whatever is calculated from it. Height and weight are
  // on the list because body mass index is, and they answer no objective of
  // their own: printed as serving nothing, rule 2.11 would mark the two rows
  // that make a third row possible as candidates for deletion.
  const through = variables
    .filter((other) => other.derived_from.includes(variable.name))
    .flatMap((other) => own(other));

  const ids = [...new Set([...own(variable), ...through])].sort();
  if (ids.length) return ids.join(", ");

  const role = variable.roles[STUDY];
  if (role === "descriptor") return "descriptive tables";
  if (role === "population_definition") return "analysis populations";
  if (role === "administrative") return "all";

  // Through a derived value that itself serves no objective - body mass index
  // is a descriptor, so its parts are collected for the descriptive tables.
  const parent = variables.find((other) => other.derived_from.includes(variable.name));
  if (parent && parent !== variable) return servesOf(parent, variables);
  return "none";
}

/** The options in print order, or the unit, or an em dash. 2.6. */
function valuesOf(variable: Variable): string {
  if (variable.options?.length) return variable.options.join(" / ");
  return variable.unit ?? "-";
}

/** The raw inputs, with the recipe 2.8 asks for in plain words beside them. */
function derivedOf(variable: Variable, label: (name: string) => string): string {
  if (!variable.derived_from.length) return "-";
  const inputs = variable.derived_from.map(label).join(", ");
  return variable.recipe ? `${inputs} (${variable.recipe})` : inputs;
}

export function variableRows(build: SapBuild): string[][] {
  const { facts, variables } = build;
  const label = (name: string) =>
    variables.find((variable) => variable.name === name)?.label ?? words(name);
  const visit = (code: string) =>
    facts.visit_schedule.find((v) => v.timepoint === code)?.label ?? code;

  return variables.map((variable) => {
    const roles = ROLE_ORDER.filter((role) =>
      Object.values(variable.roles).includes(role),
    ).map(words);
    return [
      variable.label,
      roles.join(", ") || "—",
      words(variable.type),
      valuesOf(variable),
      variable.timepoints.map(visit).join(", ") || "—",
      servesOf(variable, variables),
      derivedOf(variable, label),
    ];
  });
}
