import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Usage } from "@earendil-works/pi-ai";
import type { ExtensionContext, ReadonlyFooterDataProvider, Theme } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { chargedCredits, type QoderUsage } from "./credits.js";
import type { QuotaBucket, QuotaState } from "./quota.js";

export function qoderMode(provider: string | undefined) {
  return provider === "qoder" ? "global" : provider === "qoder-cn" ? "cn" : undefined;
}

// All remote/status text is data, never terminal control sequences.
export function singleLine(text: string): string {
  return stripTerminalSequences(text)
    .replace(/\p{Cc}|\p{Cf}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatCredits(value: number | undefined): string {
  if (value === undefined) return "?";
  if (value > 0 && value < 0.00000001) return "<0.00000001";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(value);
}

function bucketText(bucket: QuotaBucket): string {
  const unit = bucket.unit ? singleLine(bucket.unit) : "units unknown";
  return `${formatCredits(bucket.used)} used · ${formatCredits(bucket.remaining)} left (${unit})`;
}

export function quotaSummary(state: QuotaState | undefined, provider = "qoder"): string[] {
  const name = provider === "qoder-cn" ? "Qoder CN" : "Qoder";
  const suffix = state?.status === "stale" ? " [stale]" : state?.status === "loading" ? " [updating]" : "";
  if (!state?.snapshot) {
    return [`${name} account period: ${state?.status === "loading" ? "loading…" : "quota unavailable"}`];
  }
  const { userQuota, addOnQuota, orgResourcePackage } = state.snapshot;
  const lines = [
    `${name} account period: ${userQuota ? bucketText(userQuota) : "personal quota unavailable"}${suffix}`,
  ];
  if (addOnQuota) lines.push(`${name} add-on: ${bucketText(addOnQuota)}${suffix}`);
  if (orgResourcePackage) lines.push(`Organization period: ${bucketText(orgResourcePackage)}${suffix}`);
  return lines;
}

export function quotaDetails(state: QuotaState | undefined, provider: string): string {
  const lines = quotaSummary(state, provider);
  if (state?.snapshot) {
    for (const [name, bucket] of [
      ["Personal", state.snapshot.userQuota],
      ["Add-on", state.snapshot.addOnQuota],
      ["Organization", state.snapshot.orgResourcePackage],
    ] as const) {
      if (bucket?.total !== undefined) lines.push(`${name} period allowance: ${formatCredits(bucket.total)}`);
    }
    if (state.snapshot.expiresAt !== undefined) {
      lines.push(`Period expires: ${new Date(state.snapshot.expiresAt).toISOString()}`);
    }
  }
  lines.push("Account-wide period totals, including other Qoder clients; not this session's spend.");
  if (state?.status === "stale") {
    lines.push(
      state.error
        ? "Refresh failed. Showing the last successful account snapshot."
        : "Cached account snapshot is older than the refresh interval. Run /qoder-usage to refresh.",
    );
  }
  return lines.join("\n");
}

function compact(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

function displayPath(cwd: string): string {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return cwd;
  const path = relative(resolve(home), resolve(cwd));
  return path === ""
    ? "~"
    : path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path)
      ? `~${sep}${path}`
      : cwd;
}

export const QODER_STATUS_KEY = "qoder-quota";

/** Whole-session totals rebuilt from persisted request-level usage, including auxiliary calls. */
export function sessionCreditSummary(ctx: ExtensionContext): string[] {
  const credits = new Map<string, { charged: number; known: number; unknown: number; free: number }>();
  const add = (usage: Usage, provider?: string) => {
    const creditUsage = usage as QoderUsage;
    const creditProvider = provider ?? creditUsage.qoder_provider;
    if (creditProvider && qoderMode(creditProvider)) {
      const total = credits.get(creditProvider) ?? { charged: 0, known: 0, unknown: 0, free: 0 };
      const charged = chargedCredits(creditUsage);
      if (charged === undefined) total.unknown++;
      else {
        total.charged += charged;
        total.known++;
        if (creditUsage.billable === false) total.free++;
      }
      credits.set(creditProvider, total);
    }
  };
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "usage") add(entry.usage);
    else if (entry.type === "message" && entry.message.role === "assistant")
      add(entry.message.usage, entry.message.provider);
    else if (entry.type === "message" && entry.message.role === "toolResult" && entry.message.usage)
      add(entry.message.usage);
    else if ((entry.type === "branch_summary" || entry.type === "compaction") && entry.usage) add(entry.usage);
  }
  const lines: string[] = [];
  for (const [provider, total] of credits) {
    const name = provider === "qoder-cn" ? "Qoder CN" : "Qoder";
    const amount = total.known ? formatCredits(total.charged) : "?";
    const notes = [
      total.free ? `${total.free} non-billable` : "",
      total.unknown ? `${total.unknown} unknown` : "",
    ].filter(Boolean);
    const line = `${name} session: ${amount} Credits${notes.length ? ` (${notes.join(", ")})` : ""}`;
    lines.push(line);
  }
  return lines;
}

/** Read request Credits from session messages; account quota is shown separately. */
export function renderCreditFooter(
  ctx: ExtensionContext,
  footerData: ReadonlyFooterDataProvider,
  theme: Theme,
  state: QuotaState | undefined,
  width: number,
): string[] {
  if (width < 1) return [];
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  let cacheHitRate: number | undefined;
  const add = (usage: Usage) => {
    totals.input += usage.input;
    totals.output += usage.output;
    totals.cacheRead += usage.cacheRead;
    totals.cacheWrite += usage.cacheWrite;
    totals.cost += usage.cost.total;
  };
  // Same whole-session accounting as pi's built-in footer, including summary/tool usage.
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "usage") add(entry.usage);
    else if (entry.type === "message" && entry.message.role === "assistant") {
      add(entry.message.usage);
      const usage = entry.message.usage;
      const prompt = usage.input + usage.cacheRead + usage.cacheWrite;
      cacheHitRate = prompt > 0 ? (usage.cacheRead / prompt) * 100 : undefined;
    } else if (entry.type === "message" && entry.message.role === "toolResult" && entry.message.usage) {
      add(entry.message.usage);
    } else if ((entry.type === "branch_summary" || entry.type === "compaction") && entry.usage) add(entry.usage);
  }
  const branch = footerData.getGitBranch();
  const session = ctx.sessionManager.getSessionName();
  const path = `${displayPath(ctx.cwd)}${branch ? ` (${branch})` : ""}${session ? ` • ${session}` : ""}`;
  const lines = [truncateToWidth(theme.fg("dim", singleLine(path)), width)];
  const stats = [`↑${compact(totals.input)}`, `↓${compact(totals.output)}`];
  if (totals.cacheRead) stats.push(`R${compact(totals.cacheRead)}`);
  if (totals.cacheWrite) stats.push(`W${compact(totals.cacheWrite)}`);
  if ((totals.cacheRead || totals.cacheWrite) && cacheHitRate !== undefined)
    stats.push(`CH${cacheHitRate.toFixed(1)}%`);
  // Preserve real dollar charges in mixed-provider/tool sessions, clearly labelled.
  if (totals.cost > 0) stats.push(`session $${totals.cost.toFixed(3)}`);
  const context = ctx.getContextUsage();
  const percent = context?.percent;
  const contextText = `${percent == null ? "?" : `${percent.toFixed(1)}%`}/${compact(context?.contextWindow ?? ctx.model?.contextWindow ?? 0)}`;
  stats.push(
    theme.fg(
      percent != null && percent > 90 ? "error" : percent != null && percent > 70 ? "warning" : "dim",
      contextText,
    ),
  );
  const model = `${footerData.getAvailableProviderCount() > 1 ? `(${ctx.model?.provider}) ` : ""}${ctx.model?.id ?? "no-model"}${ctx.model?.reasoning ? ` • ${ctx.thinkingLevel ?? "off"}` : ""}`;
  const left = stats.join(" ");
  if (visibleWidth(left) + visibleWidth(model) + 2 <= width) {
    lines.push(
      theme.fg("dim", left + " ".repeat(width - visibleWidth(left) - visibleWidth(model)) + singleLine(model)),
    );
  } else {
    lines.push(...wrapTextWithAnsi(theme.fg("dim", left), width));
    lines.push(truncateToWidth(theme.fg("dim", singleLine(model)), width));
  }
  const color = state?.status === "stale" || state?.status === "unavailable" ? "warning" : "accent";
  for (const line of sessionCreditSummary(ctx)) {
    lines.push(...wrapTextWithAnsi(theme.fg(line.includes("unknown") ? "warning" : "accent", line), width));
  }
  for (const line of quotaSummary(state, ctx.model?.provider)) {
    lines.push(...wrapTextWithAnsi(theme.fg(color, line), width));
  }
  const statuses = [...footerData.getExtensionStatuses()]
    .filter(([key]) => key !== QODER_STATUS_KEY)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, text]) => singleLine(text));
  if (statuses.length) lines.push(...wrapTextWithAnsi(theme.fg("dim", statuses.join(" ")), width));
  // wrapTextWithAnsi preserves graphemes and ANSI; truncate pathological long words too.
  return lines.map((line) => truncateToWidth(line, width));
}
