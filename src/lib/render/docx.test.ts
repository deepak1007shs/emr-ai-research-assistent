import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildDocx } from "./docx";
import { build } from "./markdown";
import { fixtureActionSpec, fixtureSpec } from "./fixture";

/** Unzips the .docx and returns the text of `word/document.xml`. */
async function documentXml(
  spec: Parameters<typeof buildDocx>[0] = fixtureSpec,
): Promise<string> {
  const zip = await JSZip.loadAsync(await buildDocx(spec));
  const file = zip.file("word/document.xml");
  expect(file).not.toBeNull();
  return file!.async("string");
}

/** The visible text: tags stripped and XML entities decoded back to characters. */
function visibleText(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

describe("docx renderer", () => {
  it("produces a valid, non-trivial .docx", async () => {
    const buffer = await buildDocx(fixtureSpec);
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(buffer.byteLength).toBeGreaterThan(5_000);
  });

  it("carries every heading the Markdown builder emits", async () => {
    const text = visibleText(await documentXml());

    // Taken from the Markdown output, so the two renderers cannot drift apart.
    const headings = build(fixtureSpec)
      .split("\n")
      .filter((l) => /^#{1,3} /.test(l))
      .map((l) => l.replace(/^#{1,3} /, ""));

    expect(headings.length).toBeGreaterThan(8);
    for (const heading of headings) {
      expect(text, `missing heading: ${heading}`).toContain(heading);
    }
  });

  it("writes the review's own content, not just its scaffolding", async () => {
    const text = visibleText(await documentXml());
    expect(text).toContain("Hospital-based prospective diagnostic accuracy study");
    expect(text).toContain("Wrong formula");
    expect(text).toContain("The most important things to fix before the study starts:");
    expect(text).toContain("Primary outcome:");
    expect(text).toContain("Comorbidities are named as a category but never itemised");
  });

  it("keeps a literal pipe intact rather than escaping it, since Word has no table syntax", async () => {
    const text = visibleText(await documentXml());
    expect(text).toContain("blood culture positivity | adjudicated by two intensivists");
    expect(text).not.toContain("\\|");
  });

  it("switches the section 3 heading with the framework", async () => {
    const pico = visibleText(
      await documentXml({ ...fixtureSpec, peco: { ...fixtureSpec.peco, framework: "PICO" } }),
    );
    expect(pico).toContain("3. PICO (Intervention question)");
    expect(pico).not.toContain("3. PECO");
  });
});

describe("the short action document as .docx", () => {
  it("contains the action table and none of the narrative sections", async () => {
    const text = visibleText(await documentXml(fixtureActionSpec));

    expect(text).toContain("Issues & Required Changes");
    expect(text).toContain("Area");
    expect(text).toContain("Issue in the study");
    expect(text).toContain("Change needed");
    expect(text).toContain("Priority");

    expect(text).not.toContain("Title of the Study");
    expect(text).not.toContain("Objectives and Their Outcomes");
    expect(text).not.toContain("Very Important Issues");
  });

  it("carries every action row's own words", async () => {
    const text = visibleText(await documentXml(fixtureActionSpec));
    for (const [area, issue, change] of fixtureActionSpec.issues_table.rows) {
      expect(text, `missing area: ${area}`).toContain(area);
      expect(text, `missing issue: ${issue}`).toContain(issue);
      expect(text, `missing change: ${change}`).toContain(change);
    }
  });

  it("is materially shorter than the full review", async () => {
    const short = (await buildDocx(fixtureActionSpec)).byteLength;
    const full = (await buildDocx(fixtureSpec)).byteLength;
    expect(short).toBeLessThan(full);
  });
});
