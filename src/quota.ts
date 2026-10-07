import type { OAuthCredentials } from "@earendil-works/pi-ai";
import {
  fetchQoderUsageForMode,
  normalizeQoderQuotaSnapshot,
  type QoderProviderUsage,
  type QoderQuotaBucket,
  type QoderQuotaSnapshot,
} from "./auth/usage.js";
import type { QoderMode } from "./region.js";

export type QuotaBucket = QoderQuotaBucket;
export type QuotaSnapshot = QoderQuotaSnapshot;

export interface QuotaState {
  snapshot?: QuotaSnapshot;
  status: "loading" | "fresh" | "stale" | "unavailable";
  /** Monotonic timestamp for age calculations, not a wall-clock date. */
  updatedAt?: number;
  error?: string;
}

export interface QoderQuotaServiceOptions {
  fetchUsage?: (credentials: OAuthCredentials, mode: QoderMode, signal?: AbortSignal) => Promise<QoderProviderUsage>;
  /** Defaults to performance.now(), so clock adjustments cannot extend the TTL. */
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
}

interface CacheEntry {
  identity: string;
  state: QuotaState;
  checkedAt?: number;
  pending?: Promise<QuotaState>;
  controller?: AbortController;
}

const UNAVAILABLE = "Qoder quota unavailable";
const DEFAULT_TTL_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 10_000;

/** In-memory, account-period quota only. No credentials or usage are persisted. */
export class QoderQuotaService {
  private readonly entries = new Map<QoderMode, CacheEntry>();
  private readonly fetchUsage: NonNullable<QoderQuotaServiceOptions["fetchUsage"]>;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly timeoutMs: number;

  constructor(options: QoderQuotaServiceOptions = {}) {
    this.fetchUsage = options.fetchUsage ?? fetchQoderUsageForMode;
    this.now = options.now ?? (() => performance.now());
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.ttlMs) || this.ttlMs < 0) throw new Error("Invalid quota cache TTL");
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new Error("Invalid quota fetch timeout");
  }

  read(mode: QoderMode, credentials: OAuthCredentials, force = false): Promise<QuotaState> {
    let entry = this.entries.get(mode);
    if (entry && entry.identity !== credentials.access) {
      this.clear(mode);
      entry = undefined;
    }
    if (!entry) {
      entry = { identity: credentials.access, state: { status: "unavailable" } };
      this.entries.set(mode, entry);
    }
    if (!credentials.access) {
      entry.state = { status: "unavailable", error: UNAVAILABLE };
      return Promise.resolve(entry.state);
    }
    if (entry.pending) return entry.pending;
    if (!force && entry.checkedAt !== undefined && this.now() - entry.checkedAt < this.ttlMs) {
      return Promise.resolve(entry.state);
    }
    entry.state = { snapshot: entry.state.snapshot, updatedAt: entry.state.updatedAt, status: "loading" };
    const controller = new AbortController();
    entry.controller = controller;
    // Keep request authentication tied to the identity selected above, even if
    // the caller later mutates its credential object during a refresh.
    entry.pending = this.refresh(entry, { ...credentials }, mode, controller);
    return entry.pending;
  }

  /** Delay for a one-shot stale-state repaint; this never triggers a request. */
  staleAfterMs(mode: QoderMode): number | undefined {
    const entry = this.entries.get(mode);
    if (entry?.state.status !== "fresh" || entry.checkedAt === undefined) return undefined;
    return Math.max(0, this.ttlMs - (this.now() - entry.checkedAt));
  }

  /** Current region/account only; peeking never fetches or refreshes credentials. */
  peek(mode: QoderMode): QuotaState | undefined {
    const entry = this.entries.get(mode);
    if (!entry) return undefined;
    if (entry.state.status === "fresh" && entry.checkedAt !== undefined && this.now() - entry.checkedAt >= this.ttlMs) {
      entry.state = { ...entry.state, status: "stale" };
    }
    return entry.state;
  }

  clear(mode?: QoderMode): void {
    if (mode === undefined) {
      for (const entry of this.entries.values()) entry.controller?.abort();
      this.entries.clear();
    } else {
      this.entries.get(mode)?.controller?.abort();
      this.entries.delete(mode);
    }
  }

  private async refresh(
    entry: CacheEntry,
    credentials: OAuthCredentials,
    mode: QoderMode,
    controller: AbortController,
  ): Promise<QuotaState> {
    let rejectAbort: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = () => reject(new Error(UNAVAILABLE));
      controller.signal.addEventListener("abort", rejectAbort, { once: true });
    });
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      // The race also bounds injected/custom fetchers that ignore AbortSignal.
      const usage = await Promise.race([
        Promise.resolve().then(() => {
          controller.signal.throwIfAborted();
          return this.fetchUsage(credentials, mode, controller.signal);
        }),
        aborted,
      ]);
      const snapshot = normalizeQoderQuotaSnapshot(usage.raw);
      if (!snapshot) throw new Error(UNAVAILABLE);
      entry.state = { snapshot, status: "fresh", updatedAt: this.now() };
    } catch {
      entry.state = {
        snapshot: entry.state.snapshot,
        updatedAt: entry.state.updatedAt,
        status: entry.state.snapshot ? "stale" : "unavailable",
        error: UNAVAILABLE,
      };
    } finally {
      clearTimeout(timeout);
      controller.signal.removeEventListener("abort", rejectAbort);
      entry.checkedAt = this.now();
      entry.pending = undefined;
      entry.controller = undefined;
    }
    return entry.state;
  }
}
