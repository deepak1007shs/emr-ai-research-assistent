/**
 * The Markdown renderer.
 *
 * The real implementation is the vendored, zero-dependency
 * `build_review_md.js` — the canonical builder, kept byte-for-byte as it is
 * used elsewhere. This module only re-exports it under a typed name so the rest
 * of the app never reaches for the .js path directly.
 *
 * `build()` is synchronous and has no await points, so its module-level buffer
 * cannot interleave between concurrent requests on Node's single thread.
 */
export { build } from "./build_review_md";
