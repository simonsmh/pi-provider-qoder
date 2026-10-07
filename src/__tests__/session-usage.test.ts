import { readFileSync } from "node:fs";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { applyQoderCredits, type QoderProvider, type QoderUsage } from "../credits.js";
import { collectSessionUsage, SessionUsageCache } from "../session-usage.js";

const fixtures = JSON.parse(readFileSync(new URL("../__fixtures__/billing/usage.json", import.meta.url), "utf8")) as {
  requests: {
    name: string;
    provider: QoderProvider;
    usage: { credits: number; original_credits: number; billable: boolean };
  }[];
};
function usage(): QoderUsage {
  return {
    input: 10,
    output: 2,
    cacheRead: 30,
    cacheWrite: 0,
    totalTokens: 42,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}
function entries(values: unknown[]): SessionEntry[] {
  return values as SessionEntry[];
}

describe("session usage accounting", () => {
  it("rebuilds exact paid and free totals from recorded usage after serialization", () => {
    const history = entries(
      fixtures.requests.map((sample) => {
        const result = usage();
        applyQoderCredits(result, sample.usage, sample.provider);
        applyQoderCredits(result, sample.usage, sample.provider);
        return { type: "message", message: { role: "assistant", provider: sample.provider, usage: result } };
      }),
    );
    const total = collectSessionUsage(history);
    expect(total.credits.get("qoder")).toEqual({
      charged: 0.0009810014285714286 + 0.09700485 + 0.9294464699999999 + 0.10240511999999999,
      known: 6,
      unknown: 0,
      free: 2,
    });
    expect(total.credits.get("qoder-cn")?.charged).toBe(0.0006132719999999999);
    expect(collectSessionUsage(JSON.parse(JSON.stringify(history)))).toEqual(total);
    expect(collectSessionUsage(history)).toEqual(total);
    const threshold = collectSessionUsage(history.slice(4, 6));
    expect(threshold.credits.get("qoder")?.charged).toBeCloseTo(1.03185159, 12);
    expect(total.cost).toBe(0);
  });

  it("attributes standalone usage and metadata-bearing tools and summaries while exposing old unknown usage", () => {
    const billed = { ...usage(), credits: 1, billable: true, qoder_provider: "qoder" };
    const history = entries([
      { type: "usage", provider: "qoder-cn", usage: billed },
      { type: "message", message: { role: "toolResult", usage: billed } },
      { type: "compaction", usage: billed },
      { type: "branch_summary", usage: billed },
      { type: "message", message: { role: "assistant", provider: "qoder", usage: usage() } },
      {
        type: "message",
        message: { role: "assistant", provider: "other", usage: { ...billed, cost: { ...billed.cost, total: 0.5 } } },
      },
    ]);
    const result = collectSessionUsage(history);
    expect(result.credits.get("qoder")).toEqual({ charged: 3, known: 3, unknown: 1, free: 0 });
    expect(result.credits.get("qoder-cn")?.charged).toBe(1);
    expect(result.input).toBe(60);
    expect(result.cacheHitRate).toBe(75);
    expect(result.cost).toBe(0.5);
  });
});

it("caches unchanged renders and invalidates on leaf, session or manager changes", () => {
  const cache = new SessionUsageCache();
  let reads = 0;
  let leaf = "a";
  let session = "first";
  const manager = {
    getSessionId: () => session,
    getLeafId: () => leaf,
    getEntries: () => {
      reads++;
      return entries([]);
    },
  };
  const first = cache.read(manager);
  expect(cache.read(manager)).toBe(first);
  expect(reads).toBe(1);
  leaf = "b";
  expect(cache.read(manager)).not.toBe(first);
  session = "second";
  cache.read(manager);
  cache.read({ ...manager });
  expect(reads).toBe(4);
});
