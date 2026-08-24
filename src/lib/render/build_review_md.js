/*
 * build_review_md.js — Protocol Understanding & Review builder (Markdown)
 *
 * Turns a JSON spec into the standard 6-section protocol review as plain
 * GitHub-Flavored Markdown.
 *
 * Usage:  node build_review_md.js <spec.json> <output.md>
 *         node build_review_md.js <spec.json> -          # write to stdout
 *
 * ZERO DEPENDENCIES — pure Node core (fs). Runs anywhere Node runs, so the
 * same file can be dropped straight into another application.
 *
 * The spec shape is IDENTICAL to the .docx builder's, so an existing spec.json
 * renders through either builder unchanged.
 *
 * Spec shape (every field optional; omit a section to skip it):
 * {
 *   "subtitle": "Design · Objectives · Outcomes · Sample Size · Key Issues",
 *   "protocol_line": "Protocol reviewed: ...",
 *   "title":   { "as_written": "...", "suggestions": ["...", ...] },
 *   "type":    { "classification": "...", "suggestions": ["...", ...] },
 *   "peco":    { "framework": "PECO"|"PICO", "intro": "...",
 *                "rows": [["P — Population","..."], ...] },
 *   "objectives": {
 *       "primary":    { "objective": "...", "outcome": "..." },
 *       "secondary":  [ { "objective": "...", "outcome": "..." }, ... ],
 *       "exploratory":[ { "text": "...", "outcome": "..." }, ... ]
 *   },
 *   "sample_size": { "what_they_did": "...", "verdict": "...", "issues": ["...", ...] },
 *   "key_issues": [ ["Heading","Body sentence."], ... ],
 *   "footer": "...",
 *
 *   // optional compact variant only — never mix with the narrative sections
 *   "snapshot":     { "rows": [["Field","Detail"], ...] },
 *   "issues_table": { "intro": "...", "legend": "...",
 *                     "rows": [[area, issue, change, priority], ...] }
 * }
 *
 * There is NO variables section, by design. Variable problems belong in
 * `key_issues` as plain-words items.
 */
'use strict';
const fs = require('fs');

/* ---------- helpers ------------------------------------------------- */

const out = [];
const push = (s) => out.push(s);
const blank = () => { if (out.length && out[out.length - 1] !== '') out.push(''); };

// Collapse whitespace/newlines so a value never breaks a Markdown table row.
const clean = (v) => String(v == null ? '' : v).replace(/\s*\n\s*/g, ' ').trim();

// Escape the characters that would corrupt a table cell.
const cellText = (v) => clean(v).replace(/\|/g, '\\|');

// Body text: keep paragraph breaks, but trim stray indentation.
const bodyText = (v) => String(v == null ? '' : v).trim();

function heading(level, text) {
  blank();
  push('#'.repeat(level) + ' ' + clean(text));
  blank();
}

function para(text) {
  const t = bodyText(text);
  if (!t) return;
  blank();
  push(t);
  blank();
}

function labelled(label, text) {
  const t = bodyText(text);
  if (!t) return;
  blank();
  push(`**${clean(label)}** ${t}`);
  blank();
}

function bullets(items, indent) {
  const list = (items || []).filter((i) => bodyText(i));
  if (!list.length) return;
  blank();
  const pad = indent ? '  ' : '';
  list.forEach((i) => push(`${pad}- ${clean(i)}`));
  blank();
}

/**
 * GFM pipe table. `headers` is an array of column names; `rows` an array of
 * arrays. Rows shorter than the header are padded, longer rows are truncated,
 * so a malformed spec degrades instead of producing broken Markdown.
 */
function table(headers, rows) {
  const n = headers.length;
  blank();
  push('| ' + headers.map(cellText).join(' | ') + ' |');
  push('|' + headers.map(() => ' --- ').join('|') + '|');
  (rows || []).forEach((r) => {
    const cells = Array.isArray(r) ? r.slice(0, n) : [r];
    while (cells.length < n) cells.push('');
    push('| ' + cells.map(cellText).join(' | ') + ' |');
  });
  blank();
}

/* ---------- the document -------------------------------------------- */

function build(spec) {
  out.length = 0;

  // ---- header
  push('# Protocol Understanding & Review');
  blank();
  push('*' + clean(spec.subtitle || 'Design · Objectives · Outcomes · Sample Size · Key Issues') + '*');
  blank();
  push('---');
  blank();
  if (spec.protocol_line) para('**' + bodyText(spec.protocol_line) + '**');

  // ---- optional compact variant: Study snapshot
  if (spec.snapshot && spec.snapshot.rows) {
    heading(2, 'Study snapshot');
    table(['Field', 'Detail'], spec.snapshot.rows);
  }

  // ---- optional compact variant: Issues & Required Changes
  if (spec.issues_table) {
    heading(2, 'Issues & Required Changes');
    if (spec.issues_table.intro) para(spec.issues_table.intro);
    table(['Area', 'Issue in the study', 'Change needed', 'Priority'], spec.issues_table.rows || []);
    if (spec.issues_table.legend) para('*' + bodyText(spec.issues_table.legend) + '*');
  }

  // ---- 1. Title
  if (spec.title) {
    heading(2, '1. Title of the Study');
    if (spec.title.as_written) labelled('As written:', spec.title.as_written);
    if (spec.title.suggestions && spec.title.suggestions.length) {
      heading(3, 'Suggestions (only what is needed)');
      bullets(spec.title.suggestions);
    }
  }

  // ---- 2. Type of the study
  if (spec.type) {
    heading(2, '2. Type of the Study');
    if (spec.type.classification) labelled('Correct classification:', spec.type.classification);
    if (spec.type.suggestions && spec.type.suggestions.length) {
      heading(3, 'Suggestions (only what is needed)');
      bullets(spec.type.suggestions);
    }
  }

  // ---- 3. PICO / PECO
  if (spec.peco) {
    const fw = spec.peco.framework === 'PICO' ? 'PICO' : 'PECO';
    const kind = fw === 'PICO' ? 'Intervention' : 'Exposure';
    heading(2, `3. ${fw} (${kind} question)`);
    if (spec.peco.intro) para(spec.peco.intro);
    if (spec.peco.rows) table(['Element', 'Content'], spec.peco.rows);
  }

  // ---- 4. Objectives and their outcomes
  if (spec.objectives) {
    heading(2, '4. Objectives and Their Outcomes');
    const o = spec.objectives;

    if (o.primary) {
      heading(3, 'Primary objective');
      if (o.primary.objective) {
        blank();
        push('- **' + clean(o.primary.objective) + '**');
        if (o.primary.outcome) push('  - **Primary outcome:** ' + clean(o.primary.outcome));
        blank();
      } else if (o.primary.outcome) {
        labelled('Primary outcome:', o.primary.outcome);
      }
    }

    if (o.secondary && o.secondary.length) {
      heading(3, 'Secondary objectives and their outcomes');
      blank();
      o.secondary.forEach((s) => {
        push('- ' + clean(s.objective));
        if (s.outcome) push('  - **Outcome:** ' + clean(s.outcome));
      });
      blank();
    }

    if (o.exploratory && o.exploratory.length) {
      heading(3, 'Exploratory objectives (extra analyses that can be done)');
      blank();
      o.exploratory.forEach((e) => {
        push('- ' + clean(e.text));
        if (e.outcome) push('  - **Outcome:** ' + clean(e.outcome));
      });
      blank();
    }
  }

  // (No variables section — by design. Variable problems live in key_issues.)

  // ---- 5. Sample size
  if (spec.sample_size) {
    heading(2, '5. Sample Size — Is It Correct? Any Issues?');
    const s = spec.sample_size;
    if (s.what_they_did) labelled('What the protocol did:', s.what_they_did);
    if (s.verdict) labelled('Verdict:', s.verdict);
    if (s.issues && s.issues.length) {
      heading(3, 'Issues to fix');
      bullets(s.issues);
    }
  }

  // ---- 6. Very important issues
  if (spec.key_issues && spec.key_issues.length) {
    heading(2, '6. Very Important Issues to Address (in plain words)');
    para('The most important things to fix before the study starts:');
    spec.key_issues.forEach((item, i) => {
      const h = Array.isArray(item) ? item[0] : item.heading;
      const b = Array.isArray(item) ? item[1] : item.body;
      blank();
      push(`### ${i + 1}. ${clean(h)}`);
      blank();
      if (b) push(bodyText(b));
      blank();
    });
  }

  // ---- footer
  if (spec.footer) {
    blank();
    push('---');
    blank();
    push('*' + bodyText(spec.footer) + '*');
  }

  // Normalise: no more than one blank line in a row, single trailing newline.
  const text = out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  return text;
}

/* ---------- cli ------------------------------------------------------ */

function main() {
  const [, , specPath, outPath] = process.argv;
  if (!specPath || !outPath) {
    console.error('Usage: node build_review_md.js <spec.json> <output.md>');
    process.exit(1);
  }
  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  } catch (e) {
    console.error('Could not read/parse spec: ' + e.message);
    process.exit(1);
  }
  if (spec.variables) {
    console.error('Note: `variables` is ignored — this format has no variables section. ' +
                  'Move variable problems into `key_issues`.');
  }
  const md = build(spec);
  if (outPath === '-') {
    process.stdout.write(md);
  } else {
    fs.writeFileSync(outPath, md, 'utf8');
    console.log('Wrote ' + outPath + ' (' + md.split('\n').length + ' lines)');
  }
}

if (require.main === module) main();
module.exports = { build };
