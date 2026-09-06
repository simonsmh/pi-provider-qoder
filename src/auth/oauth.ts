import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";
import * as PiCodingAgent from "@earendil-works/pi-coding-agent";
import { updateQoderModelsCache } from "../catalog.js";
import { getMachineId } from "../cosy.js";
import { getQoderRefreshURL, getQoderRegionConfig, type QoderMode } from "../region.js";
import { interactiveLogin } from "./login.js";
import { credentialsFromPat, decodePatRefresh, fetchUserInfo, isPatRefresh } from "./pat.js";

export interface QoderCredentials extends OAuthCredentials {
  userID: string;
  email: string;
  name: string;
  machineID: string;
}

/**
 * `AuthStorage` is not part of every pi-coding-agent release's public exports,
 * so it is read off the module namespace instead of imported by name: a missing
 * export must degrade to the auth-file fallback below, not break the build.
 */
const AuthStorage = (
  PiCodingAgent as unknown as {
    AuthStorage?: { create?: () => { set: (providerID: string, credentials: unknown) => void } };
  }
).AuthStorage;

const identityCache = new Map<string, QoderCredentials>();

function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}

function getAuthFilePath(): string {
  return join(getHomeDir(), ".pi", "agent", "auth.json");
}

/** Memoized parse of auth.json; invalidated on save. undefined = not loaded. */
let authFileMem: { path: string; data: Record<string, unknown> } | null | undefined;

/** Clear process-memory auth caches (used by tests that mutate auth.json). */
export function clearQoderAuthMemCache(): void {
  authFileMem = undefined;
  identityCache.clear();
}

function readAuthFileCached(): Record<string, unknown> | null {
  const authPath = getAuthFilePath();
  if (authFileMem !== undefined) {
    if (authFileMem === null) return null;
    if (authFileMem.path === authPath) return authFileMem.data;
  }
  if (!existsSync(authPath)) {
    authFileMem = null;
    return null;
  }
  try {
    const data = JSON.parse(readFileSync(authPath, "utf-8")) as Record<string, unknown>;
    authFileMem = { path: authPath, data };
    return data;
  } catch {
    authFileMem = null;
    return null;
  }
}

/** Return the PAT exposed through the environment for a provider mode. */
export function getQoderPatForMode(mode: QoderMode): string {
  for (const envName of getQoderRegionConfig(mode).patEnvNames) {
    const value = process.env[envName];
    if (value) return value;
  }
  return "";
}

function saveCredentialsToAuthFile(providerID: string, credentials: OAuthCredentials): void {
  try {
    const authPath = getAuthFilePath();
    const dir = dirname(authPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    const existing = readAuthFileCached();
    const auth: Record<string, unknown> = existing ? { ...existing } : {};
    auth[providerID] = { type: "oauth", ...credentials };
    writeFileSync(authPath, JSON.stringify(auth, null, 2), { encoding: "utf-8", mode: 0o600 });
    authFileMem = { path: authPath, data: auth };
    const q = credentials as QoderCredentials;
    if (q.access && q.userID) {
      identityCache.set(`${providerID}:${q.access}`, q);
    }
  } catch (err) {
    console.error(`[pi-provider-qoder] Failed to write auth storage for ${providerID}:`, err);
  }
}

/** Exchange an environment PAT before pi resolves its initial model. */
export async function autoLoginQoderFromEnvironment(providerID: string, mode: QoderMode): Promise<void> {
  const pat = getQoderPatForMode(mode);
  if (!pat) return;

  // An explicitly supplied PAT is authoritative. The auth file only stores
  // the exchanged job token, so it cannot tell us whether the environment
  // token changed. Re-exchange it on startup to avoid silently using an old
  // account's credentials.
  const credentials = await credentialsFromPat(pat, mode);

  if (typeof AuthStorage?.create === "function") {
    try {
      const authStorage = AuthStorage.create();
      authStorage.set(providerID, { type: "oauth", ...credentials });
    } catch {
      saveCredentialsToAuthFile(providerID, credentials);
    }
  } else {
    saveCredentialsToAuthFile(providerID, credentials);
  }

  const qCreds = credentials as QoderCredentials;
  // Wait for the model cache before the provider is registered. This matters
  // for `pi --list-models`, which can exit before background work completes.
  await updateQoderModelsCache(qCreds.access, qCreds.userID, qCreds.name, qCreds.email, mode);
}

/**
 * Read the Qoder identity (userID/email/name/machineID) from pi's own auth
 * store. pi persists the full OAuthCredentials there on login/refresh and keeps
 * it up to date, so there is no need to maintain a separate credentials cache.
 *
 * Note: the auth.json path/shape is a pi internal convention, not a public API.
 * This is best-effort and falls back to null so callers can use placeholders.
 */
export function getCachedCredentials(_accessToken: string, providerID = "qoder"): QoderCredentials | null {
  const auth = readAuthFileCached();
  if (!auth) return null;
  const creds = (auth[providerID] || (providerID === "qoder" ? auth.qoder : null)) as QoderCredentials | null;
  if (creds?.userID || creds?.access) {
    if (creds.access && creds.userID) {
      identityCache.set(`${providerID}:${creds.access}`, creds);
    }
    return creds;
  }
  return null;
}

/**
 * Resolve the Qoder identity (userID/email/name/machineID) for a chat request.
 * OMP (17.x) persists login credentials in its own agent.db, not in
 * ~/.pi/agent/auth.json, so the provider-side cache is frequently empty and the
 * COSY payload would fall back to uid "qoder-user" -> Qoder CN rejects it with
 * "Login expired" (105). Fetch the identity from the job token when the cache
 * misses (in-memory cached), and persist it so later requests skip the fetch.
 */
export async function resolveQoderIdentity(
  accessToken: string,
  providerID: string,
  mode: QoderMode,
): Promise<QoderCredentials> {
  const region = getQoderRegionConfig(mode);
  const cacheKey = `${providerID}:${accessToken}`;
  const mem = identityCache.get(cacheKey);
  if (mem?.userID) return mem;

  const cached = getCachedCredentials(accessToken, providerID);
  if (cached?.userID) {
    identityCache.set(cacheKey, cached);
    return cached;
  }

  const info = await fetchUserInfo(accessToken, mode);
  const machineID = getMachineId();
  const creds: QoderCredentials = {
    access: accessToken,
    userID: info.userID || "qoder-user",
    email: info.email || region.userEmailFallback,
    name: info.name || region.userNameFallback,
    machineID,
    refresh: "",
    expires: 0,
  };
  identityCache.set(cacheKey, creds);
  saveCredentialsToAuthFile(providerID, creds);
  return creds;
}

export async function loginQoderForMode(callbacks: OAuthLoginCallbacks, mode: QoderMode): Promise<OAuthCredentials> {
  const providerID = getQoderRegionConfig(mode).providerID;
  // 1. Try environment variables first (PAT). A PAT (pt-...) must be exchanged
  //    for a short-lived job token before it can be used — credentialsFromPat
  //    handles the exchange + identity resolution.
  const pat = getQoderPatForMode(mode);
  if (pat) {
    try {
      const creds = await credentialsFromPat(pat, mode);
      const qCreds = creds as QoderCredentials;
      // Persist the resolved identity locally so chat requests can resolve the real uid.
      // Cache models in background
      updateQoderModelsCache(qCreds.access, qCreds.userID, qCreds.name, qCreds.email, mode).catch(() => {});
      // Persist the resolved identity locally. OMP (17.x) stores login
      // credentials in its own agent.db, not in ~/.pi/agent/auth.json, so
      // without this the chat COSY payload would fall back to uid "qoder-user"
      // and Qoder CN rejects it with "Login expired" (105).
      saveCredentialsToAuthFile(providerID, creds);
      return creds;
    } catch {
      // Fall through to interactive login if PAT exchange fails.
    }
  }

  // 2. Interactive login (CN only supports PAT prompt here; global supports device flow fallback)
  const creds = await interactiveLogin(callbacks, mode);

  // Cache models in background.
  try {
    const qCreds = creds as QoderCredentials;
    updateQoderModelsCache(qCreds.access, qCreds.userID, qCreds.name, qCreds.email, mode).catch(() => {});
  } catch {}

  // Persist the resolved identity locally (see note above).
  saveCredentialsToAuthFile(providerID, creds);
  return creds;
}

export async function refreshQoderTokenForMode(
  credentials: OAuthCredentials,
  mode: QoderMode,
): Promise<OAuthCredentials> {
  // PAT-based credentials: re-exchange the stored PAT for a fresh job token.
  if (isPatRefresh(credentials.refresh)) {
    const { pat } = decodePatRefresh(credentials.refresh);
    if (pat) {
      try {
        const refreshed = await credentialsFromPat(pat, mode);
        const qCreds = refreshed as QoderCredentials;
        updateQoderModelsCache(qCreds.access, qCreds.userID, qCreds.name, qCreds.email, mode).catch(() => {});
        return refreshed;
      } catch {
        // Fall through to validity extension below.
      }
    }
    return {
      ...credentials,
      expires: Date.now() + 60 * 60 * 1000, // extend 1 hour to retry later
    };
  }

  const parts = credentials.refresh.split("|");
  const refreshToken = parts[0] || "";
  const userID = parts[1] || "";
  const machineID = parts[2] || getMachineId();
  const prev = credentials as Partial<QoderCredentials>;
  const prevName = prev.name || "";
  const prevEmail = prev.email || "";

  const refreshURL = getQoderRefreshURL(mode);
  try {
    const response = await fetch(refreshURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credentials.access}`,
        Accept: "application/json",
        "User-Agent": "pi-provider-qoder",
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        token: string;
        refresh_token?: string;
        expires_at?: string;
        expires_in?: number;
      };

      const newAccess = data.token;
      const newRefresh = data.refresh_token || refreshToken;

      let expireMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
      if (data.expires_at) {
        const parsed = Date.parse(data.expires_at);
        if (!Number.isNaN(parsed)) expireMs = parsed;
      } else if (data.expires_in) {
        expireMs = Date.now() + data.expires_in * 1000;
      }

      const refreshed = {
        ...credentials,
        refresh: `${newRefresh}|${userID}|${machineID}`,
        access: newAccess,
        expires: expireMs - 5 * 60 * 1000,
        userID,
        email: prevEmail,
        name: prevName,
        machineID,
      };

      // pi persists the refreshed credentials in auth.json itself.
      // Cache models in background
      updateQoderModelsCache(newAccess, userID, prevName, prevEmail, mode).catch(() => {});

      return refreshed;
    }
  } catch {}

  // Fallback: Extend validity slightly to buy time, as Qoder tokens are long-lived
  const refreshedFallback = {
    ...credentials,
    expires: Date.now() + 60 * 60 * 1000, // extend for 1 hour
  };
  return refreshedFallback;
}
