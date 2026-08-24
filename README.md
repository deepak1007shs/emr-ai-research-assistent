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

## Cost

Roughly **$0.30–0.50** per review on a 60-page protocol (Claude Opus 5, xhigh
effort), dropping to around $0.15 once the knowledge base is cache-warm.

## Not in this step

SAP generation and CRF generation.
