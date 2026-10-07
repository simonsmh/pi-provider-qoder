import type { ExtensionContext, ReadonlyFooterDataProvider, Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import {
  formatCredits,
  QODER_STATUS_KEY,
  quotaDetails,
  quotaSummary,
  renderCreditFooter,
  singleLine,
} from "../credit-footer.js";
import type { QuotaState } from "../quota.js";

const theme = { fg: (_color: string, text: string) => text } as Theme;
const state: QuotaState = {
  status: "fresh",
  snapshot: { userQuota: { total: 1000, used: 127.5, remaining: 872.5, unit: "credits" }, expiresAt: 1790812800000 },
};
function context(entries: unknown[] = []): ExtensionContext {
  return {
    cwd: "/demo/pi-provider-qoder",
    model: { provider: "qoder", id: "Qwen3.8-Max", contextWindow: 1000000, reasoning: true },
    thinkingLevel: "high",
    sessionManager: { getEntries: () => entries, getSessionName: () => "Credit demo" },
    getContextUsage: () => ({ percent: 4.2, tokens: 42000, contextWindow: 1000000 }),
  } as unknown as ExtensionContext;
}
const footer: ReadonlyFooterDataProvider = {
  getGitBranch: () => "credit-prototype",
  getAvailableProviderCount: () => 2,
  getExtensionStatuses: () =>
    new Map([
      ["other", "other extension: ready"],
      [QODER_STATUS_KEY, "duplicate quota"],
    ]),
  onBranchChange: () => () => {},
};
const usage = {
  input: 100,
  output: 20,
  cacheRead: 300,
  cacheWrite: 100,
  totalTokens: 520,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

describe("credit footer", () => {
  it("accumulates actual deductions separately for Global and CN and exposes incomplete history", () => {
    const entries = [
      {
        type: "message",
        message: {
          role: "assistant",
          provider: "qoder",
          usage: { ...usage, credits: 0.005221428571428571, billable: false },
        },
      },
      {
        type: "message",
        message: { role: "assistant", provider: "qoder-cn", usage: { ...usage, credits: 0.000613272, billable: true } },
      },
      {
        type: "message",
        message: { role: "assistant", provider: "qoder-cn", usage: { ...usage, credits: 0.001, billable: true } },
      },
      { type: "message", message: { role: "assistant", provider: "qoder-cn", usage } },
      {
        type: "message",
        message: { role: "assistant", provider: "another", usage: { ...usage, credits: 100, billable: true } },
      },
    ];
    const restored = JSON.parse(JSON.stringify(entries));
    const output = renderCreditFooter(context(restored), footer, theme, state, 150).join("\n");
    expect(output).toContain("Qoder session: 0 Credits (1 non-billable)");
    expect(output).toContain("Qoder CN session: 0.00161327 Credits (1 unknown)");
    expect(output).not.toContain("100 Credits");
  });
  it("shows add-on balance when the personal plan has no allowance", () => {
    const output = quotaSummary({
      status: "fresh",
      snapshot: {
        userQuota: { total: 0, used: 0, remaining: 0, unit: "credits" },
        addOnQuota: { total: 300, used: 0, remaining: 300, unit: "credits" },
      },
    }).join("\n");
    expect(output).toContain("Qoder add-on: 0 used · 300 left (credits)");
  });
  it("includes attributed standalone, summary and tool credits in the restored session total", () => {
    const credited = { ...usage, qoder_provider: "qoder-cn", credits: 0.5, billable: true };
    const entries = [
      { type: "usage", usage: credited },
      { type: "message", message: { role: "toolResult", usage: credited } },
      { type: "compaction", usage: credited },
      { type: "branch_summary", usage: credited },
    ];
    const output = renderCreditFooter(context(entries), footer, theme, state, 150).join("\n");
    expect(output).toContain("Qoder CN session: 2 Credits");
  });
  it("labels quota as account period, never as money or session spend", () => {
    const output = renderCreditFooter(context(), footer, theme, state, 150).join("\n");
    expect(output).toContain("Qoder account period: 127.5 used · 872.5 left (credits)");
    expect(output).toContain("Qwen3.8-Max • high");
    expect(output).toContain("4.2%/1.0M");
    expect(output).toContain("other extension: ready");
    expect(output).toContain("credit-prototype");
    expect(output).not.toContain("$");
    expect(output).not.toContain("duplicate quota");
  });
  it("includes all session usage kinds and preserves real mixed-session dollars", () => {
    const entries = [
      { type: "message", message: { role: "assistant", usage } },
      { type: "usage", usage },
      { type: "message", message: { role: "toolResult", usage } },
      { type: "compaction", usage },
      { type: "branch_summary", usage: { ...usage, cost: { ...usage.cost, total: 0.03 } } },
    ];
    const output = renderCreditFooter(context(entries), footer, theme, state, 150).join("\n");
    expect(output).toContain("↑500 ↓100 R1.5k W500 CH60.0%");
    expect(output).toContain("session $0.030");
  });
  it.each([1, 8, 20, 40, 60, 80, 120])("fits width %i without hiding quota/model at normal narrow widths", (width) => {
    const lines = renderCreditFooter(context(), footer, theme, state, width);
    for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    if (width >= 40) {
      expect(lines.join(" ")).toContain("127.5 used");
      expect(lines.join(" ")).toContain("Qwen3.8-Max");
      expect(lines.join(" ")).toContain("other extension: ready");
    }
  });
  it("keeps zero separate from unknown and isolates personal and organization units", () => {
    const output = quotaSummary({
      status: "fresh",
      snapshot: {
        userQuota: { used: 0, unit: "credits" },
        orgResourcePackage: { used: 5, remaining: 0, unit: "requests" },
      },
    }).join("\n");
    expect(output).toContain("0 used · ? left (credits)");
    expect(output).toContain("Organization period: 5 used · 0 left (requests)");
    expect(formatCredits(undefined)).toBe("?");
  });
  it("shows loading, unavailable, stale and unknown context honestly", () => {
    expect(quotaSummary({ status: "loading" })[0]).toContain("loading");
    expect(quotaSummary({ status: "unavailable" })[0]).toContain("unavailable");
    expect(quotaSummary({ ...state, status: "stale" })[0]).toContain("[stale]");
    const ctx = context();
    ctx.getContextUsage = () => ({ percent: null, tokens: null, contextWindow: 1000000 });
    expect(renderCreditFooter(ctx, footer, theme, state, 150).join("\n")).toContain("?/1.0M");
    expect(quotaDetails(state, "qoder")).toContain("not this session's spend");
    expect(quotaDetails(state, "qoder")).toContain("Period expires:");
  });
  it("cannot emit terminal control characters from remote strings", () => {
    expect(singleLine("a\n\x1b[2J\x07b\u202ec")).not.toMatch(/\p{Cc}|\p{Cf}/u);
    expect(renderCreditFooter(context(), footer, theme, state, 0)).toEqual([]);
  });
});
