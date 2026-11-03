/**
 * Startup update check against the npm registry.
 *
 * pi/omp has no built-in update check for npm-installed extensions (marketplace
 * plugins get one, npm ones do not), so a provider can silently fall behind for
 * months. This module only *reports* that a newer release exists — installing is
 * still an explicit user action (`omp plugin upgrade pi-provider-qoder`).
 *
 * Everything here is best-effort: no exception escapes, and the network call is
 * bounded by a timeout so extension startup is never blocked on it.
 */

export const PACKAGE_NAME = "pi-provider-qoder";
export const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
export const DEFAULT_TIMEOUT_MS = 2000;

/** Parse `1.2.3`, `v1.2.3`, or `1.2.3-beta.1` into its numeric triple. */
export function parseSemver(version: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Positive when `a` is newer than `b`, negative when older, 0 when equal or incomparable. */
export function compareVersions(a: string, b: string): number {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) return 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

/**
 * Install/upgrade command for the host that is running the extension.
 * `pi install npm:...` is the documented path for pi-only installs, where `omp`
 * does not exist; when the host cannot be told apart, name both.
 */
export function upgradeCommand(hostExecutable?: string): string {
  const binary = (hostExecutable ?? "").split(/[\\/]/).pop() ?? "";
  if (/omp/i.test(binary)) return `omp plugin upgrade ${PACKAGE_NAME}`;
  if (/^pi/i.test(binary)) return `pi install npm:${PACKAGE_NAME}`;
  return `omp plugin upgrade ${PACKAGE_NAME} (pi: pi install npm:${PACKAGE_NAME})`;
}

/** One-line notice when `latest` is newer than `current`; null when up to date. */
export function formatUpdateNotice(current: string, latest: string, hostExecutable?: string): string | null {
  if (compareVersions(latest, current) <= 0) return null;
  return `[${PACKAGE_NAME}] ${latest} is available (running ${current}). Upgrade: ${upgradeCommand(hostExecutable)}`;
}

export async function fetchLatestVersion(
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(REGISTRY_URL, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { version?: unknown };
    return typeof body.version === "string" ? body.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface UpdateCheckOptions {
  currentVersion: string;
  /** Path or name of the host binary, used to pick the upgrade instruction. */
  hostExecutable?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Set by the host wiring from an env opt-out. */
  disabled?: boolean;
}

/** Resolve the notice to log, or null when up to date, disabled, or offline. */
export async function checkForUpdate(options: UpdateCheckOptions): Promise<string | null> {
  if (options.disabled) return null;
  const latest = await fetchLatestVersion(options.fetchImpl ?? fetch, options.timeoutMs);
  if (!latest) return null;
  return formatUpdateNotice(options.currentVersion, latest, options.hostExecutable);
}
