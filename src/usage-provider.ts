// Qoder usage, shaped for a host usage surface (`omp usage`).
//
// `omp usage` consumes a normalized report — `limits[]` with numeric amounts, a
// status, and a window carrying an absolute reset timestamp — while Qoder's
// quota endpoint answers with Credit amounts per bucket. This module is the
// seam between the payload the extension already parses (`auth/usage.ts`) and
// that contract.
//
// Why local structural types: pi's published `ProviderConfig` has no `usage`
// slot (only OMP's does), so importing host types would either fail to resolve
// on pi or force pi's narrower shape onto the registration. The fields below
// mirror the host contract one-for-one, and `__tests__/usage-provider.test.ts`
// pins the mapping against the endpoint's real payload so host-contract drift
// fails as a test rather than as an empty row in the host's usage view.
import type { OAuthCredentials } from "@earendil-works/pi-ai";
import {
  fetchQoderUsageForMode,
  normalizeQoderQuotaSnapshot,
  type QoderProviderUsage,
  type QoderQuotaBucket,
} from "./auth/usage.js";
import type { QoderMode } from "./region.js";

type UsageUnit = "percent" | "tokens" | "requests" | "credits" | "usd" | "minutes" | "bytes" | "unknown";

export interface UsageAmount {
  used?: number;
  limit?: number;
  remaining?: number;
  usedFraction?: number;
  unit: UsageUnit;
}

export interface UsageWindow {
  id: string;
  label: string;
  resetsAt?: number;
  /** Verb for the countdown ("resets" unless the boundary is something else). */
  resetLabel?: string;
}

export interface UsageLimit {
  id: string;
  label: string;
  scope: { provider: string; tier?: string };
  window?: UsageWindow;
  amount: UsageAmount;
  status?: "ok" | "warning" | "exhausted" | "unknown";
  notes?: string[];
}

export interface UsageReport {
  provider: string;
  fetchedAt: number;
  limits: UsageLimit[];
  notes?: string[];
  metadata?: Record<string, unknown>;
}

export interface UsageProvider {
  id: string;
  fetchUsage(params: { credential: unknown; signal?: AbortSignal }): Promise<UsageReport | null>;
  /**
   * A quota read is account-wide, so a failure here says nothing about whether
   * the credential can serve a turn. Never let it mark the account unhealthy.
   */
  validatesCredentials?: boolean;
}

const KNOWN_UNITS: Record<Exclude<UsageUnit, "unknown">, true> = {
  percent: true,
  tokens: true,
  requests: true,
  credits: true,
  usd: true,
  minutes: true,
  bytes: true,
};

function unitFor(raw: string | undefined): UsageUnit {
  const lowered = raw?.toLowerCase();
  if (!lowered) return "credits";
  return KNOWN_UNITS[lowered as Exclude<UsageUnit, "unknown">] === true ? (lowered as UsageUnit) : "unknown";
}

function statusFor(
  usedFraction: number | undefined,
  remaining: number | undefined,
  exceeded: boolean,
): "ok" | "warning" | "exhausted" {
  if (exceeded || (remaining !== undefined && remaining <= 0)) return "exhausted";
  if (usedFraction !== undefined && usedFraction >= 0.9) return "warning";
  return "ok";
}

/** Qoder reports "no expiry" as year 9999; rendering that as a reset is noise. */
const NO_EXPIRY_FROM_MS = Date.UTC(3000, 0, 1);

/** Map the parsed quota payload onto the host's normalized report. */
export function toUsageReport(
  usage: QoderProviderUsage,
  providerID: string,
  fetchedAt = Date.now(),
): UsageReport | null {
  const buckets = usage.usageBuckets ?? [];
  if (buckets.length === 0) return null;
  const parsedReset = usage.resetAt === undefined ? Number.NaN : Date.parse(usage.resetAt);
  const resetsAt = Number.isFinite(parsedReset) && parsedReset < NO_EXPIRY_FROM_MS ? parsedReset : undefined;
  const raw = usage.raw as { isQuotaExceeded?: unknown; userType?: unknown } | undefined;
  const exceeded = raw?.isQuotaExceeded === true;
  // Bucket labels are display strings on the parsed payload; the amounts live
  // in the same normalization `/qoder-usage` renders, so reuse it rather than
  // re-reading the payload's field names here.
  const snapshot = normalizeQoderQuotaSnapshot(usage.raw);
  const amountsFor = (id: string): QoderQuotaBucket | undefined => {
    if (id === "user-quota") return snapshot?.userQuota;
    if (id === "add-on-quota") return snapshot?.addOnQuota;
    if (id === "org-resource-package") return snapshot?.orgResourcePackage;
    return undefined;
  };

  const limits: UsageLimit[] = buckets.map((bucket) => {
    const amounts = amountsFor(bucket.id);
    const usedFraction =
      amounts?.used !== undefined && amounts.total !== undefined && amounts.total > 0
        ? amounts.used / amounts.total
        : undefined;
    return {
      id: bucket.id,
      label: bucket.label,
      scope: { provider: providerID },
      ...(resetsAt !== undefined
        ? {
            window: {
              id: "period",
              label: usage.subscriptionTitle ?? "Billing period",
              resetsAt,
              resetLabel: usage.subscriptionTitle ? "plan expires" : "resets",
            },
          }
        : {}),
      amount: {
        unit: unitFor(amounts?.unit ?? bucket.unit),
        ...(amounts?.used !== undefined ? { used: amounts.used } : {}),
        ...(amounts?.total !== undefined ? { limit: amounts.total } : {}),
        ...(amounts?.remaining !== undefined ? { remaining: amounts.remaining } : {}),
        ...(usedFraction !== undefined ? { usedFraction: Math.min(1, Math.max(0, usedFraction)) } : {}),
      },
      status: statusFor(usedFraction, amounts?.remaining, exceeded),
    };
  });

  const notes: string[] = [];
  if (typeof raw?.userType === "string" && raw.userType) notes.push(`Account kind: ${raw.userType}`);
  if (usage.summary) notes.push(usage.summary);
  if (usage.manageUrl) notes.push(`Manage: ${usage.manageUrl}`);

  return { provider: providerID, fetchedAt, limits, ...(notes.length > 0 ? { notes } : {}) };
}

/**
 * The `usage:` slot of the provider registration. Hosts pass a normalized
 * credential (`accessToken`); pi passes its stored OAuth grant (`access`).
 */
export function createQoderUsageProvider(mode: QoderMode, providerID: string): UsageProvider {
  return {
    id: providerID,
    validatesCredentials: false,
    async fetchUsage(params) {
      const cred = params.credential as (Partial<OAuthCredentials> & { accessToken?: unknown }) | undefined;
      const access = typeof cred?.accessToken === "string" ? cred.accessToken : cred?.access;
      // An absent token is nothing to ask with, not a failure to report.
      if (typeof access !== "string" || access.length === 0) return null;
      try {
        const usage = await fetchQoderUsageForMode({ ...(cred as OAuthCredentials), access }, mode, params.signal);
        return toUsageReport(usage, providerID);
      } catch {
        // A quota read failing says nothing about the credential, and a usage
        // surface renders "no data" perfectly well. Rejecting here would
        // surface a network blip as an error on a provider serving turns fine.
        return null;
      }
    },
  };
}
