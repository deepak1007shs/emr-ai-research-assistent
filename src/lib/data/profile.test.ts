import { describe, expect, it } from "vitest";
import { guessHeaderRow, profile } from "./profile.ts";
import type { Grid } from "./types.ts";

const grid = (rows: string[][]): Grid => ({ sheet: "Data", rows });

describe("finding the header row", () => {
  it("skips a title and a blank line above the table", () => {
    expect(
      guessHeaderRow(
        grid([
          ["Tendon study - master sheet", "", ""],
          ["", "", ""],
          ["Sr", "Age", "Sex"],
          ["1", "34", "M"],
          ["2", "51", "F"],
        ]),
      ),
    ).toBe(2);
  });

  it("takes the first row when the sheet is already tidy", () => {
    expect(guessHeaderRow(grid([["Sr", "Age"], ["1", "34"]]))).toBe(0);
  });

  it("does not mistake a wide data row for a header", () => {
    // A header's cells are short words and none of them repeats.
    expect(
      guessHeaderRow(grid([["1", "1", "1"], ["Sr", "Age", "Sex"], ["1", "34", "M"]])),
    ).toBe(1);
  });
});

describe("profiling the columns", () => {
  const sample = grid([
    ["Sr", "Age", "Sex", "Comment", "Empty"],
    ["1", "34", "M", "seen in OPD", ""],
    ["2", "51", "male", "", ""],
    ["3", "NA", "F", "referred", ""],
    ["4", "29", "M", "", ""],
  ]);

  it("counts what is there and what is not", () => {
    const age = profile(sample, 0).columns[1];
    expect(age.header).toBe("Age");
    expect(age.filled).toBe(3);
    expect(age.missing).toBe(1);
  });

  it("recognises a marker that stands for nothing recorded", () => {
    expect(profile(sample, 0).columns[1].missingMarkers).toContain("NA");
  });

  it("calls a column of numbers a number, and words words", () => {
    const columns = profile(sample, 0).columns;
    expect(columns[1].looks).toBe("number");
    expect(columns[2].looks).toBe("category");
    expect(columns[3].looks).toBe("text");
    expect(columns[4].looks).toBe("empty");
  });

  it("lists the distinct values, commonest first, so a spelling shows up", () => {
    const sex = profile(sample, 0).columns[2];
    expect(sex.distinct.map((d) => d.value)).toEqual(["M", "male", "F"]);
    expect(sex.distinct[0].count).toBe(2);
    expect(sex.distinctTotal).toBe(3);
  });

  it("counts the rows of data, not the rows of the file", () => {
    expect(profile(sample, 0).rowCount).toBe(4);
  });

  it("caps the list, because a free-text column has one value per row", () => {
    const many = grid([["note"], ...Array.from({ length: 200 }, (_, i) => [`note ${i}`])]);
    const column = profile(many, 0).columns[0];
    expect(column.distinct.length).toBe(50);
    expect(column.distinctTotal).toBe(200);
  });
});
