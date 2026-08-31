import type { Api, Model, OAuthCredentials } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
import { getQoderBaseUrl, getQoderRegionConfig, isQoderCNMode } from "./cosy.js";
import { getCachedModels, isCacheStale, staticCnModels, staticModels, updateQoderModelsCache } from "./models.js";
import {
  autoLoginQoderFromEnvironment,
  getCachedCredentials,
  loginQoderForMode,
  refreshQoderTokenForMode,
} from "./oauth.js";
import { streamQoder } from "./stream.js";
import { fetchQoderUsageForMode } from "./usage.js";

// pi supports a `fetchUsage` hook on the oauth config at runtime, but it is not
// part of the published ProviderConfig type. Declare the extension locally.
type OAuthConfigWithUsage = NonNullable<ProviderConfig["oauth"]> & {
  fetchUsage: (credentials: OAuthCredentials) => Promise<unknown>;
};

function modelsForProvider(mode: string, providerID: string): Model<Api>[] {
  const cached = getCachedModels(mode);
  const modelsToUse = cached.length > 0 ? cached : isQoderCNMode(mode) ? staticCnModels : staticModels;

  return modelsToUse.map((m) => ({
    ...m,
    provider: providerID,
    baseUrl: getQoderBaseUrl(mode),
  })) as unknown as Model<Api>[];
}

function createQoderOAuth(mode: string): OAuthConfigWithUsage {
  const region = getQoderRegionConfig(mode);
  return {
    name: region.loginName,
    login: (callbacks) => loginQoderForMode(callbacks, mode),
    refreshToken: (credentials) => refreshQoderTokenForMode(credentials, mode),
    getApiKey: (cred: OAuthCredentials) => cred.access,
    // NOTE: no `modifyModels` hook on purpose. OMP (Bun) does a whole-catalog
    // structuredClone before invoking it, and its bundled catalog contains a
    // model with a non-cloneable property -> "The object can not be cloned."
    // removes qoder from `omp models`. Models are supplied at registration
    // via `modelsForProvider` and refreshed by the startup/session cache hooks.
    fetchUsage: (credentials) => fetchQoderUsageForMode(credentials, mode),
  };
}

function registerQoderProvider(pi: ExtensionAPI, providerID: string, mode: string): void {
  const oauth = createQoderOAuth(mode);
  pi.registerProvider(providerID, {
    baseUrl: getQoderBaseUrl(mode),
    api: "qoder-api" as Api,
    models: modelsForProvider(mode, providerID) as unknown as ProviderConfig["models"],
    oauth: oauth as ProviderConfig["oauth"],
    // pi-coding-agent resolves its own nested @earendil-works/pi-ai copy, so the
    // structurally identical Model/Context types are nominally distinct here.
    streamSimple: streamQoder as unknown as ProviderConfig["streamSimple"],
  });
}

async function refreshModelsAtStartup(providerID: string, mode: string): Promise<void> {
  if (!isCacheStale(mode)) return;

  const credentials = getCachedCredentials("", providerID);
  if (!credentials?.access) return;

  const region = getQoderRegionConfig(mode);
  await updateQoderModelsCache(
    credentials.access,
    credentials.userID || "qoder-user",
    credentials.name || region.userNameFallback,
    credentials.email || region.userEmailFallback,
    mode,
  );
}

export default async function (pi: ExtensionAPI) {
  for (const [providerID, mode] of [
    ["qoder", "global"],
    ["qoder-cn", "cn"],
  ] as const) {
    try {
      await autoLoginQoderFromEnvironment(providerID, mode);
      await refreshModelsAtStartup(providerID, mode);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[pi-provider-qoder] Automatic login failed for ${providerID}: ${message}`);
    }
  }

  // Refresh the models cache once per session at startup if it is missing or
  // stale (>1h old), rather than on every message in the stream hot path.
  // Login/refresh are the other rebuild triggers; this covers the case where
  // the cache was deleted while the token is still valid.
  pi.on("session_start", async (_event, ctx) => {
    for (const [providerID, mode] of [
      ["qoder", "global"],
      ["qoder-cn", "cn"],
    ] as const) {
      try {
        const region = getQoderRegionConfig(mode);
        const accessToken = await ctx.modelRegistry.getApiKeyForProvider(providerID);
        if (!accessToken || !isCacheStale(mode)) continue;
        const creds = getCachedCredentials(accessToken, providerID);
        const userID = creds?.userID || "qoder-user";
        const name = creds?.name || region.userNameFallback;
        const email = creds?.email || region.userEmailFallback;
        await updateQoderModelsCache(accessToken, userID, name, email, mode);
      } catch {
        // Best-effort: fall back to the existing cache / static models.
      }
    }
  });

  registerQoderProvider(pi, "qoder", "global");
  registerQoderProvider(pi, "qoder-cn", "cn");
}
