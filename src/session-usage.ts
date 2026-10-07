import type { Usage } from "@earendil-works/pi-ai";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { chargedCredits, type QoderProvider, type QoderUsage } from "./credits.js";

export interface SessionCreditTotals {
  charged: number;
  known: number;
  unknown: number;
  free: number;
}

export interface SessionUsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  cacheHitRate?: number;
  credits: Map<QoderProvider, SessionCreditTotals>;
}

/** Rebuild whole-session accounting from persisted entries, independent of UI and quota requests. */
export function collectSessionUsage(entries: readonly SessionEntry[]): SessionUsageTotals {
  const totals: SessionUsageTotals = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    credits: new Map(),
  };
  const add = (usage: Usage, provider?: string) => {
    totals.input += usage.input;
    totals.output += usage.output;
    totals.cacheRead += usage.cacheRead;
    totals.cacheWrite += usage.cacheWrite;
    totals.cost += usage.cost.total;

    const creditUsage = usage as QoderUsage;
    const creditProvider = provider ?? creditUsage.qoder_provider;
    if (creditProvider !== "qoder" && creditProvider !== "qoder-cn") return;
    const creditTotals = totals.credits.get(creditProvider) ?? { charged: 0, known: 0, unknown: 0, free: 0 };
    const charged = chargedCredits(creditUsage);
    if (charged === undefined) creditTotals.unknown++;
    else {
      creditTotals.charged += charged;
      creditTotals.known++;
      if (creditUsage.billable === false) creditTotals.free++;
    }
    totals.credits.set(creditProvider, creditTotals);
  };

  for (const entry of entries) {
    if (entry.type === "usage") add(entry.usage, entry.provider);
    else if (entry.type === "message" && entry.message.role === "assistant") {
      add(entry.message.usage, entry.message.provider);
      const usage = entry.message.usage;
      const prompt = usage.input + usage.cacheRead + usage.cacheWrite;
      totals.cacheHitRate = prompt > 0 ? (usage.cacheRead / prompt) * 100 : undefined;
    } else if (entry.type === "message" && entry.message.role === "toolResult" && entry.message.usage) {
      add(entry.message.usage);
    } else if ((entry.type === "branch_summary" || entry.type === "compaction") && entry.usage) {
      add(entry.usage);
    }
  }
  return totals;
}
