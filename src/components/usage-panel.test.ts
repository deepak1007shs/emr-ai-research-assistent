import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UsagePanel } from "./usage-panel.tsx";

/** The panel says what happened on this run, and nothing it merely could. */

const run = {
  input_tokens: 39707,
  output_tokens: 32333,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};
const render = (props: Parameters<typeof UsagePanel>[0]) =>
  renderToStaticMarkup(createElement(UsagePanel, props));

describe("the usage panel", () => {
  it("shows no cache row where nothing was cached", () => {
    const html = render({ usage: run, model: "claude-sonnet-5" });
    expect(html).not.toContain("cache");
  });

  it("says a batched run was billed at half, and shows the halved figure", () => {
    const live = render({ usage: run, model: "claude-sonnet-5" });
    const batched = render({ usage: { ...run, batch: true }, model: "claude-sonnet-5" });
    expect(batched).toContain("Sent as a batch, at half the live price.");
    expect(live).not.toContain("batch");
    // 39707*2/M + 32333*10/M = $0.40; half of it $0.20.
    expect(live).toContain("$0.40");
    expect(batched).toContain("$0.20");
  });

  it("promises nothing about a review that has not happened", () => {
    const html = render({
      usage: { ...run, cache_creation_input_tokens: 26940 },
      model: "claude-sonnet-5",
    });
    expect(html).toContain("written to cache");
    expect(html).not.toContain("next review");
  });

  it("names the document it paid for", () => {
    expect(render({ usage: run, model: "claude-sonnet-5", what: "plan" })).toContain(
      "What this plan cost",
    );
    expect(render({ usage: run, model: "claude-sonnet-5" })).toContain("What this review cost");
  });
});
