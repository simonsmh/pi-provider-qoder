import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";
import { AuthStorage } from "@earendil-works/pi-coding-agent";
import { getMachineId, getQoderMode, getQoderRefreshURL, getQoderUserEmailFallback, isQoderCNMode } from "./cosy.js";
import { interactiveLogin } from "./login.js";
import { updateQoderModelsCache } from "./models.js";
import { credentialsFromPat, decodePatRefresh, fetchUserInfo, isPatRefresh } from "./pat.js";

export interface QoderCredentials extends OAuthCredentials {
  userID: string;
  email: string;
  name: string;
  machineID: string;
}

const AUTH_FILE = join(homedir(), ".pi", "agent", "auth.json");

/** Return the PAT exposed through the environment for a provider mode. */
export function getQoderPatForMode(mode: string): string {
  if (isQoderCNMode(mode)) {
    return process.env.QODERCN_API_KEY || process.env.QODERCN_PERSONAL_ACCESS_TOKEN || process.env.QODERCN_PAT || "";
  }
  return process.env.QODER_API_KEY || process.env.QODER_PERSONAL_ACCESS_TOKEN || process.env.QODER_PAT || "";
}

function saveCredentialsToAuthFile(providerID: string, credentials: OAuthCredentials): void {
  try {
    const dir = dirname(AUTH_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    let auth: Record<string, unknown> = {};
    if (existsSync(AUTH_FILE)) {
      try {
        auth = JSON.parse(readFileSync(AUTH_FILE, "utf-8"));
      } catch {}
    }
    auth[providerID] = { type: "oauth", ...credentials };
    writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), { encoding: "utf-8", mode: 0o600 });
  } catch (err) {
    console.error(`[pi-provider-qoder] Failed to write auth storage for ${providerID}:`, err);
  }
}

/** Exchange an environment PAT before pi resolves its initial model. */
export async function autoLoginQoderFromEnvironment(providerID: string, mode: string): Promise<void> {
  const pat = getQoderPatForMode(mode);
  if (!pat) return;

  // An explicitly supplied PAT is authoritative. The auth file only stores
  // the exchanged job token, so it cannot tell us whether the environment
  // token changed. Re-exchange it on startup to avoid silently using an old
  // account's credentials.
  const credentials = await credentialsFromPat(pat, mode);

  if (typeof AuthStorage !== "undefined" && typeof AuthStorage?.create === "function") {
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
  if (existsSync(AUTH_FILE)) {
    try {
      const auth = JSON.parse(readFileSync(AUTH_FILE, "utf-8"));
      const creds = auth?.[providerID] || (providerID === "qoder" ? auth?.qoder : null);
      if (creds?.userID || creds?.access) {
        return creds as QoderCredentials;
      }
    } catch {}
  }
  return null;
}

const identityCache = new Map<string, QoderCredentials>();

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
  mode: string,
): Promise<QoderCredentials> {
  const cached = getCachedCredentials(accessToken, providerID);
  if (cached?.userID) return cached;

  const cacheKey = `${providerID}:${accessToken}`;
  const mem = identityCache.get(cacheKey);
  if (mem?.userID) return mem;

  const info = await fetchUserInfo(accessToken, mode);
  const machineID = getMachineId();
  const creds: QoderCredentials = {
    access: accessToken,
    userID: info.userID || "qoder-user",
    email: info.email || getQoderUserEmailFallback(mode),
    name: info.name || (isQoderCNMode(mode) ? "Qoder CN User" : "Qoder User"),
    machineID,
    refresh: "",
    expires: 0,
  };
  identityCache.set(cacheKey, creds);
  saveCredentialsToAuthFile(providerID, creds);
  return creds;
}

async function loginQoderForMode(callbacks: OAuthLoginCallbacks, mode: string): Promise<OAuthCredentials> {
  const providerID = isQoderCNMode(mode) ? "qoder-cn" : "qoder";
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

export async function loginQoder(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
  return loginQoderForMode(callbacks, getQoderMode());
}

export async function loginQoderCN(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
  return loginQoderForMode(callbacks, "cn");
}

export async function refreshQoderToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
  return refreshQoderTokenForMode(credentials, getQoderMode());
}

export async function refreshQoderTokenCN(credentials: OAuthCredentials): Promise<OAuthCredentials> {
  return refreshQoderTokenForMode(credentials, "cn");
}

async function refreshQoderTokenForMode(credentials: OAuthCredentials, mode: string): Promise<OAuthCredentials> {
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
