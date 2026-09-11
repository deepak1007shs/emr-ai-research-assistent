import type {
  CheckResult,
  FactsSheet,
  ShellTable,
} from "../study/types.ts";

/**
 * The six checks Step 6 owes.
 *
 * Every one of them catches something that reads perfectly well on the page. A
 * value left in a shell table looks like a result; a p column on a baseline
 * table of a randomised trial looks like diligence; a sensitivity table printed
 * after the secondary block looks like an appendix. None of them is visible to
 * a reader who is not looking for it.
 */

const ok = (id: string, message: string): CheckResult => ({
  id,
  pass: true,
  failing: [],
  message,
});

/**
 * Text that is a result rather than a label.
 *
 * Not "any decimal number": a row label legitimately carries one. "Time to
 * haemoglobin of 11.0 g/dL or above" is an outcome's name, and a check that
 * read it as a filled-in cell refused a correct plan. What a label never
 * carries is a p value or a confidence interval, and those are what a result
 * looks like.
 */
const HAS_VALUE =
  /\bp\s*[<=>]\s*0?\.\d+|\(\s*-?\d+(\.\d+)?\s*(to|,)\s*-?\d+(\.\d+)?\s*\)|\b\d+(\.\d+)?\s*±\s*\d/;

export function step6Checks(
  facts: FactsSheet,
  tables: ShellTable[],
  figures: { number: string }[],
  pinned: { tables: number; fits: number; figures: number },
): CheckResult[] {
  const results: CheckResult[] = [];
  const numbered = tables.filter((t) => !t.fit_table_of);

  /* S6-1: nothing is filled in. */
  const filled = tables.filter((t) =>
    t.rows.some((r) => HAS_VALUE.test(r.label) && !r.label.includes("TODO")),
  );
  results.push(
    filled.length === 0
      ? ok("S6-1", "Every value cell is blank.")
      : {
          id: "S6-1",
          pass: false,
          failing: filled.map((t) => t.number),
          message: `Table ${filled.map((t) => t.number).join(", ")} carries a number. A shell table with a value in it is indistinguishable from a result, and the thesis it ends up in will be read as though the study had been done.`,
        },
  );

  /* S6-2: a title and a footnote on every table. */
  const bare = tables.filter((t) => !t.title.trim() || !t.footnote.trim());
  results.push(
    bare.length === 0
      ? ok("S6-2", "Every table has its title line and its footnote naming the test.")
      : {
          id: "S6-2",
          pass: false,
          failing: bare.map((t) => t.number),
          message: `Table ${bare.map((t) => t.number).join(", ")} has no title or no footnote. The footnote is the only place the test is named, and a table without one is a grid nobody can reproduce.`,
        },
  );

  /* S6-3: the sensitivity table closes the primary block. */
  const primary = numbered.filter((t) => t.block === "primary");
  const last = primary[primary.length - 1];
  // Keyed on the kind, like S6-4 and S7-5, and not on the title. A diagnostic
  // study's accuracy tables are about sensitivity too, and on the first one
  // through the rebuild this check found the word in the primary's own title
  // and reported the accuracy table as a misplaced sensitivity analysis.
  const sensitivity = primary.find((t) => t.kind === "sensitivity");
  results.push(
    !sensitivity || last === sensitivity
      ? ok("S6-3", sensitivity ? "The sensitivity table is the last table of the primary block." : "There is no primary block to close.")
      : {
          id: "S6-3",
          pass: false,
          failing: [sensitivity.number],
          message: `The sensitivity table is Table ${sensitivity.number} and the primary block ends at Table ${last?.number}. It belongs last, where a reader reaches it having read the estimate it is testing.`,
        },
  );

  /* S6-4: a fit table after every model, an overlap table before every
     adjusted one. */
  // Keyed on the template row that drew each table, not on its title. The
  // table reporting the unadjusted comparison is titled "Unadjusted comparison
  // of ...", which contains the word "adjusted", and a check that read titles
  // pointed the adjusted model at the wrong table once already.
  const MODELS = ["adjusted", "rate_of_change", "ratio", "cox"];
  const modelTables = tables.filter((t) => MODELS.includes(t.kind));
  const missingFit = modelTables.filter(
    (t) => !tables.some((f) => f.fit_table_of === t.number),
  );
  const adjusted = tables.filter((t) => t.kind === "adjusted" || t.kind === "cox");
  const missingOverlap = adjusted.filter((t) => {
    const before = numbered.slice(0, numbered.indexOf(t));
    return !before.some((p) => p.kind === "overlap");
  });
  const badModels = [...missingFit, ...missingOverlap];
  results.push(
    badModels.length === 0
      ? ok("S6-4", "Every model table has its fit table, and every adjusted table has an overlap table before it.")
      : {
          id: "S6-4",
          pass: false,
          failing: badModels.map((t) => t.number),
          message: missingFit.length
            ? `Table ${missingFit.map((t) => t.number).join(", ")} fits a model and reports no diagnostics. An assumption that is asserted rather than checked is the commonest reason a thesis result does not survive review.`
            : `Table ${missingOverlap.map((t) => t.number).join(", ")} adjusts for covariates with no overlap check before it. Where the groups do not overlap on a covariate, the adjusted estimate is extrapolation and not adjustment.`,
        },
  );

  /* S6-5: no p column where a p value would be meaningless. */
  const hasP = (t: ShellTable) => t.columns.some((c) => c.trim().toLowerCase() === "p");
  const randomised = /trial/.test(facts.design) || facts.design.includes("randomised");
  const wrongP = tables.filter(
    (t) =>
      hasP(t) &&
      (/at each visit/i.test(t.title) ||
        (randomised && t.block === "descriptive")),
  );
  results.push(
    wrongP.length === 0
      ? ok("S6-5", "No per-visit table and no baseline table of a randomised trial carries a p column.")
      : {
          id: "S6-5",
          pass: false,
          failing: wrongP.map((t) => t.number),
          message: `Table ${wrongP.map((t) => t.number).join(", ")} carries a p column that should not be there. Testing a randomised trial's baseline asks whether the randomisation worked; testing each visit separately runs the same question several times and reports the smallest answer.`,
        },
  );

  /* S6-6: the pinned count is the count. */
  const fits = tables.length - numbered.length;
  const agrees =
    pinned.tables === numbered.length &&
    pinned.fits === fits &&
    pinned.figures === figures.length;
  results.push(
    agrees
      ? ok("S6-6", `The pinned count matches what was drawn: ${numbered.length} numbered tables, ${fits} fit tables and ${figures.length} ${figures.length === 1 ? "figure" : "figures"}.`)
      : {
          id: "S6-6",
          pass: false,
          failing: [`${pinned.tables}/${numbered.length}`],
          message: `The plan pins ${pinned.tables} tables, ${pinned.fits} fit tables and ${pinned.figures} figures, and ${numbered.length}, ${fits} and ${figures.length} were drawn. The pinned count is the contract with the results chapter, and the whole point of pinning it is that it is not a description of whatever came out.`,
        },
  );

  return results;
}
