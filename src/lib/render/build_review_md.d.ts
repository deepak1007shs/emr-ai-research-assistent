import type { ActionSpec, ReviewSpec } from "@/lib/protocol/schema";

/**
 * Types for the vendored `build_review_md.js`.
 *
 * That file is kept verbatim as the canonical builder — the same script is used
 * outside this app — so it is never edited here. Any change to the review
 * format belongs in it, and this declaration follows.
 */
export declare function build(spec: ReviewSpec | ActionSpec): string;
