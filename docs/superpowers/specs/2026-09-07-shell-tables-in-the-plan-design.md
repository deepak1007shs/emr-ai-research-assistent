# The shell tables move into the plan, as Section 6

## Why

The plan already has a `Section 6 - Shell (Dummy) Tables`, and all it holds is a
sentence pointing somewhere else: the tables are laid out "in the Shell Tables
document that accompanies this plan". Two documents, one of which exists to say
where the other is.

The skill's own `SAP_FORMAT_REFERENCE.docx` puts the tables in the plan under
that heading, and a supervisor signs one document rather than reconciling two.

Decided: the standalone Shell Tables `.docx` stops being produced. Section 6
carries the numbered contents list and the slot sub-headings along with the
tables, and does not carry the standalone document's missing-data note or its
objective-to-table coverage check — the plan already fixes its missing-data
rules in Section 4 and links objectives to tables in Section 3, and a second
statement of either is a second thing that can disagree.

## The change

### One definition of a drawn table

`src/lib/render/tables-docx.ts` grew the grid two days ago: `shellGrid`,
`shellCell`, `footnote`, and `describeTable`, which draws a slot heading, a
numbered title, the grid, and the footnote naming the test. That rendering moves
to `src/lib/render/shell-tables.ts` and is called from `sap-docx.ts`.

It moves rather than being copied. Two renderers drawing the same table from the
same spec is the drift this change exists to end.

`buildSapDocx` takes the tables spec it is already given the numbers from:

```
buildSapDocx(spec, tableNumbers, { variant, shells })
```

`src/app/api/sap/[id]/export/route.ts` already fetches that spec to compute
`tableNumbers`, so it passes what it has. No new query.

### What Section 6 prints

The contents list from `contents()` in `src/lib/tables/describe.ts`, then, per
block in the house order, each table's slot sub-heading, `Table N: title`, the
drawn grid, and its footnote. Reused, not rewritten.

Where no tables have been built yet, Section 6 says so in one line instead of
printing an empty heading. The plan can be built before the tables exist and
must still render.

### The Markdown twin

`sap-md.ts` carries the same pointer sentence and must carry the same contents
list, or the two renderings of one plan disagree — which is the thing
`docx.test.ts` already exists to prevent for the review document.

### What goes

- `src/lib/render/tables-docx.ts` and its tests, the rendering having moved.
- `src/app/api/tables/[id]/export/route.ts`, the standalone download.
- The Shell Tables page keeps its on-screen preview, which is how the tables are
  read without opening Word. Its download button points at the plan's export and
  says that is where the tables now are.

## Testing

- Section 6 of the plan contains every table's number and title, its columns as
  a real grid, and its footnote.
- A plan built with no tables yet still renders, and says why Section 6 is empty.
- The contents list in Section 6 names the same tables as the grids beneath it,
  so a table cannot be listed and not drawn.
- `sap-md.ts` and `sap-docx.ts` name the same tables, held by a test that reads
  both, as the review document's two renderings already are.
- No route serves the standalone tables document any more.

## Verification

`npx vitest run`, `npx tsc --noEmit`, `npx eslint` — 619 passing today. Then
render the fixture plan and read Section 6 out of the finished `.docx`, rather
than trusting the helpers.
