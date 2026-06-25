import type { OAuthCredentials } from "@earendil-works/pi-ai";
import {
  getMachineId,
  getQoderExchangeURL,
  getQoderMode,
  getQoderUserEmailFallback,
  getQoderUserInfoURL,
  isQoderCNMode,
} from "./cosy.js";

const UA = "pi-provider-qoder";

/**
 * Marker prefix used in the credential `refresh` field to identify PAT-based
 * credentials. Layout: `pat|<personalToken>|<jobRefreshToken>|<userID>|<machineID>`
 */
export const PAT_REFRESH_PREFIX = "pat";

export interface PatExchangeResult {
  /** Short-lived job token (jt-...) used for auth + COSY signatures. */
  jobToken: string;
  /** Job refresh token (jrt-...), if returned. */
  jobRefreshToken: string;
  expiresAt: number;
}

export function isPatRefresh(refresh: string): boolean {
  return refresh.startsWith(`${PAT_REFRESH_PREFIX}|`);
}

/** Encode a PAT credential's refresh field. */
export function encodePatRefresh(pat: string, jobRefreshToken: string, userID: string, machineID: string): string {
  return [PAT_REFRESH_PREFIX, pat, jobRefreshToken, userID, machineID].join("|");
}

/** Decode a PAT credential's refresh field. */
export function decodePatRefresh(refresh: string): {
  pat: string;
  jobRefreshToken: string;
  userID: string;
  machineID: string;
} {
  const parts = refresh.split("|");
  return {
    pat: parts[1] || "",
    jobRefreshToken: parts[2] || "",
    userID: parts[3] || "",
    machineID: parts[4] || "",
  };
}

/**
 * Exchange a Qoder Personal Access Token (pt-...) for a short-lived Job Token
 * (jt-...). PATs cannot authenticate API calls directly; they must first be
 * exchanged. This mirrors the official qodercli/qoderclicn flow:
 *   POST /api/v1/jobToken/exchange { personal_token } -> { token, refresh_token, expires_at }
 * The exchange endpoint does not require a COSY signature.
 */
export async function exchangeJobToken(pat: string, mode: string = getQoderMode()): Promise<PatExchangeResult> {
  const res = await fetch(getQoderExchangeURL(mode), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": UA,
      "Cosy-Version": "1.0.1",
      "Cosy-ClientType": "5",
    },
    body: JSON.stringify({ personal_token: pat }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Qoder PAT exchange failed: ${res.status} ${res.statusText}. ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    token?: string;
    refresh_token?: string;
    expires_at?: string;
    expires_in?: number;
  };

  if (!data.token) {
    throw new Error("Qoder PAT exchange returned no job token");
  }

  let expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  if (data.expires_at) {
    const parsed = Date.parse(data.expires_at);
    if (!Number.isNaN(parsed)) expiresAt = parsed;
  } else if (data.expires_in) {
    // expires_in is in milliseconds per the observed API response.
    expiresAt = Date.now() + data.expires_in;
  }

  return {
    jobToken: data.token,
    jobRefreshToken: data.refresh_token || "",
    expiresAt,
  };
}

/** Fetch user profile using a job token (jt-...). Best-effort. */
async function fetchUserInfo(jobToken: string, mode: string): Promise<{ userID: string; email: string; name: string }> {
  let userID = "";
  let email = "";
  let name = "";
  try {
    const res = await fetch(getQoderUserInfoURL(mode), {
      headers: {
        Authorization: `Bearer ${jobToken}`,
        Accept: "application/json",
        "User-Agent": UA,
        "Cosy-Version": "1.0.1",
        "Cosy-ClientType": "5",
      },
    });
    if (res.ok) {
      const info = (await res.json()) as {
        id?: string;
        email?: string;
        name?: string;
        username?: string;
      };
      userID = info.id || "";
      email = info.email || "";
      name = info.name || info.username || "";
    }
  } catch {}
  return { userID, email, name };
}

/**
 * Build full Qoder credentials from a Personal Access Token.
 * Exchanges the PAT for a job token, resolves identity, and encodes the PAT
 * into the refresh field so the token can be re-exchanged on expiry.
 */
export async function credentialsFromPat(pat: string, mode: string = getQoderMode()): Promise<OAuthCredentials> {
  const { jobToken, jobRefreshToken, expiresAt } = await exchangeJobToken(pat, mode);
  const { userID, email, name } = await fetchUserInfo(jobToken, mode);
  const machineID = getMachineId();

  return {
    refresh: encodePatRefresh(pat, jobRefreshToken, userID, machineID),
    access: jobToken,
    expires: expiresAt - 5 * 60 * 1000, // 5 min buffer
    userID,
    email: email || getQoderUserEmailFallback(mode),
    name: name || (isQoderCNMode(mode) ? "Qoder CN User" : "Qoder User"),
    machineID,
  } as OAuthCredentials;
}
