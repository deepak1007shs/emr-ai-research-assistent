/*
 * validate_study_spec.js — the build gate for study_spec.json
 *
 * Two layers, deliberately separated:
 *   Layer 1 (shape)      — a minimal JSON-Schema subset: types, enums, required,
 *                          patterns, unknown properties. Catches malformed data.
 *   Layer 2 (invariants) — the cross-object rules JSON Schema cannot express.
 *                          This is where the no-drift guarantee lives.
 *
 * ZERO DEPENDENCIES — pure Node core, so it runs from any directory and can be
 * dropped straight into another application or a CI job.
 *
 * Usage:
 *   node validate_study_spec.js <spec.json>            # draft gate
 *   node validate_study_spec.js <spec.json> --final    # submission gate
 *   node validate_study_spec.js <spec.json> --json     # machine-readable
 *   node validate_study_spec.js <spec.json> --quiet    # exit code only
 *
 * Exit code 0 = pass, 1 = fail.
 */
'use strict';

const fs = require('fs');
const SCHEMA = require('./study_spec.schema.json');

/* ---------- findings ------------------------------------------------- */

function finding(code, severity, path, message) {
  return { code, severity, path, message };
}

const ERROR = 'ERROR';
const WARN = 'WARN';

/* ---------- Layer 1: shape ------------------------------------------- */

function resolve(schema, root) {
  if (schema && schema.$ref) {
    const def = root.$defs && root.$defs[schema.$ref];
    if (!def) throw new Error('unresolved $ref: ' + schema.$ref);
    return def;
  }
  return schema;
}

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function typeMatches(value, expected) {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  if (expected === 'object') return actual === 'object';
  return actual === expected;
}

function checkShape(node, schema, path, findings, root) {
  const s = resolve(schema, root);
  if (!s) return;

  if (s.type && !typeMatches(node, s.type)) {
    findings.push(
      finding('SHP01', ERROR, path, `expected ${s.type}, found ${typeOf(node)}`),
    );
    return;
  }

  if (s.enum && !s.enum.includes(node)) {
    findings.push(
      finding(
        'SHP02',
        ERROR,
        path,
        `"${node}" is not one of: ${s.enum.join(', ')}`,
      ),
    );
    return;
  }

  if (s.pattern && typeof node === 'string' && !new RegExp(s.pattern).test(node)) {
    findings.push(
      finding('SHP05', ERROR, path, `"${node}" does not match ${s.pattern}`),
    );
  }

  if (s.type === 'object') {
    // `$ownedBy` marks a requirement Layer 2 enforces with a better message.
    for (const key of s.required || []) {
      if (node[key] === undefined) {
        findings.push(
          finding('SHP03', ERROR, path ? `${path}.${key}` : key, `required property is missing`),
        );
      }
    }
    if (s.additionalProperties === false && s.properties) {
      for (const key of Object.keys(node)) {
        if (!s.properties[key]) {
          findings.push(
            finding('SHP04', ERROR, path ? `${path}.${key}` : key, `unknown property`),
          );
        }
      }
    }
    for (const [key, sub] of Object.entries(s.properties || {})) {
      if (node[key] !== undefined) {
        checkShape(node[key], sub, path ? `${path}.${key}` : key, findings, root);
      }
    }
  }

  if (s.type === 'array') {
    if (s.minItems !== undefined && node.length < s.minItems) {
      findings.push(
        finding('SHP06', ERROR, path, `needs at least ${s.minItems} item(s), found ${node.length}`),
      );
    }
    if (s.items) {
      node.forEach((item, i) => checkShape(item, s.items, `${path}[${i}]`, findings, root));
    }
  }
}

/* ---------- the index every invariant group reads --------------------- */

/**
 * Walks the spec once and hands every group the lookups it needs, so no group
 * re-walks the object.
 */
function buildIndex(spec) {
  const byId = new Map();
  const labels = new Map();
  const duplicateIds = [];
  const duplicateLabels = [];

  const register = (obj, kind) => {
    if (!obj || typeof obj !== 'object' || !obj.id) return;
    if (byId.has(obj.id)) duplicateIds.push(obj.id);
    else byId.set(obj.id, { kind, obj });

    if (obj.label) {
      const key = String(obj.label).trim().toLowerCase();
      if (labels.has(key)) duplicateLabels.push({ label: obj.label, kind });
      else labels.set(key, { kind, id: obj.id });
    }
  };

  const list = (name) => (Array.isArray(spec[name]) ? spec[name] : []);

  for (const name of [
    'timepoints', 'objectives', 'outcomes', 'variables', 'analyses',
    'tables', 'crf_sections', 'populations', 'sensitivity_analyses', 'open_items',
  ]) {
    for (const obj of list(name)) register(obj, name);
  }
  for (const g of (spec.study && spec.study.groups) || []) register(g, 'groups');
  for (const c of (spec.eligibility && spec.eligibility.inclusion) || []) register(c, 'eligibility');
  for (const c of (spec.eligibility && spec.eligibility.exclusion) || []) register(c, 'exclusion');

  const index = (name, prefix) => {
    const map = new Map();
    for (const obj of list(name)) map.set(obj.id, obj);
    return map;
  };

  return {
    byId,
    labels,
    duplicateIds,
    duplicateLabels,
    timepoints: index('timepoints'),
    objectives: index('objectives'),
    outcomes: index('outcomes'),
    variables: index('variables'),
    analyses: index('analyses'),
    tables: index('tables'),
    sections: index('crf_sections'),
    populations: index('populations'),
    list,
  };
}

/* ---------- Layer 2: invariant groups -------------------------------- */

const GROUPS = [
  require('./invariants/referential'),
  require('./invariants/objectives'),
  require('./invariants/outcomes'),
  require('./invariants/variables'),
];

/* ---------- the gate -------------------------------------------------- */

/**
 * @param {object} spec
 * @param {{final?: boolean}} [options] `final` makes warnings fatal and blocks
 *   on unresolved open_items.
 */
function validate(spec, options) {
  const opts = options || {};
  const findings = [];

  checkShape(spec, SCHEMA, '', findings, SCHEMA);

  // Cross-object checks on a malformed object produce noise, not signal.
  const shapeFailed = findings.some((f) => f.severity === ERROR);
  if (!shapeFailed) {
    const ctx = buildIndex(spec);
    for (const group of GROUPS) {
      try {
        findings.push(...group.check(spec, ctx));
      } catch (e) {
        findings.push(
          finding('INT01', ERROR, group.name || 'invariants', `guard crashed: ${e.message}`),
        );
      }
    }
  }

  if (opts.final) {
    for (const item of (spec.open_items || [])) {
      findings.push(
        finding('FIN01', ERROR, `open_items.${item.id}`,
          `unresolved before submission: "${item.question}" — ${item.owner} must decide.`),
      );
    }
  }

  const fatal = opts.final
    ? findings
    : findings.filter((f) => f.severity === ERROR);

  return { ok: fatal.length === 0, findings };
}

module.exports = { validate, buildIndex, SCHEMA, finding, ERROR, WARN };

/* ---------- cli ------------------------------------------------------- */

if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const final = args.includes('--final');
  const asJson = args.includes('--json');
  const quiet = args.includes('--quiet');

  if (!file) {
    console.error('Usage: node validate_study_spec.js <spec.json> [--final] [--json] [--quiet]');
    process.exit(1);
  }

  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('Could not read/parse spec: ' + e.message);
    process.exit(1);
  }

  const { ok, findings } = validate(spec, { final });

  if (asJson) {
    process.stdout.write(JSON.stringify({ ok, findings }, null, 2) + '\n');
  } else if (!quiet) {
    for (const f of findings) {
      console.error(`${f.severity.padEnd(5)} ${f.code.padEnd(6)} ${f.path}`);
      console.error(`            ${f.message}`);
    }
    const errors = findings.filter((f) => f.severity === ERROR).length;
    const warns = findings.filter((f) => f.severity === WARN).length;
    console.error(ok ? `PASS (${warns} warning(s))` : `FAIL — ${errors} error(s), ${warns} warning(s)`);
  }

  process.exit(ok ? 0 : 1);
}
