import { describe, expect, it } from "vitest";
import { apiMessage } from "./analyze";

describe("apiMessage", () => {
  it("pulls the human sentence out of a raw JSON error body", () => {
    const raw =
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011CeMeztJa8HRM15ySzgB2n"}';

    expect(apiMessage({ message: raw })).toBe(
      "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
    );
  });

  it("unescapes quotes inside the message", () => {
    const raw = '400 {"error":{"message":"Field \\"model\\" is invalid."}}';
    expect(apiMessage({ message: raw })).toBe('Field "model" is invalid.');
  });

  it("passes a plain message through untouched", () => {
    expect(apiMessage({ message: "Connection reset" })).toBe("Connection reset");
  });
});
