# SAP Builder

Step 1 of the SAP Builder pipeline: turn a medical research protocol into a
structured **Protocol Understanding & Review**.

Upload a thesis protocol, synopsis, or research proposal and get back six
sections — title, study type, PICO/PECO, objectives and their outcomes, a
sample-size verdict, and the very important issues to fix — each stating what the
protocol says and the exact correction. Download it as `.md` or `.docx`.

## Setup

1. Put your Anthropic API key in `.env.local`:

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

   The Supabase values in that file are already filled in.

2. Install and run:

   ```bash
   npm install
   npm run dev
   ```

3. Open http://localhost:3000, create an account, and upload a protocol.

## How it works

```
upload → extract → analyse → ReviewSpec (JSON) → renderers → .md / .docx
```

Claude returns a **validated JSON spec**, not markdown. Structure is then a
schema check rather than a formatting hope, and one spec renders to both output
formats without a second analysis pass.

| Piece | Where |
|---|---|
| The reviewer's domain knowledge | `src/lib/protocol/knowledge/*.md` |
| Review schema (Zod + JSON Schema) | `src/lib/protocol/schema.ts` |
| File extraction (PDF / DOCX / text) | `src/lib/protocol/extract.ts` |
| The Claude call | `src/lib/protocol/analyze.ts` |
| Markdown builder (canonical) | `src/lib/render/build_review_md.js` |
| Word renderer (mirrors it) | `src/lib/render/docx.ts` |
| Database migrations | `supabase/migrations/` |

### The canonical builder

`src/lib/render/build_review_md.js` is vendored **verbatim** — the same
zero-dependency script used outside this app — and is the single source of truth
for the review format. It is excluded from lint and must not be edited here; a
format change belongs in that script, after which `docx.ts` and
`review-document.tsx` are updated to match. It still runs standalone:

```bash
node src/lib/render/build_review_md.js spec.json out.md
node src/lib/render/build_review_md.js spec.json -     # stdout
```

`docx.test.ts` proves the .docx carries every heading the Markdown builder
emits, so the two renderers cannot silently drift apart. There is no variables
section, by design — a spec carrying `variables` is rejected by the schema, and
variable problems belong in `key_issues`.

### Tuning the reviewer

The five files under `src/lib/protocol/knowledge/` **are** the analyser — the
study-design decision tree, the outcome chain, the sample-size formulas, the
coverage rules, and a full worked example that sets the standard for depth and
tone. Editing them changes how protocols are reviewed; no code change is needed. They are concatenated once per process and sit behind a prompt-cache
breakpoint, so repeat reviews are substantially cheaper.

PDFs go to Claude natively as document blocks, which keeps tables and layout
intact. DOCX is converted with `mammoth`. Nothing is ever truncated — a file too
large to send raises an error instead.

## Commands

```bash
npm run dev     # dev server
npm run build   # production build
npm test        # renderer and schema tests
npm run lint
```

## Cost and model policy

Every review records its own token usage, and the app shows it three ways: a
live meter while the review runs, a per-review breakdown on the review page, and
a running total on the home page. Rates live in
[`src/lib/protocol/pricing.ts`](src/lib/protocol/pricing.ts).

### Where the money actually goes

Measured on a real 45,000-character thesis protocol, run on Opus 5 at `xhigh`:

| | Tokens | Cost |
|---|---|---|
| Protocol read in | 16,872 | $0.08 |
| Knowledge base written to cache | 23,453 | $0.15 |
| Review written out | 21,590 | **$0.54** |
| | | **$0.77** |

**Output is ~70% of the bill.** That is the single most important fact for
tuning cost, and it is counter-intuitive: trimming the protocol barely helps
(the whole thesis cost eight cents to read), while thinking depth and the output
rate dominate. Prompt caching saves about $0.13 on a warm run — real, but small
next to the output side.

### Which model, which phase

The default is **Sonnet 5 at `high` effort**, set in
[`analyze.ts`](src/lib/protocol/analyze.ts) and overridable per environment:

```bash
REVIEW_MODEL=claude-opus-5   # for a final protocol that deserves more reasoning
REVIEW_EFFORT=xhigh
```

The rule of thumb across the pipeline: **spend on judgement, economise on
mechanics.** A phase that decides something everything downstream depends on
gets the better model; a phase that transforms already-decided content does not.

| Phase | Model | Why |
|---|---|---|
| Protocol review (this step) | Sonnet 5, `high` | The design classification and sample-size verdict are the judgements the SAP and CRF inherit. This is the one place worth paying for — move it to Opus 5 if the verdicts start disappointing. |
| SAP generation | Sonnet 5, `medium`–`high` | The hard call was already made and stored in the review spec; this phase turns a fixed design into an analysis plan. |
| CRF generation | Haiku 4.5 | Largely mechanical from the stored outcomes and variables. |
| Dummy tables, formatting, tidying | Haiku 4.5 | No methodological judgement involved. |
| Section extraction from huge theses | Not worth it | A cheap pre-pass to strip CVs and references would save ~$0.05. Input is not the problem. |

Effort is the cheaper lever than model in most cases: dropping `xhigh` to `high`
cuts thinking tokens without changing which model reasons about the protocol.
Reserve `max` for a protocol you already suspect is subtly wrong.

## Not in this step

SAP generation and CRF generation.
# emr-ai-research-assistent
