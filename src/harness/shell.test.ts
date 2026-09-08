import { renderToStaticMarkup } from "react-dom/server";
import { Logo } from "@/components/logo";
import { createElement as h } from "react";
import { writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { it, vi } from "vitest";

// The rail and the composer reach for the router. This harness renders them to
// look at, not to navigate.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  useSelectedLayoutSegments: () => [],
  useSelectedLayoutSegment: () => null,
}));
import { ProtocolRail } from "../components/protocol-rail.tsx";
import { ShellTableSection } from "../components/tables-preview.tsx";
import { ReviewRail } from "../components/review-rail.tsx";
import { DocumentToolbar } from "../components/document-toolbar.tsx";
import { tablesFixture } from "../lib/tables/fixture.ts";
import { tableNumberIn } from "../lib/workspace/findings.ts";
import type { ProtocolRow, DocKind } from "../lib/workspace/rail.ts";
import type { Finding } from "../lib/sap/validate.ts";

const d = (id: string | null, kind: DocKind, over: object = {}) => ({
  kind, id, stale: false, behindAnswers: false, errors: 0, warnings: 0, ...over,
});

const protocols: ProtocolRow[] = [
  { id: "p1", filename: "Satyanarayana \u2014 DM Thesis (Final)", created_at: "2026-08-26",
    documents: { review: d("r", "review"), sap: d("s", "sap"), crf: d("c", "crf", { errors: 2 }) } },
  { id: "p2", filename: "Laparoscopic conversion \u2014 cohort", created_at: "2026-08-20",
    documents: { review: d("r2", "review"), sap: d(null, "sap"), crf: d(null, "crf") } },
  { id: "p3", filename: "Thyroid FNAC diagnostic accuracy", created_at: "2026-08-11",
    documents: { review: d("r3", "review"), sap: d("s3", "sap", { stale: true }), crf: d(null, "crf") } },
];

const findings: Finding[] = [
  { code: "TBL19", severity: "ERROR", message: "S1 is reported by both Table 4 and Table 5. One analysis, one table." },
  { code: "TBL19", severity: "ERROR", message: "S2 is reported by both Table 4 and Table 3. One analysis, one table." },
  { code: "TBL16", severity: "ERROR", message: "Table 4 reports operative duration, but S1, which it says it fills, measures intraoperative conversion." },
  { code: "TBL08", severity: "WARN", message: "Table 1 does not carry its denominator. A table without (n = ...) cannot be read alone." },
  { code: "TBL08", severity: "WARN", message: "Table 2 does not carry its denominator. A table without (n = ...) cannot be read alone." },
  { code: "TBL18", severity: "WARN", message: "Table 4 adjusts for Age, which S1 does not list as a predictor." },
];

const flagged = new Set(findings.map((f) => tableNumberIn(f.message)).filter((n): n is number => n !== null));

/**
 * A viewing harness, not a test.
 *
 * It renders the whole shell to a file so the design can be looked at rather
 * than reasoned about, and it lives here because vitest is the only pipeline in
 * the repo that compiles JSX. Set OUT to run it:
 *
 *   OUT=/tmp/shell.html npx vitest run src/harness/shell.test.ts
 */
it.skipIf(!process.env.OUT)("writes the shell harness", async () => {
  const page = h("div", { className: "flex h-screen flex-col overflow-hidden bg-bg" },
    h("header", { className: "flex h-[var(--header-h)] shrink-0 items-center gap-4 border-b border-line bg-surface px-4" },
      h("div", { className: "flex shrink-0 items-center gap-2.5" },
        // The mark, as the header ships it. The harness exists to show what the
        // page really looks like, so a stand-in here would make it lie again.
        Logo({ className: "size-6 shrink-0" }),
        h("span", { className: "text-base font-semibold tracking-tight text-ink" }, "EMR AI Research Assistant")),
      h("span", { className: "h-5 w-px shrink-0 bg-line" }),
      h("nav", { className: "flex min-w-0 flex-1 items-center gap-1.75 text-sm text-ink-3" },
        h("span", { className: "max-w-[16rem] truncate" }, "Satyanarayana \u2014 DM Thesis (Final)"),
        h("span", { className: "text-line-3" }, "/"),
        h("span", { className: "font-semibold text-ink" }, "Shell tables")),
      h("div", { className: "flex shrink-0 items-center gap-2" },
        h("span", { className: "flex size-[1.875rem] items-center justify-center rounded-md border border-line bg-surface text-ink-3" }, "\u263e"),
        h("div", { className: "flex h-[1.875rem] items-center gap-2 rounded-full border border-line bg-surface pr-2.5 pl-1" },
          h("span", { className: "flex size-[1.375rem] items-center justify-center rounded-full bg-brand-100 text-2xs font-bold text-brand-ink" }, "DE"),
          h("span", { className: "text-xs font-medium text-ink-2" }, "deepak1007shs")))),
    h("div", { className: "flex min-h-0 flex-1" },
      h("aside", { className: "panel-type flex w-[var(--rail-w)] shrink-0 flex-col border-r border-line bg-surface" },
        h(ProtocolRail, { protocols, activeProtocolId: "p1", activeDoc: "sap" as DocKind })),
      h("div", { className: "flex min-h-0 min-w-0 flex-1 flex-col" },
        h(DocumentToolbar, { title: "Analysis plan", status: "built" as const,
          meta: ["5 tables", "3 versions \u00b7 built 27 Aug 2026"], downloadHref: "#",
          children: h("button", { className: "btn btn-quiet" }, "Rebuild") }),
        h("div", { className: "flex min-h-0 flex-1" },
          h("section", { className: "min-w-0 flex-1 overflow-y-auto py-6 pb-10" },
            h(ShellTableSection, { spec: tablesFixture, flagged })),
          h(ReviewRail, { findings }))))
  );

  // The stylesheet is copied in beside this file, and a copy goes stale. The
  // harness exists to show what ships, so a stale one is worse than no
  // screenshot at all: it once showed the wrong panel scale, and then the wrong
  // brand colour, and both times it looked right.
  const cssPath = new URL("app.css", pathToFileURL(process.env.OUT!));
  const shipped = readFileSync("src/app/globals.css", "utf8").match(/--brand:\s*(#[0-9a-f]{6})/i)?.[1];
  const harnessed = existsSync(cssPath)
    ? readFileSync(cssPath, "utf8").match(/--brand:\s*(#[0-9a-f]{6})/i)?.[1]
    : null;
  if (shipped && harnessed && shipped.toLowerCase() !== harnessed.toLowerCase()) {
    throw new Error(
      `app.css beside the harness is stale: it has --brand ${harnessed}, the app has ${shipped}. ` +
        `Refresh it from the running dev server before trusting the screenshot.`,
    );
  }

  const html = `<!doctype html><html data-theme="${process.env.THEME ?? "light"}"><head><meta charset="utf-8"><link rel="stylesheet" href="app.css"></head><body>${renderToStaticMarkup(page)}</body></html>`;
  await writeFile(process.env.OUT!, html);
});
