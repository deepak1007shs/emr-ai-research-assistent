import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { idaPreg } from "./fixture.ts";
import { gateA } from "./gate.ts";
import { GateAStopped } from "../../components/gate-a-stopped.tsx";

/**
 * A reading that fails Gate A is kept, not thrown away.
 *
 * It used to throw from inside the extraction, after the protocol had been read
 * and paid for, with only the gate's messages in the error. The facts were
 * lost, and a rebuild paid again to read the same protocol into, most likely,
 * the same failure.
 */

// "Prospective study" is a timing word, not a design: G-A1 fails on it.
const unsettled = { ...idaPreg, design_label: "A prospective study" };

vi.mock("../model/call.ts", async (original) => ({
  ...(await original<typeof import("../model/call.ts")>()),
  runMessage: vi.fn(async () => ({
    message: {
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(unsettled) }],
    },
    usage: {
      input_tokens: 40_000,
      output_tokens: 15_000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      batch: true,
    },
  })),
}));

const protocol = { kind: "text" as const, text: "A protocol.", filename: "p.docx", bytes: 11 };

describe("a reading that fails Gate A", () => {
  it("is the precondition this test relies on: the reading does fail the gate", () => {
    expect(gateA(unsettled).filter((c) => !c.pass).map((c) => c.id)).toEqual(["G-A1"]);
  });

  it("is returned by the extraction, with what it cost, rather than thrown", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    const { extractFacts } = await import("./extract.ts");
    const result = await extractFacts(protocol);

    expect(result.facts.design_label).toBe("A prospective study");
    // The runner stores this on the row, so the cost of the stop is visible.
    expect(result.usage.output_tokens).toBe(15_000);
    expect(result.usage.batch).toBe(true);
  });
});

describe("the page for a plan Gate A stopped", () => {
  const html = renderToStaticMarkup(createElement(GateAStopped, { facts: unsettled }));

  it("names each check that stopped it, with its reason", () => {
    expect(html).toContain("G-A1");
    expect(html).toContain("says when the data were collected, not what the study is");
    // Only the checks that failed. A passed check listed here would read as a
    // second problem.
    expect(html).not.toContain("G-A2");
  });

  it("shows what the protocol was read as saying, so the gap can be seen", () => {
    expect(html).toContain("A prospective study");
    expect(html).toContain("Change in haemoglobin");
    expect(html).toContain("Haemoglobin at week 6 minus haemoglobin at day 0");
    expect(html).toContain("FCM (IV ferric carboxymaltose)");
  });

  it("says a rebuild is billed again", () => {
    expect(html).toContain("billed again");
  });
});
