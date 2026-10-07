/** Offline preview: actual extension renderer + pi-tui, entirely synthetic account/session data. */
import type { ExtensionContext, ReadonlyFooterDataProvider, Theme } from "@earendil-works/pi-coding-agent";
import { ProcessTerminal, TuiMainScreen, truncateToWidth } from "@earendil-works/pi-tui";
import { renderCreditFooter } from "../src/credit-footer.js";
import type { QuotaState } from "../src/quota.js";

const theme = {
  fg: (color: string, text: string) => {
    const colors: Record<string, number> = { dim: 37, accent: 36, warning: 33, error: 31 };
    return `\x1b[${colors[color] ?? 37}m${text}\x1b[0m`;
  },
} as Theme;
const quota: QuotaState = {
  status: "fresh",
  snapshot: { userQuota: { total: 1000, used: 127.5, remaining: 872.5, unit: "credits" } },
};
const usage = {
  input: 12800,
  output: 1600,
  cacheRead: 28600,
  cacheWrite: 900,
  totalTokens: 43900,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
const ctx = {
  cwd: "/demo/pi-provider-qoder",
  model: { provider: "qoder", id: "Qwen3.8-Max", contextWindow: 1000000, reasoning: true },
  thinkingLevel: "high",
  sessionManager: {
    getEntries: () => [{ type: "message", message: { role: "assistant", usage } }],
    getSessionName: () => "Credit footer preview",
  },
  getContextUsage: () => ({ percent: 4.2, tokens: 42000, contextWindow: 1000000 }),
} as unknown as ExtensionContext;
const footer: ReadonlyFooterDataProvider = {
  getGitBranch: () => "credit-prototype",
  getAvailableProviderCount: () => 2,
  getExtensionStatuses: () =>
    new Map([
      ["review", "review: ready"],
      ["tools", "tools: 4 enabled"],
    ]),
  onBranchChange: () => () => {},
};
let current = quota;
const terminal = new ProcessTerminal();
const tui = new TuiMainScreen(terminal);
const preview = {
  invalidate() {},
  handleInput(data: string) {
    if (data === "q" || data === "\u0003") {
      tui.stop();
      process.exit(0);
    }
    if (data === "f") current = quota;
    if (data === "s") current = { ...quota, status: "stale" };
    if (data === "u") current = { status: "unavailable" };
    if (data === "0")
      current = { status: "fresh", snapshot: { userQuota: { used: 0, remaining: 0, total: 0, unit: "credits" } } };
    tui.requestRender();
  },
  render(width: number) {
    const wide = Math.min(width, 112);
    const narrow = Math.min(width, 54);
    const rule = (w: number) => theme.fg("dim", "─".repeat(w));
    return [
      "",
      theme.fg("accent", "QODER  /  ACCOUNT CREDITS"),
      "LOCAL PROTOTYPE  •  SAMPLE DATA ONLY  •  NO LIVE ACCOUNT REQUESTS",
      "",
      "Same footer renderer used by /qoder-usage footer on",
      "Credit counts cover the account period, including other Qoder clients.",
      "",
      theme.fg("dim", "STANDARD TERMINAL"),
      rule(wide),
      ...renderCreditFooter(ctx, footer, theme, current, wide),
      rule(wide),
      "",
      theme.fg("dim", "NARROW TERMINAL  /  54 COLUMNS"),
      rule(narrow),
      ...renderCreditFooter(ctx, footer, theme, current, narrow),
      rule(narrow),
      "",
      theme.fg("dim", "f fresh  ·  s stale  ·  u unavailable  ·  0 zero quota  ·  q quit"),
      "",
    ].map((line) => truncateToWidth(line, width));
  },
};
tui.addChild(preview);
tui.setFocus(preview);
tui.start();
