import { describe, expect, it } from "vitest";
import { SAP_JSON_SCHEMA } from "./build.ts";
import { SAP_RULES_JSON_SCHEMA } from "./rules-stage.ts";
import { CRF_JSON_SCHEMA } from "../crf/build.ts";
import { TABLES_JSON_SCHEMA } from "../tables/build.ts";
import type { SapSpec } from "./types.ts";
import type { CrfSpec } from "../crf/types.ts";
import type { ShellTablesSpec } from "../tables/types.ts";
import { validateSap } from "./validate.ts";
import { validateCrf } from "../crf/validate.ts";
import { validateTables } from "../tables/validate.ts";
import { buildSapDocx } from "../render/sap-docx.ts";
import { buildCrfDocx } from "../render/crf-docx.ts";
import { buildTablesDocx } from "../render/tables-docx.ts";

/**
 * Does the schema we ask for match the type we expect back?
 *
 * The model's answer cannot be tested without the model, but the shape of it
 * can. These build the smallest object each schema permits, then push it
 * through the same path a real answer takes: read it as the type, validate it,
 * render it. A schema that asks for a field the type does not have, or a
 * renderer that assumes a field the schema never requests, fails here rather
 * than in front of an investigator halfway through a build.
 */

type Schema = {
  type: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: string[];
};

/** The smallest value this schema permits, with one entry in every array. */
function sample(schema: Schema, key = ""): unknown {
  if (schema.enum?.length) return schema.enum[0];

  switch (schema.type) {
    case "string":
      // Ids have to look like ids, because the guards read their prefix.
      if (key.endsWith("_ids")) return [];
      return `sample ${key}`.trim();
    case "integer":
    case "number":
      return 1;
    case "boolean":
      return false;
    case "array":
      return schema.items ? [sample(schema.items, key)] : [];
    case "object": {
      const out: Record<string, unknown> = {};
      for (const [name, child] of Object.entries(schema.properties ?? {})) {
        out[name] = sample(child, name);
      }
      return out;
    }
    default:
      return null;
  }
}

/** Every key the schema requires, at every level, as dotted paths. */
function requiredPaths(schema: Schema, prefix = ""): string[] {
  const paths: string[] = [];
  if (schema.type === "object") {
    for (const name of schema.required ?? []) {
      const path = prefix ? `${prefix}.${name}` : name;
      paths.push(path);
      const child = schema.properties?.[name];
      if (child) paths.push(...requiredPaths(child, path));
    }
  }
  if (schema.type === "array" && schema.items) {
    paths.push(...requiredPaths(schema.items, `${prefix}[]`));
  }
  return paths;
}

describe("the schemas ask for what the types expect", () => {
  it("a conforming SAP answer reads as a plan, validates and renders", async () => {
    const front = sample(SAP_JSON_SCHEMA as unknown as Schema) as Record<string, unknown>;
    const back = sample(SAP_RULES_JSON_SCHEMA as unknown as Schema) as Record<string, unknown>;
    const spec = { ...front, ...back } as unknown as SapSpec;

    // Every field the type needs is present, so this compiles as a SapSpec and
    // the validator can run without reaching for something that is not there.
    expect(() => validateSap(spec)).not.toThrow();
    await expect(buildSapDocx(spec)).resolves.toBeInstanceOf(Buffer);
  });

  it("a conforming CRF answer reads as a form, validates and renders", async () => {
    const raw = sample(CRF_JSON_SCHEMA as unknown as Schema) as Record<string, unknown>;
    // The builder adds these two; the schema deliberately does not ask for them.
    const spec = { ...raw, title: "A study", labels: {} } as unknown as CrfSpec;

    expect(() => validateCrf(spec)).not.toThrow();
    await expect(buildCrfDocx(spec)).resolves.toBeInstanceOf(Buffer);
  });

  it("a conforming shell-tables answer reads as tables, validates and renders", async () => {
    const raw = sample(TABLES_JSON_SCHEMA as unknown as Schema) as Record<string, unknown>;
    const spec = { ...raw, title: "A study", labels: {} } as unknown as ShellTablesSpec;

    expect(() => validateTables(spec)).not.toThrow();
    await expect(buildTablesDocx(spec)).resolves.toBeInstanceOf(Buffer);
  });

  it("the two SAP stages between them cover every field the plan needs", () => {
    const asked = new Set([
      ...requiredPaths(SAP_JSON_SCHEMA as unknown as Schema),
      ...requiredPaths(SAP_RULES_JSON_SCHEMA as unknown as Schema),
    ]);

    // The sections the document renders and the guards check. A field the type
    // requires but neither stage asks for would arrive undefined every time.
    for (const field of [
      "title", "design", "setting", "guideline",
      "glance.primary_outcome", "glance.sample_size_basis",
      "picot.assembled_question", "estimand.endpoint", "estimand.intercurrent_strategy",
      "aim", "hypothesis", "sample_size_note", "priority_confounder_ids",
      "objectives", "variables", "outcomes", "analyses",
      "rules.missing_data", "rules.multiplicity", "rules.reproducibility",
      "populations", "baseline_comparison", "intercurrent_events",
      "testing_hierarchy", "subgroups", "interim", "steps",
      "assumption_checks", "flags",
    ]) {
      expect(asked, `no stage asks for ${field}`).toContain(field);
    }
  });

  it("neither stage asks for the statistical test, which code chooses", () => {
    const asked = [
      ...requiredPaths(SAP_JSON_SCHEMA as unknown as Schema),
      ...requiredPaths(SAP_RULES_JSON_SCHEMA as unknown as Schema),
    ];
    // test_override is the one deliberate escape hatch, and it carries a reason.
    expect(asked).not.toContain("analyses[].test");
    expect(asked).toContain("analyses[].test_override");
    expect(asked).toContain("analyses[].override_reason");
  });
});
