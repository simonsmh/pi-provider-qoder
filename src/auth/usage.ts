import type { OAuthCredentials } from "@earendil-works/pi-ai";
import { getQoderRegionConfig, getQoderUsageURL, type QoderMode } from "../region.js";

export interface QoderQuotaBucket {
  total?: number;
  used?: number;
  remaining?: number;
  unit?: string;
}

export interface QoderQuotaSnapshot {
  userQuota?: QoderQuotaBucket;
  orgResourcePackage?: QoderQuotaBucket;
  /** Account-period expiration, in Unix milliseconds as supplied by Qoder. */
  expiresAt?: number;
}

export interface QoderProviderUsage {
  summary?: string;
  subscriptionTitle?: string;
  resetAt?: string;
  manageUrl?: string;
  usageBuckets?: Array<{
    id: string;
    label: string;
    usedDisplay: string;
    limitDisplay?: string;
    unit?: string;
    resetAt?: string;
  }>;
  raw?: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function quotaNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function normalizeBucket(value: unknown): QoderQuotaBucket | undefined {
  const raw = asRecord(value);
  if (!raw) return undefined;
  const total = quotaNumber(raw.total);
  const used = quotaNumber(raw.used);
  const remaining = quotaNumber(raw.remaining);
  if (total === undefined && used === undefined && remaining === undefined) return undefined;
  const unit = typeof raw.unit === "string" && raw.unit.trim() ? raw.unit.trim() : undefined;
  return { total, used, remaining, unit };
}

/** Missing values stay missing; never infer prices, units, or usage across buckets. */
export function normalizeQoderQuotaSnapshot(value: unknown): QoderQuotaSnapshot | undefined {
  const raw = asRecord(value);
  if (!raw) return undefined;
  const userQuota = normalizeBucket(raw.userQuota);
  const orgResourcePackage = normalizeBucket(raw.orgResourcePackage);
  if (!userQuota && !orgResourcePackage) return undefined;
  const expiration = quotaNumber(raw.expiresAt);
  // Qoder's existing provider contract uses Unix milliseconds. Do not guess a
  // different unit or let an out-of-range date throw during display formatting.
  const expiresAt = expiration !== undefined && expiration <= 8.64e15 ? expiration : undefined;
  return { userQuota, orgResourcePackage, expiresAt };
}

export async function fetchQoderUsageForMode(
  credentials: OAuthCredentials,
  mode: QoderMode,
  signal?: AbortSignal,
): Promise<QoderProviderUsage> {
  const region = getQoderRegionConfig(mode);
  const response = await fetch(getQoderUsageURL(mode), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${credentials.access}`,
      Accept: "application/json",
      "User-Agent": "pi-provider-qoder",
    },
    signal,
  });

  if (!response.ok) {
    // Do not expose a server-controlled statusText or body in UI errors.
    throw new Error(`Failed to fetch Qoder usage (${response.status})`);
  }

  const raw = asRecord(await response.json());
  if (!raw) throw new Error("Invalid Qoder usage response");
  const snapshot = normalizeQoderQuotaSnapshot(raw);
  const resetAt = snapshot?.expiresAt === undefined ? undefined : new Date(snapshot.expiresAt).toISOString();
  const usageBuckets: NonNullable<QoderProviderUsage["usageBuckets"]> = [];

  for (const [id, label, bucket] of [
    ["user-quota", "User Quota", snapshot?.userQuota],
    ["org-resource-package", "Org Resource Package", snapshot?.orgResourcePackage],
  ] as const) {
    if (!bucket) continue;
    usageBuckets.push({
      id,
      label,
      usedDisplay: bucket.used === undefined ? "unknown" : bucket.used.toFixed(2),
      limitDisplay: bucket.total?.toFixed(2),
      unit: bucket.unit,
      resetAt,
    });
  }

  const personal = snapshot?.userQuota;
  const remainingText =
    personal?.remaining === undefined
      ? ""
      : `${personal.remaining.toFixed(2)}${personal.unit ? ` ${personal.unit}` : ""} remaining`;

  return {
    summary: remainingText,
    subscriptionTitle: region.usageTitle,
    resetAt,
    manageUrl: region.manageUrl,
    usageBuckets,
    raw,
  };
}
