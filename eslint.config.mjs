import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored verbatim from the canonical CommonJS builder — kept byte-for-byte
    // so it stays interchangeable with the copy used outside this app.
    "src/lib/render/build_review_md.js",
    // Zero-dependency CommonJS gate, runnable standalone and from CI.
    "src/lib/study-spec/validate_study_spec.js",
    "src/lib/study-spec/invariants/*.js",
    "src/lib/study-spec/test_invariants.js",
  ]),
]);

export default eslintConfig;
