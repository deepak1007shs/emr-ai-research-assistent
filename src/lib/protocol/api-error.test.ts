import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { apiMessage, explainApiError } from "./api-error.ts";

/**
 * An untranslated API failure reaches the screen as a wall of JSON, which tells
 * an investigator nothing they can act on. These are the failures that actually
 * happen, and what each should say instead.
 */

const badRequest = (message: string) =>
  new Anthropic.BadRequestError(400, { message }, message, new Headers());

describe("explainApiError", () => {
  it("tells you to add credit, and where", () => {
    const said = explainApiError(
      badRequest(
        '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}',
      ),
    );
    expect(said).toContain("no credit left");
    expect(said).toContain("console.anthropic.com");
    // The distinction that catches people out.
    expect(said).toContain("separate from a Claude.ai subscription");
  });

  it("distinguishes a usage limit from an empty balance", () => {
    const said = explainApiError(
      badRequest(
        '400 {"type":"error","error":{"message":"You have reached your specified API usage limits. You will regain access on 2026-09-01."}}',
      ),
    );
    expect(said).toContain("usage limit");
    expect(said).toContain("2026-09-01");
  });

  it("says a schema too large is the application's fault, not the protocol's", () => {
    // This one has forced a redesign in this repo before, and retrying a
    // protocol will never fix it.
    const said = explainApiError(
      badRequest('400 {"error":{"message":"The compiled grammar is too large."}}'),
    );
    expect(said).toContain("fault in the application");
    expect(said).toContain("report it rather than retrying");
  });

  it("names the key when the key is the problem", () => {
    const said = explainApiError(
      new Anthropic.AuthenticationError(401, {}, "unauthorized", new Headers()),
    );
    expect(said).toContain("ANTHROPIC_API_KEY");
  });

  it("leaves anything that is not an API error to its caller", () => {
    expect(explainApiError(new Error("the disk is full"))).toBeNull();
  });
});

describe("apiMessage", () => {
  it("pulls the sentence out of the JSON body", () => {
    expect(
      apiMessage({ message: '400 {"type":"error","error":{"message":"Overloaded"}}' }),
    ).toBe("Overloaded");
  });

  it("returns the message unchanged when there is no body to unwrap", () => {
    expect(apiMessage({ message: "socket hang up" })).toBe("socket hang up");
  });
});
