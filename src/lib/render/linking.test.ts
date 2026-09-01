import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildCrfDocx } from "./crf-docx.ts";
import { buildTablesDocx } from "./tables-docx.ts";
import { crfFixture } from "../crf/fixture.ts";
import { tablesFixture } from "../tables/fixture.ts";
import type { CrfSpec } from "../crf/types.ts";
import type { ShellTablesSpec } from "../tables/types.ts";

/**
 * The three documents are linked by id, not by wording.
 *
 * These tests do the thing string matching could never do: change the wording in
 * one document and check the printed document ignores it, because the wording
 * comes from the plan's registry through the id.
 */

async function visible(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")!.async("string");
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

describe("one concept, one wording", () => {
  it("the form prints the plan's wording, not the wording typed on the field", async () => {
    const crf = structuredClone(crfFixture) as CrfSpec;
    // The field claims a different wording for a variable the plan has named.
    const field = crf.sections[0].fields.find((f) => f.variable_id === "var_age")!;
    field.label = "Patient age at operation";

    const text = await visible(await buildCrfDocx(crf));
    expect(text).toContain("Age");
    expect(text).not.toContain("Patient age at operation");
  });

  it("a shell table prints the plan's wording, not its own row label", async () => {
    const tables = structuredClone(tablesFixture) as ShellTablesSpec;
    const row = tables.tables[0].rows.find((r) => r.variable_id === "var_sex")!;
    row.label = "Gender";

    const text = await visible(await buildTablesDocx(tables));
    expect(text).toContain("Sex");
    expect(text).not.toContain("Gender");
  });

  it("the roll-call names the field by id, so it cannot point at nothing", async () => {
    const text = await visible(await buildCrfDocx(crfFixture));
    // The primary outcome's roll-call entry resolves to the field's own wording.
    expect(text).toContain("Intraoperative conversion");
    expect(text).not.toContain("NOT CAPTURED");
  });

  it("still prints a plain label where the plan has no variable", async () => {
    // Identifiers are not analysed, so they carry a label and no id.
    const text = await visible(await buildCrfDocx(crfFixture));
    expect(text).toContain("Study subject ID");
  });
});

describe("when an id cannot be resolved", () => {
  it("the form falls back to the field's own label, never a raw id", async () => {
    const crf = structuredClone(crfFixture) as CrfSpec;
    // A plan that has moved on: the form still points at a variable the
    // registry no longer carries.
    delete crf.labels.var_age;

    const text = await visible(await buildCrfDocx(crf));
    expect(text).toContain("Age");
    // Not on the form, and not in the roll-call either.
    expect(text).not.toContain("var_age");
  });

  it("shows the id itself only where no document holds any wording for it", async () => {
    const crf = structuredClone(crfFixture) as CrfSpec;
    // An outcome id that is in the roll-call but is not a field and is no
    // longer in the registry. Printing the id is the honest answer: the
    // alternative is a blank cell in the check that exists to catch this.
    delete crf.labels.out_conversion;

    // The roll-call is evidence, so it is in the plan document rather than on
    // the form the collector fills in.
    const text = await visible(await buildCrfDocx(crf, "plan"));
    expect(text).toContain("out_conversion");
  });

  it("a shell table falls back to its row label, never a raw id", async () => {
    const tables = structuredClone(tablesFixture) as ShellTablesSpec;
    delete tables.labels.var_sex;

    const text = await visible(await buildTablesDocx(tables));
    expect(text).toContain("Sex");
    expect(text).not.toContain("var_sex");
  });
});
