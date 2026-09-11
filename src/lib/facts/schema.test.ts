import { describe, expect, it } from "vitest";
import { z } from "zod";
import Ajv from "ajv";
import { FACTS_JSON_SCHEMA, factsSchema } from "./schema.ts";
import { idaPreg } from "./fixture.ts";

/**
 * The two schemas the Facts Sheet has, held against each other.
 *
 * `FACTS_JSON_SCHEMA` is what the model is shown and constrained to.
 * `factsSchema` is what the answer is parsed with. Every test in this
 * repository used the fixture, which never passes through either, so they were
 * free to drift - and they did, eight ways, found only by the first real run on
 * 11 Sep 2026:
 *
 * - covariates asked the model for `name` while the parser required `measure`
 *   and `at`;
 * - proforma items were missing `measure` and `purpose`;
 * - visits were missing `label`;
 * - `allocation.matched` was not required;
 * - `stated_rules.sided` put an enum under a type list, which the API rejects.
 *
 * Each came from a scripted edit that meant to change both and matched
 * nothing in one of them. Any one of the eight failed every real extraction,
 * and seven of them would have failed it after the protocol had been read and
 * paid for.
 */

const parser = z.toJSONSchema(factsSchema, { unrepresentable: "any" }) as Record<string, unknown>;

type Node = {
  type?: string | string[];
  anyOf?: Node[];
  properties?: Record<string, Node>;
  required?: string[];
  items?: Node;
  enum?: unknown[];
  additionalProperties?: unknown;
};

/** The non-null branch of a nullable node, which is where its shape is. */
const shapeOf = (node: Node | undefined): Node | undefined =>
  node?.anyOf ? (node.anyOf.find((b) => b.type !== "null") ?? node) : node;

const isArray = (node?: Node) =>
  node?.type === "array" || (Array.isArray(node?.type) && node.type.includes("array"));

/** Every disagreement between the schema the model sees and the parser. */
function differences(model: Node | undefined, zod: Node | undefined, path: string): string[] {
  const m = shapeOf(model);
  const p = shapeOf(zod);
  if (!m) return [`${path}: missing from the model's schema`];
  if (isArray(m)) return differences(m.items, p?.items, `${path}[]`);

  const found: string[] = [];
  if (Array.isArray(m.type) && m.enum) {
    found.push(`${path}: an enum under a type list, which the API rejects`);
  }
  if (m.type !== "object") return found;

  const modelKeys = Object.keys(m.properties ?? {});
  const parserKeys = Object.keys(p?.properties ?? {});
  for (const key of parserKeys) {
    if (!modelKeys.includes(key)) found.push(`${path}.${key}: required by the parser, never asked of the model`);
  }
  for (const key of modelKeys) {
    if (!parserKeys.includes(key)) found.push(`${path}.${key}: asked of the model, rejected by the parser`);
    if (!(m.required ?? []).includes(key)) found.push(`${path}.${key}: not in "required"`);
  }
  if (m.additionalProperties !== false) found.push(`${path}: additionalProperties is not false`);
  for (const key of modelKeys) {
    if (parserKeys.includes(key)) {
      found.push(...differences(m.properties?.[key], p?.properties?.[key], `${path}.${key}`));
    }
  }
  return found;
}

describe("the schema the model sees, against the schema its answer is parsed with", () => {
  it("agree on every field, at every depth", () => {
    expect(differences(FACTS_JSON_SCHEMA as unknown as Node, parser as Node, "facts")).toEqual([]);
  });

  it("would have caught the drift that reached the first real run", () => {
    // The check must be able to fail. Drop one field from a nested object in a
    // copy of the model's schema and it has to say so.
    const drifted = structuredClone(FACTS_JSON_SCHEMA) as unknown as Node;
    const item = drifted.properties!.covariates.items!;
    delete item.properties!.at;
    item.required = item.required!.filter((key) => key !== "at");
    expect(differences(drifted, parser as Node, "facts")).toContain(
      "facts.covariates[].at: required by the parser, never asked of the model",
    );
  });

  it("uses no form the API rejects", () => {
    const withTypeList = structuredClone(FACTS_JSON_SCHEMA) as unknown as Node;
    withTypeList.properties!.stated_rules.properties!.sided = {
      type: ["string", "null"],
      enum: ["one", "two", null],
    };
    expect(differences(withTypeList, parser as Node, "facts")).toContain(
      "facts.stated_rules.sided: an enum under a type list, which the API rejects",
    );
  });

  it("stays within the compiler's 16 nullable or union-typed fields", () => {
    // "Schemas contains too many parameters with union types (22 parameters
    // with type arrays or anyOf) ... limit: 16" - the second refusal from the
    // real API. A reused sub-schema counts once per place it appears, as the
    // compiler counts it: the outcome chain is the primary and every secondary.
    const unions = (node: Node | undefined): number => {
      if (!node) return 0;
      const own = Array.isArray(node.type) || node.anyOf ? 1 : 0;
      const branches = (node.anyOf ?? []).reduce((n, b) => n + unions(b), 0);
      const props = Object.values(node.properties ?? {}).reduce((n, p) => n + unions(p), 0);
      return own + branches + props + unions(node.items);
    };
    expect(unions(FACTS_JSON_SCHEMA as unknown as Node)).toBeLessThanOrEqual(16);
  });

  it("accepts the worked example written as the model writes it, and parses it back exactly", () => {
    // The model writes an empty string where the protocol is silent; the parser
    // turns it back into null. The worked example, written that way, has to be
    // accepted by the model's schema and come out of the parser unchanged, or
    // the tests are testing a Facts Sheet no real run can return.
    const asTheModelWrites = (value: unknown, node: Node | undefined): unknown => {
      const shape = shapeOf(node);
      if (value === null) return node?.type === "string" ? "" : null;
      if (Array.isArray(value)) return value.map((v) => asTheModelWrites(v, shape?.items));
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, asTheModelWrites(v, shape?.properties?.[k])]),
        );
      }
      return value;
    };
    const written = asTheModelWrites(
      JSON.parse(JSON.stringify(idaPreg)),
      FACTS_JSON_SCHEMA as unknown as Node,
    );

    const validate = new Ajv({ allErrors: true }).compile(FACTS_JSON_SCHEMA);
    const valid = validate(written);
    expect(validate.errors ?? []).toEqual([]);
    expect(valid).toBe(true);

    const parsed = factsSchema.parse(written);
    expect(parsed).toEqual(JSON.parse(JSON.stringify(idaPreg)));
  });
});
