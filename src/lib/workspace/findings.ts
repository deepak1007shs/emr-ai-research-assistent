import type { Finding } from "../sap/validate.ts";

/**
 * The validation findings, arranged the way a reviewer works through them.
 *
 * A flat list of twelve problems is a wall. Grouped by the rule that raised
 * them, it becomes three things to decide rather than twelve to read, and the
 * rule code is the thing a supervisor recognises and can look up.
 */

export type Severity = "Must fix" | "Should fix" | "Note";

/** ERROR stops the document being right; WARN is a judgement worth making. */
export function severityOf(finding: Finding): Severity {
  return finding.severity === "ERROR" ? "Must fix" : "Should fix";
}

export const SEVERITY_STYLE: Record<Severity, { chip: string; text: string }> = {
  "Must fix": { chip: "bg-warn-50 text-warn", text: "text-warn" },
  "Should fix": { chip: "bg-amber-50 text-amber", text: "text-amber" },
  Note: { chip: "bg-line-2 text-ink-2", text: "text-ink-3" },
};

export type Issue = {
  message: string;
  /** The table this is about, when the finding names one. */
  tableNumber: number | null;
};

export type IssueGroup = {
  code: string;
  severity: Severity;
  /** The shared part of the messages, or the first one where they share none. */
  title: string;
  issues: Issue[];
};

/**
 * The table a finding is about.
 *
 * Read out of the message rather than carried as a field: the validators write
 * "Table 4 reports ..." and adding a reference to every one of seventy-two
 * guards to say again what the sentence already says would be a lot of churn
 * for a link. Where a finding names no table, the card simply does not link.
 */
export function tableNumberIn(message: string): number | null {
  const match = message.match(/\bTable (\d+)/i);
  return match ? Number(match[1]) : null;
}

/** The words the messages of one group start with, which name the problem. */
function sharedTitle(messages: string[]): string {
  if (messages.length === 1) return messages[0];

  const words = messages.map((m) => m.split(/\s+/));
  const shared: string[] = [];
  for (let i = 0; i < words[0].length; i += 1) {
    const word = words[0][i];
    if (!words.every((w) => w[i] === word)) break;
    shared.push(word);
  }

  // Three words is the point where a shared opening is a description rather
  // than an accident of phrasing.
  const title = shared.join(" ").replace(/[,:;.]$/, "");
  return shared.length >= 3 ? title : messages[0];
}

export function groupFindings(findings: Finding[]): IssueGroup[] {
  const byCode = new Map<string, Finding[]>();
  for (const finding of findings) {
    byCode.set(finding.code, [...(byCode.get(finding.code) ?? []), finding]);
  }

  const groups = [...byCode].map(([code, list]) => ({
    code,
    severity: severityOf(list[0]),
    title: sharedTitle(list.map((f) => f.message)),
    issues: list.map((f) => ({
      message: f.message,
      tableNumber: tableNumberIn(f.message),
    })),
  }));

  // What must be fixed comes first, and within a severity the group with most
  // to answer for.
  const rank: Record<Severity, number> = { "Must fix": 0, "Should fix": 1, Note: 2 };
  return groups.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || b.issues.length - a.issues.length,
  );
}
