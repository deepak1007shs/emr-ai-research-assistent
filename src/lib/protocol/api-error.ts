import Anthropic from "@anthropic-ai/sdk";

/**
 * What went wrong with an API call, said in words.
 *
 * The SDK puts the useful sentence inside a JSON body inside the error message,
 * so an untranslated failure reaches the screen as a wall of JSON. The review
 * has translated these since it was built; the plan, the form, the tables and
 * the chat did not, which meant an exhausted account showed a stack of braces
 * instead of "add credit".
 */

/** Pull the human-readable part out of an SDK error message. */
export function apiMessage(error: { message: string }): string {
  const match = error.message.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!match) return error.message;
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1];
  }
}

/**
 * The sentence to show for an error from the Messages API, or null when it is
 * not one of ours and the caller should keep its own message.
 */
export function explainApiError(error: unknown): string | null {
  if (error instanceof Anthropic.AuthenticationError) {
    return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Rate limited by the Anthropic API. Wait a moment and try again.";
  }
  if (error instanceof Anthropic.BadRequestError) {
    // Billing and quota arrive as a 400 with the reason buried in a JSON blob.
    if (/credit balance is too low/i.test(error.message)) {
      return "The Anthropic account has no credit left. Add credits at console.anthropic.com/settings/billing, then try again. (API credits are separate from a Claude.ai subscription.)";
    }
    if (/usage limits?/i.test(error.message)) {
      return `The account has reached its configured API usage limit. ${apiMessage(error)}`;
    }
    // The one that has forced a redesign here before: a strict output schema
    // too large for the API to compile.
    if (/grammar is too large/i.test(error.message)) {
      return "The document's output schema is too large for the API to compile. This is a fault in the application, not in the protocol: report it rather than retrying.";
    }
    return `The API rejected the request: ${apiMessage(error)}`;
  }
  if (error instanceof Anthropic.APIError) {
    return `Anthropic API error ${error.status}: ${apiMessage(error)}`;
  }
  return null;
}
