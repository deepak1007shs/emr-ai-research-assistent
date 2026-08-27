"use client";

import { useState, type ReactNode } from "react";
import { ChevronRightIcon } from "./icons";
import {
  SEVERITY_STYLE,
  groupFindings,
  type Severity,
} from "@/lib/workspace/findings";
import type { Finding } from "@/lib/sap/validate";

/**
 * What the checks found, beside the document rather than buried under it.
 *
 * Grouped by the rule that raised them, because twelve problems in a flat list
 * is a wall and three rules is three decisions. Clicking an issue scrolls the
 * document to the table it is about, so the finding and the thing it is about
 * are on screen together.
 */

const FILTERS: (Severity | "All")[] = ["All", "Must fix", "Should fix"];

export function ReviewRail({
  findings,
  /** Docked at the foot: the composer, which knows how to stream. */
  children,
}: {
  findings: Finding[];
  children?: ReactNode;
}) {
  const groups = groupFindings(findings);
  const [filter, setFilter] = useState<Severity | "All">("All");
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    // The first group is open, because a rail that opens closed looks empty.
    groups.length ? { [groups[0].code]: true } : {},
  );

  const shown = groups.filter((g) => filter === "All" || g.severity === filter);
  const mustFix = findings.filter((f) => f.severity === "ERROR").length;

  return (
    <aside className="panel-type no-print hidden w-[var(--review-w)] shrink-0 flex-col border-l border-line bg-surface xl:flex">
      <div className="shrink-0 border-b border-line-2 px-4 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-tight text-ink">Review</span>
          {findings.length > 0 && (
            <span
              className={`tnum inline-flex h-4.5 items-center rounded-full px-1.75 text-2xs font-bold ${
                mustFix ? "bg-warn-50 text-warn" : "bg-amber-50 text-amber"
              }`}
            >
              {findings.length}
            </span>
          )}
        </div>
        <p className="mt-1.5 mb-2.5 text-xs leading-relaxed text-ink-3">
          {findings.length
            ? "Judgements a supervisor would make. The document is still downloadable."
            : "Nothing was flagged when this was built."}
        </p>

        {groups.length > 1 && (
          <div className="flex gap-1.25">
            {FILTERS.map((label) => {
              const active = filter === label;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setFilter(label)}
                  className={`h-6.25 rounded-full border px-2.25 text-xs font-semibold transition-colors ${
                    active
                      ? "border-brand-200 bg-brand-50 text-brand-ink"
                      : "border-line bg-surface text-ink-3 hover:border-brand-200"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pt-2 pb-3.5">
        {!shown.length && (
          <p className="px-2 py-3 text-xs text-ink-4">
            {findings.length ? "Nothing at this severity." : "Nothing to review."}
          </p>
        )}

        {shown.map((group) => {
          const isOpen = Boolean(open[group.code]);
          const style = SEVERITY_STYLE[group.severity];

          return (
            <div key={group.code} className="mb-1.5">
              <button
                type="button"
                onClick={() => setOpen((c) => ({ ...c, [group.code]: !c[group.code] }))}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.75 text-left transition-colors hover:bg-bg"
              >
                <ChevronRightIcon
                  size={13}
                  className={`text-ink-4 transition-transform duration-150 ${
                    isOpen ? "rotate-90" : ""
                  }`}
                />
                <span
                  className={`shrink-0 rounded-sm px-1.25 py-0.5 font-mono text-2xs ${style.chip}`}
                >
                  {group.code}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-2">
                  {group.title}
                </span>
                <span className="tnum shrink-0 text-2xs text-ink-4">{group.issues.length}</span>
              </button>

              {isOpen && (
                <div className="my-0.5 ml-6.5 flex flex-col gap-1">
                  {group.issues.map((issue, i) => {
                    const body = (
                      <>
                        <span className="block text-xs leading-relaxed text-ink">
                          {issue.message}
                        </span>
                        {issue.tableNumber !== null && (
                          <span className="mt-1.25 flex items-center gap-1.5">
                            <span className="text-2xs text-ink-3">
                              Table {issue.tableNumber}
                            </span>
                            <span className="flex-1" />
                            <span className="text-2xs font-semibold text-brand">Go to it →</span>
                          </span>
                        )}
                      </>
                    );

                    const shell =
                      "block rounded-lg border border-line-2 bg-surface-2 px-2.5 py-2 transition-colors";

                    return issue.tableNumber !== null ? (
                      <a
                        key={i}
                        href={`#table-${issue.tableNumber}`}
                        className={`${shell} no-underline hover:border-brand-200 hover:bg-brand-50`}
                      >
                        {body}
                      </a>
                    ) : (
                      <div key={i} className={shell}>
                        {body}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {children}
    </aside>
  );
}
