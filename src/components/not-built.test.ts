import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NotBuilt } from "./not-built.tsx";

/**
 * The state a document spends most of its life in, for a user who has not seen
 * one before.
 */

const render = (props: Parameters<typeof NotBuilt>[0]) =>
  renderToStaticMarkup(createElement(NotBuilt, props));

const base = {
  kind: "Statistical Analysis Plan",
  description: "The protocol is read once, into a sheet of facts.",
  children: createElement("button", {}, "Build the analysis plan"),
};

describe("a document that does not exist yet", () => {
  it("names the document, says it is not built, and offers to build it", () => {
    const html = render(base);
    expect(html).toContain("Statistical Analysis Plan");
    expect(html).toContain("Not built");
    expect(html).toContain("Build the analysis plan");
  });

  it("lists the sections in the order the document prints them", () => {
    const html = render({
      ...base,
      parts: [
        { name: "PICOT or PECO", detail: "the question decomposed." },
        { name: "Analysis Map", detail: "one row per objective." },
        { name: "Section 6", detail: "every empty results table." },
      ],
    });
    expect(html).toContain("What it contains");
    expect(html.indexOf("PICOT or PECO")).toBeLessThan(html.indexOf("Analysis Map"));
    expect(html.indexOf("Analysis Map")).toBeLessThan(html.indexOf("Section 6"));
    // Numbered, so a reader can see there are three of them without counting.
    expect(html).toContain(">1<");
    expect(html).toContain(">3<");
  });

  it("shows no empty list where there is nothing to list", () => {
    expect(render(base)).not.toContain("What it contains");
  });

  it("puts what to expect of the build beside the button", () => {
    const html = render({ ...base, note: "It runs on the server." });
    expect(html.indexOf("Build the analysis plan")).toBeLessThan(
      html.indexOf("It runs on the server."),
    );
  });

  it("uses only colours the stylesheet defines", () => {
    // A class naming a token that does not exist renders as nothing at all,
    // and the difference is invisible until someone looks at the page.
    const css = readFileSync("src/app/globals.css", "utf8");
    const html = render({
      ...base,
      parts: [{ name: "A", detail: "b." }],
      note: "c",
    });
    const tokens = [
      ...new Set(
        [...html.matchAll(/(?:text|bg|border|divide)-((?:ink|line|surface|muted)[a-z0-9-]*)/g)].map(
          (m) => m[1],
        ),
      ),
    ];
    expect(tokens.length).toBeGreaterThan(3);
    for (const token of tokens) {
      expect(css, token).toContain(`--color-${token}:`);
    }
  });
});
