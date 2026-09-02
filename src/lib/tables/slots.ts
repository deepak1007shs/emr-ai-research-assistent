import fs from "node:fs";
import path from "node:path";
import type { ShellTable, TableBlock, TableRole } from "./types.ts";

/**
 * Where each table sits in the house skeleton.
 *
 * The slot is not the table's number. Tables are numbered from 1 through the
 * document, because that is what a supervisor writes when they say "see Table
 * 7" and what the analysis map cites. The slot is the sub-heading above it, so
 * a reader can see which part of the skeleton they are in, and so a missing one
 * can be noticed.
 *
 * Code assigns every slot but the descriptive ones. The role already says which
 * table this is: a crude effect is B4 wherever it appears. Only A1 to A7 need a
 * reader of the protocol, because nothing in the plan distinguishes a table of
 * comorbidities from a table of baseline investigations.
 */

export type SlotRule = {
  slot: string;
  block: TableBlock;
  /** The role that fills it, where code can tell. Null for the A slots. */
  role: TableRole | null;
  title: string;
  holds: string;
};

const RULES_PATH = path.join(process.cwd(), "src", "lib", "tables", "table-slots.md");

let cached: SlotRule[] | null = null;

export function loadSlots(source?: string): SlotRule[] {
  if (!source && cached) return cached;
  const text = source ?? fs.readFileSync(RULES_PATH, "utf8");

  const rules = text
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim()),
    )
    .filter((cells) => cells.length === 5)
    .filter((cells) => cells[0] !== "slot" && !/^-+$/.test(cells[0]))
    .map(([slot, block, role, title, holds]) => ({
      slot,
      block: block as TableBlock,
      role: role === "-" ? null : (role as TableRole),
      title,
      holds,
    }));

  if (!source) cached = rules;
  return rules;
}

/** The seven descriptive slots, for the model to choose from. */
export function descriptiveSlots(rules: SlotRule[] = loadSlots()): SlotRule[] {
  return rules.filter((r) => r.block === "descriptive");
}

/** The heading printed above a table, or null where the slot is unknown. */
export function slotTitle(slot: string | undefined, rules: SlotRule[] = loadSlots()): string | null {
  if (!slot) return null;
  const exact = rules.find((r) => r.slot === slot);
  if (exact) return exact.title;
  // C1.2 and D3 are numbered at build time; their titles come from the pattern.
  const pattern = rules.find((r) => r.slot === slot[0]);
  return pattern?.title ?? null;
}

/**
 * Stamps the slot on every table the plan produced.
 *
 * Run after the two halves are merged and ordered, because a secondary table's
 * slot depends on which objective it reports and how many tables that objective
 * already has. The descriptive tables keep the slot the model gave them.
 */
export function assignSlots(
  tables: ShellTable[],
  objectiveOrder: string[],
  rules: SlotRule[] = loadSlots(),
): ShellTable[] {
  const byRole = new Map(rules.filter((r) => r.role).map((r) => [`${r.block}:${r.role}`, r.slot]));

  // How many tables each secondary objective has had so far, and which C number
  // it was given. Numbered by the order the objectives are declared, not the
  // order their tables happen to appear.
  const secondaries = objectiveOrder.filter((id) => id.startsWith("S"));
  const counts = new Map<string, number>();
  let exploratory = 0;

  // A primary objective usually has one outcome, and then B1 is the whole of
  // it. One protocol's primary objective covers eleven: the clinical features,
  // the diagnostic criteria, the cytopenia pattern, the marrow findings and so
  // on. All eleven were stamped B1, so the document carried eleven sections
  // headed "B1 - Primary outcome" and a reader could not cite any of them.
  const primaryOutcomes = tables.filter(
    (t) => t.block === "primary" && t.role === "outcome",
  ).length;
  let primarySeen = 0;

  return tables.map((table) => {
    if (table.block === "descriptive") {
      // The writer chose the A slot for a baseline table, but the flow table is
      // built by code and its slot is known from its role.
      const byBlock = byRole.get(`descriptive:${table.role}`);
      return byBlock ? { ...table, slot: byBlock } : table;
    }

    if (table.block === "primary") {
      const slot = byRole.get(`primary:${table.role}`) ?? table.slot;
      // Numbered only where there is more than one, so the ordinary study keeps
      // the plain B1 a reader already knows.
      if (table.role === "outcome" && primaryOutcomes > 1) {
        primarySeen += 1;
        return { ...table, slot: `${slot}.${primarySeen}` };
      }
      return { ...table, slot };
    }

    if (table.block === "secondary") {
      const objective = (table.fills ?? []).find((id) => secondaries.includes(id));
      if (!objective) return table;
      const n = secondaries.indexOf(objective) + 1;
      const m = (counts.get(objective) ?? 0) + 1;
      counts.set(objective, m);
      return { ...table, slot: `C${n}.${m}` };
    }

    exploratory += 1;
    return { ...table, slot: `D${exploratory}` };
  });
}
