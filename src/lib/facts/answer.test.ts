import { beforeEach, describe, expect, it, vi } from "vitest";
import { idaPreg } from "./fixture.ts";

/**
 * Reading the model's answer, now that no grammar holds it to the schema.
 *
 * The API cannot compile the Facts Sheet as a grammar, so the schema is given
 * as text and the parser checks the answer. A malformed answer is possible and
 * arrives after the protocol has been read and paid for, so it gets one repair:
 * the answer and what is wrong with it go back, the protocol does not.
 */

const usage = (output: number) => ({
  input_tokens: 40_000,
  output_tokens: output,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
});

const answers: string[] = [];
const sent: { messages: { content: unknown }[]; output_config: { effort: string } }[] = [];

vi.mock("../model/call.ts", async (original) => ({
  ...(await original<typeof import("../model/call.ts")>()),
  runMessage: vi.fn(async (_client: unknown, params: (typeof sent)[number]) => {
    sent.push(params);
    const text = answers.shift() ?? "";
    return {
      message: { stop_reason: "end_turn", content: [{ type: "text", text }] },
      usage: usage(sent.length === 1 ? 20_000 : 3_000),
    };
  }),
}));

/** The worked example with its covariates left out: one required field missing. */
const missing = Object.fromEntries(
  Object.entries(idaPreg).filter(([key]) => key !== "covariates"),
);

const protocol = { kind: "text" as const, text: "THE PROTOCOL TEXT", filename: "p.docx", bytes: 17 };
const good = JSON.stringify(idaPreg);

async function extract() {
  process.env.ANTHROPIC_API_KEY = "test";
  const { extractFacts } = await import("./extract.ts");
  return extractFacts(protocol);
}

beforeEach(() => {
  answers.length = 0;
  sent.length = 0;
});

describe("the model's answer", () => {
  it("is read in one call when it matches the schema", async () => {
    answers.push(good);
    const result = await extract();
    expect(result.facts.title).toBe(idaPreg.title);
    expect(sent).toHaveLength(1);
  });

  it("is read through a code fence or a sentence around it", async () => {
    answers.push("Here is the Facts Sheet.\n```json\n" + good + "\n```");
    const result = await extract();
    expect(result.facts.design).toBe("randomised_trial");
    expect(sent).toHaveLength(1);
  });

  it("turns an empty string back into the null every later step expects", async () => {
    answers.push(JSON.stringify({ ...idaPreg, hypothesis: "" }));
    expect((await extract()).facts.hypothesis).toBeNull();
  });

  it("gets one repair when it misses the schema, and the repair is kept", async () => {
    answers.push(JSON.stringify(missing), good);
    const result = await extract();

    expect(sent).toHaveLength(2);
    expect(result.facts.covariates).toEqual(idaPreg.covariates);
    // Both calls are billed, so both are counted.
    expect(result.usage.output_tokens).toBe(23_000);
  });

  it("sends the repair the answer and its problems, and not the protocol", async () => {
    // The protocol is most of what a call costs. The repair is a question about
    // structure and has no need of it.
    answers.push(JSON.stringify(missing), good);
    await extract();

    const repair = JSON.stringify(sent[1].messages);
    expect(repair).not.toContain("THE PROTOCOL TEXT");
    expect(repair).toContain("covariates");
    expect(repair).toContain("Change only what the problems below name");
    expect(sent[1].output_config.effort).toBe("medium");
  });

  it("repairs an answer that is not JSON at all", async () => {
    answers.push("I could not finish the object {", good);
    const result = await extract();
    expect(result.facts.title).toBe(idaPreg.title);
    expect(sent).toHaveLength(2);
  });

  it("gives up after one repair, and says what was still wrong", async () => {
    answers.push(JSON.stringify(missing), JSON.stringify(missing));
    await expect(extract()).rejects.toThrow(/even after one repair: covariates/);
    expect(sent).toHaveLength(2);
  });
});
