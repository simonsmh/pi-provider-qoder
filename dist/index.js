// src/index.ts
import { createRequire as createRequire3 } from "node:module";

// src/auth/oauth.ts
import { existsSync as existsSync4, mkdirSync as mkdirSync4, readFileSync as readFileSync4, writeFileSync as writeFileSync4 } from "node:fs";
import { homedir as homedir4 } from "node:os";
import { dirname as dirname4, join as join4 } from "node:path";
import * as PiCodingAgent from "@earendil-works/pi-coding-agent";

// src/catalog.ts
import { existsSync as existsSync3, mkdirSync as mkdirSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync3 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { dirname as dirname3, join as join3 } from "node:path";

// src/cosy.ts
import crypto from "node:crypto";
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { dirname as dirname2, join as join2 } from "node:path";

// src/cosy-version.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
var BUNDLED_GATEWAY_COSY_VERSION = "1.1.72";
var QODER_CLI_RELEASES_URL = "https://repo.qoder.com/repos/QoderAI/changelog-CLI/releases?per_page=5&page=1";
var CACHE_FILE = "qoder-cosy-version-cache.json";
var REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1e3;
var FETCH_TIMEOUT_MS = 5e3;
function getHomeDir() {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}
function getCosyVersionCachePath() {
  return join(getHomeDir(), ".pi", "agent", CACHE_FILE);
}
var cosyVersionMem = /* @__PURE__ */ new Map();
function readCosyVersionCache() {
  const cachePath = getCosyVersionCachePath();
  if (cosyVersionMem.has(cachePath)) {
    return cosyVersionMem.get(cachePath) ?? null;
  }
  if (!existsSync(cachePath)) {
    cosyVersionMem.set(cachePath, null);
    return null;
  }
  try {
    const data = JSON.parse(readFileSync(cachePath, "utf8"));
    cosyVersionMem.set(cachePath, data);
    return data;
  } catch {
    cosyVersionMem.set(cachePath, null);
    return null;
  }
}
function writeCosyVersionCache(data) {
  const cachePath = getCosyVersionCachePath();
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, JSON.stringify(data, null, 2), "utf-8");
  } catch {
  }
  cosyVersionMem.set(cachePath, data);
}
function isCliVersion(value) {
  return typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value);
}
function compareCliVersions(a, b2) {
  const pa = a.split(".").map(Number);
  const pb = b2.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}
function getGatewayCosyVersion() {
  const cached = readCosyVersionCache()?.version;
  if (isCliVersion(cached) && compareCliVersions(cached, BUNDLED_GATEWAY_COSY_VERSION) >= 0) {
    return cached;
  }
  return BUNDLED_GATEWAY_COSY_VERSION;
}
var refreshInFlight = null;
async function refreshGatewayCosyVersion(options) {
  const now = options?.now ?? Date.now();
  const checkedAt = readCosyVersionCache()?.checkedAt;
  if (!options?.force && typeof checkedAt === "number" && now - checkedAt < REFRESH_INTERVAL_MS) {
    return;
  }
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let releases;
      try {
        const response = await fetch(QODER_CLI_RELEASES_URL, {
          headers: { Accept: "application/vnd.github.v3+json" },
          signal: controller.signal
        });
        if (!response.ok) return;
        releases = await response.json();
      } finally {
        clearTimeout(timer);
      }
      if (!Array.isArray(releases)) return;
      const latest = releases.find(
        (release) => release && !release.draft && !release.prerelease && isCliVersion(release.tag_name)
      );
      const stampedAt = Date.now();
      if (latest && compareCliVersions(latest.tag_name, getGatewayCosyVersion()) > 0) {
        writeCosyVersionCache({ version: latest.tag_name, checkedAt: stampedAt });
      } else {
        writeCosyVersionCache({ version: readCosyVersionCache()?.version, checkedAt: stampedAt });
      }
    } catch {
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

// src/cosy.ts
var qoderRSAPublicKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDA8iMH5c02LilrsERw9t6Pv5Nc
4k6Pz1EaDicBMpdpxKduSZu5OANqUq8er4GM95omAGIOPOh+Nx0spthYA2BqGz+l
6HRkPJ7S236FZz73In/KVuLnwI8JJ2CbuJap8kvheCCZpmAWpb/cPx/3Vr/J6I17
XcW+ML9FoCI6AOvOzwIDAQAB
-----END PUBLIC KEY-----`;
var QODER_OPENAPI_COSY_VERSION = "1.0.1";
var QODER_CLIENT_TYPE = "5";
var QoderDataPolicy = "disagree";
var QoderLoginVersion = "v2";
var QoderMachineOS = process.platform === "win32" ? process.arch === "arm64" ? "aarch64_windows" : "x86_64_windows" : process.arch === "arm64" ? "aarch64_linux" : "x86_64_linux";
var QoderMachineTypeMagic = "5";
function rsaEncryptBase64(data) {
  const key = {
    key: qoderRSAPublicKey,
    padding: crypto.constants.RSA_PKCS1_PADDING
  };
  const encrypted = crypto.publicEncrypt(key, typeof data === "string" ? Buffer.from(data) : data);
  return encrypted.toString("base64");
}
function aesEncryptCBCBase64(plaintext, keyStr) {
  const cipher = crypto.createCipheriv("aes-128-cbc", Buffer.from(keyStr), Buffer.from(keyStr));
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}
function computeSigPath(urlStr) {
  const parsed = new URL(urlStr);
  let sigPath = parsed.pathname;
  if (sigPath.startsWith("/algo")) {
    sigPath = sigPath.substring("/algo".length);
  }
  return sigPath;
}
function getHomeDir2() {
  return process.env.HOME || process.env.USERPROFILE || homedir2();
}
function getMachineId() {
  const home = getHomeDir2();
  const paths = [join2(home, ".qoder", ".auth", "machine_id"), join2(home, ".pi", "agent", "qoder-machine-id")];
  for (const p of paths) {
    if (existsSync2(p)) {
      try {
        const val = readFileSync2(p, "utf8").trim();
        if (val) return val;
      } catch {
      }
    }
  }
  const newId = crypto.randomUUID();
  try {
    const savePath = paths[1];
    mkdirSync2(dirname2(savePath), { recursive: true });
    writeFileSync2(savePath, newId, "utf8");
  } catch {
  }
  return newId;
}
function buildAuthHeaders(body, requestURL, creds) {
  if (!creds.userID) {
    throw new Error("cosy: user id is empty");
  }
  if (!creds.authToken) {
    throw new Error("cosy: auth token is empty");
  }
  const aesKey = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const userInfo = {
    uid: creds.userID,
    security_oauth_token: creds.authToken,
    name: creds.name || "",
    aid: "",
    email: creds.email || ""
  };
  const infoB64 = aesEncryptCBCBase64(JSON.stringify(userInfo), aesKey);
  const cosyKey = rsaEncryptBase64(aesKey);
  const timestamp = Math.floor(Date.now() / 1e3).toString();
  const requestId = crypto.randomUUID();
  const cosyVersion = getGatewayCosyVersion();
  const cosyPayload = {
    version: "v1",
    requestId,
    info: infoB64,
    cosyVersion,
    ideVersion: ""
  };
  const payloadB64 = Buffer.from(JSON.stringify(cosyPayload)).toString("base64");
  const sigPath = computeSigPath(requestURL);
  const bodyBytes = body ? Buffer.isBuffer(body) ? body : Buffer.from(body) : Buffer.alloc(0);
  const sig = crypto.createHash("md5").update(payloadB64).update("\n").update(cosyKey).update("\n").update(timestamp).update("\n").update(bodyBytes).update("\n").update(sigPath).digest("hex");
  const bodyHash = crypto.createHash("md5").update(bodyBytes).digest("hex");
  const bodyLen = bodyBytes.length.toString();
  const machineID = creds.machineID || getMachineId();
  return {
    Authorization: `Bearer COSY.${payloadB64}.${sig}`,
    "Cosy-Key": cosyKey,
    "Cosy-User": creds.userID,
    "Cosy-Date": timestamp,
    "Cosy-Version": cosyVersion,
    "Cosy-Machineid": machineID,
    "Cosy-Machinetoken": machineID,
    "Cosy-Machinetype": QoderMachineTypeMagic,
    "Cosy-Machineos": QoderMachineOS,
    "Cosy-Clienttype": QODER_CLIENT_TYPE,
    "Cosy-Clientip": "127.0.0.1",
    "Cosy-Bodyhash": bodyHash,
    "Cosy-Bodylength": bodyLen,
    "Cosy-Sigpath": sigPath,
    "Cosy-Data-Policy": QoderDataPolicy,
    "Cosy-Organization-Id": "",
    "Cosy-Organization-Tags": "",
    "Login-Version": QoderLoginVersion,
    "X-Request-Id": crypto.randomUUID()
  };
}

// src/region.ts
var QODER_REGIONS = {
  global: {
    mode: "global",
    providerID: "qoder",
    baseUrl: "https://api3.qoder.sh/",
    openApiUrl: "https://openapi.qoder.sh",
    centerUrl: "https://center.qoder.sh",
    manageUrl: "https://qoder.com",
    patManageUrl: "https://qoder.com/account/integrations",
    deviceLoginUrl: "https://qoder.com/device/selectAccounts",
    modelCacheFile: "qoder-models-cache.json",
    patEnvNames: ["QODER_API_KEY", "QODER_PERSONAL_ACCESS_TOKEN", "QODER_PAT"],
    loginName: "Qoder (Browser OAuth / PAT)",
    userNameFallback: "Qoder User",
    userEmailFallback: "user@qoder.com",
    usageTitle: "Qoder AI Plan",
    supportsBrowserLogin: true
  },
  cn: {
    mode: "cn",
    providerID: "qoder-cn",
    baseUrl: "https://gateway.qoder.com.cn/",
    openApiUrl: "https://openapi.qoder.com.cn",
    centerUrl: "https://gateway.qoder.com.cn",
    manageUrl: "https://qoder.com.cn",
    patManageUrl: "https://qoder.com.cn/account/integrations",
    modelCacheFile: "qoder-cn-models-cache.json",
    patEnvNames: ["QODERCN_API_KEY", "QODERCN_PERSONAL_ACCESS_TOKEN", "QODERCN_PAT"],
    loginName: "Qoder CN (PAT)",
    userNameFallback: "Qoder CN User",
    userEmailFallback: "user@qoder.com.cn",
    usageTitle: "Qoder CN Plan",
    supportsBrowserLogin: false
  }
};
var QODER_MODES = ["global", "cn"];
function getQoderRegionConfig(mode) {
  return QODER_REGIONS[mode];
}
function getQoderBaseUrl(mode) {
  return getQoderRegionConfig(mode).baseUrl;
}
var chatBaseUrlOverrides = /* @__PURE__ */ new Map();
function getQoderChatBaseUrl(mode) {
  return chatBaseUrlOverrides.get(mode) ?? getQoderBaseUrl(mode);
}
function setQoderChatBaseUrl(mode, url) {
  if (!url) {
    chatBaseUrlOverrides.delete(mode);
    return;
  }
  chatBaseUrlOverrides.set(mode, url.endsWith("/") ? url : `${url}/`);
}
function getQoderModelListURL(mode) {
  return `${getQoderBaseUrl(mode)}algo/api/v2/model/list?Encode=1`;
}
function getQoderChatURL(mode) {
  return `${getQoderChatBaseUrl(mode)}algo/api/v2/service/pro/sse/agent_chat_generation?FetchKeys=llm_model_result&AgentId=agent_common&Encode=1`;
}
function getQoderExchangeURL(mode) {
  return `${getQoderRegionConfig(mode).openApiUrl}/api/v1/jobToken/exchange`;
}
function getQoderUserInfoURL(mode) {
  return `${getQoderRegionConfig(mode).openApiUrl}/api/v1/userinfo`;
}
function getQoderUsageURL(mode) {
  return `${getQoderRegionConfig(mode).openApiUrl}/api/v2/quota/usage`;
}
function getQoderRefreshURL(mode) {
  return `${getQoderRegionConfig(mode).centerUrl}/algo/api/v3/user/refresh_token`;
}
function getQoderDeviceLoginURL(codeChallenge, machineID, nonce) {
  const baseUrl = getQoderRegionConfig("global").deviceLoginUrl;
  if (!baseUrl) throw new Error("Qoder browser login URL is not configured");
  return `${baseUrl}?challenge=${codeChallenge}&challenge_method=S256&machine_id=${machineID}&nonce=${nonce}`;
}
function getQoderDevicePollURL(nonce, codeVerifier) {
  const baseUrl = getQoderRegionConfig("global").openApiUrl;
  return `${baseUrl}/api/v1/deviceToken/poll?nonce=${encodeURIComponent(nonce)}&verifier=${encodeURIComponent(codeVerifier)}&challenge_method=S256`;
}

// src/catalog.ts
var ZERO_COST = Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
var MAX_OUTPUT_TOKENS = 131072;
var DEFAULT_CONTEXT_WINDOW = 1e6;
function getHomeDir3() {
  return process.env.HOME || process.env.USERPROFILE || homedir3();
}
function getQoderCachePath(mode) {
  return join3(getHomeDir3(), ".pi", "agent", getQoderRegionConfig(mode).modelCacheFile);
}
var modelCacheMem = /* @__PURE__ */ new Map();
function readParsedModelCache(mode) {
  const cachePath = getQoderCachePath(mode);
  if (modelCacheMem.has(cachePath)) {
    return modelCacheMem.get(cachePath) ?? null;
  }
  if (!existsSync3(cachePath)) {
    modelCacheMem.set(cachePath, null);
    return null;
  }
  try {
    const data = JSON.parse(readFileSync3(cachePath, "utf8"));
    modelCacheMem.set(cachePath, data);
    return data;
  } catch {
    modelCacheMem.set(cachePath, null);
    return null;
  }
}
function writeParsedModelCache(mode, data) {
  const cachePath = getQoderCachePath(mode);
  mkdirSync3(dirname3(cachePath), { recursive: true });
  writeFileSync3(cachePath, JSON.stringify(data, null, 2), "utf-8");
  modelCacheMem.set(cachePath, data);
}
function toQoderModelId(displayName) {
  return (displayName || "QoderModel").replace(/\s+/g, "");
}
var staticModels = [
  {
    id: "Auto",
    upstreamKey: "auto",
    name: "Auto",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: true,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "Ultimate",
    upstreamKey: "ultimate",
    name: "Ultimate",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: true,
    supportsEffort: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "Performance",
    upstreamKey: "performance",
    name: "Performance",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: true,
    supportsEffort: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "Efficient",
    upstreamKey: "efficient",
    name: "Efficient",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: false,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "Lite",
    upstreamKey: "lite",
    name: "Lite",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: false,
    supportsEffort: false,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "Qwen3.7Plus",
    upstreamKey: "qmodel",
    name: "Qwen3.7 Plus",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: false,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "Cantus",
    upstreamKey: "cmodel",
    name: "Cantus",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: true,
    supportsEffort: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "Qwen3.8-Max",
    upstreamKey: "qmodel_preview",
    name: "Qwen3.8-Max",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: true,
    supportsEffort: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "Qwen3.7-Max",
    upstreamKey: "qmodel_latest",
    name: "Qwen3.7-Max",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: false,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "DeepSeek-V4-Pro",
    upstreamKey: "dmodel",
    name: "DeepSeek-V4-Pro",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: true,
    supportsEffort: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "DeepSeek-V4-Flash",
    upstreamKey: "dfmodel",
    name: "DeepSeek-V4-Flash",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: true,
    supportsEffort: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "GLM-5.2",
    upstreamKey: "gm51model",
    name: "GLM-5.2",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: true,
    supportsEffort: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "Kimi-K2.7-Code",
    upstreamKey: "kmodel",
    name: "Kimi-K2.7-Code",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: false,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    // Catalog advertises 256K; not included in the 1M live test in issue #13.
    contextWindow: 256e3,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "Kimi-K3",
    upstreamKey: "kmodel_latest",
    name: "Kimi-K3",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: false,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "MiniMax-M3",
    upstreamKey: "mmodel",
    name: "MiniMax-M3",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: false,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  }
];
var staticCnModels = [
  {
    id: "Auto",
    upstreamKey: "auto",
    name: "Auto",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: true,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    // CN Auto has not been live-tested at 1M; keep the conservative 200K
    // fallback until the CN catalog advertises a larger option.
    contextWindow: 2e5,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN smart routing; fallback context window of 200K."
  },
  {
    id: "Qwen3.7-Max",
    upstreamKey: "qmodel_latest",
    name: "Qwen3.7-Max",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: true,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN qmodel_latest; context options 200K/400K/1M."
  },
  {
    id: "Qwen3.7-Plus",
    upstreamKey: "qmodel",
    name: "Qwen3.7-Plus",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: true,
    supportsEffort: false,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN qmodel; context options 200K/400K/1M."
  },
  {
    id: "Qwen3.6-Flash",
    upstreamKey: "q36fmodel",
    name: "Qwen3.6-Flash",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: true,
    supportsEffort: false,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN q36fmodel; context options 200K/400K/1M."
  },
  {
    id: "DeepSeek-V4-Pro",
    upstreamKey: "dmodel",
    name: "DeepSeek-V4-Pro",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: true,
    supportsEffort: false,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN dmodel; context options 200K/400K/1M."
  },
  {
    id: "DeepSeek-V4-Flash",
    upstreamKey: "dfmodel",
    name: "DeepSeek-V4-Flash",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: false,
    supportsEffort: false,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN dfmodel; context options 200K/400K/1M."
  },
  {
    id: "GLM-5.2",
    upstreamKey: "gm51model",
    name: "GLM-5.2",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: true,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    // Live CN catalog currently displays 200K; do not copy global gm51model's 1M.
    contextWindow: 2e5,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN gm51model; live catalog currently displays GLM-5.2 with 200K context."
  },
  {
    id: "Kimi-K2.7-Code",
    upstreamKey: "kmodel",
    name: "Kimi-K2.7-Code",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: true,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    // Catalog advertises 256K; same as global kmodel.
    contextWindow: 256e3,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN kmodel; context option 256K."
  },
  {
    id: "MiniMax-M2.7",
    upstreamKey: "mmodel",
    name: "MiniMax-M2.7",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: false,
    supportsEffort: false,
    input: ["text"],
    cost: ZERO_COST,
    // Live CN catalog reports 200K; not confirmed at 1M.
    contextWindow: 2e5,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN mmodel; live catalog reports 200K context."
  }
];
var PI_THINKING_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"];
function buildThinkingLevelMap(entry) {
  const tc = entry.thinking_config;
  if (!tc) return void 0;
  const efforts = tc.enabled?.efforts;
  if (efforts && typeof efforts === "object") {
    const supported = new Set(Object.keys(efforts));
    const map = { off: tc.disabled ? "disabled" : null };
    for (const level of PI_THINKING_LEVELS) {
      map[level] = supported.has(level) ? level : null;
    }
    return map;
  }
  if (tc.enabled) {
    const map = { off: tc.disabled ? "disabled" : null };
    for (const level of PI_THINKING_LEVELS) {
      map[level] = "enabled";
    }
    return map;
  }
  return void 0;
}
function buildThinkingConfig(entry) {
  const tc = entry.thinking_config;
  const efforts = tc?.enabled?.efforts;
  if (!efforts || typeof efforts !== "object") return void 0;
  const supported = new Set(Object.keys(efforts));
  const ordered = PI_THINKING_LEVELS.filter((level) => supported.has(level));
  if (ordered.length === 0) return void 0;
  const defaultLevel = PI_THINKING_LEVELS.find((level) => efforts[level]?.is_default);
  return {
    mode: "effort",
    efforts: ordered,
    ...defaultLevel ? { defaultLevel } : {},
    // Qoder's catalog marks a `disabled` branch when thinking can be turned
    // off. Without it reasoning is mandatory upstream, so omp clamps "off" to
    // the lowest supported effort instead of disabling.
    requiresEffort: !tc?.disabled
  };
}
function getCachedModels(mode) {
  const data = readParsedModelCache(mode);
  if (data && Array.isArray(data.models)) {
    const models = data.models.map((model) => {
      const config = data.configs?.[model.id];
      const display = config?.display_name;
      const staticModel = (mode === "cn" ? staticCnModels : staticModels).find((seed) => seed.upstreamKey === model.id);
      if (display) return { ...model, id: toQoderModelId(display), name: display };
      if (staticModel) return { ...model, id: staticModel.id, name: staticModel.name };
      return model.name ? { ...model, id: toQoderModelId(model.name) } : model;
    });
    if (data.configs && typeof data.configs === "object" && !data.configs.auto && !data.configs.Auto) {
      return models.filter((model) => model.id.toLowerCase() !== "auto");
    }
    return models;
  }
  return mode === "cn" ? staticCnModels : staticModels;
}
function getCachedModelConfig(modelId, mode) {
  const data = readParsedModelCache(mode);
  if (data) {
    const direct = data.configs?.[modelId];
    if (direct && toQoderModelId(direct.display_name) === modelId) {
      return withMaxContextAsDefault(direct);
    }
    const legacyEntry = Object.values(data.configs || {}).find(
      (entry) => entry && typeof entry === "object" && toQoderModelId(entry.display_name) === modelId
    );
    if (legacyEntry) {
      return withMaxContextAsDefault(legacyEntry);
    }
  }
  const staticModel = (mode === "cn" ? staticCnModels : staticModels).find((model) => model.id === modelId);
  if (staticModel) {
    return {
      key: staticModel.upstreamKey || modelId,
      is_reasoning: staticModel.reasoning,
      source: "system"
    };
  }
  return null;
}
function contextWindowFromCatalog(entry) {
  const contextConfig = entry.context_config;
  if (contextConfig && typeof contextConfig === "object") {
    let advertised = 0;
    for (const configVal of Object.values(contextConfig)) {
      if (configVal && typeof configVal === "object" && typeof configVal.token_count === "number") {
        if (configVal.token_count > advertised) advertised = configVal.token_count;
      }
    }
    if (advertised > 0) return advertised;
  }
  return DEFAULT_CONTEXT_WINDOW;
}
function withMaxContextAsDefault(entry) {
  const contextConfig = entry.context_config;
  if (!contextConfig || typeof contextConfig !== "object") return entry;
  const maxTokenCount = Math.max(
    ...Object.values(contextConfig).map((config) => typeof config?.token_count === "number" ? config.token_count : 0)
  );
  if (maxTokenCount <= 0) return entry;
  return {
    ...entry,
    context_config: Object.fromEntries(
      Object.entries(contextConfig).map(([name, config]) => [
        name,
        { ...config, is_default: config.token_count === maxTokenCount }
      ])
    )
  };
}
function isCacheStale(mode) {
  const data = readParsedModelCache(mode);
  if (!data || typeof data.updatedAt !== "number") return true;
  return Date.now() - data.updatedAt > 36e5;
}
async function updateQoderModelsCache(authToken, userID, name, email, mode) {
  const modelListURL = getQoderModelListURL(mode);
  try {
    await refreshGatewayCosyVersion();
    const headers = buildAuthHeaders(null, modelListURL, {
      userID,
      authToken,
      name,
      email
    });
    const response = await fetch(modelListURL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...headers
      }
    });
    if (!response.ok) {
      return;
    }
    const resData = await response.json();
    const chatModels = resData.chat || [];
    if (chatModels.length === 0) return;
    const newModels = [];
    const configs = {};
    for (const entry of chatModels) {
      const key = entry.key;
      if (!key || !entry.enable || !entry.display_name) continue;
      const display = entry.display_name;
      const ctxLen = contextWindowFromCatalog(entry);
      const isVL = !!entry.is_vl;
      const isReasoning = !!entry.is_reasoning || !!entry.thinking_config;
      const supportsEffort = !!entry.thinking_config?.enabled?.efforts;
      const thinkingLevelMap = buildThinkingLevelMap(entry);
      const thinking = buildThinkingConfig(entry);
      const modelInfo = { id: toQoderModelId(display), name: display };
      configs[modelInfo.id] = entry;
      newModels.push({
        id: modelInfo.id,
        name: modelInfo.name,
        api: "qoder-api",
        provider: getQoderRegionConfig(mode).providerID,
        baseUrl: getQoderBaseUrl(mode),
        reasoning: isReasoning,
        supportsEffort,
        thinkingLevelMap,
        thinking,
        input: isVL ? ["text", "image"] : ["text"],
        cost: ZERO_COST,
        contextWindow: ctxLen,
        maxTokens: MAX_OUTPUT_TOKENS
      });
    }
    if (newModels.length === 0) return;
    const cacheData = {
      updatedAt: Date.now(),
      models: newModels,
      configs
    };
    writeParsedModelCache(mode, cacheData);
  } catch {
  }
}

// src/auth/login.ts
import crypto2 from "node:crypto";

// src/auth/pat.ts
var UA = "pi-provider-qoder";
var PAT_REFRESH_PREFIX = "pat";
function isPatRefresh(refresh) {
  return refresh.startsWith(`${PAT_REFRESH_PREFIX}|`);
}
function encodePatRefresh(pat, jobRefreshToken, userID, machineID) {
  return [PAT_REFRESH_PREFIX, pat, jobRefreshToken, userID, machineID].join("|");
}
function decodePatRefresh(refresh) {
  const parts = refresh.split("|");
  return {
    pat: parts[1] || "",
    jobRefreshToken: parts[2] || "",
    userID: parts[3] || "",
    machineID: parts[4] || ""
  };
}
async function exchangeJobToken(pat, mode) {
  const res = await fetch(getQoderExchangeURL(mode), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": UA,
      "Cosy-Version": QODER_OPENAPI_COSY_VERSION,
      "Cosy-ClientType": QODER_CLIENT_TYPE
    },
    body: JSON.stringify({ personal_token: pat })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Qoder PAT exchange failed: ${res.status} ${res.statusText}. ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.token) {
    throw new Error("Qoder PAT exchange returned no job token");
  }
  let expiresAt = Date.now() + 24 * 60 * 60 * 1e3;
  if (data.expires_at) {
    const parsed = Date.parse(data.expires_at);
    if (!Number.isNaN(parsed)) expiresAt = parsed;
  } else if (data.expires_in) {
    expiresAt = Date.now() + data.expires_in;
  }
  return {
    jobToken: data.token,
    jobRefreshToken: data.refresh_token || "",
    expiresAt
  };
}
async function fetchUserInfo(jobToken, mode) {
  let userID = "";
  let email = "";
  let name = "";
  try {
    const res = await fetch(getQoderUserInfoURL(mode), {
      headers: {
        Authorization: `Bearer ${jobToken}`,
        Accept: "application/json",
        "User-Agent": UA,
        "Cosy-Version": QODER_OPENAPI_COSY_VERSION,
        "Cosy-ClientType": QODER_CLIENT_TYPE
      }
    });
    if (res.ok) {
      const info = await res.json();
      userID = info.id || "";
      email = info.email || "";
      name = info.name || info.username || "";
    }
  } catch {
  }
  return { userID, email, name };
}
async function credentialsFromPat(pat, mode) {
  const region = getQoderRegionConfig(mode);
  const { jobToken, jobRefreshToken, expiresAt } = await exchangeJobToken(pat, mode);
  const { userID, email, name } = await fetchUserInfo(jobToken, mode);
  const machineID = getMachineId();
  return {
    refresh: encodePatRefresh(pat, jobRefreshToken, userID, machineID),
    access: jobToken,
    expires: expiresAt - 5 * 60 * 1e3,
    // 5 min buffer
    userID,
    email: email || region.userEmailFallback,
    name: name || region.userNameFallback,
    machineID
  };
}

// src/auth/login.ts
function getPrompt(callbacks) {
  return callbacks.onPrompt;
}
function getProgress(callbacks) {
  return callbacks.onProgress;
}
function getSignal(callbacks) {
  return callbacks.signal;
}
function generatePKCE() {
  const codeVerifier = crypto2.randomBytes(32).toString("base64url");
  const codeChallenge = crypto2.createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}
function parseExpiresAt(s, expiresInSeconds) {
  if (s) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return t;
    const ms = Number.parseInt(s, 10);
    if (!Number.isNaN(ms) && ms > 0) return ms;
  }
  if (expiresInSeconds && expiresInSeconds > 0) {
    return Date.now() + expiresInSeconds * 1e3;
  }
  return Date.now() + 30 * 24 * 60 * 60 * 1e3;
}
async function interactiveLogin(callbacks, mode) {
  const region = getQoderRegionConfig(mode);
  const prompt = getPrompt(callbacks);
  const pat = await prompt({
    message: !region.supportsBrowserLogin ? "Paste a Qoder CN Personal Access Token, or leave empty to cancel" : "Paste a Qoder Personal Access Token (pt-...), or leave empty for browser login",
    placeholder: "pt-...",
    allowEmpty: true
  });
  if (getSignal(callbacks)?.aborted) throw new Error("Login cancelled");
  if (pat?.trim()) {
    return patLogin(callbacks, pat.trim(), mode);
  }
  if (!region.supportsBrowserLogin) {
    throw new Error(
      `Qoder CN browser login is not supported here. Paste a Qoder CN PAT from ${region.patManageUrl} or set QODERCN_PERSONAL_ACCESS_TOKEN.`
    );
  }
  if (getSignal(callbacks)?.aborted) throw new Error("Login cancelled");
  return runDeviceFlow(callbacks);
}
async function patLogin(callbacks, providedPat, mode) {
  const region = getQoderRegionConfig(mode);
  let pat = providedPat;
  if (!pat) {
    const prompt = getPrompt(callbacks);
    const entered = await prompt({
      message: !region.supportsBrowserLogin ? "Paste your Qoder CN Personal Access Token" : "Paste your Qoder Personal Access Token (pt-...)",
      placeholder: "pt-...",
      allowEmpty: false
    });
    if (getSignal(callbacks)?.aborted) throw new Error("Login cancelled");
    pat = entered?.trim();
  }
  if (!pat) {
    throw new Error("No Personal Access Token provided");
  }
  getProgress(callbacks)?.("Exchanging access token...");
  const creds = await credentialsFromPat(pat, mode);
  getProgress(callbacks)?.("Login successful!");
  return creds;
}
function abortableDelay(ms, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason || new Error("Login cancelled"));
  return new Promise((resolve2, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve2();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason || new Error("Login cancelled"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
async function runDeviceFlow(callbacks) {
  const { codeVerifier, codeChallenge } = generatePKCE();
  const nonce = crypto2.randomUUID();
  const machineID = getMachineId();
  const verificationURI = getQoderDeviceLoginURL(codeChallenge, machineID, nonce);
  getProgress(callbacks)?.("Please complete login in your browser...");
  callbacks.onAuth({
    url: verificationURI,
    instructions: "Click to sign in with your Qoder account in the browser."
  });
  const pollURL = getQoderDevicePollURL(nonce, codeVerifier);
  const pollInterval = 2e3;
  const maxAttempts = 90;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (getSignal(callbacks)?.aborted) throw new Error("Login cancelled");
    await abortableDelay(pollInterval, getSignal(callbacks));
    try {
      const response = await fetch(pollURL, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "pi-provider-qoder"
        },
        signal: getSignal(callbacks)
      });
      if (response.status === 202 || response.status === 404) {
        continue;
      }
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Device token poll failed: ${response.status} ${response.statusText}. Response: ${errText}`);
      }
      const tokenData = await response.json();
      if (!tokenData.token) {
        throw new Error("Device token poll returned empty access token");
      }
      const expireMs = parseExpiresAt(tokenData.expires_at, tokenData.expires_in);
      getProgress(callbacks)?.("Fetching user profile...");
      let email = "";
      let name = "";
      try {
        const userinfoRes = await fetch(getQoderUserInfoURL("global"), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${tokenData.token}`,
            Accept: "application/json",
            "User-Agent": "pi-provider-qoder"
          }
        });
        if (userinfoRes.ok) {
          const userinfo = await userinfoRes.json();
          email = userinfo.email || "";
          name = userinfo.name || userinfo.username || "";
        }
      } catch {
      }
      getProgress(callbacks)?.("Login successful!");
      return {
        refresh: `${tokenData.refresh_token}|${tokenData.user_id}|${machineID}`,
        access: tokenData.token,
        expires: expireMs - 5 * 60 * 1e3,
        // 5 min buffer
        userID: tokenData.user_id,
        email,
        name,
        machineID
      };
    } catch (e) {
      const err = e;
      if (err.name === "AbortError" || getSignal(callbacks)?.aborted) {
        throw new Error("Login cancelled");
      }
      throw e;
    }
  }
  throw new Error("Authorization timed out");
}

// src/auth/oauth.ts
var AuthStorage2 = PiCodingAgent.AuthStorage;
var identityCache = /* @__PURE__ */ new Map();
function getHomeDir4() {
  return process.env.HOME || process.env.USERPROFILE || homedir4();
}
function getAuthFilePath() {
  return join4(getHomeDir4(), ".pi", "agent", "auth.json");
}
var authFileMem;
function readAuthFileCached() {
  const authPath = getAuthFilePath();
  if (authFileMem !== void 0) {
    if (authFileMem === null) return null;
    if (authFileMem.path === authPath) return authFileMem.data;
  }
  if (!existsSync4(authPath)) {
    authFileMem = null;
    return null;
  }
  try {
    const data = JSON.parse(readFileSync4(authPath, "utf-8"));
    authFileMem = { path: authPath, data };
    return data;
  } catch {
    authFileMem = null;
    return null;
  }
}
function getQoderPatForMode(mode) {
  for (const envName of getQoderRegionConfig(mode).patEnvNames) {
    const value = process.env[envName];
    if (value) return value;
  }
  return "";
}
function saveCredentialsToAuthFile(providerID, credentials) {
  try {
    const authPath = getAuthFilePath();
    const dir = dirname4(authPath);
    if (!existsSync4(dir)) {
      mkdirSync4(dir, { recursive: true, mode: 448 });
    }
    const existing = readAuthFileCached();
    const auth = existing ? { ...existing } : {};
    auth[providerID] = { type: "oauth", ...credentials };
    writeFileSync4(authPath, JSON.stringify(auth, null, 2), { encoding: "utf-8", mode: 384 });
    authFileMem = { path: authPath, data: auth };
    const q2 = credentials;
    if (q2.access && q2.userID) {
      identityCache.set(`${providerID}:${q2.access}`, q2);
    }
  } catch (err) {
    console.error(`[pi-provider-qoder] Failed to write auth storage for ${providerID}:`, err);
  }
}
async function autoLoginQoderFromEnvironment(providerID, mode) {
  const pat = getQoderPatForMode(mode);
  if (!pat) return;
  const credentials = await credentialsFromPat(pat, mode);
  if (typeof AuthStorage2?.create === "function") {
    try {
      const authStorage = AuthStorage2.create();
      authStorage.set(providerID, { type: "oauth", ...credentials });
    } catch {
      saveCredentialsToAuthFile(providerID, credentials);
    }
  } else {
    saveCredentialsToAuthFile(providerID, credentials);
  }
  const qCreds = credentials;
  await updateQoderModelsCache(qCreds.access, qCreds.userID, qCreds.name, qCreds.email, mode);
}
function getCachedCredentials(_accessToken, providerID = "qoder") {
  const auth = readAuthFileCached();
  if (!auth) return null;
  const creds = auth[providerID] || (providerID === "qoder" ? auth.qoder : null);
  if (creds?.userID || creds?.access) {
    if (creds.access && creds.userID) {
      identityCache.set(`${providerID}:${creds.access}`, creds);
    }
    return creds;
  }
  return null;
}
async function resolveQoderIdentity(accessToken, providerID, mode) {
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
  const creds = {
    access: accessToken,
    userID: info.userID || "qoder-user",
    email: info.email || region.userEmailFallback,
    name: info.name || region.userNameFallback,
    machineID,
    refresh: "",
    expires: 0
  };
  identityCache.set(cacheKey, creds);
  saveCredentialsToAuthFile(providerID, creds);
  return creds;
}
async function loginQoderForMode(callbacks, mode) {
  const providerID = getQoderRegionConfig(mode).providerID;
  const pat = getQoderPatForMode(mode);
  if (pat) {
    try {
      const creds2 = await credentialsFromPat(pat, mode);
      const qCreds = creds2;
      updateQoderModelsCache(qCreds.access, qCreds.userID, qCreds.name, qCreds.email, mode).catch(() => {
      });
      saveCredentialsToAuthFile(providerID, creds2);
      return creds2;
    } catch {
    }
  }
  const creds = await interactiveLogin(callbacks, mode);
  try {
    const qCreds = creds;
    updateQoderModelsCache(qCreds.access, qCreds.userID, qCreds.name, qCreds.email, mode).catch(() => {
    });
  } catch {
  }
  saveCredentialsToAuthFile(providerID, creds);
  return creds;
}
async function refreshQoderTokenForMode(credentials, mode) {
  if (isPatRefresh(credentials.refresh)) {
    const { pat } = decodePatRefresh(credentials.refresh);
    if (pat) {
      try {
        const refreshed = await credentialsFromPat(pat, mode);
        const qCreds = refreshed;
        updateQoderModelsCache(qCreds.access, qCreds.userID, qCreds.name, qCreds.email, mode).catch(() => {
        });
        return refreshed;
      } catch {
      }
    }
    return {
      ...credentials,
      expires: Date.now() + 60 * 60 * 1e3
      // extend 1 hour to retry later
    };
  }
  const parts = credentials.refresh.split("|");
  const refreshToken = parts[0] || "";
  const userID = parts[1] || "";
  const machineID = parts[2] || getMachineId();
  const prev = credentials;
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
        "User-Agent": "pi-provider-qoder"
      },
      body: JSON.stringify({ refreshToken })
    });
    if (response.ok) {
      const data = await response.json();
      const newAccess = data.token;
      const newRefresh = data.refresh_token || refreshToken;
      let expireMs = Date.now() + 30 * 24 * 60 * 60 * 1e3;
      if (data.expires_at) {
        const parsed = Date.parse(data.expires_at);
        if (!Number.isNaN(parsed)) expireMs = parsed;
      } else if (data.expires_in) {
        expireMs = Date.now() + data.expires_in * 1e3;
      }
      const refreshed = {
        ...credentials,
        refresh: `${newRefresh}|${userID}|${machineID}`,
        access: newAccess,
        expires: expireMs - 5 * 60 * 1e3,
        userID,
        email: prevEmail,
        name: prevName,
        machineID
      };
      updateQoderModelsCache(newAccess, userID, prevName, prevEmail, mode).catch(() => {
      });
      return refreshed;
    }
  } catch {
  }
  const refreshedFallback = {
    ...credentials,
    expires: Date.now() + 60 * 60 * 1e3
    // extend for 1 hour
  };
  return refreshedFallback;
}

// src/auth/usage.ts
function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function quotaNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
function normalizeBucket(value, totalKey = "total") {
  const raw = asRecord(value);
  if (!raw) return void 0;
  const total = quotaNumber(raw[totalKey]);
  const used = quotaNumber(raw.used);
  const remaining = quotaNumber(raw.remaining);
  if (total === void 0 && used === void 0 && remaining === void 0) return void 0;
  const unit = typeof raw.unit === "string" && raw.unit.trim() ? raw.unit.trim() : void 0;
  return { total, used, remaining, unit };
}
function normalizeQoderQuotaSnapshot(value) {
  const raw = asRecord(value);
  if (!raw) return void 0;
  const userQuota = normalizeBucket(raw.userQuota);
  const addOnQuota = normalizeBucket(raw.addOnQuota);
  const orgRaw = asRecord(raw.orgResourcePackage);
  const orgResourcePackage = normalizeBucket(orgRaw, orgRaw && "cap" in orgRaw ? "cap" : "total");
  if (!userQuota && !addOnQuota && !orgResourcePackage) return void 0;
  const expiration = quotaNumber(raw.expiresAt);
  const expiresAt = expiration !== void 0 && expiration <= 864e13 ? expiration : void 0;
  return { userQuota, ...addOnQuota ? { addOnQuota } : {}, orgResourcePackage, expiresAt };
}
async function fetchQoderUsageForMode(credentials, mode, signal) {
  const region = getQoderRegionConfig(mode);
  const response = await fetch(getQoderUsageURL(mode), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${credentials.access}`,
      Accept: "application/json",
      "User-Agent": "pi-provider-qoder"
    },
    signal
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Qoder usage (${response.status})`);
  }
  const raw = asRecord(await response.json());
  if (!raw) throw new Error("Invalid Qoder usage response");
  const snapshot = normalizeQoderQuotaSnapshot(raw);
  const resetAt = snapshot?.expiresAt === void 0 ? void 0 : new Date(snapshot.expiresAt).toISOString();
  const usageBuckets = [];
  for (const [id, label, bucket] of [
    ["user-quota", "User Quota", snapshot?.userQuota],
    ["add-on-quota", "Add-on Credits", snapshot?.addOnQuota],
    ["org-resource-package", "Org Resource Package", snapshot?.orgResourcePackage]
  ]) {
    if (!bucket) continue;
    usageBuckets.push({
      id,
      label,
      usedDisplay: bucket.used === void 0 ? "unknown" : bucket.used.toFixed(2),
      limitDisplay: bucket.total?.toFixed(2),
      unit: bucket.unit,
      resetAt
    });
  }
  const personal = snapshot?.userQuota;
  const remainingText = personal?.remaining === void 0 ? "" : `${personal.remaining.toFixed(2)}${personal.unit ? ` ${personal.unit}` : ""} remaining`;
  const addOn = snapshot?.addOnQuota;
  const addOnText = addOn?.remaining === void 0 ? "" : `Add-on: ${addOn.remaining.toFixed(2)}${addOn.unit ? ` ${addOn.unit}` : ""} remaining`;
  return {
    summary: [remainingText, addOnText].filter(Boolean).join(" \xB7 "),
    subscriptionTitle: region.usageTitle,
    resetAt,
    manageUrl: region.manageUrl,
    usageBuckets,
    raw
  };
}

// src/credit-footer.ts
import { isAbsolute, relative, resolve, sep } from "node:path";

// node_modules/marked/lib/marked.esm.js
function A() {
  return { async: false, breaks: false, extensions: null, gfm: true, hooks: null, pedantic: false, renderer: null, silent: false, tokenizer: null, walkTokens: null };
}
var R = A();
function j(l3) {
  R = l3;
}
var z = { exec: () => null };
function I(l3) {
  let e = [];
  return (t) => {
    let n = Math.max(0, Math.min(3, t - 1)), s = e[n];
    return s || (s = l3(n), e[n] = s), s;
  };
}
function k(l3, e = "") {
  let t = typeof l3 == "string" ? l3 : l3.source, n = { replace: (s, r) => {
    let i = typeof r == "string" ? r : r.source;
    return i = i.replace(m.caret, "$1"), t = t.replace(s, i), n;
  }, getRegex: () => new RegExp(t, e) };
  return n;
}
var Oe = ((l3 = "") => {
  try {
    return !!new RegExp("(?<=1)(?<!1)" + l3);
  } catch {
    return false;
  }
})();
var m = { codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm, outputLinkReplace: /\\([\[\]])/g, indentCodeCompensation: /^(\s+)(?:```)/, beginningSpace: /^\s+/, endingHash: /#$/, startingSpaceChar: /^ /, endingSpaceChar: / $/, nonSpaceChar: /[^ ]/, newLineCharGlobal: /\n/g, tabCharGlobal: /\t/g, multipleSpaceGlobal: /\s+/g, blankLine: /^[ \t]*$/, doubleBlankLine: /\n[ \t]*\n[ \t]*$/, blockquoteStart: /^ {0,3}>/, blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g, blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm, listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g, listIsTask: /^\[[ xX]\] +\S/, listReplaceTask: /^\[[ xX]\] +/, listTaskCheckbox: /\[[ xX]\]/, anyLine: /\n.*\n/, hrefBrackets: /^<(.*)>$/, tableDelimiter: /[:|]/, tableAlignChars: /^\||\| *$/g, tableRowBlankLine: /\n[ \t]*$/, tableAlignRight: /^ *-+: *$/, tableAlignCenter: /^ *:-+: *$/, tableAlignLeft: /^ *:-+ *$/, startATag: /^<a /i, endATag: /^<\/a>/i, startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i, endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i, startAngleBracket: /^</, endAngleBracket: />$/, pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/, unicodeAlphaNumeric: /[\p{L}\p{N}]/u, escapeTest: /[&<>"']/, escapeReplace: /[&<>"']/g, escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/, escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, caret: /(^|[^\[])\^/g, percentDecode: /%25/g, findPipe: /\|/g, splitPipe: / \|/, slashPipe: /\\\|/g, carriageReturn: /\r\n|\r/g, spaceLine: /^ +$/gm, notSpaceStart: /^\S*/, endingNewline: /\n$/, listItemRegex: (l3) => new RegExp(`^( {0,3}${l3})((?:[	 ][^\\n]*)?(?:\\n|$))`), nextBulletRegex: I((l3) => new RegExp(`^ {0,${l3}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`)), hrRegex: I((l3) => new RegExp(`^ {0,${l3}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`)), fencesBeginRegex: I((l3) => new RegExp(`^ {0,${l3}}(?:\`\`\`|~~~)`)), headingBeginRegex: I((l3) => new RegExp(`^ {0,${l3}}#`)), htmlBeginRegex: I((l3) => new RegExp(`^ {0,${l3}}<(?:[a-z].*>|!--)`, "i")), blockquoteBeginRegex: I((l3) => new RegExp(`^ {0,${l3}}>`)) };
var Te = /^(?:[ \t]*(?:\n|$))+/;
var we = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
var ye = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
var q = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
var Pe = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
var U = / {0,3}(?:[*+-]|\d{1,9}[.)])/;
var oe = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/;
var ae = k(oe).replace(/bull/g, U).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}(?:\s|$)/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex();
var Se = k(oe).replace(/bull/g, U).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}(?:\s|$)/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex();
var K = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table|[ \t]+\n)[^\n]+)*)/;
var _e = /^[^\n]+/;
var W = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/;
var $e = k(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", W).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
var Le = k(/^(bull)([ \t][^\n]*?)?(?:\n|$)/).replace(/bull/g, U).getRegex();
var Q = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
var X = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
var Ee = k("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n*|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>[^\\n]*\\n*|$)|<![A-Z][\\s\\S]*?(?:>[^\\n]*\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>[^\\n]*\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", X).replace("tag", Q).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
var le = (l3) => k(K).replace("hr", q).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace("list", l3).replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", Q).getRegex();
var ze = le(/ {0,3}(?:[*+-]|1[.)])[ \t]+[^ \t\n]/);
var Me = le(/ {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]|\n|$)/);
var Ae = k(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", Me).getRegex();
var J = { blockquote: Ae, code: we, def: $e, fences: ye, heading: Pe, hr: q, html: Ee, lheading: ae, list: Le, newline: Te, paragraph: ze, table: z, text: _e };
var se = k("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", q).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", Q).getRegex();
var Ie = { ...J, lheading: Se, table: se, paragraph: k(K).replace("hr", q).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", se).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]+[^ \\t\\n]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", Q).getRegex() };
var Ce = { ...J, html: k(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", X).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(), def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/, heading: /^(#{1,6})(.*)(?:\n+|$)/, fences: z, lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/, paragraph: k(K).replace("hr", q).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", ae).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex() };
var Be = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
var De = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
var ue = /^( {2,}|\\)\n(?!\s*$)/;
var qe = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
var _ = /[\p{P}\p{S}]/u;
var C = /[\s\p{P}\p{S}]/u;
var v = /[^\s\p{P}\p{S}]/u;
var ve = k(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, C).getRegex();
var He = /[\p{Pi}\p{Ps}"']/u;
var pe = /(?!~)[\p{P}\p{S}]/u;
var Ze = /(?!~)[\s\p{P}\p{S}]/u;
var Ge = /(?:[^\s\p{P}\p{S}]|~)/u;
var Qe = k(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", Oe ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex();
var ce = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/;
var Ne = k(ce, "u").replace(/punct/g, _).getRegex();
var je = k(ce, "u").replace(/punct/g, pe).getRegex();
var Fe = /^(?:\*+(?:((?!\*)(?!openQuote)punct)|([^\s*]))?)|^_+(?:((?!_)(?!openQuote)punct)|([^\s_]))?/;
var Ue = k(Fe, "u").replace(/openQuote/g, He).replace(/punct/g, _).getRegex();
var he = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)";
var Ke = k(he, "gu").replace(/notPunctSpace/g, v).replace(/punctSpace/g, C).replace(/punct/g, _).getRegex();
var We = k(he, "gu").replace(/notPunctSpace/g, Ge).replace(/punctSpace/g, Ze).replace(/punct/g, pe).getRegex();
var Xe = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)[\\s](\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|(?:(?!\\*)punct|notPunctSpace)(\\*+)(?!\\*)(?=notPunctSpace)";
var Je = k(Xe, "gu").replace(/notPunctSpace/g, v).replace(/punctSpace/g, C).replace(/punct/g, _).getRegex();
var Ve = k("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, v).replace(/punctSpace/g, C).replace(/punct/g, _).getRegex();
var Ye = "^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)[\\s](_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)|(?:(?!_)punct|notPunctSpace)(_+)(?!_)(?=notPunctSpace)";
var et = k(Ye, "gu").replace(/notPunctSpace/g, v).replace(/punctSpace/g, C).replace(/punct/g, _).getRegex();
var tt = k(/^~~?(?:((?!~)punct)|[^\s~])/, "u").replace(/punct/g, _).getRegex();
var nt = "^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)";
var rt = k(nt, "gu").replace(/notPunctSpace/g, v).replace(/punctSpace/g, C).replace(/punct/g, _).getRegex();
var st = k(/\\(punct)/, "gu").replace(/punct/g, _).getRegex();
var it = k(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
var ot = k(X).replace("(?:-->|$)", "-->").getRegex();
var at = k("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", ot).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
var G = /(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/;
var lt = k(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?\s*\)/).replace("label", G).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\))/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
var ke = k(/^!?\[(label)\]\[(ref)\]/).replace("label", G).replace("ref", W).getRegex();
var de = k(/^!?\[(ref)\](?:\[\])?/).replace("ref", W).getRegex();
var ut = k("reflink|nolink(?!\\()", "g").replace("reflink", ke).replace("nolink", de).getRegex();
var ie = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
var V = { _backpedal: z, anyPunctuation: st, autolink: it, blockSkip: Qe, br: ue, code: De, del: z, delLDelim: z, delRDelim: z, emStrongLDelim: Ne, emStrongRDelimAst: Ke, emStrongRDelimUnd: Ve, escape: Be, link: lt, nolink: de, punctuation: ve, reflink: ke, reflinkSearch: ut, tag: at, text: qe, url: z };
var pt = { ...V, emStrongLDelim: Ue, emStrongRDelimAst: Je, emStrongRDelimUnd: et, link: k(/^!?\[(label)\]\((.*?)\)/).replace("label", G).getRegex(), reflink: k(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", G).getRegex() };
var F = { ...V, emStrongRDelimAst: We, emStrongLDelim: je, delLDelim: tt, delRDelim: rt, url: k(/^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("protocol", ie).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(), _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/, del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/, text: k(/^(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/).replace("protocol", ie).getRegex() };
var ct = { ...F, br: k(ue).replace("{2,}", "*").getRegex(), text: k(F.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex() };
var H = { normal: J, gfm: Ie, pedantic: Ce };
var B = { normal: V, gfm: F, breaks: ct, pedantic: pt };
var ht = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
var ge = (l3) => ht[l3];
function T(l3, e) {
  if (e) {
    if (m.escapeTest.test(l3)) return l3.replace(m.escapeReplace, ge);
  } else if (m.escapeTestNoEncode.test(l3)) return l3.replace(m.escapeReplaceNoEncode, ge);
  return l3;
}
function Y(l3) {
  try {
    l3 = encodeURI(l3).replace(m.percentDecode, "%");
  } catch {
    return null;
  }
  return l3;
}
function ee(l3, e) {
  let t = l3.replace(m.findPipe, (r, i, o) => {
    let u = false, a = i;
    for (; --a >= 0 && o[a] === "\\"; ) u = !u;
    return u ? "|" : " |";
  }), n = t.split(m.splitPipe), s = 0;
  if (n[0].trim() || n.shift(), n.length > 0 && !n.at(-1)?.trim() && n.pop(), e) if (n.length > e) n.splice(e);
  else for (; n.length < e; ) n.push("");
  for (; s < n.length; s++) n[s] = n[s].trim().replace(m.slashPipe, "|");
  return n;
}
function $(l3, e, t) {
  let n = l3.length;
  if (n === 0) return "";
  let s = 0;
  for (; s < n; ) {
    let r = l3.charAt(n - s - 1);
    if (r === e && !t) s++;
    else if (r !== e && t) s++;
    else break;
  }
  return l3.slice(0, n - s);
}
function te(l3) {
  let e = l3.split(`
`), t = e.length - 1;
  for (; t >= 0 && m.blankLine.test(e[t]); ) t--;
  return e.length - t <= 2 ? l3 : e.slice(0, t + 1).join(`
`);
}
function fe(l3, e) {
  if (l3.indexOf(e[1]) === -1) return -1;
  let t = 0;
  for (let n = 0; n < l3.length; n++) if (l3[n] === "\\") n++;
  else if (l3[n] === e[0]) t++;
  else if (l3[n] === e[1] && (t--, t < 0)) return n;
  return t > 0 ? -2 : -1;
}
function me(l3, e = 0) {
  let t = e, n = "";
  for (let s of l3) if (s === "	") {
    let r = 4 - t % 4;
    n += " ".repeat(r), t += r;
  } else n += s, t++;
  return n;
}
function xe(l3, e, t, n, s) {
  let r = e.href, i = e.title || null, o = l3[1].replace(s.other.outputLinkReplace, "$1"), u = l3[0].charAt(0) === "!";
  n.state.inLink = true;
  let a = n.state.linkEmitted, p = n.state.inRawBlock;
  n.state.linkEmitted = false;
  let c = n.inlineTokens(o), h = n.state.linkEmitted;
  if (n.state.linkEmitted = a, n.state.inLink = false, !u) {
    if (h) {
      n.state.inRawBlock = p;
      return;
    }
    n.state.linkEmitted = true;
  }
  return { type: u ? "image" : "link", raw: t, href: r, title: i, text: o, tokens: c };
}
function kt(l3, e, t) {
  let n = l3.match(t.other.indentCodeCompensation);
  if (n === null) return e;
  let s = n[1];
  return e.split(`
`).map((r) => {
    let i = r.match(t.other.beginningSpace);
    if (i === null) return r;
    let [o] = i;
    return o.length >= s.length ? r.slice(s.length) : r;
  }).join(`
`);
}
var y = class {
  options;
  rules;
  lexer;
  constructor(e) {
    this.options = e || R;
  }
  space(e) {
    let t = this.rules.block.newline.exec(e);
    if (t && t[0].length > 0) return { type: "space", raw: t[0] };
  }
  code(e) {
    let t = this.rules.block.code.exec(e);
    if (t) {
      let n = this.options.pedantic ? t[0] : te(t[0]), s = n.replace(this.rules.other.codeRemoveIndent, "");
      return { type: "code", raw: n, codeBlockStyle: "indented", text: s };
    }
  }
  fences(e) {
    let t = this.rules.block.fences.exec(e);
    if (t) {
      let n = t[0], s = kt(n, t[3] || "", this.rules);
      return { type: "code", raw: n, lang: t[2] ? t[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : t[2], text: s };
    }
  }
  heading(e) {
    let t = this.rules.block.heading.exec(e);
    if (t) {
      let n = t[2].trim();
      if (this.rules.other.endingHash.test(n)) {
        let s = $(n, "#");
        (this.options.pedantic || !s || this.rules.other.endingSpaceChar.test(s)) && (n = s.trim());
      }
      return { type: "heading", raw: $(t[0], `
`), depth: t[1].length, text: n, tokens: this.lexer.inline(n) };
    }
  }
  hr(e) {
    let t = this.rules.block.hr.exec(e);
    if (t) return { type: "hr", raw: $(t[0], `
`) };
  }
  blockquote(e) {
    let t = this.rules.block.blockquote.exec(e);
    if (t) {
      let n = $(t[0], `
`).split(`
`), s = "", r = "", i = [];
      for (; n.length > 0; ) {
        let o = false, u = [], a;
        for (a = 0; a < n.length; a++) if (this.rules.other.blockquoteStart.test(n[a])) u.push(n[a]), o = true;
        else if (!o) u.push(n[a]);
        else break;
        n = n.slice(a);
        let p = u.join(`
`), c = p.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
        s = s ? `${s}
${p}` : p, r = r ? `${r}
${c}` : c;
        let h = this.lexer.state.top;
        if (this.lexer.state.top = true, this.lexer.blockTokens(c, i, true), this.lexer.state.top = h, n.length === 0) break;
        let d = i.at(-1);
        if (d?.type === "code") break;
        if (d?.type === "blockquote") {
          let O = d, g = n.join(`
`), w = O.raw + `
` + g.replace(this.rules.other.blockquoteSetextReplace2, ""), E = this.blockquote(w);
          i[i.length - 1] = E, s = `${s}
${g}`, r = r.substring(0, r.length - O.text.length) + E.text;
          break;
        } else if (d?.type === "list") {
          let O = d, g = O.raw + `
` + n.join(`
`), w = this.list(g);
          i[i.length - 1] = w, s = s.substring(0, s.length - d.raw.length) + w.raw, r = r.substring(0, r.length - O.raw.length) + w.raw, n = g.substring(i.at(-1).raw.length).split(`
`);
          continue;
        }
      }
      return { type: "blockquote", raw: s, tokens: i, text: r };
    }
  }
  list(e) {
    let t = this.rules.block.list.exec(e);
    if (t) {
      let n = t[1].trim(), s = n.length > 1, r = { type: "list", raw: "", ordered: s, start: s ? +n.slice(0, -1) : "", loose: false, items: [] };
      n = s ? `\\d{1,9}\\${n.slice(-1)}` : `\\${n}`, this.options.pedantic && (n = s ? n : "[*+-]");
      let i = this.rules.other.listItemRegex(n), o = false;
      for (; e; ) {
        let a = false, p = "", c = "";
        if (!(t = i.exec(e)) || this.rules.block.hr.test(e)) break;
        p = t[0], e = e.substring(p.length);
        let h = me(t[2].split(`
`, 1)[0], t[1].length), d = e.split(`
`, 1)[0], O = !h.trim(), g = 0;
        if (this.options.pedantic ? (g = 2, c = h.trimStart()) : O ? g = t[1].length + 1 : (g = h.search(this.rules.other.nonSpaceChar), g = g > 4 ? 1 : g, c = h.slice(g), g += t[1].length), O && this.rules.other.blankLine.test(d) && (p += d + `
`, e = e.substring(d.length + 1), a = true), !a) {
          let w = this.rules.other.nextBulletRegex(g), E = this.rules.other.hrRegex(g), ne = this.rules.other.fencesBeginRegex(g), re = this.rules.other.headingBeginRegex(g), be = this.rules.other.htmlBeginRegex(g), Re = this.rules.other.blockquoteBeginRegex(g);
          for (; e; ) {
            let N = e.split(`
`, 1)[0], D;
            if (d = N, this.options.pedantic ? (d = d.replace(this.rules.other.listReplaceNesting, "  "), D = d) : D = d.replace(this.rules.other.tabCharGlobal, "    "), ne.test(d) || re.test(d) || be.test(d) || Re.test(d) || w.test(d) || E.test(d)) break;
            if (D.search(this.rules.other.nonSpaceChar) >= g || !d.trim()) c += `
` + D.slice(g);
            else {
              if (O || h.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || ne.test(h) || re.test(h) || E.test(h)) break;
              c += `
` + d;
            }
            O = !d.trim(), p += N + `
`, e = e.substring(N.length + 1), h = D.slice(g);
          }
        }
        r.loose || (o ? r.loose = true : this.rules.other.doubleBlankLine.test(p) && (o = true)), r.items.push({ type: "list_item", raw: p, task: !!this.options.gfm && this.rules.other.listIsTask.test(c), loose: false, text: c, tokens: [] }), r.raw += p;
      }
      let u = r.items.at(-1);
      if (u) u.raw = u.raw.trimEnd(), u.text = u.text.trimEnd();
      else return;
      r.raw = r.raw.trimEnd();
      for (let a of r.items) if (this.lexer.state.top = false, a.tokens = this.lexer.blockTokens(a.text, []), !r.loose) {
        let p = a.tokens.filter((h) => h.type === "space"), c = p.length > 0 && p.some((h) => this.rules.other.anyLine.test(h.raw));
        r.loose = c;
      }
      for (let a of r.items) {
        let p = a.tokens[0];
        if (a.task && (p?.type === "text" || p?.type === "paragraph")) {
          a.text = a.text.replace(this.rules.other.listReplaceTask, ""), p.raw = p.raw.replace(this.rules.other.listReplaceTask, ""), p.text = p.text.replace(this.rules.other.listReplaceTask, "");
          for (let h = this.lexer.inlineQueue.length - 1; h >= 0; h--) if (this.rules.other.listIsTask.test(this.lexer.inlineQueue[h].src)) {
            this.lexer.inlineQueue[h].src = this.lexer.inlineQueue[h].src.replace(this.rules.other.listReplaceTask, "");
            break;
          }
          let c = this.rules.other.listTaskCheckbox.exec(a.raw);
          if (c) {
            let h = { type: "checkbox", raw: c[0] + " ", checked: c[0] !== "[ ]" };
            a.checked = h.checked, r.loose ? a.tokens[0] && ["paragraph", "text"].includes(a.tokens[0].type) && "tokens" in a.tokens[0] && a.tokens[0].tokens ? (a.tokens[0].raw = h.raw + a.tokens[0].raw, a.tokens[0].text = h.raw + a.tokens[0].text, a.tokens[0].tokens.unshift(h)) : a.tokens.unshift({ type: "paragraph", raw: h.raw, text: h.raw, tokens: [h] }) : a.tokens.unshift(h);
          }
        } else a.task && (a.task = false);
      }
      if (r.loose) for (let a of r.items) {
        a.loose = true;
        for (let p of a.tokens) p.type === "text" && (p.type = "paragraph");
      }
      return r;
    }
  }
  html(e) {
    let t = this.rules.block.html.exec(e);
    if (t) {
      let n = te(t[0]);
      return { type: "html", block: true, raw: n, pre: t[1] === "pre" || t[1] === "script" || t[1] === "style", text: n };
    }
  }
  def(e) {
    let t = this.rules.block.def.exec(e);
    if (t) {
      let n = t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " "), s = t[2] ? t[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", r = t[3] ? t[3].substring(1, t[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : t[3];
      return { type: "def", tag: n, raw: $(t[0], `
`), href: s, title: r };
    }
  }
  table(e) {
    let t = this.rules.block.table.exec(e);
    if (!t || !this.rules.other.tableDelimiter.test(t[2])) return;
    let n = ee(t[1]), s = t[2].replace(this.rules.other.tableAlignChars, "").split("|"), r = t[3]?.trim() ? t[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], i = { type: "table", raw: $(t[0], `
`), header: [], align: [], rows: [] };
    if (n.length === s.length) {
      for (let o of s) this.rules.other.tableAlignRight.test(o) ? i.align.push("right") : this.rules.other.tableAlignCenter.test(o) ? i.align.push("center") : this.rules.other.tableAlignLeft.test(o) ? i.align.push("left") : i.align.push(null);
      for (let o = 0; o < n.length; o++) i.header.push({ text: n[o], tokens: this.lexer.inline(n[o]), header: true, align: i.align[o] });
      for (let o of r) i.rows.push(ee(o, i.header.length).map((u, a) => ({ text: u, tokens: this.lexer.inline(u), header: false, align: i.align[a] })));
      return i;
    }
  }
  lheading(e) {
    let t = this.rules.block.lheading.exec(e);
    if (t) {
      let n = t[1].trim();
      return { type: "heading", raw: $(t[0], `
`), depth: t[2].charAt(0) === "=" ? 1 : 2, text: n, tokens: this.lexer.inline(n) };
    }
  }
  paragraph(e) {
    let t = this.rules.block.paragraph.exec(e);
    if (t) {
      let n = t[1].charAt(t[1].length - 1) === `
` ? t[1].slice(0, -1) : t[1];
      return { type: "paragraph", raw: t[0], text: n, tokens: this.lexer.inline(n) };
    }
  }
  text(e) {
    let t = this.rules.block.text.exec(e);
    if (t) return { type: "text", raw: t[0], text: t[0], tokens: this.lexer.inline(t[0]) };
  }
  escape(e) {
    let t = this.rules.inline.escape.exec(e);
    if (t) return { type: "escape", raw: t[0], text: t[1] };
  }
  tag(e) {
    let t = this.rules.inline.tag.exec(e);
    if (t) return !this.lexer.state.inLink && this.rules.other.startATag.test(t[0]) ? this.lexer.state.inLink = true : this.lexer.state.inLink && this.rules.other.endATag.test(t[0]) && (this.lexer.state.inLink = false), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(t[0]) ? this.lexer.state.inRawBlock = true : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(t[0]) && (this.lexer.state.inRawBlock = false), { type: "html", raw: t[0], inLink: this.lexer.state.inLink, inRawBlock: this.lexer.state.inRawBlock, block: false, text: t[0] };
  }
  link(e) {
    let t = this.rules.inline.link.exec(e);
    if (t) {
      let n = t[2].trim();
      if (!this.options.pedantic && this.rules.other.startAngleBracket.test(n)) {
        if (!this.rules.other.endAngleBracket.test(n)) return;
        let i = $(n.slice(0, -1), "\\");
        if ((n.length - i.length) % 2 === 0) return;
      } else {
        let i = fe(t[2], "()");
        if (i === -2) return;
        if (i > -1) {
          let u = (t[0].indexOf("!") === 0 ? 5 : 4) + t[1].length + i;
          t[2] = t[2].substring(0, i), t[0] = t[0].substring(0, u).trim(), t[3] = "";
        }
      }
      let s = t[2], r = "";
      if (this.options.pedantic) {
        let i = this.rules.other.pedanticHrefTitle.exec(s);
        i && (s = i[1], r = i[3]);
      } else r = t[3] ? t[3].slice(1, -1) : "";
      return s = s.trim(), this.rules.other.startAngleBracket.test(s) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(n) ? s = s.slice(1) : s = s.slice(1, -1)), xe(t, { href: s && s.replace(this.rules.inline.anyPunctuation, "$1"), title: r && r.replace(this.rules.inline.anyPunctuation, "$1") }, t[0], this.lexer, this.rules);
    }
  }
  reflink(e, t) {
    let n;
    if ((n = this.rules.inline.reflink.exec(e)) || (n = this.rules.inline.nolink.exec(e))) {
      let s = (n[2] || n[1]).replace(this.rules.other.multipleSpaceGlobal, " "), r = t[s.toLowerCase()];
      if (!r) {
        let i = n[0].charAt(0);
        return { type: "text", raw: i, text: i };
      }
      return xe(n, r, n[0], this.lexer, this.rules);
    }
  }
  emStrong(e, t, n = "") {
    let s = this.rules.inline.emStrongLDelim.exec(e);
    if (!s || !s[1] && !s[2] && !s[3] && !s[4] || s[4] && n.match(this.rules.other.unicodeAlphaNumeric)) return;
    if (!(s[1] || s[3] || "") || !n || this.rules.inline.punctuation.exec(n)) {
      let i = [...s[0]].length - 1, o, u, a = i, p = 0, c = s[0][0], h = n === c, d = c === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
      for (d.lastIndex = 0, t = t.slice(-1 * e.length + i); (s = d.exec(t)) !== null; ) {
        if (o = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !o) continue;
        if (u = [...o].length, s[3] || s[4]) {
          a += u;
          continue;
        } else if (s[5] || s[6]) {
          if (i % 3 && !((i + u) % 3)) {
            p += u;
            continue;
          }
          if (h) break;
        }
        if (a -= u, a > 0) continue;
        u = Math.min(u, u + a + p);
        let O = [...s[0]][0].length, g = e.slice(0, i + s.index + O + u);
        if (Math.min(i, u) % 2) {
          let E = g.slice(1, -1);
          return { type: "em", raw: g, text: E, tokens: this.lexer.inlineTokens(E) };
        }
        let w = g.slice(2, -2);
        return { type: "strong", raw: g, text: w, tokens: this.lexer.inlineTokens(w) };
      }
    }
  }
  codespan(e) {
    let t = this.rules.inline.code.exec(e);
    if (t) {
      let n = t[2].replace(this.rules.other.newLineCharGlobal, " "), s = this.rules.other.nonSpaceChar.test(n), r = this.rules.other.startingSpaceChar.test(n) && this.rules.other.endingSpaceChar.test(n);
      return s && r && (n = n.substring(1, n.length - 1)), { type: "codespan", raw: t[0], text: n };
    }
  }
  br(e) {
    let t = this.rules.inline.br.exec(e);
    if (t) return { type: "br", raw: t[0] };
  }
  del(e, t, n = "") {
    let s = this.rules.inline.delLDelim.exec(e);
    if (!s) return;
    if (!(s[1] || "") || !n || this.rules.inline.punctuation.exec(n)) {
      let i = [...s[0]].length - 1, o, u, a = i, p = this.rules.inline.delRDelim;
      for (p.lastIndex = 0, t = t.slice(-1 * e.length + i); (s = p.exec(t)) !== null; ) {
        if (o = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !o || (u = [...o].length, u !== i)) continue;
        if (s[3] || s[4]) {
          a += u;
          continue;
        }
        if (a -= u, a > 0) continue;
        u = Math.min(u, u + a);
        let c = [...s[0]][0].length, h = e.slice(0, i + s.index + c + u), d = h.slice(i, -i);
        return { type: "del", raw: h, text: d, tokens: this.lexer.inlineTokens(d) };
      }
    }
  }
  autolink(e) {
    let t = this.rules.inline.autolink.exec(e);
    if (t) {
      let n, s;
      return t[2] === "@" ? (n = t[1], s = "mailto:" + n) : (n = t[1], s = n), { type: "link", raw: t[0], text: n, href: s, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  url(e) {
    let t;
    if (t = this.rules.inline.url.exec(e)) {
      let n, s;
      if (t[2] === "@") n = t[0], s = "mailto:" + n;
      else {
        let r;
        do
          r = t[0], t[0] = this.rules.inline._backpedal.exec(t[0])?.[0] ?? "";
        while (r !== t[0]);
        n = t[0], t[1] === "www." ? s = "http://" + t[0] : s = t[0];
      }
      return { type: "link", raw: t[0], text: n, href: s, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  inlineText(e) {
    let t = this.rules.inline.text.exec(e);
    if (t) {
      let n = this.lexer.state.inRawBlock;
      return { type: "text", raw: t[0], text: t[0], escaped: n };
    }
  }
};
var x = class l {
  tokens;
  options;
  state;
  inlineQueue;
  tokenizer;
  constructor(e) {
    this.tokens = [], this.tokens.links = /* @__PURE__ */ Object.create(null), this.options = e || R, this.options.tokenizer = this.options.tokenizer || new y(), this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = { inLink: false, inRawBlock: false, linkEmitted: false, top: true };
    let t = { other: m, block: H.normal, inline: B.normal };
    this.options.pedantic ? (t.block = H.pedantic, t.inline = B.pedantic) : this.options.gfm && (t.block = H.gfm, this.options.breaks ? t.inline = B.breaks : t.inline = B.gfm), this.tokenizer.rules = t;
  }
  static get rules() {
    return { block: H, inline: B };
  }
  static lex(e, t) {
    return new l(t).lex(e);
  }
  static lexInline(e, t) {
    return new l(t).inlineTokens(e);
  }
  lex(e) {
    e = e.replace(m.carriageReturn, `
`), this.blockTokens(e, this.tokens);
    for (let t = 0; t < this.inlineQueue.length; t++) {
      let n = this.inlineQueue[t];
      this.inlineTokens(n.src, n.tokens);
    }
    return this.inlineQueue = [], this.tokens;
  }
  blockTokens(e, t = [], n = false) {
    this.tokenizer.lexer = this, this.options.pedantic && (e = e.replace(m.tabCharGlobal, "    ").replace(m.spaceLine, ""));
    let s = 1 / 0;
    for (; e; ) {
      if (e.length < s) s = e.length;
      else {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
      let r;
      if (this.options.extensions?.block?.some((o) => (r = o.call({ lexer: this }, e, t)) ? (e = e.substring(r.raw.length), t.push(r), true) : false)) continue;
      if (r = this.tokenizer.space(e)) {
        e = e.substring(r.raw.length);
        let o = t.at(-1);
        r.raw.length === 1 && o !== void 0 ? o.raw += `
` : t.push(r);
        continue;
      }
      if (r = this.tokenizer.code(e)) {
        e = e.substring(r.raw.length);
        let o = t.at(-1);
        o?.type === "paragraph" || o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.at(-1).src = o.text) : t.push(r);
        continue;
      }
      if (r = this.tokenizer.fences(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.heading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.hr(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.blockquote(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.list(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.html(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.def(e)) {
        e = e.substring(r.raw.length);
        let o = t.at(-1);
        o?.type === "paragraph" || o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.raw, this.inlineQueue.at(-1).src = o.text) : this.tokens.links[r.tag] || (this.tokens.links[r.tag] = { href: r.href, title: r.title }, t.push(r));
        continue;
      }
      if (r = this.tokenizer.table(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.lheading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      let i = e;
      if (this.options.extensions?.startBlock) {
        let o = 1 / 0, u = e.slice(1), a;
        this.options.extensions.startBlock.forEach((p) => {
          a = p.call({ lexer: this }, u), typeof a == "number" && a >= 0 && (o = Math.min(o, a));
        }), o < 1 / 0 && o >= 0 && (i = e.substring(0, o + 1));
      }
      if (this.state.top && (r = this.tokenizer.paragraph(i))) {
        let o = t.at(-1);
        n && o?.type === "paragraph" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o.text) : t.push(r), n = i.length !== e.length, e = e.substring(r.raw.length);
        continue;
      }
      if (r = this.tokenizer.text(e)) {
        e = e.substring(r.raw.length);
        let o = t.at(-1);
        o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o.text) : t.push(r);
        continue;
      }
      if (e) {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
    }
    return this.state.top = true, t;
  }
  inline(e, t = []) {
    return this.inlineQueue.push({ src: e, tokens: t }), t;
  }
  linkInText(e) {
    if (!e.includes("[")) return false;
    let t = this.tokenizer.rules.inline.link;
    for (let n of e.matchAll(this.tokenizer.rules.inline.blockSkip)) if (t.test(n[0]) && e.charAt(n.index - 1) !== "!") return true;
    for (let n of e.matchAll(this.tokenizer.rules.inline.reflinkSearch)) {
      let s = n[0], r = s.lastIndexOf("[");
      if (!(s.charAt(0) === "!" || !Object.hasOwn(this.tokens.links, s.slice(r + 1, -1))) && !(r > 1 && this.linkInText(s.slice(1, r - 1)))) return true;
    }
    return false;
  }
  inlineTokens(e, t = []) {
    this.tokenizer.lexer = this;
    let n = e;
    if (this.tokens.links && e.includes("[")) {
      let o = this.tokenizer.rules.inline.reflinkSearch, u = (a) => {
        let p = a.lastIndexOf("[");
        if (!Object.hasOwn(this.tokens.links, a.slice(p + 1, -1))) return a;
        if (p > 1 && a.charAt(0) !== "!") {
          let c = a.slice(1, p - 1);
          if (this.linkInText(c)) return "[" + c.replace(o, u) + "][" + "a".repeat(a.length - p - 2) + "]";
        }
        return "[" + "a".repeat(a.length - 2) + "]";
      };
      n = n.replace(o, u);
    }
    n = n.replace(this.tokenizer.rules.inline.anyPunctuation, (o) => "+".repeat(o.length)), n = n.replace(this.tokenizer.rules.inline.blockSkip, (o, u, a) => {
      let p = a ? a.length : 0;
      return o.slice(0, p) + "[" + "a".repeat(o.length - p - 2) + "]";
    }), n = this.options.hooks?.emStrongMask?.call({ lexer: this }, n) ?? n;
    let s = false, r = "", i = 1 / 0;
    for (; e; ) {
      if (e.length < i) i = e.length;
      else {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
      s || (r = ""), s = false;
      let o;
      if (this.options.extensions?.inline?.some((a) => (o = a.call({ lexer: this }, e, t)) ? (e = e.substring(o.raw.length), t.push(o), true) : false)) continue;
      if (o = this.tokenizer.escape(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.tag(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.link(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.reflink(e, this.tokens.links)) {
        e = e.substring(o.raw.length);
        let a = t.at(-1);
        o.type === "text" && a?.type === "text" ? (a.raw += o.raw, a.text += o.text) : t.push(o);
        continue;
      }
      if (o = this.tokenizer.emStrong(e, n, r)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.codespan(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.br(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.del(e, n, r)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.autolink(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (!this.state.inLink && (o = this.tokenizer.url(e))) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      let u = e;
      if (this.options.extensions?.startInline) {
        let a = 1 / 0, p = e.slice(1), c;
        this.options.extensions.startInline.forEach((h) => {
          c = h.call({ lexer: this }, p), typeof c == "number" && c >= 0 && (a = Math.min(a, c));
        }), a < 1 / 0 && a >= 0 && (u = e.substring(0, a + 1));
      }
      if (o = this.tokenizer.inlineText(u)) {
        e = e.substring(o.raw.length), o.raw.slice(-1) !== "_" && (r = o.raw.slice(-1)), s = true;
        let a = t.at(-1);
        a?.type === "text" ? (a.raw += o.raw, a.text += o.text) : t.push(o);
        continue;
      }
      if (e) {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
    }
    return t;
  }
  infiniteLoopError(e) {
    let t = "Infinite loop on byte: " + e;
    if (this.options.silent) console.error(t);
    else throw new Error(t);
  }
};
var P = class {
  options;
  parser;
  constructor(e) {
    this.options = e || R;
  }
  space(e) {
    return "";
  }
  code({ text: e, lang: t, escaped: n }) {
    let s = (t || "").match(m.notSpaceStart)?.[0], r = e.replace(m.endingNewline, "") + `
`;
    return s ? '<pre><code class="language-' + T(s) + '">' + (n ? r : T(r, true)) + `</code></pre>
` : "<pre><code>" + (n ? r : T(r, true)) + `</code></pre>
`;
  }
  blockquote({ tokens: e }) {
    return `<blockquote>
${this.parser.parse(e)}</blockquote>
`;
  }
  html({ text: e }) {
    return e;
  }
  def(e) {
    return "";
  }
  heading({ tokens: e, depth: t }) {
    return `<h${t}>${this.parser.parseInline(e)}</h${t}>
`;
  }
  hr(e) {
    return `<hr>
`;
  }
  list(e) {
    let t = e.ordered, n = e.start, s = "";
    for (let o = 0; o < e.items.length; o++) {
      let u = e.items[o];
      s += this.listitem(u);
    }
    let r = t ? "ol" : "ul", i = t && n !== 1 ? ' start="' + n + '"' : "";
    return "<" + r + i + `>
` + s + "</" + r + `>
`;
  }
  listitem(e) {
    return `<li>${this.parser.parse(e.tokens)}</li>
`;
  }
  checkbox({ checked: e }) {
    return "<input " + (e ? 'checked="" ' : "") + 'disabled="" type="checkbox"> ';
  }
  paragraph({ tokens: e }) {
    return `<p>${this.parser.parseInline(e)}</p>
`;
  }
  table(e) {
    let t = "", n = "";
    for (let r = 0; r < e.header.length; r++) n += this.tablecell(e.header[r]);
    t += this.tablerow({ text: n });
    let s = "";
    for (let r = 0; r < e.rows.length; r++) {
      let i = e.rows[r];
      n = "";
      for (let o = 0; o < i.length; o++) n += this.tablecell(i[o]);
      s += this.tablerow({ text: n });
    }
    return s && (s = `<tbody>${s}</tbody>`), `<table>
<thead>
` + t + `</thead>
` + s + `</table>
`;
  }
  tablerow({ text: e }) {
    return `<tr>
${e}</tr>
`;
  }
  tablecell(e) {
    let t = this.parser.parseInline(e.tokens), n = e.header ? "th" : "td";
    return (e.align ? `<${n} align="${e.align}">` : `<${n}>`) + t + `</${n}>
`;
  }
  strong({ tokens: e }) {
    return `<strong>${this.parser.parseInline(e)}</strong>`;
  }
  em({ tokens: e }) {
    return `<em>${this.parser.parseInline(e)}</em>`;
  }
  codespan({ text: e }) {
    return `<code>${T(e, true)}</code>`;
  }
  br(e) {
    return "<br>";
  }
  del({ tokens: e }) {
    return `<del>${this.parser.parseInline(e)}</del>`;
  }
  link({ href: e, title: t, tokens: n }) {
    let s = this.parser.parseInline(n), r = Y(e);
    if (r === null) return s;
    e = r;
    let i = '<a href="' + e + '"';
    return t && (i += ' title="' + T(t) + '"'), i += ">" + s + "</a>", i;
  }
  image({ href: e, title: t, text: n, tokens: s }) {
    s && (n = this.parser.parseInline(s, this.parser.textRenderer));
    let r = Y(e);
    if (r === null) return T(n);
    e = r;
    let i = `<img src="${e}" alt="${T(n)}"`;
    return t && (i += ` title="${T(t)}"`), i += ">", i;
  }
  text(e) {
    return "tokens" in e && e.tokens ? this.parser.parseInline(e.tokens) : "escaped" in e && e.escaped ? e.text : T(e.text);
  }
};
var L = class {
  strong({ text: e }) {
    return e;
  }
  em({ text: e }) {
    return e;
  }
  codespan({ text: e }) {
    return e;
  }
  del({ text: e }) {
    return e;
  }
  html({ text: e }) {
    return e;
  }
  text({ text: e }) {
    return e;
  }
  link({ text: e }) {
    return "" + e;
  }
  image({ text: e }) {
    return "" + e;
  }
  br() {
    return "";
  }
  checkbox({ raw: e }) {
    return e;
  }
};
var b = class l2 {
  options;
  renderer;
  textRenderer;
  constructor(e) {
    this.options = e || R, this.options.renderer = this.options.renderer || new P(), this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new L();
  }
  static parse(e, t) {
    return new l2(t).parse(e);
  }
  static parseInline(e, t) {
    return new l2(t).parseInline(e);
  }
  parse(e) {
    this.renderer.parser = this;
    let t = "";
    for (let n = 0; n < e.length; n++) {
      let s = e[n];
      if (this.options.extensions?.renderers?.[s.type]) {
        let i = s, o = this.options.extensions.renderers[i.type].call({ parser: this }, i);
        if (o !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "checkbox", "html", "def", "paragraph", "text"].includes(i.type)) {
          t += o || "";
          continue;
        }
      }
      let r = s;
      switch (r.type) {
        case "space": {
          t += this.renderer.space(r);
          break;
        }
        case "hr": {
          t += this.renderer.hr(r);
          break;
        }
        case "heading": {
          t += this.renderer.heading(r);
          break;
        }
        case "code": {
          t += this.renderer.code(r);
          break;
        }
        case "table": {
          t += this.renderer.table(r);
          break;
        }
        case "blockquote": {
          t += this.renderer.blockquote(r);
          break;
        }
        case "list": {
          t += this.renderer.list(r);
          break;
        }
        case "checkbox": {
          t += this.renderer.checkbox(r);
          break;
        }
        case "html": {
          t += this.renderer.html(r);
          break;
        }
        case "def": {
          t += this.renderer.def(r);
          break;
        }
        case "paragraph": {
          t += this.renderer.paragraph(r);
          break;
        }
        case "text": {
          t += this.renderer.text(r);
          break;
        }
        default: {
          let i = 'Token with "' + r.type + '" type was not found.';
          if (this.options.silent) return console.error(i), "";
          throw new Error(i);
        }
      }
    }
    return t;
  }
  parseInline(e, t = this.renderer) {
    this.renderer.parser = this;
    let n = "";
    for (let s = 0; s < e.length; s++) {
      let r = e[s];
      if (this.options.extensions?.renderers?.[r.type]) {
        let o = this.options.extensions.renderers[r.type].call({ parser: this }, r);
        if (o !== false || !["escape", "html", "link", "image", "checkbox", "strong", "em", "codespan", "br", "del", "text"].includes(r.type)) {
          n += o || "";
          continue;
        }
      }
      let i = r;
      switch (i.type) {
        case "escape": {
          n += t.text(i);
          break;
        }
        case "html": {
          n += t.html(i);
          break;
        }
        case "link": {
          n += t.link(i);
          break;
        }
        case "image": {
          n += t.image(i);
          break;
        }
        case "checkbox": {
          n += t.checkbox(i);
          break;
        }
        case "strong": {
          n += t.strong(i);
          break;
        }
        case "em": {
          n += t.em(i);
          break;
        }
        case "codespan": {
          n += t.codespan(i);
          break;
        }
        case "br": {
          n += t.br(i);
          break;
        }
        case "del": {
          n += t.del(i);
          break;
        }
        case "text": {
          n += t.text(i);
          break;
        }
        default: {
          let o = 'Token with "' + i.type + '" type was not found.';
          if (this.options.silent) return console.error(o), "";
          throw new Error(o);
        }
      }
    }
    return n;
  }
};
var S = class {
  options;
  block;
  constructor(e) {
    this.options = e || R;
  }
  static passThroughHooks = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens", "emStrongMask"]);
  static passThroughHooksRespectAsync = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens"]);
  preprocess(e) {
    return e;
  }
  postprocess(e) {
    return e;
  }
  processAllTokens(e) {
    return e;
  }
  emStrongMask(e) {
    return e;
  }
  provideLexer(e = this.block) {
    return e ? x.lex : x.lexInline;
  }
  provideParser(e = this.block) {
    return e ? b.parse : b.parseInline;
  }
};
var Z = class {
  defaults = A();
  options = this.setOptions;
  parse = this.parseMarkdown(true);
  parseInline = this.parseMarkdown(false);
  Parser = b;
  Renderer = P;
  TextRenderer = L;
  Lexer = x;
  Tokenizer = y;
  Hooks = S;
  constructor(...e) {
    this.use(...e);
  }
  walkTokens(e, t) {
    let n = [];
    for (let s of e) switch (n = n.concat(t.call(this, s)), s.type) {
      case "table": {
        let r = s;
        for (let i of r.header) n = n.concat(this.walkTokens(i.tokens, t));
        for (let i of r.rows) for (let o of i) n = n.concat(this.walkTokens(o.tokens, t));
        break;
      }
      case "list": {
        let r = s;
        n = n.concat(this.walkTokens(r.items, t));
        break;
      }
      default: {
        let r = s;
        this.defaults.extensions?.childTokens?.[r.type] ? this.defaults.extensions.childTokens[r.type].forEach((i) => {
          let o = r[i].flat(1 / 0);
          n = n.concat(this.walkTokens(o, t));
        }) : r.tokens && (n = n.concat(this.walkTokens(r.tokens, t)));
      }
    }
    return n;
  }
  use(...e) {
    let t = this.defaults.extensions || { renderers: {}, childTokens: {} };
    return e.forEach((n) => {
      let s = { ...n };
      if (s.async = this.defaults.async || s.async || false, n.extensions && (n.extensions.forEach((r) => {
        if (!r.name) throw new Error("extension name required");
        if ("renderer" in r) {
          let i = t.renderers[r.name];
          i ? t.renderers[r.name] = function(...o) {
            let u = r.renderer.apply(this, o);
            return u === false && (u = i.apply(this, o)), u;
          } : t.renderers[r.name] = r.renderer;
        }
        if ("tokenizer" in r) {
          if (!r.level || r.level !== "block" && r.level !== "inline") throw new Error("extension level must be 'block' or 'inline'");
          let i = t[r.level];
          i ? i.unshift(r.tokenizer) : t[r.level] = [r.tokenizer], r.start && (r.level === "block" ? t.startBlock ? t.startBlock.push(r.start) : t.startBlock = [r.start] : r.level === "inline" && (t.startInline ? t.startInline.push(r.start) : t.startInline = [r.start]));
        }
        "childTokens" in r && r.childTokens && (t.childTokens[r.name] = r.childTokens);
      }), s.extensions = t), n.renderer) {
        let r = this.defaults.renderer || new P(this.defaults);
        for (let i in n.renderer) {
          if (!(i in r)) throw new Error(`renderer '${i}' does not exist`);
          if (["options", "parser"].includes(i)) continue;
          let o = i, u = n.renderer[o], a = r[o];
          r[o] = (...p) => {
            let c = u.apply(r, p);
            return c === false && (c = a.apply(r, p)), c || "";
          };
        }
        s.renderer = r;
      }
      if (n.tokenizer) {
        let r = this.defaults.tokenizer || new y(this.defaults);
        for (let i in n.tokenizer) {
          if (!(i in r)) throw new Error(`tokenizer '${i}' does not exist`);
          if (["options", "rules", "lexer"].includes(i)) continue;
          let o = i, u = n.tokenizer[o], a = r[o];
          r[o] = (...p) => {
            let c = u.apply(r, p);
            return c === false && (c = a.apply(r, p)), c;
          };
        }
        s.tokenizer = r;
      }
      if (n.hooks) {
        let r = this.defaults.hooks || new S();
        for (let i in n.hooks) {
          if (!(i in r)) throw new Error(`hook '${i}' does not exist`);
          if (["options", "block"].includes(i)) continue;
          let o = i, u = n.hooks[o], a = r[o];
          S.passThroughHooks.has(i) ? r[o] = (p) => {
            if (this.defaults.async && S.passThroughHooksRespectAsync.has(i)) return (async () => {
              let h = await u.call(r, p);
              return a.call(r, h);
            })();
            let c = u.call(r, p);
            return a.call(r, c);
          } : r[o] = (...p) => {
            if (this.defaults.async) return (async () => {
              let h = await u.apply(r, p);
              return h === false && (h = await a.apply(r, p)), h;
            })();
            let c = u.apply(r, p);
            return c === false && (c = a.apply(r, p)), c;
          };
        }
        s.hooks = r;
      }
      if (n.walkTokens) {
        let r = this.defaults.walkTokens, i = n.walkTokens;
        s.walkTokens = function(o) {
          let u = [];
          return u.push(i.call(this, o)), r && (u = u.concat(r.call(this, o))), u;
        };
      }
      this.defaults = { ...this.defaults, ...s };
    }), this;
  }
  setOptions(e) {
    return this.defaults = { ...this.defaults, ...e }, this;
  }
  lexer(e, t) {
    return x.lex(e, t ?? this.defaults);
  }
  parser(e, t) {
    return b.parse(e, t ?? this.defaults);
  }
  parseMarkdown(e) {
    return (n, s) => {
      let r = { ...s }, i = { ...this.defaults, ...r }, o = this.onError(!!i.silent, !!i.async);
      if (this.defaults.async === true && r.async === false) return o(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
      if (typeof n > "u" || n === null) return o(new Error("marked(): input parameter is undefined or null"));
      if (typeof n != "string") return o(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(n) + ", string expected"));
      if (i.hooks && (i.hooks.options = i, i.hooks.block = e), i.async) return (async () => {
        let u = i.hooks ? await i.hooks.preprocess(n) : n, p = await (i.hooks ? await i.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(u, i), c = i.hooks ? await i.hooks.processAllTokens(p) : p;
        i.walkTokens && await Promise.all(this.walkTokens(c, i.walkTokens));
        let d = await (i.hooks ? await i.hooks.provideParser(e) : e ? b.parse : b.parseInline)(c, i);
        return i.hooks ? await i.hooks.postprocess(d) : d;
      })().catch(o);
      try {
        i.hooks && (n = i.hooks.preprocess(n));
        let a = (i.hooks ? i.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(n, i);
        i.hooks && (a = i.hooks.processAllTokens(a)), i.walkTokens && this.walkTokens(a, i.walkTokens);
        let c = (i.hooks ? i.hooks.provideParser(e) : e ? b.parse : b.parseInline)(a, i);
        return i.hooks && (c = i.hooks.postprocess(c)), c;
      } catch (u) {
        return o(u);
      }
    };
  }
  onError(e, t) {
    return (n) => {
      if (n.message += `
Please report this to https://github.com/markedjs/marked.`, e) {
        let s = "<p>An error occurred:</p><pre>" + T(n.message + "", true) + "</pre>";
        return t ? Promise.resolve(s) : s;
      }
      if (t) return Promise.reject(n);
      throw n;
    };
  }
};
var M = new Z();
function f(l3, e) {
  return M.parse(l3, e);
}
f.options = f.setOptions = function(l3) {
  return M.setOptions(l3), f.defaults = M.defaults, j(f.defaults), f;
};
f.getDefaults = A;
f.defaults = R;
function dt(...l3) {
  return M.use(...l3), f.defaults = M.defaults, j(f.defaults), f;
}
f.use = dt;
f.walkTokens = function(l3, e) {
  return M.walkTokens(l3, e);
};
f.parseInline = M.parseInline;
f.Parser = b;
f.parser = b.parse;
f.Renderer = P;
f.TextRenderer = L;
f.Lexer = x;
f.lexer = x.lex;
f.Tokenizer = y;
f.Hooks = S;
f.parse = f;
var nn = f.options;
var rn = f.setOptions;
var sn = f.walkTokens;
var on = f.parseInline;
var ln = b.parse;
var un = x.lex;

// node_modules/get-east-asian-width/lookup-data.js
var ambiguousMinimalCodePoint = 161;
var ambiguousMaximumCodePoint = 1114109;
var ambiguousRanges = [161, 161, 164, 164, 167, 168, 170, 170, 173, 174, 176, 180, 182, 186, 188, 191, 198, 198, 208, 208, 215, 216, 222, 225, 230, 230, 232, 234, 236, 237, 240, 240, 242, 243, 247, 250, 252, 252, 254, 254, 257, 257, 273, 273, 275, 275, 283, 283, 294, 295, 299, 299, 305, 307, 312, 312, 319, 322, 324, 324, 328, 331, 333, 333, 338, 339, 358, 359, 363, 363, 462, 462, 464, 464, 466, 466, 468, 468, 470, 470, 472, 472, 474, 474, 476, 476, 593, 593, 609, 609, 708, 708, 711, 711, 713, 715, 717, 717, 720, 720, 728, 731, 733, 733, 735, 735, 768, 879, 913, 929, 931, 937, 945, 961, 963, 969, 1025, 1025, 1040, 1103, 1105, 1105, 8208, 8208, 8211, 8214, 8216, 8217, 8220, 8221, 8224, 8226, 8228, 8231, 8240, 8240, 8242, 8243, 8245, 8245, 8251, 8251, 8254, 8254, 8308, 8308, 8319, 8319, 8321, 8324, 8364, 8364, 8451, 8451, 8453, 8453, 8457, 8457, 8467, 8467, 8470, 8470, 8481, 8482, 8486, 8486, 8491, 8491, 8531, 8532, 8539, 8542, 8544, 8555, 8560, 8569, 8585, 8585, 8592, 8601, 8632, 8633, 8658, 8658, 8660, 8660, 8679, 8679, 8704, 8704, 8706, 8707, 8711, 8712, 8715, 8715, 8719, 8719, 8721, 8721, 8725, 8725, 8730, 8730, 8733, 8736, 8739, 8739, 8741, 8741, 8743, 8748, 8750, 8750, 8756, 8759, 8764, 8765, 8776, 8776, 8780, 8780, 8786, 8786, 8800, 8801, 8804, 8807, 8810, 8811, 8814, 8815, 8834, 8835, 8838, 8839, 8853, 8853, 8857, 8857, 8869, 8869, 8895, 8895, 8978, 8978, 9312, 9449, 9451, 9547, 9552, 9587, 9600, 9615, 9618, 9621, 9632, 9633, 9635, 9641, 9650, 9651, 9654, 9655, 9660, 9661, 9664, 9665, 9670, 9672, 9675, 9675, 9678, 9681, 9698, 9701, 9711, 9711, 9733, 9734, 9737, 9737, 9742, 9743, 9756, 9756, 9758, 9758, 9792, 9792, 9794, 9794, 9824, 9825, 9827, 9829, 9831, 9834, 9836, 9837, 9839, 9839, 9886, 9887, 9919, 9919, 9926, 9933, 9935, 9939, 9941, 9953, 9955, 9955, 9960, 9961, 9963, 9969, 9972, 9972, 9974, 9977, 9979, 9980, 9982, 9983, 10045, 10045, 10102, 10111, 11094, 11097, 12872, 12879, 57344, 63743, 65024, 65039, 65533, 65533, 127232, 127242, 127248, 127277, 127280, 127337, 127344, 127373, 127375, 127376, 127387, 127404, 917760, 917999, 983040, 1048573, 1048576, 1114109];
var fullwidthMinimalCodePoint = 12288;
var fullwidthMaximumCodePoint = 65510;
var fullwidthRanges = [12288, 12288, 65281, 65376, 65504, 65510];
var wideMinimalCodePoint = 4352;
var wideMaximumCodePoint = 262141;
var wideRanges = [4352, 4447, 8986, 8987, 9001, 9002, 9193, 9196, 9200, 9200, 9203, 9203, 9725, 9726, 9748, 9749, 9776, 9783, 9800, 9811, 9855, 9855, 9866, 9871, 9875, 9875, 9889, 9889, 9898, 9899, 9917, 9918, 9924, 9925, 9934, 9934, 9940, 9940, 9962, 9962, 9970, 9971, 9973, 9973, 9978, 9978, 9981, 9981, 9989, 9989, 9994, 9995, 10024, 10024, 10060, 10060, 10062, 10062, 10067, 10069, 10071, 10071, 10133, 10135, 10160, 10160, 10175, 10175, 11035, 11036, 11088, 11088, 11093, 11093, 11904, 11929, 11931, 12019, 12032, 12245, 12272, 12287, 12289, 12350, 12353, 12438, 12441, 12543, 12549, 12591, 12593, 12686, 12688, 12773, 12783, 12830, 12832, 12871, 12880, 42124, 42128, 42182, 43360, 43388, 44032, 55203, 63744, 64255, 65040, 65049, 65072, 65106, 65108, 65126, 65128, 65131, 94176, 94180, 94192, 94198, 94208, 101589, 101631, 101662, 101760, 101874, 110576, 110579, 110581, 110587, 110589, 110590, 110592, 110882, 110898, 110898, 110928, 110930, 110933, 110933, 110948, 110951, 110960, 111355, 119552, 119638, 119648, 119670, 126980, 126980, 127183, 127183, 127374, 127374, 127377, 127386, 127488, 127490, 127504, 127547, 127552, 127560, 127568, 127569, 127584, 127589, 127744, 127776, 127789, 127797, 127799, 127868, 127870, 127891, 127904, 127946, 127951, 127955, 127968, 127984, 127988, 127988, 127992, 128062, 128064, 128064, 128066, 128252, 128255, 128317, 128331, 128334, 128336, 128359, 128378, 128378, 128405, 128406, 128420, 128420, 128507, 128591, 128640, 128709, 128716, 128716, 128720, 128722, 128725, 128728, 128732, 128735, 128747, 128748, 128756, 128764, 128992, 129003, 129008, 129008, 129292, 129338, 129340, 129349, 129351, 129535, 129648, 129660, 129664, 129674, 129678, 129734, 129736, 129736, 129741, 129756, 129759, 129770, 129775, 129784, 131072, 196605, 196608, 262141];

// node_modules/get-east-asian-width/utilities.js
var isInRange = (ranges, codePoint) => {
  let low = 0;
  let high = Math.floor(ranges.length / 2) - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const i = mid * 2;
    if (codePoint < ranges[i]) {
      high = mid - 1;
    } else if (codePoint > ranges[i + 1]) {
      low = mid + 1;
    } else {
      return true;
    }
  }
  return false;
};

// node_modules/get-east-asian-width/lookup.js
var commonCjkCodePoint = 19968;
var [wideFastPathStart, wideFastPathEnd] = /* @__PURE__ */ findWideFastPathRange(wideRanges);
function findWideFastPathRange(ranges) {
  let fastPathStart = ranges[0];
  let fastPathEnd = ranges[1];
  for (let index = 0; index < ranges.length; index += 2) {
    const start = ranges[index];
    const end = ranges[index + 1];
    if (commonCjkCodePoint >= start && commonCjkCodePoint <= end) {
      return [start, end];
    }
    if (end - start > fastPathEnd - fastPathStart) {
      fastPathStart = start;
      fastPathEnd = end;
    }
  }
  return [fastPathStart, fastPathEnd];
}
var isAmbiguous = (codePoint) => {
  if (codePoint < ambiguousMinimalCodePoint || codePoint > ambiguousMaximumCodePoint) {
    return false;
  }
  return isInRange(ambiguousRanges, codePoint);
};
var isFullWidth = (codePoint) => {
  if (codePoint < fullwidthMinimalCodePoint || codePoint > fullwidthMaximumCodePoint) {
    return false;
  }
  return isInRange(fullwidthRanges, codePoint);
};
var isWide = (codePoint) => {
  if (codePoint >= wideFastPathStart && codePoint <= wideFastPathEnd) {
    return true;
  }
  if (codePoint < wideMinimalCodePoint || codePoint > wideMaximumCodePoint) {
    return false;
  }
  return isInRange(wideRanges, codePoint);
};

// node_modules/get-east-asian-width/index.js
function validate(codePoint) {
  if (!Number.isSafeInteger(codePoint)) {
    throw new TypeError(`Expected a code point, got \`${typeof codePoint}\`.`);
  }
}
function eastAsianWidth(codePoint, { ambiguousAsWide = false } = {}) {
  validate(codePoint);
  if (isFullWidth(codePoint) || isWide(codePoint) || ambiguousAsWide && isAmbiguous(codePoint)) {
    return 2;
  }
  return 1;
}

// node_modules/@earendil-works/pi-tui/dist/utils.js
var graphemeSegmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
var wordSegmenter = new Intl.Segmenter(void 0, { granularity: "word" });
function getGraphemeSegmenter() {
  return graphemeSegmenter;
}
function getWordSegmenter() {
  return wordSegmenter;
}
function couldBeEmoji(segment) {
  const cp = segment.codePointAt(0);
  return cp >= 126976 && cp <= 130047 || // Emoji and Pictograph
  cp >= 8960 && cp <= 9215 || // Misc technical
  cp >= 9728 && cp <= 10175 || // Misc symbols, dingbats
  cp >= 11088 && cp <= 11093 || // Specific stars/circles
  segment.includes("\uFE0F") || // Contains VS16 (emoji presentation selector)
  segment.length > 2;
}
var zeroWidthRegex = /^(?:\p{Default_Ignorable_Code_Point}|\p{Control}|\p{Mark}|\p{Surrogate})+$/v;
var leadingNonPrintingRegex = /^[\p{Default_Ignorable_Code_Point}\p{Control}\p{Format}\p{Mark}\p{Surrogate}]+/v;
var nonPrintingCharRegex = /^(?:\p{Default_Ignorable_Code_Point}|\p{Control}|\p{Format}|\p{Mark}|\p{Surrogate})$/v;
var markCharRegex = /^\p{Mark}$/v;
var terminalSpacingMarkRegex = /^(?:[\p{Spacing_Mark}--[\u1734\u302E\u302F]]|[\u065F\u0F7F\u102B\u102C\u1031\u1033-\u1035\u1038\u103A-\u103E])+$/v;
var rgiEmojiRegex = /^\p{RGI_Emoji}$/v;
var WIDTH_CACHE_SIZE = 512;
var widthCache = /* @__PURE__ */ new Map();
var cjkBreakRegex = /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}\p{Script_Extensions=Bopomofo}]/u;
var cjkPunctuationRegex = new RegExp(`(?:(?=\\p{Punctuation})${cjkBreakRegex.source}|[\uFF0C\uFF0E\uFF1A\uFF1B\uFF01\uFF1F\uFF08\uFF09\uFF3B\uFF3D\uFF5B\uFF5D\u201C\u201D\u2018\u2019\u2026\u2014])`, "u");
var autocompleteSeparatorRegex = new RegExp(`(?:\\s|${cjkPunctuationRegex.source})`, "u");
var autocompleteBoundaryRegex = new RegExp(`(?:^|${autocompleteSeparatorRegex.source})`, "u");
function isPrintableAscii(str) {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 32 || code > 126) {
      return false;
    }
  }
  return true;
}
function truncateFragmentToWidth(text, maxWidth) {
  if (maxWidth <= 0 || text.length === 0) {
    return { text: "", width: 0 };
  }
  if (isPrintableAscii(text)) {
    const clipped = text.slice(0, maxWidth);
    return { text: clipped, width: clipped.length };
  }
  const hasAnsi = text.includes("\x1B");
  const hasTabs = text.includes("	");
  if (!hasAnsi && !hasTabs) {
    let result2 = "";
    let width2 = 0;
    for (const { segment } of graphemeSegmenter.segment(text)) {
      const w = graphemeWidth(segment);
      if (width2 + w > maxWidth) {
        break;
      }
      result2 += segment;
      width2 += w;
    }
    return { text: result2, width: width2 };
  }
  let result = "";
  let width = 0;
  let i = 0;
  let pendingAnsi = "";
  while (i < text.length) {
    const ansi = extractAnsiCode(text, i);
    if (ansi) {
      pendingAnsi += ansi.code;
      i += ansi.length;
      continue;
    }
    if (text[i] === "	") {
      if (width + 3 > maxWidth) {
        break;
      }
      if (pendingAnsi) {
        result += pendingAnsi;
        pendingAnsi = "";
      }
      result += "	";
      width += 3;
      i++;
      continue;
    }
    let end = i;
    while (end < text.length && text[end] !== "	") {
      const nextAnsi = extractAnsiCode(text, end);
      if (nextAnsi) {
        break;
      }
      end++;
    }
    for (const { segment } of graphemeSegmenter.segment(text.slice(i, end))) {
      const w = graphemeWidth(segment);
      if (width + w > maxWidth) {
        return { text: result, width };
      }
      if (pendingAnsi) {
        result += pendingAnsi;
        pendingAnsi = "";
      }
      result += segment;
      width += w;
    }
    i = end;
  }
  return { text: result, width };
}
function finalizeTruncatedResult(prefix, prefixWidth, ellipsis, ellipsisWidth, maxWidth, pad) {
  const reset = "\x1B[0m";
  const hyperlinkClose = getActiveOsc8Close(prefix);
  const visibleWidth2 = prefixWidth + ellipsisWidth;
  let result;
  if (ellipsis.length > 0) {
    result = `${prefix}${hyperlinkClose}${reset}${ellipsis}${reset}`;
  } else {
    result = `${prefix}${hyperlinkClose}${reset}`;
  }
  return pad ? result + " ".repeat(Math.max(0, maxWidth - visibleWidth2)) : result;
}
function graphemeWidth(segment) {
  if (segment.length === 1) {
    const code = segment.charCodeAt(0);
    if (code >= 32 && code <= 126)
      return 1;
    if (code === 9)
      return 3;
  }
  if (terminalSpacingMarkRegex.test(segment)) {
    return [...segment].length;
  }
  if (zeroWidthRegex.test(segment)) {
    return 0;
  }
  if (couldBeEmoji(segment) && rgiEmojiRegex.test(segment)) {
    return 2;
  }
  const base = segment.replace(leadingNonPrintingRegex, "");
  const cp = base.codePointAt(0);
  if (cp === void 0) {
    return 0;
  }
  if (cp >= 127462 && cp <= 127487) {
    return 2;
  }
  let width = eastAsianWidth(cp);
  let followsMark = false;
  const chars = [...base];
  for (const char of chars.slice(1)) {
    if (terminalSpacingMarkRegex.test(char)) {
      width += 1;
      followsMark = false;
    } else if (markCharRegex.test(char)) {
      followsMark = true;
    } else if (!nonPrintingCharRegex.test(char)) {
      const c = char.codePointAt(0);
      if (followsMark || c >= 65280 && c <= 65519) {
        width += eastAsianWidth(c);
      } else if (c === 3635 || c === 3763) {
        width += 1;
      }
      followsMark = false;
    }
  }
  return width;
}
function visibleWidth(str) {
  if (str.length === 0) {
    return 0;
  }
  const asciiWidth = asciiVisibleWidth(str);
  if (asciiWidth !== -1) {
    return asciiWidth;
  }
  const cached = widthCache.get(str);
  if (cached !== void 0) {
    return cached;
  }
  let clean = str;
  if (str.includes("	")) {
    clean = clean.replace(/\t/g, "   ");
  }
  let escapeIndex = clean.indexOf("\x1B");
  if (escapeIndex !== -1) {
    let stripped = "";
    let copyFrom = 0;
    while (escapeIndex !== -1) {
      const length = ansiCodeLength(clean, escapeIndex);
      if (length > 0) {
        stripped += clean.slice(copyFrom, escapeIndex);
        escapeIndex += length;
        copyFrom = escapeIndex;
      } else {
        escapeIndex++;
      }
      escapeIndex = clean.indexOf("\x1B", escapeIndex);
    }
    clean = stripped + clean.slice(copyFrom);
  }
  let width = 0;
  for (const { segment } of graphemeSegmenter.segment(clean)) {
    width += graphemeWidth(segment);
  }
  if (widthCache.size >= WIDTH_CACHE_SIZE) {
    const firstKey = widthCache.keys().next().value;
    if (firstKey !== void 0) {
      widthCache.delete(firstKey);
    }
  }
  widthCache.set(str, width);
  return width;
}
function stripTerminalSequences(str) {
  if (!str.includes("\x1B"))
    return str;
  let result = "";
  let i = 0;
  while (i < str.length) {
    const ansi = extractAnsiCode(str, i);
    if (ansi) {
      i += ansi.length;
      continue;
    }
    result += str[i];
    i++;
  }
  return result;
}
function extractAnsiCodes(str) {
  let result = "";
  let i = str.indexOf("\x1B");
  while (i !== -1) {
    const length = ansiCodeLength(str, i);
    if (length > 0) {
      result += str.substring(i, i + length);
      i += length;
    } else {
      i++;
    }
    i = str.indexOf("\x1B", i);
  }
  return result;
}
var WHITESPACE_REGEX = /\s/;
function isWhitespaceToken(token) {
  let i = 0;
  while (i < token.length) {
    const code = token.charCodeAt(i);
    if (code === 27) {
      const length = ansiCodeLength(token, i);
      if (length === 0)
        return false;
      i += length;
    } else if (code === 32 || code >= 9 && code <= 13) {
      i++;
    } else if (code < 128 || !WHITESPACE_REGEX.test(token[i])) {
      return false;
    } else {
      i++;
    }
  }
  return true;
}
function getGraphemeCellRange(line, column) {
  let currentCol = 0;
  let i = 0;
  while (i < line.length) {
    const ansi = extractAnsiCode(line, i);
    if (ansi) {
      i += ansi.length;
      continue;
    }
    let textEnd = i;
    while (textEnd < line.length && !extractAnsiCode(line, textEnd))
      textEnd++;
    for (const { segment } of graphemeSegmenter.segment(line.slice(i, textEnd))) {
      const width = graphemeWidth(segment);
      if (width > 0 && column >= currentCol && column < currentCol + width) {
        return { start: currentCol, end: currentCol + width };
      }
      currentCol += width;
    }
    i = textEnd;
  }
  return void 0;
}
function getOsc8LinkAtColumn(line, column) {
  let activeUrl;
  let currentCol = 0;
  let i = 0;
  while (i < line.length) {
    const ansi = extractAnsiCode(line, i);
    if (ansi) {
      const hyperlink2 = /^\x1b\]8;[^;]*;([^\x07\x1b]*)(?:\x07|\x1b\\)$/.exec(ansi.code);
      if (hyperlink2)
        activeUrl = hyperlink2[1] || void 0;
      i += ansi.length;
      continue;
    }
    let textEnd = i;
    while (textEnd < line.length && !extractAnsiCode(line, textEnd))
      textEnd++;
    for (const { segment } of graphemeSegmenter.segment(line.slice(i, textEnd))) {
      const width = segment === "	" ? 3 : graphemeWidth(segment);
      if (column >= currentCol && column < currentCol + width)
        return activeUrl;
      currentCol += width;
    }
    i = textEnd;
  }
  return void 0;
}
var THAI_LAO_AM_REGEX = /[\u0e33\u0eb3]/;
var THAI_LAO_AM_GLOBAL_REGEX = /[\u0e33\u0eb3]/g;
function normalizeTerminalOutput(str) {
  let normalized = str;
  if (THAI_LAO_AM_REGEX.test(normalized)) {
    normalized = normalized.replace(THAI_LAO_AM_GLOBAL_REGEX, (char) => char === "\u0E33" ? "\u0E4D\u0E32" : "\u0ECD\u0EB2");
  }
  if (!normalized.includes("	"))
    return normalized;
  let result = "";
  let i = 0;
  while (i < normalized.length) {
    const ansi = extractAnsiCode(normalized, i);
    if (ansi) {
      result += ansi.code;
      i += ansi.length;
      continue;
    }
    result += normalized[i] === "	" ? "   " : normalized[i];
    i++;
  }
  return result;
}
function extractAnsiCode(str, pos) {
  const length = ansiCodeLength(str, pos);
  return length > 0 ? { code: str.substring(pos, pos + length), length } : null;
}
function asciiVisibleWidth(str) {
  let width = 0;
  let i = 0;
  while (i < str.length) {
    const code = str.charCodeAt(i);
    if (code >= 32 && code <= 126) {
      width++;
      i++;
    } else if (code === 9) {
      width += 3;
      i++;
    } else if (code === 27) {
      const length = ansiCodeLength(str, i);
      if (length === 0)
        return -1;
      i += length;
    } else {
      return -1;
    }
  }
  return width;
}
function ansiCodeLength(str, pos) {
  if (pos >= str.length || str.charCodeAt(pos) !== 27)
    return 0;
  const next = str[pos + 1];
  if (next === "[") {
    for (let j2 = pos + 2; j2 < str.length; j2++) {
      const c = str.charCodeAt(j2);
      if (c === 109 || c === 71 || c === 75 || c === 72 || c === 74)
        return j2 + 1 - pos;
    }
    return 0;
  }
  if (next === "]" || next === "_") {
    for (let j2 = pos + 2; j2 < str.length; j2++) {
      const c = str.charCodeAt(j2);
      if (c === 7)
        return j2 + 1 - pos;
      if (c === 27 && str[j2 + 1] === "\\")
        return j2 + 2 - pos;
    }
    return 0;
  }
  return 0;
}
function parseOsc8Hyperlink(ansiCode) {
  if (!ansiCode.startsWith("\x1B]8;")) {
    return void 0;
  }
  const terminator = ansiCode.endsWith("\x07") ? "\x07" : "\x1B\\";
  const body = ansiCode.slice(4, terminator === "\x07" ? -1 : -2);
  const separatorIndex = body.indexOf(";");
  if (separatorIndex === -1) {
    return void 0;
  }
  const params = body.slice(0, separatorIndex);
  const url = body.slice(separatorIndex + 1);
  if (!url) {
    return null;
  }
  return { params, url, terminator };
}
function formatOsc8Hyperlink(hyperlink2) {
  return `\x1B]8;${hyperlink2.params};${hyperlink2.url}${hyperlink2.terminator}`;
}
function formatOsc8Close(terminator) {
  return `\x1B]8;;${terminator}`;
}
function getActiveOsc8Close(prefix) {
  if (!prefix.includes("\x1B]8;")) {
    return "";
  }
  let activeHyperlink = null;
  let i = 0;
  while (i < prefix.length) {
    const ansi = extractAnsiCode(prefix, i);
    if (ansi) {
      const hyperlink2 = parseOsc8Hyperlink(ansi.code);
      if (hyperlink2 !== void 0) {
        activeHyperlink = hyperlink2;
      }
      i += ansi.length;
    } else {
      i++;
    }
  }
  return activeHyperlink ? formatOsc8Close(activeHyperlink.terminator) : "";
}
var AnsiCodeTracker = class {
  // Track individual attributes separately so we can reset them specifically
  bold = false;
  dim = false;
  italic = false;
  underline = false;
  blink = false;
  inverse = false;
  hidden = false;
  strikethrough = false;
  fgColor = null;
  // Stores the full code like "31" or "38;5;240"
  bgColor = null;
  // Stores the full code like "41" or "48;5;240"
  activeHyperlink = null;
  process(ansiCode) {
    const hyperlink2 = parseOsc8Hyperlink(ansiCode);
    if (hyperlink2 !== void 0) {
      this.activeHyperlink = hyperlink2;
      return;
    }
    if (!ansiCode.endsWith("m")) {
      return;
    }
    const match = ansiCode.match(/\x1b\[([\d;]*)m/);
    if (!match)
      return;
    const params = match[1];
    if (params === "" || params === "0") {
      this.reset();
      return;
    }
    const parts = params.split(";");
    let i = 0;
    while (i < parts.length) {
      const code = Number.parseInt(parts[i], 10);
      if (code === 38 || code === 48) {
        if (parts[i + 1] === "5" && parts[i + 2] !== void 0) {
          const colorCode = `${parts[i]};${parts[i + 1]};${parts[i + 2]}`;
          if (code === 38) {
            this.fgColor = colorCode;
          } else {
            this.bgColor = colorCode;
          }
          i += 3;
          continue;
        } else if (parts[i + 1] === "2" && parts[i + 4] !== void 0) {
          const colorCode = `${parts[i]};${parts[i + 1]};${parts[i + 2]};${parts[i + 3]};${parts[i + 4]}`;
          if (code === 38) {
            this.fgColor = colorCode;
          } else {
            this.bgColor = colorCode;
          }
          i += 5;
          continue;
        }
      }
      switch (code) {
        case 0:
          this.reset();
          break;
        case 1:
          this.bold = true;
          break;
        case 2:
          this.dim = true;
          break;
        case 3:
          this.italic = true;
          break;
        case 4:
          this.underline = true;
          break;
        case 5:
          this.blink = true;
          break;
        case 7:
          this.inverse = true;
          break;
        case 8:
          this.hidden = true;
          break;
        case 9:
          this.strikethrough = true;
          break;
        case 21:
          this.bold = false;
          break;
        // Some terminals
        case 22:
          this.bold = false;
          this.dim = false;
          break;
        case 23:
          this.italic = false;
          break;
        case 24:
          this.underline = false;
          break;
        case 25:
          this.blink = false;
          break;
        case 27:
          this.inverse = false;
          break;
        case 28:
          this.hidden = false;
          break;
        case 29:
          this.strikethrough = false;
          break;
        case 39:
          this.fgColor = null;
          break;
        // Default fg
        case 49:
          this.bgColor = null;
          break;
        // Default bg
        default:
          if (code >= 30 && code <= 37 || code >= 90 && code <= 97) {
            this.fgColor = String(code);
          } else if (code >= 40 && code <= 47 || code >= 100 && code <= 107) {
            this.bgColor = String(code);
          }
          break;
      }
      i++;
    }
  }
  reset() {
    this.bold = false;
    this.dim = false;
    this.italic = false;
    this.underline = false;
    this.blink = false;
    this.inverse = false;
    this.hidden = false;
    this.strikethrough = false;
    this.fgColor = null;
    this.bgColor = null;
  }
  /** Clear all state for reuse. */
  clear() {
    this.reset();
    this.activeHyperlink = null;
  }
  getActiveCodes() {
    const codes = [];
    if (this.bold)
      codes.push("1");
    if (this.dim)
      codes.push("2");
    if (this.italic)
      codes.push("3");
    if (this.underline)
      codes.push("4");
    if (this.blink)
      codes.push("5");
    if (this.inverse)
      codes.push("7");
    if (this.hidden)
      codes.push("8");
    if (this.strikethrough)
      codes.push("9");
    if (this.fgColor)
      codes.push(this.fgColor);
    if (this.bgColor)
      codes.push(this.bgColor);
    let result = codes.length > 0 ? `\x1B[${codes.join(";")}m` : "";
    if (this.activeHyperlink) {
      result += formatOsc8Hyperlink(this.activeHyperlink);
    }
    return result;
  }
  getActiveBackgroundCode() {
    return this.bgColor ? `\x1B[${this.bgColor}m` : "";
  }
  hasActiveCodes() {
    return this.bold || this.dim || this.italic || this.underline || this.blink || this.inverse || this.hidden || this.strikethrough || this.fgColor !== null || this.bgColor !== null || this.activeHyperlink !== null;
  }
  /**
   * Get reset codes for attributes that need to be turned off at line end.
   * Underline and strikethrough must be closed to prevent bleeding into padding.
   * Active OSC 8 hyperlinks must be closed and re-opened on the next line.
   * Returns empty string if no attributes need closing.
   */
  getLineEndReset() {
    let result = "";
    if (this.underline) {
      result += "\x1B[24m";
    }
    if (this.strikethrough) {
      result += "\x1B[29m";
    }
    if (this.activeHyperlink) {
      result += formatOsc8Close(this.activeHyperlink.terminator);
    }
    return result;
  }
};
function updateTrackerFromText(text, tracker) {
  let i = text.indexOf("\x1B");
  while (i !== -1) {
    const length = ansiCodeLength(text, i);
    if (length > 0) {
      tracker.process(text.substring(i, i + length));
      i += length;
    } else {
      i++;
    }
    i = text.indexOf("\x1B", i);
  }
}
function getActiveBackgroundAnsi(text) {
  const tracker = new AnsiCodeTracker();
  updateTrackerFromText(text, tracker);
  return tracker.getActiveBackgroundCode();
}
function* graphemeSegments(text) {
  for (const { segment } of graphemeSegmenter.segment(text))
    yield segment;
}
function splitIntoTokensWithAnsi(text) {
  const tokens = [];
  let current = "";
  let pendingAnsi = "";
  let currentKind = null;
  let i = 0;
  const flushCurrent = () => {
    if (!current) {
      return;
    }
    tokens.push(current);
    current = "";
    currentKind = null;
  };
  while (i < text.length) {
    const ansiResult = extractAnsiCode(text, i);
    if (ansiResult) {
      pendingAnsi += ansiResult.code;
      i += ansiResult.length;
      continue;
    }
    let end = text.indexOf("\x1B", i + 1);
    while (end !== -1 && ansiCodeLength(text, end) === 0) {
      end = text.indexOf("\x1B", end + 1);
    }
    if (end === -1)
      end = text.length;
    const chunk = text.slice(i, end);
    const ascii = isPrintableAscii(chunk);
    for (const segment of ascii ? chunk : graphemeSegments(chunk)) {
      const segmentIsSpace = segment === " ";
      if (!ascii && !segmentIsSpace && cjkBreakRegex.test(segment)) {
        flushCurrent();
        const token = pendingAnsi + segment;
        pendingAnsi = "";
        tokens.push(token);
        continue;
      }
      const segmentKind = segmentIsSpace ? "space" : "word";
      if (current && currentKind !== segmentKind) {
        flushCurrent();
      }
      if (pendingAnsi) {
        current += pendingAnsi;
        pendingAnsi = "";
      }
      currentKind = segmentKind;
      current += segment;
    }
    i = end;
  }
  if (pendingAnsi) {
    if (current) {
      current += pendingAnsi;
    } else if (tokens.length > 0) {
      tokens[tokens.length - 1] += pendingAnsi;
    } else {
      current = pendingAnsi;
    }
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}
function wrapTextWithAnsi(text, width) {
  if (!text) {
    return [""];
  }
  const inputLines = text.split(/\r\n|\r|\n/);
  const result = [];
  const tracker = new AnsiCodeTracker();
  for (const inputLine of inputLines) {
    const prefix = result.length > 0 ? tracker.getActiveCodes() : "";
    const wrappedLines = wrapSingleLine(prefix + inputLine, width);
    for (const wrappedLine of wrappedLines) {
      result.push(wrappedLine);
    }
    updateTrackerFromText(inputLine, tracker);
  }
  return result.length > 0 ? result : [""];
}
function wrapSingleLine(line, width) {
  if (!line) {
    return [""];
  }
  const visibleLength = visibleWidth(line);
  if (visibleLength <= width) {
    return [line];
  }
  const wrapped = [];
  const tracker = new AnsiCodeTracker();
  const tokens = splitIntoTokensWithAnsi(line);
  let currentLine = "";
  let currentVisibleLength = 0;
  for (const token of tokens) {
    const tokenVisibleLength = visibleWidth(token);
    const isWhitespace = isWhitespaceToken(token);
    if (tokenVisibleLength > width && !isWhitespace) {
      if (currentLine) {
        currentLine = currentLine.trimEnd();
        const lineEndReset = tracker.getLineEndReset();
        if (lineEndReset) {
          currentLine += lineEndReset;
        }
        wrapped.push(currentLine);
        currentLine = "";
        currentVisibleLength = 0;
      }
      const broken = breakLongWord(token, width, tracker);
      for (let i = 0; i < broken.length - 1; i++) {
        wrapped.push(broken[i]);
      }
      currentLine = broken[broken.length - 1];
      currentVisibleLength = visibleWidth(currentLine);
      continue;
    }
    const totalNeeded = currentVisibleLength + tokenVisibleLength;
    if (totalNeeded > width && currentVisibleLength > 0) {
      let lineToWrap = currentLine.trimEnd();
      if (isWhitespace) {
        lineToWrap += extractAnsiCodes(token);
        updateTrackerFromText(token, tracker);
      }
      const lineEndReset = tracker.getLineEndReset();
      if (lineEndReset) {
        lineToWrap += lineEndReset;
      }
      wrapped.push(lineToWrap);
      if (isWhitespace) {
        currentLine = tracker.getActiveCodes();
        currentVisibleLength = 0;
        continue;
      }
      currentLine = tracker.getActiveCodes() + token;
      currentVisibleLength = tokenVisibleLength;
    } else if (isWhitespace && totalNeeded > width && token.includes("\x1B")) {
      currentLine += extractAnsiCodes(token);
    } else {
      currentLine += token;
      currentVisibleLength += tokenVisibleLength;
    }
    updateTrackerFromText(token, tracker);
  }
  if (currentLine) {
    wrapped.push(currentLine);
  }
  return wrapped.length > 0 ? wrapped.map((line2) => line2.trimEnd()) : [""];
}
var PUNCTUATION_REGEX = /[(){}[\]<>.,;:'"!?+\-=*/\\|&%^$#@~`]/;
function isWhitespaceChar(char) {
  return /\s/.test(char);
}
function breakLongWord(word, width, tracker) {
  const lines = [];
  let currentLine = tracker.getActiveCodes();
  let currentWidth = 0;
  let i = 0;
  const segments = [];
  while (i < word.length) {
    const ansiResult = extractAnsiCode(word, i);
    if (ansiResult) {
      segments.push({ type: "ansi", value: ansiResult.code });
      i += ansiResult.length;
    } else {
      let end = i;
      while (end < word.length) {
        const nextAnsi = extractAnsiCode(word, end);
        if (nextAnsi)
          break;
        end++;
      }
      const textPortion = word.slice(i, end);
      for (const seg of graphemeSegmenter.segment(textPortion)) {
        segments.push({ type: "grapheme", value: seg.segment });
      }
      i = end;
    }
  }
  for (const seg of segments) {
    if (seg.type === "ansi") {
      currentLine += seg.value;
      tracker.process(seg.value);
      continue;
    }
    const grapheme = seg.value;
    if (!grapheme)
      continue;
    const graphemeWidth2 = visibleWidth(grapheme);
    if (currentWidth + graphemeWidth2 > width) {
      const lineEndReset = tracker.getLineEndReset();
      if (lineEndReset) {
        currentLine += lineEndReset;
      }
      lines.push(currentLine);
      currentLine = tracker.getActiveCodes();
      currentWidth = 0;
    }
    currentLine += grapheme;
    currentWidth += graphemeWidth2;
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.length > 0 ? lines : [""];
}
function truncateToWidth(text, maxWidth, ellipsis = "...", pad = false) {
  if (maxWidth <= 0) {
    return "";
  }
  if (text.length === 0) {
    return pad ? " ".repeat(maxWidth) : "";
  }
  const ellipsisWidth = visibleWidth(ellipsis);
  if (ellipsisWidth >= maxWidth) {
    const textWidth = visibleWidth(text);
    if (textWidth <= maxWidth) {
      return pad ? text + " ".repeat(maxWidth - textWidth) : text;
    }
    const clippedEllipsis = truncateFragmentToWidth(ellipsis, maxWidth);
    if (clippedEllipsis.width === 0) {
      return pad ? " ".repeat(maxWidth) : "";
    }
    return finalizeTruncatedResult("", 0, clippedEllipsis.text, clippedEllipsis.width, maxWidth, pad);
  }
  if (isPrintableAscii(text)) {
    if (text.length <= maxWidth) {
      return pad ? text + " ".repeat(maxWidth - text.length) : text;
    }
    const targetWidth2 = maxWidth - ellipsisWidth;
    return finalizeTruncatedResult(text.slice(0, targetWidth2), targetWidth2, ellipsis, ellipsisWidth, maxWidth, pad);
  }
  const targetWidth = maxWidth - ellipsisWidth;
  let result = "";
  let pendingAnsi = "";
  let visibleSoFar = 0;
  let keptWidth = 0;
  let keepContiguousPrefix = true;
  let overflowed = false;
  let exhaustedInput = false;
  const hasAnsi = text.includes("\x1B");
  const hasTabs = text.includes("	");
  if (!hasAnsi && !hasTabs) {
    for (const { segment } of graphemeSegmenter.segment(text)) {
      const width = graphemeWidth(segment);
      if (keepContiguousPrefix && keptWidth + width <= targetWidth) {
        result += segment;
        keptWidth += width;
      } else {
        keepContiguousPrefix = false;
      }
      visibleSoFar += width;
      if (visibleSoFar > maxWidth) {
        overflowed = true;
        break;
      }
    }
    exhaustedInput = !overflowed;
  } else {
    let i = 0;
    while (i < text.length) {
      const ansi = extractAnsiCode(text, i);
      if (ansi) {
        pendingAnsi += ansi.code;
        i += ansi.length;
        continue;
      }
      if (text[i] === "	") {
        if (keepContiguousPrefix && keptWidth + 3 <= targetWidth) {
          if (pendingAnsi) {
            result += pendingAnsi;
            pendingAnsi = "";
          }
          result += "	";
          keptWidth += 3;
        } else {
          keepContiguousPrefix = false;
          pendingAnsi = "";
        }
        visibleSoFar += 3;
        if (visibleSoFar > maxWidth) {
          overflowed = true;
          break;
        }
        i++;
        continue;
      }
      let end = i;
      while (end < text.length && text[end] !== "	") {
        const nextAnsi = extractAnsiCode(text, end);
        if (nextAnsi) {
          break;
        }
        end++;
      }
      for (const { segment } of graphemeSegmenter.segment(text.slice(i, end))) {
        const width = graphemeWidth(segment);
        if (keepContiguousPrefix && keptWidth + width <= targetWidth) {
          if (pendingAnsi) {
            result += pendingAnsi;
            pendingAnsi = "";
          }
          result += segment;
          keptWidth += width;
        } else {
          keepContiguousPrefix = false;
          pendingAnsi = "";
        }
        visibleSoFar += width;
        if (visibleSoFar > maxWidth) {
          overflowed = true;
          break;
        }
      }
      if (overflowed) {
        break;
      }
      i = end;
    }
    exhaustedInput = i >= text.length;
  }
  if (!overflowed && exhaustedInput) {
    return pad ? text + " ".repeat(Math.max(0, maxWidth - visibleSoFar)) : text;
  }
  return finalizeTruncatedResult(result, keptWidth, ellipsis, ellipsisWidth, maxWidth, pad);
}
function sliceByColumn(line, startCol, length, strict = false) {
  return sliceWithWidth(line, startCol, length, strict).text;
}
function sliceWithWidth(line, startCol, length, strict = false) {
  if (length <= 0)
    return { text: "", width: 0 };
  const endCol = startCol + length;
  let result = "", resultWidth = 0, currentCol = 0, i = 0, pendingAnsi = "";
  while (i < line.length) {
    const ansi = extractAnsiCode(line, i);
    if (ansi) {
      if (currentCol >= startCol && currentCol < endCol) {
        result += pendingAnsi + ansi.code;
        pendingAnsi = "";
      } else if (currentCol < startCol)
        pendingAnsi += ansi.code;
      i += ansi.length;
      continue;
    }
    let textEnd = i;
    while (textEnd < line.length && !extractAnsiCode(line, textEnd))
      textEnd++;
    for (const { segment } of graphemeSegmenter.segment(line.slice(i, textEnd))) {
      const w = graphemeWidth(segment);
      const inRange = currentCol >= startCol && currentCol < endCol;
      const fits = !strict || currentCol + w <= endCol;
      if (inRange && fits) {
        if (pendingAnsi) {
          result += pendingAnsi;
          pendingAnsi = "";
        }
        result += segment;
        resultWidth += w;
      }
      currentCol += w;
      if (currentCol >= endCol)
        break;
    }
    i = textEnd;
    if (currentCol >= endCol)
      break;
  }
  return { text: result, width: resultWidth };
}
var pooledStyleTracker = new AnsiCodeTracker();
function extractSegments(line, beforeEnd, afterStart, afterLen, strictAfter = false) {
  let before = "", beforeWidth = 0, after = "", afterWidth = 0;
  let currentCol = 0, i = 0;
  let pendingAnsiBefore = "";
  let afterStarted = false;
  const afterEnd = afterStart + afterLen;
  pooledStyleTracker.clear();
  while (i < line.length) {
    const ansi = extractAnsiCode(line, i);
    if (ansi) {
      pooledStyleTracker.process(ansi.code);
      if (currentCol < beforeEnd) {
        pendingAnsiBefore += ansi.code;
      } else if (currentCol >= afterStart && currentCol < afterEnd && (afterStarted || ansi.code.startsWith("\x1B_"))) {
        after += ansi.code;
      }
      i += ansi.length;
      continue;
    }
    let textEnd = i;
    while (textEnd < line.length && !extractAnsiCode(line, textEnd))
      textEnd++;
    for (const { segment } of graphemeSegmenter.segment(line.slice(i, textEnd))) {
      const w = graphemeWidth(segment);
      if (currentCol < beforeEnd && currentCol + w <= beforeEnd) {
        if (pendingAnsiBefore) {
          before += pendingAnsiBefore;
          pendingAnsiBefore = "";
        }
        before += segment;
        beforeWidth += w;
      } else if (currentCol >= afterStart && currentCol < afterEnd) {
        const fits = !strictAfter || currentCol + w <= afterEnd;
        if (fits) {
          if (!afterStarted) {
            after += pooledStyleTracker.getActiveCodes();
            afterStarted = true;
          }
          after += segment;
          afterWidth += w;
        }
      }
      currentCol += w;
      if (afterLen <= 0 ? currentCol >= beforeEnd : currentCol >= afterEnd)
        break;
    }
    i = textEnd;
    if (afterLen <= 0 ? currentCol >= beforeEnd : currentCol >= afterEnd)
      break;
  }
  return { before, beforeWidth, after, afterWidth };
}

// node_modules/@earendil-works/pi-tui/dist/autocomplete.js
var tokenStartRegex = new RegExp(`${autocompleteBoundaryRegex.source}$`, "u");

// node_modules/@earendil-works/pi-tui/dist/oklab.js
var K1 = 0.206;
var K2 = 0.03;
var K3 = (1 + K1) / (1 + K2);

// node_modules/@earendil-works/pi-tui/dist/colors.js
var NUMBER_PATTERN = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?`;
var OKLCH_PATTERN = new RegExp(`^oklch\\(\\s*(${NUMBER_PATTERN})(%)?\\s+(${NUMBER_PATTERN})\\s+(${NUMBER_PATTERN})(?:deg)?\\s*\\)$`, "i");
var OKHSL_PATTERN = new RegExp(`^okhsl\\(\\s*(${NUMBER_PATTERN})(?:deg)?\\s+(${NUMBER_PATTERN})(%)?\\s+(${NUMBER_PATTERN})(%)?\\s*\\)$`, "i");
var GRAY_VALUES = Array.from({ length: 24 }, (_2, index) => 8 + index * 10);

// node_modules/@earendil-works/pi-tui/dist/tui.js
import { performance as performance2 } from "node:perf_hooks";

// node_modules/@earendil-works/pi-tui/dist/keys.js
var _kittyProtocolActive = false;
var SYMBOL_KEYS = /* @__PURE__ */ new Set([
  "`",
  "-",
  "=",
  "[",
  "]",
  "\\",
  ";",
  "'",
  ",",
  ".",
  "/",
  "!",
  "@",
  "#",
  "$",
  "%",
  "^",
  "&",
  "*",
  "(",
  ")",
  "_",
  "+",
  "|",
  "~",
  "{",
  "}",
  ":",
  "<",
  ">",
  "?"
]);
var SHIFTED_SYMBOL_KEYS = new Set("~!@#$%^&*()_+|{}:<>?");
var MODIFIER_NAMES = ["shift", "alt", "ctrl", "super"];
var MODIFIERS = {
  shift: 1,
  alt: 2,
  ctrl: 4,
  super: 8
};
var LOCK_MASK = 64 + 128;
var CODEPOINTS = {
  escape: 27,
  tab: 9,
  enter: 13,
  space: 32,
  backspace: 127,
  kpEnter: 57414
  // Numpad Enter (Kitty protocol)
};
var ARROW_CODEPOINTS = {
  up: -1,
  down: -2,
  right: -3,
  left: -4
};
var FUNCTIONAL_CODEPOINTS = {
  delete: -10,
  insert: -11,
  pageUp: -12,
  pageDown: -13,
  home: -14,
  end: -15,
  f1: -21,
  f2: -22,
  f3: -23,
  f4: -24,
  f5: -25,
  f6: -26,
  f7: -27,
  f8: -28,
  f9: -29,
  f10: -30,
  f11: -31,
  f12: -32
};
var KITTY_FUNCTIONAL_PUA_START = 57344;
var KITTY_FUNCTIONAL_PUA_END = 63743;
var KITTY_FUNCTIONAL_KEY_EQUIVALENTS = /* @__PURE__ */ new Map([
  [57399, 48],
  // KP_0 -> 0
  [57400, 49],
  // KP_1 -> 1
  [57401, 50],
  // KP_2 -> 2
  [57402, 51],
  // KP_3 -> 3
  [57403, 52],
  // KP_4 -> 4
  [57404, 53],
  // KP_5 -> 5
  [57405, 54],
  // KP_6 -> 6
  [57406, 55],
  // KP_7 -> 7
  [57407, 56],
  // KP_8 -> 8
  [57408, 57],
  // KP_9 -> 9
  [57409, 46],
  // KP_DECIMAL -> .
  [57410, 47],
  // KP_DIVIDE -> /
  [57411, 42],
  // KP_MULTIPLY -> *
  [57412, 45],
  // KP_SUBTRACT -> -
  [57413, 43],
  // KP_ADD -> +
  [57415, 61],
  // KP_EQUAL -> =
  [57416, 44],
  // KP_SEPARATOR -> ,
  [57417, ARROW_CODEPOINTS.left],
  [57418, ARROW_CODEPOINTS.right],
  [57419, ARROW_CODEPOINTS.up],
  [57420, ARROW_CODEPOINTS.down],
  [57421, FUNCTIONAL_CODEPOINTS.pageUp],
  [57422, FUNCTIONAL_CODEPOINTS.pageDown],
  [57423, FUNCTIONAL_CODEPOINTS.home],
  [57424, FUNCTIONAL_CODEPOINTS.end],
  [57425, FUNCTIONAL_CODEPOINTS.insert],
  [57426, FUNCTIONAL_CODEPOINTS.delete]
]);
function normalizeKittyFunctionalCodepoint(codepoint) {
  return KITTY_FUNCTIONAL_KEY_EQUIVALENTS.get(codepoint) ?? codepoint;
}
function normalizeShiftedLetterIdentityCodepoint(codepoint, modifier) {
  const effectiveModifier = modifier & ~LOCK_MASK;
  if ((effectiveModifier & MODIFIERS.shift) !== 0 && codepoint >= 65 && codepoint <= 90) {
    return codepoint + 32;
  }
  return codepoint;
}
function getLogicalShiftedSymbolCandidate(codepoint, modifier, allowedSymbols) {
  if (codepoint === void 0 || (modifier & MODIFIERS.shift) === 0)
    return void 0;
  const normalizedCodepoint = normalizeKittyFunctionalCodepoint(codepoint);
  if (!allowedSymbols.has(String.fromCharCode(normalizedCodepoint)))
    return void 0;
  return { codepoint: normalizedCodepoint, modifier: modifier & ~MODIFIERS.shift };
}
var LEGACY_KEY_SEQUENCES = {
  up: ["\x1B[A", "\x1BOA"],
  down: ["\x1B[B", "\x1BOB"],
  right: ["\x1B[C", "\x1BOC"],
  left: ["\x1B[D", "\x1BOD"],
  home: ["\x1B[H", "\x1BOH", "\x1B[1~", "\x1B[7~"],
  end: ["\x1B[F", "\x1BOF", "\x1B[4~", "\x1B[8~"],
  insert: ["\x1B[2~"],
  delete: ["\x1B[3~"],
  pageUp: ["\x1B[5~", "\x1B[[5~"],
  pageDown: ["\x1B[6~", "\x1B[[6~"],
  clear: ["\x1B[E", "\x1BOE"],
  f1: ["\x1BOP", "\x1B[11~", "\x1B[[A"],
  f2: ["\x1BOQ", "\x1B[12~", "\x1B[[B"],
  f3: ["\x1BOR", "\x1B[13~", "\x1B[[C"],
  f4: ["\x1BOS", "\x1B[14~", "\x1B[[D"],
  f5: ["\x1B[15~", "\x1B[[E"],
  f6: ["\x1B[17~"],
  f7: ["\x1B[18~"],
  f8: ["\x1B[19~"],
  f9: ["\x1B[20~"],
  f10: ["\x1B[21~"],
  f11: ["\x1B[23~"],
  f12: ["\x1B[24~"]
};
var LEGACY_SHIFT_SEQUENCES = {
  up: ["\x1B[a"],
  down: ["\x1B[b"],
  right: ["\x1B[c"],
  left: ["\x1B[d"],
  clear: ["\x1B[e"],
  insert: ["\x1B[2$"],
  delete: ["\x1B[3$"],
  pageUp: ["\x1B[5$"],
  pageDown: ["\x1B[6$"],
  home: ["\x1B[7$"],
  end: ["\x1B[8$"]
};
var LEGACY_CTRL_SEQUENCES = {
  up: ["\x1BOa"],
  down: ["\x1BOb"],
  right: ["\x1BOc"],
  left: ["\x1BOd"],
  clear: ["\x1BOe"],
  insert: ["\x1B[2^"],
  delete: ["\x1B[3^"],
  pageUp: ["\x1B[5^"],
  pageDown: ["\x1B[6^"],
  home: ["\x1B[7^"],
  end: ["\x1B[8^"]
};
var matchesLegacySequence = (data, sequences) => sequences.includes(data);
var matchesLegacyModifierSequence = (data, key, modifier) => {
  if (modifier === MODIFIERS.shift) {
    return matchesLegacySequence(data, LEGACY_SHIFT_SEQUENCES[key]);
  }
  if (modifier === MODIFIERS.ctrl) {
    return matchesLegacySequence(data, LEGACY_CTRL_SEQUENCES[key]);
  }
  return false;
};
var _lastEventType = "press";
function isKeyRelease(data) {
  if (data.includes("\x1B[200~")) {
    return false;
  }
  if (data.includes(":3u") || data.includes(":3~") || data.includes(":3A") || data.includes(":3B") || data.includes(":3C") || data.includes(":3D") || data.includes(":3H") || data.includes(":3F") || data.includes(":3P") || data.includes(":3Q") || data.includes(":3S")) {
    return true;
  }
  return false;
}
function parseEventType(eventTypeStr) {
  if (!eventTypeStr)
    return "press";
  const eventType = parseInt(eventTypeStr, 10);
  if (eventType === 2)
    return "repeat";
  if (eventType === 3)
    return "release";
  return "press";
}
function parseKittySequence(data) {
  const csiUMatch = data.match(/^\x1b\[(\d+)(?::(\d*))?(?::(\d+))?(?:;(\d+))?(?::(\d+))?u$/);
  if (csiUMatch) {
    const codepoint = parseInt(csiUMatch[1], 10);
    const shiftedKey = csiUMatch[2] && csiUMatch[2].length > 0 ? parseInt(csiUMatch[2], 10) : void 0;
    const baseLayoutKey = csiUMatch[3] ? parseInt(csiUMatch[3], 10) : void 0;
    const modValue = csiUMatch[4] ? parseInt(csiUMatch[4], 10) : 1;
    const eventType = parseEventType(csiUMatch[5]);
    _lastEventType = eventType;
    return { codepoint, shiftedKey, baseLayoutKey, modifier: modValue - 1, eventType };
  }
  const arrowMatch = data.match(/^\x1b\[1;(\d+)(?::(\d+))?([ABCD])$/);
  if (arrowMatch) {
    const modValue = parseInt(arrowMatch[1], 10);
    const eventType = parseEventType(arrowMatch[2]);
    const arrowCodes = { A: -1, B: -2, C: -3, D: -4 };
    _lastEventType = eventType;
    return { codepoint: arrowCodes[arrowMatch[3]], modifier: modValue - 1, eventType };
  }
  const funcMatch = data.match(/^\x1b\[(\d+)(?:;(\d+))?(?::(\d+))?~$/);
  if (funcMatch) {
    const keyNum = parseInt(funcMatch[1], 10);
    const modValue = funcMatch[2] ? parseInt(funcMatch[2], 10) : 1;
    const eventType = parseEventType(funcMatch[3]);
    const funcCodes = {
      2: FUNCTIONAL_CODEPOINTS.insert,
      3: FUNCTIONAL_CODEPOINTS.delete,
      5: FUNCTIONAL_CODEPOINTS.pageUp,
      6: FUNCTIONAL_CODEPOINTS.pageDown,
      7: FUNCTIONAL_CODEPOINTS.home,
      8: FUNCTIONAL_CODEPOINTS.end,
      11: FUNCTIONAL_CODEPOINTS.f1,
      12: FUNCTIONAL_CODEPOINTS.f2,
      13: FUNCTIONAL_CODEPOINTS.f3,
      14: FUNCTIONAL_CODEPOINTS.f4,
      15: FUNCTIONAL_CODEPOINTS.f5,
      17: FUNCTIONAL_CODEPOINTS.f6,
      18: FUNCTIONAL_CODEPOINTS.f7,
      19: FUNCTIONAL_CODEPOINTS.f8,
      20: FUNCTIONAL_CODEPOINTS.f9,
      21: FUNCTIONAL_CODEPOINTS.f10,
      23: FUNCTIONAL_CODEPOINTS.f11,
      24: FUNCTIONAL_CODEPOINTS.f12
    };
    const codepoint = funcCodes[keyNum];
    if (codepoint !== void 0) {
      _lastEventType = eventType;
      return { codepoint, modifier: modValue - 1, eventType };
    }
  }
  const homeEndMatch = data.match(/^\x1b\[1;(\d+)(?::(\d+))?([HF])$/);
  if (homeEndMatch) {
    const modValue = parseInt(homeEndMatch[1], 10);
    const eventType = parseEventType(homeEndMatch[2]);
    const codepoint = homeEndMatch[3] === "H" ? FUNCTIONAL_CODEPOINTS.home : FUNCTIONAL_CODEPOINTS.end;
    _lastEventType = eventType;
    return { codepoint, modifier: modValue - 1, eventType };
  }
  const fKeyMatch = data.match(/^\x1b\[(?:1;(\d+)(?::(\d+))?)?([PQS])$/);
  if (fKeyMatch) {
    const modValue = fKeyMatch[1] ? parseInt(fKeyMatch[1], 10) : 1;
    const eventType = parseEventType(fKeyMatch[2]);
    const fKeyCodes = {
      P: FUNCTIONAL_CODEPOINTS.f1,
      Q: FUNCTIONAL_CODEPOINTS.f2,
      S: FUNCTIONAL_CODEPOINTS.f4
    };
    _lastEventType = eventType;
    return { codepoint: fKeyCodes[fKeyMatch[3]], modifier: modValue - 1, eventType };
  }
  return null;
}
function matchesKittySequence(data, expectedCodepoint, expectedModifier) {
  const parsed = parseKittySequence(data);
  if (!parsed)
    return false;
  const actualMod = parsed.modifier & ~LOCK_MASK;
  const expectedMod = expectedModifier & ~LOCK_MASK;
  const normalizedCodepoint = normalizeShiftedLetterIdentityCodepoint(normalizeKittyFunctionalCodepoint(parsed.codepoint), parsed.modifier);
  const normalizedExpectedCodepoint = normalizeShiftedLetterIdentityCodepoint(normalizeKittyFunctionalCodepoint(expectedCodepoint), expectedModifier);
  if (actualMod === expectedMod && normalizedCodepoint === normalizedExpectedCodepoint)
    return true;
  const logicalShiftedSymbol = getLogicalShiftedSymbolCandidate(parsed.shiftedKey, actualMod, SYMBOL_KEYS);
  if (logicalShiftedSymbol && (logicalShiftedSymbol.modifier & ~LOCK_MASK) === expectedMod && logicalShiftedSymbol.codepoint === normalizeKittyFunctionalCodepoint(expectedCodepoint)) {
    return true;
  }
  if (actualMod !== expectedMod)
    return false;
  if (parsed.baseLayoutKey !== void 0 && parsed.baseLayoutKey === expectedCodepoint) {
    const cp = normalizedCodepoint;
    const isLatinLetter = cp >= 97 && cp <= 122;
    const isKnownSymbol = SYMBOL_KEYS.has(String.fromCharCode(cp));
    if (!isLatinLetter && !isKnownSymbol)
      return true;
  }
  return false;
}
function parseModifyOtherKeysSequence(data) {
  const match = data.match(/^\x1b\[27;(\d+);(\d+)~$/);
  if (!match)
    return null;
  const modValue = parseInt(match[1], 10);
  const codepoint = parseInt(match[2], 10);
  return { codepoint, modifier: modValue - 1 };
}
function matchesModifyOtherKeys(data, expectedKeycode, expectedModifier) {
  const parsed = parseModifyOtherKeysSequence(data);
  if (!parsed)
    return false;
  return parsed.codepoint === expectedKeycode && parsed.modifier === expectedModifier;
}
function isWindowsTerminalSession() {
  return Boolean(process.env.WT_SESSION) && !process.env.SSH_CONNECTION && !process.env.SSH_CLIENT && !process.env.SSH_TTY;
}
function matchesRawBackspace(data, expectedModifier) {
  if (data === "\x7F")
    return expectedModifier === 0;
  if (data !== "\b")
    return false;
  return isWindowsTerminalSession() ? expectedModifier === MODIFIERS.ctrl : expectedModifier === 0;
}
function rawCtrlChar(key) {
  const char = key.toLowerCase();
  const code = char.charCodeAt(0);
  if (code >= 97 && code <= 122 || char === "[" || char === "\\" || char === "]" || char === "_") {
    return String.fromCharCode(code & 31);
  }
  if (char === "-") {
    return String.fromCharCode(31);
  }
  return null;
}
function isDigitKey(key) {
  return key >= "0" && key <= "9";
}
function matchesPrintableModifyOtherKeys(data, expectedKeycode, expectedModifier) {
  const parsed = parseModifyOtherKeysSequence(data);
  if (!parsed)
    return false;
  const physicalMatch = parsed.modifier === expectedModifier && normalizeShiftedLetterIdentityCodepoint(parsed.codepoint, parsed.modifier) === normalizeShiftedLetterIdentityCodepoint(expectedKeycode, expectedModifier);
  if (physicalMatch)
    return true;
  const logicalShiftedSymbol = getLogicalShiftedSymbolCandidate(parsed.codepoint, parsed.modifier, SHIFTED_SYMBOL_KEYS);
  return logicalShiftedSymbol?.modifier === expectedModifier && logicalShiftedSymbol.codepoint === expectedKeycode;
}
function parseKeyId(keyId) {
  let key = keyId.toLowerCase();
  const modifiers = /* @__PURE__ */ new Set();
  while (true) {
    const modifier = MODIFIER_NAMES.find((name) => key.startsWith(`${name}+`));
    if (!modifier)
      break;
    if (modifiers.has(modifier))
      return null;
    modifiers.add(modifier);
    key = key.slice(modifier.length + 1);
  }
  if (!key || key.includes("+") && key !== "+")
    return null;
  return {
    key,
    ctrl: modifiers.has("ctrl"),
    shift: modifiers.has("shift"),
    alt: modifiers.has("alt"),
    super: modifiers.has("super")
  };
}
function matchesKey(data, keyId) {
  const parsed = parseKeyId(keyId);
  if (!parsed)
    return false;
  const { key, ctrl, shift, alt, super: superModifier } = parsed;
  let modifier = 0;
  if (shift)
    modifier |= MODIFIERS.shift;
  if (alt)
    modifier |= MODIFIERS.alt;
  if (ctrl)
    modifier |= MODIFIERS.ctrl;
  if (superModifier)
    modifier |= MODIFIERS.super;
  switch (key) {
    case "escape":
    case "esc":
      if (modifier !== 0)
        return false;
      return data === "\x1B" || matchesKittySequence(data, CODEPOINTS.escape, 0) || matchesModifyOtherKeys(data, CODEPOINTS.escape, 0);
    case "space":
      if (!_kittyProtocolActive) {
        if (modifier === MODIFIERS.ctrl && data === "\0") {
          return true;
        }
        if (modifier === MODIFIERS.alt && data === "\x1B ") {
          return true;
        }
      }
      if (modifier === 0) {
        return data === " " || matchesKittySequence(data, CODEPOINTS.space, 0) || matchesModifyOtherKeys(data, CODEPOINTS.space, 0);
      }
      return matchesKittySequence(data, CODEPOINTS.space, modifier) || matchesModifyOtherKeys(data, CODEPOINTS.space, modifier);
    case "tab":
      if (modifier === MODIFIERS.shift) {
        return data === "\x1B[Z" || matchesKittySequence(data, CODEPOINTS.tab, MODIFIERS.shift) || matchesModifyOtherKeys(data, CODEPOINTS.tab, MODIFIERS.shift);
      }
      if (modifier === 0) {
        return data === "	" || matchesKittySequence(data, CODEPOINTS.tab, 0);
      }
      return matchesKittySequence(data, CODEPOINTS.tab, modifier) || matchesModifyOtherKeys(data, CODEPOINTS.tab, modifier);
    case "enter":
    case "return":
      if (modifier === MODIFIERS.shift) {
        if (matchesKittySequence(data, CODEPOINTS.enter, MODIFIERS.shift) || matchesKittySequence(data, CODEPOINTS.kpEnter, MODIFIERS.shift)) {
          return true;
        }
        if (matchesModifyOtherKeys(data, CODEPOINTS.enter, MODIFIERS.shift)) {
          return true;
        }
        if (_kittyProtocolActive) {
          return data === "\x1B\r" || data === "\n";
        }
        return false;
      }
      if (modifier === MODIFIERS.alt) {
        if (matchesKittySequence(data, CODEPOINTS.enter, MODIFIERS.alt) || matchesKittySequence(data, CODEPOINTS.kpEnter, MODIFIERS.alt)) {
          return true;
        }
        if (matchesModifyOtherKeys(data, CODEPOINTS.enter, MODIFIERS.alt)) {
          return true;
        }
        if (!_kittyProtocolActive) {
          return data === "\x1B\r";
        }
        return false;
      }
      if (modifier === 0) {
        return data === "\r" || !_kittyProtocolActive && data === "\n" || data === "\x1BOM" || // SS3 M (numpad enter in some terminals)
        matchesKittySequence(data, CODEPOINTS.enter, 0) || matchesKittySequence(data, CODEPOINTS.kpEnter, 0);
      }
      return matchesKittySequence(data, CODEPOINTS.enter, modifier) || matchesKittySequence(data, CODEPOINTS.kpEnter, modifier) || matchesModifyOtherKeys(data, CODEPOINTS.enter, modifier);
    case "backspace":
      if (modifier === MODIFIERS.alt) {
        if (data === "\x1B\x7F" || data === "\x1B\b") {
          return true;
        }
        return matchesKittySequence(data, CODEPOINTS.backspace, MODIFIERS.alt) || matchesModifyOtherKeys(data, CODEPOINTS.backspace, MODIFIERS.alt);
      }
      if (modifier === MODIFIERS.ctrl) {
        if (matchesRawBackspace(data, MODIFIERS.ctrl))
          return true;
        return matchesKittySequence(data, CODEPOINTS.backspace, MODIFIERS.ctrl) || matchesModifyOtherKeys(data, CODEPOINTS.backspace, MODIFIERS.ctrl);
      }
      if (modifier === 0) {
        return matchesRawBackspace(data, 0) || matchesKittySequence(data, CODEPOINTS.backspace, 0) || matchesModifyOtherKeys(data, CODEPOINTS.backspace, 0);
      }
      return matchesKittySequence(data, CODEPOINTS.backspace, modifier) || matchesModifyOtherKeys(data, CODEPOINTS.backspace, modifier);
    case "insert":
      if (modifier === 0) {
        return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.insert) || matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.insert, 0);
      }
      if (matchesLegacyModifierSequence(data, "insert", modifier)) {
        return true;
      }
      return matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.insert, modifier);
    case "delete":
      if (modifier === 0) {
        return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.delete) || matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.delete, 0);
      }
      if (matchesLegacyModifierSequence(data, "delete", modifier)) {
        return true;
      }
      return matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.delete, modifier);
    case "clear":
      if (modifier === 0) {
        return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.clear);
      }
      return matchesLegacyModifierSequence(data, "clear", modifier);
    case "home":
      if (modifier === 0) {
        return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.home) || matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.home, 0);
      }
      if (matchesLegacyModifierSequence(data, "home", modifier)) {
        return true;
      }
      return matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.home, modifier);
    case "end":
      if (modifier === 0) {
        return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.end) || matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.end, 0);
      }
      if (matchesLegacyModifierSequence(data, "end", modifier)) {
        return true;
      }
      return matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.end, modifier);
    case "pageup":
      if (modifier === 0) {
        return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.pageUp) || matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.pageUp, 0);
      }
      if (matchesLegacyModifierSequence(data, "pageUp", modifier)) {
        return true;
      }
      return matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.pageUp, modifier);
    case "pagedown":
      if (modifier === 0) {
        return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.pageDown) || matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.pageDown, 0);
      }
      if (matchesLegacyModifierSequence(data, "pageDown", modifier)) {
        return true;
      }
      return matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.pageDown, modifier);
    case "up":
      if (modifier === MODIFIERS.alt) {
        return data === "\x1Bp" || matchesKittySequence(data, ARROW_CODEPOINTS.up, MODIFIERS.alt);
      }
      if (modifier === 0) {
        return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.up) || matchesKittySequence(data, ARROW_CODEPOINTS.up, 0);
      }
      if (matchesLegacyModifierSequence(data, "up", modifier)) {
        return true;
      }
      return matchesKittySequence(data, ARROW_CODEPOINTS.up, modifier);
    case "down":
      if (modifier === MODIFIERS.alt) {
        return data === "\x1Bn" || matchesKittySequence(data, ARROW_CODEPOINTS.down, MODIFIERS.alt);
      }
      if (modifier === 0) {
        return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.down) || matchesKittySequence(data, ARROW_CODEPOINTS.down, 0);
      }
      if (matchesLegacyModifierSequence(data, "down", modifier)) {
        return true;
      }
      return matchesKittySequence(data, ARROW_CODEPOINTS.down, modifier);
    case "left":
      if (modifier === MODIFIERS.alt) {
        return data === "\x1B[1;3D" || !_kittyProtocolActive && data === "\x1BB" || data === "\x1Bb" || matchesKittySequence(data, ARROW_CODEPOINTS.left, MODIFIERS.alt);
      }
      if (modifier === MODIFIERS.ctrl) {
        return data === "\x1B[1;5D" || matchesLegacyModifierSequence(data, "left", MODIFIERS.ctrl) || matchesKittySequence(data, ARROW_CODEPOINTS.left, MODIFIERS.ctrl);
      }
      if (modifier === 0) {
        return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.left) || matchesKittySequence(data, ARROW_CODEPOINTS.left, 0);
      }
      if (matchesLegacyModifierSequence(data, "left", modifier)) {
        return true;
      }
      return matchesKittySequence(data, ARROW_CODEPOINTS.left, modifier);
    case "right":
      if (modifier === MODIFIERS.alt) {
        return data === "\x1B[1;3C" || !_kittyProtocolActive && data === "\x1BF" || data === "\x1Bf" || matchesKittySequence(data, ARROW_CODEPOINTS.right, MODIFIERS.alt);
      }
      if (modifier === MODIFIERS.ctrl) {
        return data === "\x1B[1;5C" || matchesLegacyModifierSequence(data, "right", MODIFIERS.ctrl) || matchesKittySequence(data, ARROW_CODEPOINTS.right, MODIFIERS.ctrl);
      }
      if (modifier === 0) {
        return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.right) || matchesKittySequence(data, ARROW_CODEPOINTS.right, 0);
      }
      if (matchesLegacyModifierSequence(data, "right", modifier)) {
        return true;
      }
      return matchesKittySequence(data, ARROW_CODEPOINTS.right, modifier);
    case "f1":
    case "f2":
    case "f3":
    case "f4":
    case "f5":
    case "f6":
    case "f7":
    case "f8":
    case "f9":
    case "f10":
    case "f11":
    case "f12": {
      const functionKey = key;
      if (modifier === 0 && matchesLegacySequence(data, LEGACY_KEY_SEQUENCES[functionKey])) {
        return true;
      }
      return matchesKittySequence(data, FUNCTIONAL_CODEPOINTS[functionKey], modifier);
    }
  }
  if (key.length === 1 && (key >= "a" && key <= "z" || isDigitKey(key) || SYMBOL_KEYS.has(key))) {
    const codepoint = key.charCodeAt(0);
    const rawCtrl = rawCtrlChar(key);
    const isLetter = key >= "a" && key <= "z";
    const isDigit = isDigitKey(key);
    if (modifier === MODIFIERS.ctrl + MODIFIERS.alt && !_kittyProtocolActive && rawCtrl) {
      if (data === `\x1B${rawCtrl}`)
        return true;
    }
    if (modifier === MODIFIERS.alt && !_kittyProtocolActive && (isLetter || isDigit || SYMBOL_KEYS.has(key))) {
      if (data === `\x1B${key}`)
        return true;
    }
    if (modifier === MODIFIERS.ctrl) {
      if (rawCtrl && data === rawCtrl)
        return true;
      return matchesKittySequence(data, codepoint, MODIFIERS.ctrl) || matchesPrintableModifyOtherKeys(data, codepoint, MODIFIERS.ctrl);
    }
    if (modifier === MODIFIERS.shift + MODIFIERS.ctrl) {
      return matchesKittySequence(data, codepoint, MODIFIERS.shift + MODIFIERS.ctrl) || matchesPrintableModifyOtherKeys(data, codepoint, MODIFIERS.shift + MODIFIERS.ctrl);
    }
    if (modifier === MODIFIERS.shift) {
      if (isLetter && data === key.toUpperCase())
        return true;
      return matchesKittySequence(data, codepoint, MODIFIERS.shift) || matchesPrintableModifyOtherKeys(data, codepoint, MODIFIERS.shift);
    }
    if (modifier !== 0) {
      return matchesKittySequence(data, codepoint, modifier) || matchesPrintableModifyOtherKeys(data, codepoint, modifier);
    }
    return data === key || matchesKittySequence(data, codepoint, 0) || matchesPrintableModifyOtherKeys(data, codepoint, 0);
  }
  return false;
}
var KITTY_CSI_U_REGEX = /^\x1b\[(\d+)(?::(\d*))?(?::(\d+))?(?:;(\d+))?(?::(\d+))?u$/;
var KITTY_PRINTABLE_ALLOWED_MODIFIERS = MODIFIERS.shift | LOCK_MASK;
function decodeKittyPrintable(data) {
  const match = data.match(KITTY_CSI_U_REGEX);
  if (!match)
    return void 0;
  const codepoint = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(codepoint))
    return void 0;
  const shiftedKey = match[2] && match[2].length > 0 ? Number.parseInt(match[2], 10) : void 0;
  const modValue = match[4] ? Number.parseInt(match[4], 10) : 1;
  const modifier = Number.isFinite(modValue) ? modValue - 1 : 0;
  if ((modifier & ~KITTY_PRINTABLE_ALLOWED_MODIFIERS) !== 0)
    return void 0;
  if (modifier & (MODIFIERS.alt | MODIFIERS.ctrl))
    return void 0;
  let effectiveCodepoint = codepoint;
  if (modifier & MODIFIERS.shift && typeof shiftedKey === "number") {
    effectiveCodepoint = shiftedKey;
  }
  effectiveCodepoint = normalizeKittyFunctionalCodepoint(effectiveCodepoint);
  if (!Number.isFinite(effectiveCodepoint) || effectiveCodepoint < 32)
    return void 0;
  if (effectiveCodepoint >= KITTY_FUNCTIONAL_PUA_START && effectiveCodepoint <= KITTY_FUNCTIONAL_PUA_END) {
    return void 0;
  }
  try {
    return String.fromCodePoint(effectiveCodepoint);
  } catch {
    return void 0;
  }
}

// node_modules/@earendil-works/pi-tui/dist/terminal-colors.js
function hexToRgb(hex) {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b2 = parseInt(normalized.slice(4, 6), 16);
  return { r, g, b: b2 };
}
function parseOscHexChannel(channel) {
  if (!/^[0-9a-f]+$/i.test(channel)) {
    return void 0;
  }
  const max = 16 ** channel.length - 1;
  if (max <= 0) {
    return void 0;
  }
  return Math.round(parseInt(channel, 16) / max * 255);
}
var OSC_COLOR_RESPONSE_PATTERN = /^\x1b\](?:(1[01])|4;(\d{1,3}));([^\x07\x1b]*)(?:\x07|\x1b\\)$/i;
var COLOR_SCHEME_REPORT_PATTERN = /^(?:\x1b\[\?997;(1|2)n)+$/;
function parseOscColorResponse(data) {
  const match = data.match(OSC_COLOR_RESPONSE_PATTERN);
  if (!match) {
    return void 0;
  }
  const target = match[1] === "10" ? "foreground" : match[1] === "11" ? "background" : Number.parseInt(match[2], 10);
  return { target, rgb: parseOscColorValue(match[3]) };
}
function parseOscColorValue(rawValue) {
  const value = rawValue.trim();
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      return hexToRgb(value);
    }
    if (/^[0-9a-f]{12}$/i.test(hex)) {
      const r2 = parseOscHexChannel(hex.slice(0, 4));
      const g2 = parseOscHexChannel(hex.slice(4, 8));
      const b3 = parseOscHexChannel(hex.slice(8, 12));
      return r2 !== void 0 && g2 !== void 0 && b3 !== void 0 ? { r: r2, g: g2, b: b3 } : void 0;
    }
    return void 0;
  }
  const rgbValue = value.replace(/^rgba?:/i, "");
  const [red, green, blue] = rgbValue.split("/");
  if (red === void 0 || green === void 0 || blue === void 0) {
    return void 0;
  }
  const r = parseOscHexChannel(red);
  const g = parseOscHexChannel(green);
  const b2 = parseOscHexChannel(blue);
  return r !== void 0 && g !== void 0 && b2 !== void 0 ? { r, g, b: b2 } : void 0;
}
function parseTerminalColorSchemeReport(data) {
  const match = data.match(COLOR_SCHEME_REPORT_PATTERN);
  if (!match) {
    return void 0;
  }
  return match[1] === "2" ? "light" : "dark";
}

// node_modules/@earendil-works/pi-tui/dist/terminal-image.js
import { execSync } from "node:child_process";
var cachedCapabilities = null;
var capabilityOverrides = {};
var cellDimensions = { widthPx: 9, heightPx: 18 };
function setCellDimensions(dims) {
  cellDimensions = dims;
}
function probeTmuxHyperlinks() {
  try {
    const termfeatures = execSync("tmux display-message -p '#{client_termfeatures}'", {
      encoding: "utf8",
      timeout: 250,
      stdio: ["ignore", "pipe", "ignore"]
    });
    return termfeatures.split(",").map((feature) => feature.trim()).includes("hyperlinks");
  } catch {
    return false;
  }
}
function detectCapabilitiesFromEnvironment(tmuxForwardsHyperlink) {
  const termProgram = process.env.TERM_PROGRAM?.toLowerCase() || "";
  const terminalEmulator = process.env.TERMINAL_EMULATOR?.toLowerCase() || "";
  const term = process.env.TERM?.toLowerCase() || "";
  const colorTerm = process.env.COLORTERM?.toLowerCase() || "";
  const hasTrueColorHint = colorTerm === "truecolor" || colorTerm === "24bit" || term.endsWith("-direct");
  const isWindowsConsole = process.platform === "win32";
  if (process.env.TMUX || term.startsWith("tmux")) {
    return { images: null, trueColor: hasTrueColorHint, hyperlinks: tmuxForwardsHyperlink() };
  }
  if (term.startsWith("screen")) {
    return { images: null, trueColor: hasTrueColorHint, hyperlinks: false };
  }
  if (termProgram === "herdr") {
    return { images: "kitty", trueColor: hasTrueColorHint, hyperlinks: true };
  }
  if (termProgram === "rex") {
    return { images: "kitty", trueColor: true, hyperlinks: true };
  }
  if (termProgram === "orca" && process.env.ORCA_IMAGE_PROTOCOL === "kitty") {
    return { images: "kitty", trueColor: true, hyperlinks: true };
  }
  if (process.env.KITTY_WINDOW_ID || termProgram === "kitty") {
    return { images: "kitty", trueColor: true, hyperlinks: true };
  }
  if (termProgram === "ghostty" || term.includes("ghostty") || process.env.GHOSTTY_RESOURCES_DIR) {
    return { images: "kitty", trueColor: true, hyperlinks: true };
  }
  if (process.env.WEZTERM_PANE || termProgram === "wezterm") {
    return { images: "kitty", trueColor: true, hyperlinks: true };
  }
  if (termProgram === "warpterminal" || process.env.WARP_SESSION_ID || process.env.WARP_TERMINAL_SESSION_UUID) {
    return { images: "kitty", trueColor: true, hyperlinks: true };
  }
  if (process.env.ITERM_SESSION_ID || termProgram === "iterm.app") {
    return { images: "iterm2", trueColor: true, hyperlinks: true };
  }
  if (process.env.WT_SESSION) {
    return { images: null, trueColor: true, hyperlinks: true };
  }
  if (termProgram === "alacritty" || termProgram === "vscode" || termProgram === "zed") {
    return { images: null, trueColor: true, hyperlinks: true };
  }
  if (terminalEmulator === "jetbrains-jediterm") {
    return { images: null, trueColor: true, hyperlinks: false };
  }
  if (isWindowsConsole) {
    return { images: null, trueColor: true, hyperlinks: false };
  }
  return { images: null, trueColor: hasTrueColorHint, hyperlinks: false };
}
function parseBooleanCapabilityOverride(value) {
  return value === "1" ? true : value === "0" ? false : void 0;
}
function detectCapabilities(tmuxForwardsHyperlink = probeTmuxHyperlinks) {
  const hyperlinks = parseBooleanCapabilityOverride(process.env.PI_HYPERLINKS);
  const detected = detectCapabilitiesFromEnvironment(hyperlinks === void 0 ? tmuxForwardsHyperlink : () => hyperlinks);
  const imageProtocol = process.env.PI_IMAGE_PROTOCOL?.toLowerCase();
  const images = imageProtocol === "kitty" || imageProtocol === "iterm2" ? imageProtocol : imageProtocol === "none" || imageProtocol === "0" ? null : void 0;
  const trueColor = parseBooleanCapabilityOverride(process.env.PI_TRUE_COLOR);
  return {
    ...detected,
    ...images !== void 0 ? { images } : {},
    ...trueColor !== void 0 ? { trueColor } : {},
    ...hyperlinks !== void 0 ? { hyperlinks } : {}
  };
}
function getCapabilities() {
  if (!cachedCapabilities) {
    const hyperlinks = capabilityOverrides.hyperlinks;
    cachedCapabilities = {
      ...detectCapabilities(hyperlinks === void 0 ? void 0 : () => hyperlinks),
      ...capabilityOverrides
    };
  }
  return cachedCapabilities;
}
function setCapabilities(caps) {
  cachedCapabilities = caps;
}
var KITTY_PREFIX = "\x1B_G";
var ITERM2_PREFIX = "\x1B]1337;File=";
function isImageLine(line) {
  if (line.startsWith(KITTY_PREFIX) || line.startsWith(ITERM2_PREFIX)) {
    return true;
  }
  return line.includes(KITTY_PREFIX) || line.includes(ITERM2_PREFIX);
}
function deleteKittyImage(imageId) {
  return `\x1B_Ga=d,d=I,i=${imageId},q=2\x1B\\`;
}
function deleteAllKittyImages() {
  return "\x1B_Ga=d,d=A,q=2\x1B\\";
}
function deleteAllKittyPlacements() {
  return "\x1B_Ga=d,d=a,q=2\x1B\\";
}
var kittyImageMetadata = /* @__PURE__ */ new Map();
var maxKittyImageRows = 0;
function getMaxKittyImageRows() {
  return maxKittyImageRows;
}
function getRegisteredKittyImageMetadataFromControls(controls) {
  const imageId = /(?:^|,)i=(\d+)(?:,|$)/.exec(controls)?.[1];
  return imageId === void 0 ? void 0 : kittyImageMetadata.get(Number.parseInt(imageId, 10));
}
function getRegisteredKittyImageMetadata(line) {
  const controls = /\x1b_G([^;]*);/.exec(line)?.[1];
  return controls === void 0 ? void 0 : getRegisteredKittyImageMetadataFromControls(controls);
}
function getExplicitKittyImageRows(controls) {
  const value = /(?:^|,)r=(\d+)(?:,|$)/.exec(controls)?.[1];
  if (value === void 0)
    return void 0;
  const rows = Number.parseInt(value, 10);
  return rows > 0 ? rows : void 0;
}
function getKittyImageRowsFromControls(controls, fallbackRows) {
  return getExplicitKittyImageRows(controls) ?? fallbackRows;
}
function getKittyImageMetadata(line) {
  const metadata = getRegisteredKittyImageMetadata(line);
  if (!metadata)
    return void 0;
  return {
    imageId: metadata.imageId,
    columns: metadata.columns,
    rows: metadata.rows,
    widthPx: metadata.widthPx,
    heightPx: metadata.heightPx
  };
}
var KITTY_PLACEMENT_CONTROL_KEYS = /* @__PURE__ */ new Set([
  "i",
  "p",
  "x",
  "y",
  "w",
  "h",
  "X",
  "Y",
  "c",
  "r",
  "C",
  "U",
  "z",
  "P",
  "Q",
  "H",
  "V"
]);
function getKittyImagePlacementRows(line) {
  const controls = /\x1b_G([^;]*);/.exec(line)?.[1];
  if (controls === void 0)
    return void 0;
  const explicitRows = getExplicitKittyImageRows(controls);
  if (explicitRows !== void 0)
    return explicitRows;
  return getRegisteredKittyImageMetadataFromControls(controls)?.rows;
}
function getKittyImagePlacement(line) {
  const match = /\x1b_G([^;]*);/.exec(line);
  if (!match)
    return void 0;
  const metadata = getRegisteredKittyImageMetadataFromControls(match[1]);
  if (!metadata)
    return void 0;
  let commandStart = match.index;
  let commandControls = match[1];
  let transmissionEnd;
  while (true) {
    const terminator = line.indexOf("\x1B\\", commandStart + KITTY_PREFIX.length);
    if (terminator === -1)
      return void 0;
    transmissionEnd = terminator + 2;
    if (!/(?:^|,)m=1(?:,|$)/.test(commandControls))
      break;
    commandStart = transmissionEnd;
    if (!line.startsWith(KITTY_PREFIX, commandStart))
      return void 0;
    const controlsEnd = line.indexOf(";", commandStart + KITTY_PREFIX.length);
    if (controlsEnd === -1)
      return void 0;
    commandControls = line.slice(commandStart + KITTY_PREFIX.length, controlsEnd);
  }
  const controls = match[1].split(",").filter((control) => KITTY_PLACEMENT_CONTROL_KEYS.has(control.split("=", 1)[0] ?? ""));
  const sequence = `\x1B_Ga=p,q=2,${controls.join(",")}\x1B\\`;
  return {
    imageId: metadata.imageId,
    transmissionGeneration: metadata.transmissionGeneration,
    transmissionBytes: transmissionEnd - match.index,
    estimatedDecodedBytes: metadata.widthPx * metadata.heightPx * 4,
    rows: getKittyImageRowsFromControls(match[1], metadata.rows),
    sequence,
    replacementLine: `${line.slice(0, match.index)}${sequence}${line.slice(transmissionEnd)}`
  };
}
function cropKittyImageLine(line, hiddenRows, visibleRows) {
  const metadata = getKittyImageMetadata(line);
  const match = /\x1b_G([^;]*);/.exec(line);
  if (!metadata || !match || hiddenRows < 0 || hiddenRows >= metadata.rows || visibleRows <= 0)
    return line;
  const croppedRows = Math.min(visibleRows, metadata.rows - hiddenRows);
  if (hiddenRows === 0 && croppedRows === metadata.rows)
    return line;
  const sourceY = Math.floor(metadata.heightPx * hiddenRows / metadata.rows);
  const sourceEnd = Math.ceil(metadata.heightPx * (hiddenRows + croppedRows) / metadata.rows);
  const sourceHeight = Math.max(1, Math.min(metadata.heightPx, sourceEnd) - sourceY);
  const controls = match[1].split(",").filter((control) => !/^[yhr]=/.test(control));
  controls.push(`y=${sourceY}`, `h=${sourceHeight}`, `r=${croppedRows}`);
  return `${line.slice(0, match.index)}\x1B_G${controls.join(",")};${line.slice(match.index + match[0].length)}`;
}

// node_modules/@earendil-works/pi-tui/dist/tui.js
function dispatchMouseEvent(component, event) {
  const result = component.handleMouse?.(event);
  if (!result)
    return void 0;
  if ("target" in result) {
    const forwarded = result;
    return forwarded.focus && component.handleInput ? { ...forwarded, focusTarget: component } : forwarded;
  }
  if (!result.handled && !result.capture && !result.focus)
    return void 0;
  return {
    ...result,
    handled: true,
    ...result.focus ? { focusTarget: component } : {},
    target: {
      component,
      originX: event.screenX - event.x,
      originY: event.screenY - event.y,
      width: event.width,
      height: event.height
    }
  };
}
function retargetMouseEvent(event, target) {
  return {
    ...event,
    x: event.screenX - target.originX,
    y: event.screenY - target.originY,
    width: target.width,
    height: target.height
  };
}
var TERMINAL_PALETTE_SIZE = 16;
var TERMINAL_COLOR_REPLY_COUNT = 2 + TERMINAL_PALETTE_SIZE;
var TERMINAL_COLOR_QUERY = `\x1B]10;?\x07\x1B]11;?\x07${Array.from({ length: TERMINAL_PALETTE_SIZE }, (_2, index) => `\x1B]4;${index};?\x07`).join("")}\x1B[c`;
var DEVICE_ATTRIBUTES_RESPONSE_PATTERN = /^\x1b\[\?[\d;]*c$/;
function isFocusable(component) {
  return component !== null && "focused" in component;
}
var CURSOR_MARKER = "\x1B_pi:c\x07";
var FAKE_CURSOR_START = "\x1B_pi:fc\x07";
var FAKE_CURSOR_END = "\x1B_pi:/fc\x07";
var FOCUSED_FAKE_CURSOR = /(\x1b_pi:c\x07)\x1b_pi:fc\x07(.*?)(?:\x1b_pi:\/fc\x07|$)/s;
function renderFakeCursor(text) {
  return `${FAKE_CURSOR_START}${text}${FAKE_CURSOR_END}`;
}
function parseSizeValue(value, referenceSize) {
  if (value === void 0)
    return void 0;
  if (typeof value === "number")
    return value;
  const match = value.match(/^(\d+(?:\.\d+)?)%$/);
  if (match) {
    return Math.floor(referenceSize * parseFloat(match[1]) / 100);
  }
  return void 0;
}
var Container = class {
  children = [];
  mouseLayout;
  addChild(component) {
    this.children.push(component);
  }
  removeChild(component) {
    const index = this.children.indexOf(component);
    if (index !== -1) {
      this.children.splice(index, 1);
    }
  }
  clear() {
    this.children = [];
  }
  invalidate() {
    for (const child of this.children) {
      child.invalidate?.();
    }
  }
  handleMouse(event) {
    if (event.y < 0 || event.y >= event.height)
      return void 0;
    const mouseChildren = this.mouseLayout?.width === event.width ? this.mouseLayout.children : this.children.map((component) => ({ component, height: component.render(event.width).length }));
    let childY = 0;
    for (const { component: child, height: childHeight } of mouseChildren) {
      if (event.y >= childY && event.y < childY + childHeight) {
        const result = dispatchMouseEvent(child, {
          ...event,
          y: event.y - childY,
          height: childHeight
        });
        if (result?.focus && this.handleInput)
          return { ...result, focusTarget: this };
        return result;
      }
      childY += childHeight;
    }
    return void 0;
  }
  render(width) {
    const lines = [];
    const mouseChildren = [];
    for (const child of this.children) {
      const childLines = child.render(width);
      mouseChildren.push({ component: child, height: childLines.length });
      for (const line of childLines) {
        lines.push(line);
      }
    }
    this.mouseLayout = { width, children: mouseChildren };
    return lines;
  }
};
var SEGMENT_RESET = "\x1B[0m\x1B]8;;\x07";
function compositeTuiLine(baseLine, overlayLine, startCol, overlayWidth, totalWidth) {
  if (isImageLine(baseLine))
    return baseLine;
  const afterStart = startCol + overlayWidth;
  const base = extractSegments(baseLine, startCol, afterStart, totalWidth - afterStart, true);
  const overlay = sliceWithWidth(overlayLine, 0, overlayWidth, true);
  const beforePad = Math.max(0, startCol - base.beforeWidth);
  const overlayPad = Math.max(0, overlayWidth - overlay.width);
  const actualBeforeWidth = Math.max(startCol, base.beforeWidth);
  const actualOverlayWidth = Math.max(overlayWidth, overlay.width);
  const afterTarget = Math.max(0, totalWidth - actualBeforeWidth - actualOverlayWidth);
  const afterPad = Math.max(0, afterTarget - base.afterWidth);
  const result = base.before + " ".repeat(beforePad) + SEGMENT_RESET + overlay.text + " ".repeat(overlayPad) + SEGMENT_RESET + base.after + " ".repeat(afterPad);
  return visibleWidth(result) <= totalWidth ? result : sliceByColumn(result, 0, totalWidth, true);
}
var VIEWPORT_TUI = /* @__PURE__ */ Symbol.for("@earendil-works/pi-tui/viewport");
var TuiBase = class _TuiBase extends Container {
  terminal;
  focusedComponent = null;
  inputListeners = /* @__PURE__ */ new Set();
  /** Global callback for debug key (Shift+Ctrl+D). Called before input is forwarded to focused component. */
  onDebug;
  renderRequested = false;
  immediateRenderScheduled = false;
  renderTimer;
  lastRenderAt = 0;
  static MIN_RENDER_INTERVAL_MS = 16;
  showHardwareCursor = false;
  clearOnShrink = false;
  fullRedrawCount = 0;
  stopped = false;
  /**
   * Color queries waiting for their DA1 reply, oldest first. Terminals answer in order, so color
   * replies belong to the oldest one. Queries stay here after a timeout to collect late replies.
   */
  pendingTerminalColorQueries = [];
  terminalColorSchemeListeners = /* @__PURE__ */ new Set();
  terminalColorSchemeNotificationsEnabled = false;
  /** Directory for debug/crash logs. When undefined, debug logging is disabled and crash dumps fall back to the OS temp directory. */
  logDirectory;
  // Overlay stack for modal components rendered on top of base content
  focusOrderCounter = 0;
  overlayStack = [];
  renderedOverlayLayouts = [];
  get hasOverlayEntries() {
    return this.overlayStack.length > 0;
  }
  overlayFocusRestore = { status: "inactive" };
  constructor(terminal, showHardwareCursor, logDirectory) {
    super();
    this.terminal = terminal;
    this.logDirectory = logDirectory;
    if (showHardwareCursor !== void 0) {
      this.showHardwareCursor = showHardwareCursor;
    }
  }
  resetRenderState() {
  }
  beforeTerminalStart() {
  }
  afterTerminalStart() {
  }
  beforeTerminalStop(_options) {
  }
  afterTerminalStop(_options) {
  }
  /** Mode resets written before the terminal's own resets when the process exits without stop(). */
  getExitRestorePrefix() {
    return `${this.terminalColorSchemeNotificationsEnabled ? "\x1B[?2031l" : ""}\x1B[?25h`;
  }
  /** Mode resets written after the terminal's own resets when the process exits without stop(). */
  getExitRestoreSuffix() {
    return "";
  }
  /**
   * Last-resort restore for exit paths that skip stop(), e.g. a direct process.exit() (#11170).
   * Hard kills and native aborts run no JavaScript and cannot be covered.
   */
  exitRestoreHandler = () => {
    if (this.stopped)
      return;
    try {
      this.terminal.restoreOnExit?.(this.getExitRestorePrefix(), this.getExitRestoreSuffix());
    } catch {
    }
  };
  get fullRedraws() {
    return this.fullRedrawCount;
  }
  getShowHardwareCursor() {
    return this.showHardwareCursor;
  }
  setShowHardwareCursor(enabled) {
    if (this.showHardwareCursor === enabled)
      return;
    this.showHardwareCursor = enabled;
    if (!enabled) {
      this.hideTerminalCursor();
    }
    this.requestRender();
  }
  getClearOnShrink() {
    return this.clearOnShrink;
  }
  /**
   * Set whether to trigger full re-render when content shrinks.
   * When true, empty rows are cleared when content shrinks.
   * When false (default), empty rows remain (reduces redraws on slower terminals).
   */
  setClearOnShrink(enabled) {
    this.clearOnShrink = enabled;
  }
  getFocusedComponent() {
    return this.focusedComponent;
  }
  setFocus(component) {
    this.setFocusInternal({ component, overlayFocusRestore: "clear" });
  }
  setFocusInternal({ component, overlayFocusRestore }) {
    const previousFocus = this.focusedComponent;
    let nextFocus = component;
    const previousFocusedOverlay = previousFocus ? this.overlayStack.find((entry) => entry.component === previousFocus && this.isOverlayVisible(entry)) : void 0;
    const nextFocusIsOverlay = nextFocus ? this.overlayStack.some((entry) => entry.component === nextFocus) : false;
    const restoreState = this.getVisibleOverlayFocusRestore();
    if (nextFocus && !nextFocusIsOverlay) {
      if (restoreState.status === "blocked" && restoreState.blockedBy === previousFocus) {
        if (restoreState.resume.status === "focus-target" || !this.isComponentMounted(restoreState.blockedBy)) {
          nextFocus = this.resolveBlockedOverlayFocusResume(restoreState);
        } else {
          this.overlayFocusRestore = {
            status: "blocked",
            overlay: restoreState.overlay,
            blockedBy: nextFocus,
            resume: restoreState.resume
          };
        }
      } else if (previousFocusedOverlay && restoreState.status !== "inactive" && restoreState.overlay === previousFocusedOverlay && !this.isOverlayFocusAncestor(previousFocusedOverlay, nextFocus)) {
        this.overlayFocusRestore = {
          status: "blocked",
          overlay: previousFocusedOverlay,
          blockedBy: nextFocus,
          resume: { status: "restore-overlay" }
        };
      }
    } else if (nextFocus === null) {
      if (restoreState.status === "blocked" && restoreState.blockedBy === previousFocus) {
        nextFocus = this.resolveBlockedOverlayFocusResume(restoreState);
      } else if (overlayFocusRestore === "clear") {
        this.clearOverlayFocusRestore();
      }
    }
    if (isFocusable(this.focusedComponent)) {
      this.focusedComponent.focused = false;
    }
    this.focusedComponent = nextFocus;
    if (isFocusable(nextFocus)) {
      nextFocus.focused = true;
    }
    const focusedOverlay = nextFocus ? this.overlayStack.find((entry) => entry.component === nextFocus && this.isOverlayVisible(entry)) : void 0;
    if (focusedOverlay) {
      this.overlayFocusRestore = { status: "eligible", overlay: focusedOverlay };
    }
  }
  clearOverlayFocusRestore() {
    this.overlayFocusRestore = { status: "inactive" };
  }
  clearOverlayFocusRestoreFor(overlay) {
    if (this.overlayFocusRestore.status !== "inactive" && this.overlayFocusRestore.overlay === overlay) {
      this.clearOverlayFocusRestore();
    }
  }
  resolveBlockedOverlayFocusResume(restoreState) {
    if (restoreState.resume.status === "restore-overlay")
      return restoreState.overlay.component;
    this.clearOverlayFocusRestore();
    return restoreState.resume.target;
  }
  getVisibleOverlayFocusRestore() {
    const restoreState = this.overlayFocusRestore;
    if (restoreState.status === "inactive")
      return restoreState;
    if (!this.overlayStack.includes(restoreState.overlay) || !this.isOverlayVisible(restoreState.overlay)) {
      return { status: "inactive" };
    }
    return restoreState;
  }
  isOverlayFocusAncestor(entry, component) {
    const visited = /* @__PURE__ */ new Set();
    let current = entry.preFocus;
    while (current && !visited.has(current)) {
      visited.add(current);
      if (current === component)
        return true;
      current = this.overlayStack.find((overlay) => overlay.component === current)?.preFocus ?? null;
    }
    return false;
  }
  retargetOverlayPreFocus(removed) {
    for (const overlay of this.overlayStack) {
      if (overlay !== removed && overlay.preFocus === removed.component) {
        overlay.preFocus = removed.preFocus;
      }
    }
  }
  getMountedRoots() {
    return this.children;
  }
  isComponentMounted(component) {
    return this.getMountedRoots().some((child) => this.containsComponent(child, component));
  }
  containsComponent(root, target) {
    if (root === target)
      return true;
    if (!(root instanceof Container))
      return false;
    return root.children.some((child) => this.containsComponent(child, target));
  }
  /**
   * Show an overlay component with configurable positioning and sizing.
   * Returns a handle to control the overlay's visibility.
   */
  showOverlay(component, options) {
    const entry = {
      component,
      ...options === void 0 ? {} : { options },
      preFocus: this.focusedComponent,
      hidden: false,
      focusOrder: ++this.focusOrderCounter
    };
    this.overlayStack.push(entry);
    if (!options?.nonCapturing && this.isOverlayVisible(entry)) {
      this.setFocus(component);
    }
    this.hideTerminalCursor();
    this.requestRender();
    return {
      hide: () => {
        const index = this.overlayStack.indexOf(entry);
        if (index !== -1) {
          this.clearOverlayFocusRestoreFor(entry);
          this.retargetOverlayPreFocus(entry);
          this.overlayStack.splice(index, 1);
          if (this.focusedComponent === component) {
            const topVisible = this.getTopmostVisibleOverlay();
            this.setFocus(topVisible?.component ?? entry.preFocus);
          }
          if (this.overlayStack.length === 0)
            this.hideTerminalCursor();
          this.requestRender();
        }
      },
      setHidden: (hidden) => {
        if (entry.hidden === hidden)
          return;
        entry.hidden = hidden;
        if (hidden) {
          this.clearOverlayFocusRestoreFor(entry);
          if (this.focusedComponent === component) {
            const topVisible = this.getTopmostVisibleOverlay();
            this.setFocus(topVisible?.component ?? entry.preFocus);
          }
        } else {
          if (!options?.nonCapturing && this.isOverlayVisible(entry)) {
            entry.focusOrder = ++this.focusOrderCounter;
            this.setFocus(component);
          }
        }
        this.requestRender();
      },
      isHidden: () => entry.hidden,
      focus: () => {
        if (!this.overlayStack.includes(entry) || !this.isOverlayVisible(entry))
          return;
        entry.focusOrder = ++this.focusOrderCounter;
        this.setFocus(component);
        this.requestRender();
      },
      unfocus: (unfocusOptions) => {
        const isFocused = this.focusedComponent === component;
        const restoreState = this.overlayFocusRestore;
        const hasPendingRestore = restoreState.status !== "inactive" && restoreState.overlay === entry;
        if (!isFocused && !hasPendingRestore)
          return;
        if (restoreState.status === "blocked" && restoreState.overlay === entry && this.focusedComponent === restoreState.blockedBy) {
          if (unfocusOptions) {
            this.overlayFocusRestore = {
              status: "blocked",
              overlay: entry,
              blockedBy: restoreState.blockedBy,
              resume: { status: "focus-target", target: unfocusOptions.target }
            };
          } else {
            this.clearOverlayFocusRestore();
          }
          this.requestRender();
          return;
        }
        this.clearOverlayFocusRestoreFor(entry);
        if (isFocused || unfocusOptions) {
          const topVisible = this.getTopmostVisibleOverlay();
          const fallbackTarget = topVisible && topVisible !== entry ? topVisible.component : entry.preFocus;
          this.setFocus(unfocusOptions ? unfocusOptions.target : fallbackTarget);
        }
        this.requestRender();
      },
      isFocused: () => this.focusedComponent === component,
      getBounds: () => {
        if (!this.overlayStack.includes(entry) || !this.isOverlayVisible(entry) || !entry.bounds)
          return void 0;
        return { ...entry.bounds };
      }
    };
  }
  /** Hide the topmost overlay and restore previous focus. */
  hideOverlay() {
    const overlay = this.overlayStack[this.overlayStack.length - 1];
    if (!overlay)
      return;
    this.clearOverlayFocusRestoreFor(overlay);
    this.retargetOverlayPreFocus(overlay);
    this.overlayStack.pop();
    if (this.focusedComponent === overlay.component) {
      const topVisible = this.getTopmostVisibleOverlay();
      this.setFocus(topVisible?.component ?? overlay.preFocus);
    }
    if (this.overlayStack.length === 0)
      this.hideTerminalCursor();
    this.requestRender();
  }
  /** Hide the cursor while running. After stop(), the shell owns the cursor and it must stay visible. */
  hideTerminalCursor() {
    if (!this.stopped)
      this.terminal.hideCursor();
  }
  /** Check if there are any visible overlays */
  hasOverlay() {
    return this.overlayStack.some((o) => this.isOverlayVisible(o));
  }
  /** Check if the focused component is a visible overlay */
  isOverlayFocused() {
    return this.overlayStack.some((entry) => entry.component === this.focusedComponent && this.isOverlayVisible(entry));
  }
  /** Keep overlay containers as keyboard focus owners when a nested control is clicked. */
  resolveMouseFocusTarget(component) {
    for (let index = this.overlayStack.length - 1; index >= 0; index--) {
      const overlay = this.overlayStack[index];
      if (this.isOverlayVisible(overlay) && this.containsComponent(overlay.component, component)) {
        return overlay.component;
      }
    }
    return component;
  }
  /** Dispatch to the visually topmost overlay under the pointer. */
  dispatchMouseToOverlay(event) {
    for (let index = this.renderedOverlayLayouts.length - 1; index >= 0; index--) {
      const layout = this.renderedOverlayLayouts[index];
      if (event.screenX < layout.col || event.screenX >= layout.col + layout.width || event.screenY < layout.row || event.screenY >= layout.row + layout.height) {
        continue;
      }
      const result = dispatchMouseEvent(layout.entry.component, {
        ...event,
        x: event.screenX - layout.col,
        y: event.screenY - layout.row,
        width: layout.width,
        height: layout.height
      });
      return result ? {
        hit: true,
        result: result.focus ? { ...result, focusTarget: layout.entry.component } : result
      } : { hit: true };
    }
    return { hit: false };
  }
  /** Check if an overlay entry is currently visible */
  isOverlayVisible(entry) {
    if (entry.hidden)
      return false;
    if (entry.options?.visible) {
      return entry.options.visible(this.terminal.columns, this.terminal.rows);
    }
    return true;
  }
  /** Find the visual-frontmost visible capturing overlay, if any */
  getTopmostVisibleOverlay() {
    let topmost;
    for (const overlay of this.overlayStack) {
      if (overlay.options?.nonCapturing || !this.isOverlayVisible(overlay))
        continue;
      if (!topmost || overlay.focusOrder > topmost.focusOrder) {
        topmost = overlay;
      }
    }
    return topmost;
  }
  invalidate() {
    for (const root of this.getMountedRoots())
      root.invalidate();
    for (const overlay of this.overlayStack)
      overlay.component.invalidate();
  }
  start() {
    this.stopped = false;
    process.off("exit", this.exitRestoreHandler);
    process.on("exit", this.exitRestoreHandler);
    this.beforeTerminalStart();
    this.terminal.start((data) => this.handleTerminalInput(data), () => this.requestRender());
    this.afterTerminalStart();
    this.terminal.hideCursor();
    if (this.terminalColorSchemeNotificationsEnabled) {
      this.terminal.write("\x1B[?2031h");
    }
    this.queryCellSize();
    this.requestRender();
  }
  addInputListener(listener) {
    this.inputListeners.add(listener);
    return () => {
      this.inputListeners.delete(listener);
    };
  }
  removeInputListener(listener) {
    this.inputListeners.delete(listener);
  }
  onTerminalColorSchemeChange(listener) {
    this.terminalColorSchemeListeners.add(listener);
    return () => {
      this.terminalColorSchemeListeners.delete(listener);
    };
  }
  setTerminalColorSchemeNotifications(enabled) {
    if (this.terminalColorSchemeNotificationsEnabled === enabled) {
      return;
    }
    this.terminalColorSchemeNotificationsEnabled = enabled;
    if (!this.stopped) {
      this.terminal.write(enabled ? "\x1B[?2031h" : "\x1B[?2031l");
    }
  }
  queryCellSize() {
    if (!getCapabilities().images) {
      return;
    }
    this.terminal.write("\x1B[16t");
  }
  stop(options = {}) {
    this.stopped = true;
    process.off("exit", this.exitRestoreHandler);
    this.cancelRenderTimer();
    if (this.terminalColorSchemeNotificationsEnabled) {
      this.terminal.write("\x1B[?2031l");
    }
    this.beforeTerminalStop(options);
    this.terminal.showCursor();
    this.terminal.stop();
    this.afterTerminalStop(options);
  }
  renderNow(force = false) {
    if (force)
      this.resetRenderState();
    this.renderRequested = false;
    this.cancelRenderTimer();
    this.lastRenderAt = performance2.now();
    this.doRender();
  }
  requestRender(force = false) {
    if (force) {
      this.resetRenderState();
      this.requestImmediateRender();
      return;
    }
    if (this.renderRequested)
      return;
    this.renderRequested = true;
    process.nextTick(() => this.scheduleRender());
  }
  requestImmediateRender() {
    this.cancelRenderTimer();
    this.renderRequested = true;
    if (this.immediateRenderScheduled)
      return;
    this.immediateRenderScheduled = true;
    process.nextTick(() => {
      this.immediateRenderScheduled = false;
      if (this.stopped || !this.renderRequested)
        return;
      this.cancelRenderTimer();
      this.renderRequested = false;
      this.lastRenderAt = performance2.now();
      this.doRender();
    });
  }
  cancelRenderTimer() {
    if (!this.renderTimer)
      return;
    clearTimeout(this.renderTimer);
    this.renderTimer = void 0;
  }
  scheduleRender() {
    if (this.stopped || this.renderTimer || !this.renderRequested) {
      return;
    }
    const elapsed = performance2.now() - this.lastRenderAt;
    const delay = Math.max(0, _TuiBase.MIN_RENDER_INTERVAL_MS - elapsed);
    this.renderTimer = setTimeout(() => {
      this.renderTimer = void 0;
      if (this.stopped || !this.renderRequested) {
        return;
      }
      this.renderRequested = false;
      this.lastRenderAt = performance2.now();
      this.doRender();
      if (this.renderRequested) {
        this.scheduleRender();
      }
    }, delay);
  }
  handleTerminalInput(data) {
    if (this.consumeTerminalColorResponse(data)) {
      return;
    }
    if (this.consumeTerminalColorSchemeReport(data)) {
      return;
    }
    if (this.inputListeners.size > 0) {
      let current = data;
      for (const listener of this.inputListeners) {
        const result = listener(current);
        if (result?.consume) {
          return;
        }
        if (result?.data !== void 0) {
          current = result.data;
        }
      }
      if (current.length === 0) {
        return;
      }
      data = current;
    }
    if (this.consumeCellSizeResponse(data)) {
      return;
    }
    if (matchesKey(data, "shift+ctrl+d") && this.onDebug) {
      this.onDebug();
      return;
    }
    const focusedOverlay = this.overlayStack.find((o) => o.component === this.focusedComponent);
    if (focusedOverlay && !this.isOverlayVisible(focusedOverlay)) {
      const topVisible = this.getTopmostVisibleOverlay();
      if (topVisible) {
        this.setFocus(topVisible.component);
      } else {
        this.setFocusInternal({ component: focusedOverlay.preFocus, overlayFocusRestore: "preserve" });
      }
    }
    const focusIsOverlay = this.overlayStack.some((o) => o.component === this.focusedComponent);
    if (!focusIsOverlay) {
      const restoreState = this.getVisibleOverlayFocusRestore();
      if (restoreState.status === "eligible") {
        this.setFocus(restoreState.overlay.component);
      } else if (restoreState.status === "blocked" && restoreState.blockedBy !== this.focusedComponent) {
        if (restoreState.resume.status === "restore-overlay") {
          this.setFocus(restoreState.overlay.component);
        } else {
          this.clearOverlayFocusRestore();
          this.setFocus(restoreState.resume.target);
        }
      }
    }
    if (this.focusedComponent?.handleInput) {
      if (isKeyRelease(data) && !this.focusedComponent.wantsKeyRelease) {
        return;
      }
      this.focusedComponent.handleInput(data);
      this.requestImmediateRender();
    }
  }
  consumeTerminalColorResponse(data) {
    const query = this.pendingTerminalColorQueries[0];
    if (!query) {
      return false;
    }
    if (DEVICE_ATTRIBUTES_RESPONSE_PATTERN.test(data)) {
      this.pendingTerminalColorQueries.shift();
      this.completeTerminalColorQuery(query);
      return true;
    }
    const response = parseOscColorResponse(data);
    if (!response) {
      return false;
    }
    const { target, rgb } = response;
    const key = String(target);
    if (!query.deliver || query.replied.has(key)) {
      return true;
    }
    query.replied.add(key);
    if (target === "foreground") {
      query.foreground = rgb;
    } else if (target === "background") {
      query.background = rgb;
    } else if (target < TERMINAL_PALETTE_SIZE) {
      query.palette[target] = rgb;
    }
    if (query.replied.size === TERMINAL_COLOR_REPLY_COUNT) {
      this.completeTerminalColorQuery(query);
    }
    return true;
  }
  terminalColorQueryResult(query) {
    const palette = query.palette.every((color) => color !== void 0) ? query.palette : void 0;
    return { foreground: query.foreground, background: query.background, palette };
  }
  completeTerminalColorQuery(query) {
    const deliver = query.deliver;
    query.deliver = void 0;
    clearTimeout(query.timer);
    deliver?.(this.terminalColorQueryResult(query));
  }
  consumeTerminalColorSchemeReport(data) {
    const scheme = parseTerminalColorSchemeReport(data);
    if (!scheme) {
      return false;
    }
    for (const listener of this.terminalColorSchemeListeners) {
      listener(scheme);
    }
    return true;
  }
  consumeCellSizeResponse(data) {
    const match = data.match(/^\x1b\[6;(\d+);(\d+)t$/);
    if (!match) {
      return false;
    }
    const heightPx = parseInt(match[1], 10);
    const widthPx = parseInt(match[2], 10);
    if (heightPx <= 0 || widthPx <= 0) {
      return true;
    }
    setCellDimensions({ widthPx, heightPx });
    this.invalidate();
    this.requestRender();
    return true;
  }
  /**
   * Resolve overlay layout from options.
   * Returns { width, row, col, maxHeight } for rendering.
   */
  resolveOverlayLayout(options, overlayHeight, termWidth, termHeight) {
    const opt = options ?? {};
    const margin = typeof opt.margin === "number" ? { top: opt.margin, right: opt.margin, bottom: opt.margin, left: opt.margin } : opt.margin ?? {};
    const marginTop = Math.max(0, margin.top ?? 0);
    const marginRight = Math.max(0, margin.right ?? 0);
    const marginBottom = Math.max(0, margin.bottom ?? 0);
    const marginLeft = Math.max(0, margin.left ?? 0);
    const availWidth = Math.max(1, termWidth - marginLeft - marginRight);
    const availHeight = Math.max(1, termHeight - marginTop - marginBottom);
    let width = parseSizeValue(opt.width, termWidth) ?? Math.min(80, availWidth);
    if (opt.minWidth !== void 0) {
      width = Math.max(width, opt.minWidth);
    }
    width = Math.max(1, Math.min(width, availWidth));
    let maxHeight = parseSizeValue(opt.maxHeight, termHeight);
    if (maxHeight !== void 0) {
      maxHeight = Math.max(1, Math.min(maxHeight, availHeight));
    }
    const effectiveHeight = maxHeight !== void 0 ? Math.min(overlayHeight, maxHeight) : overlayHeight;
    let row;
    let col;
    if (opt.row !== void 0) {
      if (typeof opt.row === "string") {
        const match = opt.row.match(/^(\d+(?:\.\d+)?)%$/);
        if (match) {
          const maxRow = Math.max(0, availHeight - effectiveHeight);
          const percent = parseFloat(match[1]) / 100;
          row = marginTop + Math.floor(maxRow * percent);
        } else {
          row = this.resolveAnchorRow("center", effectiveHeight, availHeight, marginTop);
        }
      } else {
        row = opt.row;
      }
    } else {
      const anchor = opt.anchor ?? "center";
      row = this.resolveAnchorRow(anchor, effectiveHeight, availHeight, marginTop);
    }
    if (opt.col !== void 0) {
      if (typeof opt.col === "string") {
        const match = opt.col.match(/^(\d+(?:\.\d+)?)%$/);
        if (match) {
          const maxCol = Math.max(0, availWidth - width);
          const percent = parseFloat(match[1]) / 100;
          col = marginLeft + Math.floor(maxCol * percent);
        } else {
          col = this.resolveAnchorCol("center", width, availWidth, marginLeft);
        }
      } else {
        col = opt.col;
      }
    } else {
      const anchor = opt.anchor ?? "center";
      col = this.resolveAnchorCol(anchor, width, availWidth, marginLeft);
    }
    if (opt.offsetY !== void 0)
      row += opt.offsetY;
    if (opt.offsetX !== void 0)
      col += opt.offsetX;
    row = Math.max(marginTop, Math.min(row, termHeight - marginBottom - effectiveHeight));
    col = Math.max(marginLeft, Math.min(col, termWidth - marginRight - width));
    return { width, row, col, maxHeight };
  }
  resolveAnchorRow(anchor, height, availHeight, marginTop) {
    switch (anchor) {
      case "top-left":
      case "top-center":
      case "top-right":
        return marginTop;
      case "bottom-left":
      case "bottom-center":
      case "bottom-right":
        return marginTop + availHeight - height;
      case "left-center":
      case "center":
      case "right-center":
        return marginTop + Math.floor((availHeight - height) / 2);
    }
  }
  resolveAnchorCol(anchor, width, availWidth, marginLeft) {
    switch (anchor) {
      case "top-left":
      case "left-center":
      case "bottom-left":
        return marginLeft;
      case "top-right":
      case "right-center":
      case "bottom-right":
        return marginLeft + availWidth - width;
      case "top-center":
      case "center":
      case "bottom-center":
        return marginLeft + Math.floor((availWidth - width) / 2);
    }
  }
  /** Composite all overlays into content lines (sorted by focusOrder, higher = on top). */
  compositeOverlays(lines, termWidth, termHeight) {
    if (this.overlayStack.length === 0) {
      this.renderedOverlayLayouts = [];
      return lines;
    }
    const result = [...lines];
    for (const entry of this.overlayStack)
      entry.bounds = void 0;
    const rendered = [];
    let minLinesNeeded = result.length;
    const visibleEntries = this.overlayStack.filter((e) => this.isOverlayVisible(e));
    visibleEntries.sort((a, b2) => a.focusOrder - b2.focusOrder);
    for (const entry of visibleEntries) {
      const { component, options } = entry;
      const { width, maxHeight } = this.resolveOverlayLayout(options, 0, termWidth, termHeight);
      let overlayLines = this.resolveFakeCursors(component.render(width));
      if (maxHeight !== void 0 && overlayLines.length > maxHeight) {
        overlayLines = overlayLines.slice(0, maxHeight);
      }
      const { row, col } = this.resolveOverlayLayout(options, overlayLines.length, termWidth, termHeight);
      entry.bounds = { row, col, width, height: overlayLines.length };
      rendered.push({ entry, overlayLines, row, col, w: width });
      minLinesNeeded = Math.max(minLinesNeeded, row + overlayLines.length);
    }
    this.renderedOverlayLayouts = rendered.map(({ entry, row, col, w, overlayLines }) => ({
      entry,
      row,
      col,
      width: w,
      height: overlayLines.length
    }));
    const workingHeight = Math.max(result.length, termHeight, minLinesNeeded);
    while (result.length < workingHeight) {
      result.push("");
    }
    const viewportStart = Math.max(0, workingHeight - termHeight);
    for (const { overlayLines, row, col, w } of rendered) {
      for (let i = 0; i < overlayLines.length; i++) {
        const idx = viewportStart + row + i;
        if (idx >= 0 && idx < result.length) {
          const truncatedOverlayLine = visibleWidth(overlayLines[i]) > w ? sliceByColumn(overlayLines[i], 0, w, true) : overlayLines[i];
          result[idx] = this.compositeLineAt(result[idx], truncatedOverlayLine, col, w, termWidth);
        }
      }
    }
    return result;
  }
  applyLineResets(lines) {
    const reset = SEGMENT_RESET;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!isImageLine(line)) {
        lines[i] = normalizeTerminalOutput(line) + reset;
      }
    }
    return lines;
  }
  compositeLineAt(baseLine, overlayLine, startCol, overlayWidth, totalWidth) {
    return compositeTuiLine(baseLine, overlayLine, startCol, overlayWidth, totalWidth);
  }
  /**
   * Find and extract cursor position from rendered lines.
   * Searches for CURSOR_MARKER, calculates its position, and strips it from the output.
   * Only scans the bottom terminal height lines (visible viewport).
   * @param lines - Rendered lines to search
   * @param height - Terminal height (visible viewport size)
   * @returns Cursor position { row, col } or null if no marker found
   */
  extractCursorPosition(lines, height) {
    const viewportTop = Math.max(0, lines.length - height);
    for (let row = lines.length - 1; row >= viewportTop; row--) {
      const line = lines[row];
      const markerIndex = line.indexOf(CURSOR_MARKER);
      if (markerIndex !== -1) {
        const beforeMarker = line.slice(0, markerIndex);
        const col = visibleWidth(beforeMarker);
        lines[row] = line.slice(0, markerIndex) + line.slice(markerIndex + CURSOR_MARKER.length);
        return { row, col };
      }
    }
    return null;
  }
  /**
   * Resolve fake cursor markers to reverse video. When the hardware cursor is shown, a fake cursor
   * directly after CURSOR_MARKER is dropped because the terminal cursor is drawn there. Fake cursors
   * of components without focus have no CURSOR_MARKER and stay visible.
   */
  resolveFakeCursors(lines) {
    return lines.map((line) => {
      if (!line.includes(FAKE_CURSOR_START))
        return line;
      const resolved = this.showHardwareCursor ? line.replace(FOCUSED_FAKE_CURSOR, "$1$2") : line;
      return resolved.replaceAll(FAKE_CURSOR_START, "\x1B[7m").replaceAll(FAKE_CURSOR_END, "\x1B[27m");
    });
  }
  /**
   * Query the terminal's theme colors: the default foreground (OSC 10), the default background
   * (OSC 11), and ANSI colors 0-15 (OSC 4), followed by a DA1 request that marks the end of the
   * replies. Resolves when the DA1 reply or all color replies arrive, or when the timeout expires.
   * Colors the terminal did not report are undefined; the palette is only set when all 16 arrived.
   * @param timeoutMs Query timeout in milliseconds, for terminals that do not answer DA1 either.
   * @param onLateReply Receives the replies if the query completes after the timeout, e.g. over slow links.
   */
  queryTerminalColors({ timeoutMs, onLateReply }) {
    return new Promise((resolve2) => {
      const query = {
        palette: Array.from({ length: TERMINAL_PALETTE_SIZE }, () => void 0),
        replied: /* @__PURE__ */ new Set(),
        deliver: resolve2,
        timer: void 0
      };
      query.timer = setTimeout(() => {
        query.deliver = onLateReply;
        resolve2(this.terminalColorQueryResult(query));
      }, timeoutMs);
      this.pendingTerminalColorQueries.push(query);
      this.terminal.write(TERMINAL_COLOR_QUERY);
    });
  }
};

// node_modules/@earendil-works/pi-tui/dist/keybindings.js
var TUI_KEYBINDINGS = {
  "tui.editor.cursorUp": { defaultKeys: "up", description: "Move cursor up" },
  "tui.editor.cursorDown": { defaultKeys: "down", description: "Move cursor down" },
  "tui.editor.historyPrevious": {
    defaultKeys: [],
    description: "Select previous prompt history entry"
  },
  "tui.editor.historyNext": {
    defaultKeys: [],
    description: "Select next prompt history entry"
  },
  "tui.editor.cursorLeft": {
    defaultKeys: ["left", "ctrl+b"],
    description: "Move cursor left"
  },
  "tui.editor.cursorRight": {
    defaultKeys: ["right", "ctrl+f"],
    description: "Move cursor right"
  },
  "tui.editor.cursorWordLeft": {
    defaultKeys: ["alt+left", "ctrl+left", "alt+b"],
    description: "Move cursor word left"
  },
  "tui.editor.cursorWordRight": {
    defaultKeys: ["alt+right", "ctrl+right", "alt+f"],
    description: "Move cursor word right"
  },
  "tui.editor.cursorLineStart": {
    defaultKeys: ["home", "ctrl+a"],
    description: "Move to line start"
  },
  "tui.editor.cursorLineEnd": {
    defaultKeys: ["end", "ctrl+e"],
    description: "Move to line end"
  },
  "tui.editor.jumpForward": {
    defaultKeys: "ctrl+]",
    description: "Jump forward to character"
  },
  "tui.editor.jumpBackward": {
    defaultKeys: "ctrl+alt+]",
    description: "Jump backward to character"
  },
  "tui.editor.pageUp": { defaultKeys: ["pageUp", "ctrl+pageUp"], description: "Page up" },
  "tui.editor.pageDown": { defaultKeys: ["pageDown", "ctrl+pageDown"], description: "Page down" },
  "tui.editor.deleteCharBackward": {
    defaultKeys: "backspace",
    description: "Delete character backward"
  },
  "tui.editor.deleteCharForward": {
    defaultKeys: ["delete", "ctrl+d"],
    description: "Delete character forward"
  },
  "tui.editor.deleteWordBackward": {
    defaultKeys: ["ctrl+w", "alt+backspace"],
    description: "Delete word backward"
  },
  "tui.editor.deleteWordForward": {
    defaultKeys: ["alt+d", "alt+delete"],
    description: "Delete word forward"
  },
  "tui.editor.deleteToLineStart": {
    defaultKeys: "ctrl+u",
    description: "Delete to line start"
  },
  "tui.editor.deleteToLineEnd": {
    defaultKeys: "ctrl+k",
    description: "Delete to line end"
  },
  "tui.editor.yank": { defaultKeys: "ctrl+y", description: "Yank" },
  "tui.editor.yankPop": { defaultKeys: "alt+y", description: "Yank pop" },
  "tui.editor.undo": { defaultKeys: "ctrl+-", description: "Undo" },
  "tui.input.newLine": { defaultKeys: ["shift+enter", "ctrl+j"], description: "Insert newline" },
  "tui.input.submit": { defaultKeys: "enter", description: "Submit input" },
  "tui.input.tab": { defaultKeys: "tab", description: "Tab / autocomplete" },
  "tui.input.copy": { defaultKeys: "ctrl+c", description: "Copy selection" },
  "tui.select.up": { defaultKeys: "up", description: "Move selection up" },
  "tui.select.down": { defaultKeys: "down", description: "Move selection down" },
  "tui.select.pageUp": { defaultKeys: "pageUp", description: "Selection page up" },
  "tui.select.pageDown": {
    defaultKeys: "pageDown",
    description: "Selection page down"
  },
  "tui.select.confirm": { defaultKeys: "enter", description: "Confirm selection" },
  "tui.select.cancel": {
    defaultKeys: ["escape", "ctrl+c"],
    description: "Cancel selection"
  },
  // These intentionally shadow the unmodified editor bindings in fullscreen mode.
  "tui.altScreen.pageUp": {
    defaultKeys: "pageUp",
    description: "Scroll viewport up one page"
  },
  "tui.altScreen.pageDown": {
    defaultKeys: "pageDown",
    description: "Scroll viewport down one page"
  },
  "tui.altScreen.halfPageUp": {
    defaultKeys: [],
    description: "Scroll viewport up half a page"
  },
  "tui.altScreen.halfPageDown": {
    defaultKeys: [],
    description: "Scroll viewport down half a page"
  },
  "tui.altScreen.lineUp": {
    defaultKeys: [],
    description: "Scroll viewport up one line"
  },
  "tui.altScreen.lineDown": {
    defaultKeys: [],
    description: "Scroll viewport down one line"
  },
  "tui.altScreen.previousPrompt": {
    defaultKeys: ["ctrl+shift+up", "ctrl+up"],
    description: "Jump to previous semantic prompt"
  },
  "tui.altScreen.nextPrompt": {
    defaultKeys: ["ctrl+shift+down", "ctrl+down"],
    description: "Jump to next semantic prompt"
  },
  "tui.altScreen.search": {
    defaultKeys: "ctrl+shift+f",
    description: "Search the primary scroll view"
  },
  "tui.altScreen.searchNext": {
    defaultKeys: ["enter", "ctrl+g"],
    description: "Select the next search match"
  },
  "tui.altScreen.searchPrevious": {
    defaultKeys: ["shift+enter", "ctrl+shift+g"],
    description: "Select the previous search match"
  },
  "tui.altScreen.searchClose": {
    defaultKeys: "escape",
    description: "Close transcript search"
  },
  "tui.altScreen.top": { defaultKeys: "ctrl+home", description: "Scroll viewport to top" },
  "tui.altScreen.bottom": { defaultKeys: "ctrl+end", description: "Scroll viewport to bottom" }
};
function normalizeKeys(keys) {
  if (keys === void 0)
    return [];
  const keyList = Array.isArray(keys) ? keys : [keys];
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const key of keyList) {
    if (!seen.has(key)) {
      seen.add(key);
      result.push(key);
    }
  }
  return result;
}
var KeybindingsManager = class {
  definitions;
  userBindings;
  keysById = /* @__PURE__ */ new Map();
  conflicts = [];
  constructor(definitions, userBindings = {}) {
    this.definitions = definitions;
    this.userBindings = userBindings;
    this.rebuild();
  }
  rebuild() {
    this.keysById.clear();
    this.conflicts = [];
    const userClaims = /* @__PURE__ */ new Map();
    for (const [keybinding, keys] of Object.entries(this.userBindings)) {
      if (!(keybinding in this.definitions))
        continue;
      for (const key of normalizeKeys(keys)) {
        const claimants = userClaims.get(key) ?? /* @__PURE__ */ new Set();
        claimants.add(keybinding);
        userClaims.set(key, claimants);
      }
    }
    for (const [key, keybindings] of userClaims) {
      if (keybindings.size > 1) {
        this.conflicts.push({ key, keybindings: [...keybindings] });
      }
    }
    for (const [id, definition] of Object.entries(this.definitions)) {
      const userKeys = this.userBindings[id];
      const keys = userKeys === void 0 ? normalizeKeys(definition.defaultKeys) : normalizeKeys(userKeys);
      this.keysById.set(id, keys);
    }
  }
  matches(data, keybinding) {
    const keys = this.keysById.get(keybinding) ?? [];
    for (const key of keys) {
      if (matchesKey(data, key))
        return true;
    }
    return false;
  }
  getKeys(keybinding) {
    return [...this.keysById.get(keybinding) ?? []];
  }
  getDefinition(keybinding) {
    return this.definitions[keybinding];
  }
  getConflicts() {
    return this.conflicts.map((conflict) => ({ ...conflict, keybindings: [...conflict.keybindings] }));
  }
  setUserBindings(userBindings) {
    this.userBindings = userBindings;
    this.rebuild();
  }
  getUserBindings() {
    return { ...this.userBindings };
  }
  getResolvedBindings() {
    const resolved = {};
    for (const id of Object.keys(this.definitions)) {
      const keys = this.keysById.get(id) ?? [];
      resolved[id] = keys.length === 1 ? keys[0] : [...keys];
    }
    return resolved;
  }
};
var globalKeybindings = null;
function getKeybindings() {
  if (!globalKeybindings) {
    globalKeybindings = new KeybindingsManager(TUI_KEYBINDINGS);
  }
  return globalKeybindings;
}

// node_modules/@earendil-works/pi-tui/dist/kill-ring.js
var KillRing = class {
  ring = [];
  /**
   * Add text to the kill ring.
   *
   * @param text - The killed text to add
   * @param opts - Push options
   * @param opts.prepend - If accumulating, prepend (backward deletion) or append (forward deletion)
   * @param opts.accumulate - Merge with the most recent entry instead of creating a new one
   */
  push(text, opts) {
    if (!text)
      return;
    if (opts.accumulate && this.ring.length > 0) {
      const last = this.ring.pop();
      this.ring.push(opts.prepend ? text + last : last + text);
    } else {
      this.ring.push(text);
    }
  }
  /** Get most recent entry without modifying the ring. */
  peek() {
    return this.ring.length > 0 ? this.ring[this.ring.length - 1] : void 0;
  }
  /** Move last entry to front (for yank-pop cycling). */
  rotate() {
    if (this.ring.length > 1) {
      const last = this.ring.pop();
      this.ring.unshift(last);
    }
  }
  get length() {
    return this.ring.length;
  }
};

// node_modules/@earendil-works/pi-tui/dist/undo-stack.js
var UndoStack = class {
  stack = [];
  /** Push a deep clone of the given state onto the stack. */
  push(state) {
    this.stack.push(structuredClone(state));
  }
  /** Pop and return the most recent snapshot, or undefined if empty. */
  pop() {
    return this.stack.pop();
  }
  /** Remove all snapshots. */
  clear() {
    this.stack.length = 0;
  }
  get length() {
    return this.stack.length;
  }
};

// node_modules/@earendil-works/pi-tui/dist/word-navigation.js
var wordSegmenter2 = getWordSegmenter();
function findWordBackward(text, cursor, options) {
  if (cursor <= 0)
    return 0;
  const textBeforeCursor = text.slice(0, cursor);
  const segmentFn = options?.segment;
  const isAtomic = options?.isAtomicSegment;
  const segments = segmentFn ? [...segmentFn(textBeforeCursor)] : [...wordSegmenter2.segment(textBeforeCursor)];
  let newCursor = cursor;
  while (segments.length > 0 && !isAtomic?.(segments[segments.length - 1]?.segment || "") && isWhitespaceChar(segments[segments.length - 1]?.segment || "")) {
    newCursor -= segments.pop()?.segment.length || 0;
  }
  if (segments.length === 0)
    return newCursor;
  const last = segments[segments.length - 1];
  if (isAtomic?.(last.segment)) {
    newCursor -= last.segment.length;
  } else if (last.isWordLike) {
    const segment = last.segment;
    const matches = [...segment.matchAll(new RegExp(PUNCTUATION_REGEX, "g"))];
    if (matches.length <= 0) {
      newCursor -= segment.length;
    } else {
      const lastMatch = matches[matches.length - 1];
      newCursor -= segment.length - (lastMatch.index + lastMatch[0].length);
    }
  } else {
    while (segments.length > 0 && !isAtomic?.(segments[segments.length - 1]?.segment || "") && !segments[segments.length - 1]?.isWordLike && !isWhitespaceChar(segments[segments.length - 1]?.segment || "")) {
      newCursor -= segments.pop()?.segment.length || 0;
    }
  }
  return newCursor;
}
function findWordForward(text, cursor, options) {
  if (cursor >= text.length)
    return text.length;
  const textAfterCursor = text.slice(cursor);
  const segmentFn = options?.segment;
  const isAtomic = options?.isAtomicSegment;
  const segments = segmentFn ? segmentFn(textAfterCursor) : wordSegmenter2.segment(textAfterCursor);
  const iterator = segments[Symbol.iterator]();
  let next = iterator.next();
  let newCursor = cursor;
  while (!next.done && !isAtomic?.(next.value.segment) && isWhitespaceChar(next.value.segment)) {
    newCursor += next.value.segment.length;
    next = iterator.next();
  }
  if (next.done)
    return newCursor;
  if (isAtomic?.(next.value.segment)) {
    newCursor += next.value.segment.length;
  } else if (next.value.isWordLike) {
    newCursor += PUNCTUATION_REGEX.exec(next.value.segment)?.index ?? next.value.segment.length;
  } else {
    while (!next.done && !isAtomic?.(next.value.segment) && !next.value.isWordLike && !isWhitespaceChar(next.value.segment)) {
      newCursor += next.value.segment.length;
      next = iterator.next();
    }
  }
  return newCursor;
}

// node_modules/@earendil-works/pi-tui/dist/components/editor.js
var graphemeSegmenter2 = getGraphemeSegmenter();
var wordSegmenter3 = getWordSegmenter();
var unquotedAutocompleteSuffixRegex = new RegExp(`(?:(?!${autocompleteSeparatorRegex.source}).)*`, "u");
var autocompleteTokenStartSource = `${autocompleteBoundaryRegex.source}[([{<\`]*`;

// node_modules/@earendil-works/pi-tui/dist/layout-node.js
var LAYOUT_NODE = /* @__PURE__ */ Symbol.for("@earendil-works/pi-tui/layout-node");
function getLayoutNode(component) {
  const candidate = component;
  return typeof candidate[LAYOUT_NODE] === "function" ? candidate[LAYOUT_NODE]() : void 0;
}

// node_modules/@earendil-works/pi-tui/dist/components/stack.js
function isStackEntry(child) {
  return !("render" in child);
}
function normalizeSize(value, fallback) {
  return value === void 0 || !Number.isFinite(value) ? fallback : Math.max(0, Math.floor(value));
}
var Stack = class extends Container {
  entries = [];
  gap;
  align;
  constructor(children = [], options = {}) {
    super();
    this.gap = normalizeSize(options.gap, 0);
    this.align = options.align ?? "stretch";
    for (const child of children) {
      if (isStackEntry(child))
        this.addChild(child.component, child);
      else
        this.addChild(child);
    }
  }
  addChild(component, options = {}) {
    super.addChild(component);
    this.entries.push({
      component,
      ...options.basis === void 0 ? {} : { basis: options.basis },
      ...options.grow === void 0 ? {} : { grow: normalizeSize(options.grow, 0) },
      ...options.shrink === void 0 ? {} : { shrink: normalizeSize(options.shrink, 1) },
      ...options.minSize === void 0 ? {} : { minSize: normalizeSize(options.minSize, 0) },
      ...options.maxSize === void 0 ? {} : { maxSize: normalizeSize(options.maxSize, Number.MAX_SAFE_INTEGER) },
      ...options.visible === void 0 ? {} : { visible: options.visible }
    });
  }
  removeChild(component) {
    super.removeChild(component);
    const index = this.entries.findIndex((entry) => entry.component === component);
    if (index !== -1)
      this.entries.splice(index, 1);
  }
  clear() {
    super.clear();
    this.entries.length = 0;
  }
  [LAYOUT_NODE]() {
    return {
      type: this.layoutType,
      entries: this.entries,
      gap: this.gap,
      align: this.align
    };
  }
};
function visibleStackEntries(entries, viewport) {
  return entries.filter((entry) => entry.visible?.(viewport) ?? true);
}
function clampSize(size, entry) {
  const min = Math.max(0, Math.floor(entry.minSize ?? 0));
  const max = Math.max(min, Math.floor(entry.maxSize ?? Number.MAX_SAFE_INTEGER));
  return Math.max(min, Math.min(max, Math.max(0, Math.floor(size))));
}
function distribute(sizes, entries, amount, mode) {
  let remaining = amount;
  while (remaining > 0) {
    const candidates = entries.map((entry, index) => ({ entry, index })).filter(({ entry, index }) => {
      if (mode === "grow") {
        return (entry.grow ?? 0) > 0 && sizes[index] < (entry.maxSize ?? Number.MAX_SAFE_INTEGER);
      }
      return (entry.shrink ?? 1) > 0 && sizes[index] > (entry.minSize ?? 0);
    });
    if (candidates.length === 0)
      return;
    const totalWeight = candidates.reduce((sum, { entry, index }) => {
      return sum + (mode === "grow" ? entry.grow ?? 0 : (entry.shrink ?? 1) * Math.max(1, sizes[index]));
    }, 0);
    let distributed = 0;
    for (const { entry, index } of candidates) {
      if (remaining <= 0)
        break;
      const weight = mode === "grow" ? entry.grow ?? 0 : (entry.shrink ?? 1) * Math.max(1, sizes[index]);
      const proposed = Math.max(1, Math.floor(remaining * weight / totalWeight));
      const capacity = mode === "grow" ? (entry.maxSize ?? Number.MAX_SAFE_INTEGER) - sizes[index] : sizes[index] - (entry.minSize ?? 0);
      const delta = Math.min(remaining, proposed, capacity);
      if (delta <= 0)
        continue;
      sizes[index] = sizes[index] + (mode === "grow" ? delta : -delta);
      remaining -= delta;
      distributed += delta;
    }
    if (distributed === 0)
      return;
  }
}
function allocateStackSizes(entries, intrinsicSizes, availableSize, gap) {
  const sizes = entries.map((entry, index) => clampSize(entry.basis === void 0 || entry.basis === "auto" ? intrinsicSizes[index] ?? 0 : entry.basis, entry));
  if (availableSize === void 0)
    return sizes;
  const contentSize = Math.max(0, Math.floor(availableSize) - Math.max(0, entries.length - 1) * gap);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (total < contentSize)
    distribute(sizes, entries, contentSize - total, "grow");
  else if (total > contentSize)
    distribute(sizes, entries, total - contentSize, "shrink");
  return sizes;
}

// node_modules/@earendil-works/pi-tui/dist/components/input.js
var segmenter = getGraphemeSegmenter();
var Input = class {
  value = "";
  cursor = 0;
  // Cursor position in the value
  prompt;
  placeholder;
  placeholderStyle;
  renderedStartColumn = 0;
  onSubmit;
  onEscape;
  /** Focusable interface - set by TUI when focus changes */
  focused = false;
  // Bracketed paste mode buffering
  pasteBuffer = "";
  isInPaste = false;
  // Kill ring for Emacs-style kill/yank operations
  killRing = new KillRing();
  lastAction = null;
  // Undo support
  undoStack = new UndoStack();
  constructor(options = {}) {
    this.prompt = options.prompt ?? "> ";
    this.placeholder = options.placeholder ?? "";
    this.placeholderStyle = options.placeholderStyle ?? ((text) => text);
  }
  getValue() {
    return this.value;
  }
  setValue(value) {
    this.value = value;
    this.cursor = Math.min(this.cursor, value.length);
  }
  handleInput(data) {
    if (data.includes("\x1B[200~")) {
      this.isInPaste = true;
      this.pasteBuffer = "";
      data = data.replace("\x1B[200~", "");
    }
    if (this.isInPaste) {
      this.pasteBuffer += data;
      const endIndex = this.pasteBuffer.indexOf("\x1B[201~");
      if (endIndex !== -1) {
        const pasteContent = this.pasteBuffer.substring(0, endIndex);
        this.handlePaste(pasteContent);
        this.isInPaste = false;
        const remaining = this.pasteBuffer.substring(endIndex + 6);
        this.pasteBuffer = "";
        if (remaining) {
          this.handleInput(remaining);
        }
      }
      return;
    }
    const kb = getKeybindings();
    if (kb.matches(data, "tui.select.cancel")) {
      if (this.onEscape)
        this.onEscape();
      return;
    }
    if (kb.matches(data, "tui.editor.undo")) {
      this.undo();
      return;
    }
    if (kb.matches(data, "tui.input.submit") || data === "\n") {
      if (this.onSubmit)
        this.onSubmit(this.value);
      return;
    }
    if (kb.matches(data, "tui.editor.deleteCharBackward")) {
      this.handleBackspace();
      return;
    }
    if (kb.matches(data, "tui.editor.deleteCharForward")) {
      this.handleForwardDelete();
      return;
    }
    if (kb.matches(data, "tui.editor.deleteWordBackward")) {
      this.deleteWordBackwards();
      return;
    }
    if (kb.matches(data, "tui.editor.deleteWordForward")) {
      this.deleteWordForward();
      return;
    }
    if (kb.matches(data, "tui.editor.deleteToLineStart")) {
      this.deleteToLineStart();
      return;
    }
    if (kb.matches(data, "tui.editor.deleteToLineEnd")) {
      this.deleteToLineEnd();
      return;
    }
    if (kb.matches(data, "tui.editor.yank")) {
      this.yank();
      return;
    }
    if (kb.matches(data, "tui.editor.yankPop")) {
      this.yankPop();
      return;
    }
    if (kb.matches(data, "tui.editor.cursorLeft")) {
      this.lastAction = null;
      if (this.cursor > 0) {
        const beforeCursor = this.value.slice(0, this.cursor);
        const graphemes = [...segmenter.segment(beforeCursor)];
        const lastGrapheme = graphemes[graphemes.length - 1];
        this.cursor -= lastGrapheme ? lastGrapheme.segment.length : 1;
      }
      return;
    }
    if (kb.matches(data, "tui.editor.cursorRight")) {
      this.lastAction = null;
      if (this.cursor < this.value.length) {
        const afterCursor = this.value.slice(this.cursor);
        const graphemes = [...segmenter.segment(afterCursor)];
        const firstGrapheme = graphemes[0];
        this.cursor += firstGrapheme ? firstGrapheme.segment.length : 1;
      }
      return;
    }
    if (kb.matches(data, "tui.editor.cursorLineStart")) {
      this.lastAction = null;
      this.cursor = 0;
      return;
    }
    if (kb.matches(data, "tui.editor.cursorLineEnd")) {
      this.lastAction = null;
      this.cursor = this.value.length;
      return;
    }
    if (kb.matches(data, "tui.editor.cursorWordLeft")) {
      this.moveWordBackwards();
      return;
    }
    if (kb.matches(data, "tui.editor.cursorWordRight")) {
      this.moveWordForwards();
      return;
    }
    const kittyPrintable = decodeKittyPrintable(data);
    if (kittyPrintable !== void 0) {
      this.insertCharacter(kittyPrintable);
      return;
    }
    const hasControlChars = [...data].some((ch) => {
      const code = ch.charCodeAt(0);
      return code < 32 || code === 127 || code >= 128 && code <= 159;
    });
    if (!hasControlChars) {
      this.insertCharacter(data);
    }
  }
  handleMouse(event) {
    if (event.type !== "press" || event.button !== "left" || event.y !== 0)
      return void 0;
    const visibleColumn = Math.max(0, event.x - 2);
    const targetColumn = this.renderedStartColumn + visibleColumn;
    let currentColumn = 0;
    this.cursor = this.value.length;
    for (const grapheme of segmenter.segment(this.value)) {
      const nextColumn = currentColumn + visibleWidth(grapheme.segment);
      if (targetColumn < nextColumn) {
        this.cursor = grapheme.index;
        break;
      }
      currentColumn = nextColumn;
    }
    this.lastAction = null;
    return { handled: true, focus: true };
  }
  insertCharacter(char) {
    if (isWhitespaceChar(char) || this.lastAction !== "type-word") {
      this.pushUndo();
    }
    this.lastAction = "type-word";
    this.value = this.value.slice(0, this.cursor) + char + this.value.slice(this.cursor);
    this.cursor += char.length;
  }
  handleBackspace() {
    this.lastAction = null;
    if (this.cursor > 0) {
      this.pushUndo();
      const beforeCursor = this.value.slice(0, this.cursor);
      const graphemes = [...segmenter.segment(beforeCursor)];
      const lastGrapheme = graphemes[graphemes.length - 1];
      const graphemeLength = lastGrapheme ? lastGrapheme.segment.length : 1;
      this.value = this.value.slice(0, this.cursor - graphemeLength) + this.value.slice(this.cursor);
      this.cursor -= graphemeLength;
    }
  }
  handleForwardDelete() {
    this.lastAction = null;
    if (this.cursor < this.value.length) {
      this.pushUndo();
      const afterCursor = this.value.slice(this.cursor);
      const graphemes = [...segmenter.segment(afterCursor)];
      const firstGrapheme = graphemes[0];
      const graphemeLength = firstGrapheme ? firstGrapheme.segment.length : 1;
      this.value = this.value.slice(0, this.cursor) + this.value.slice(this.cursor + graphemeLength);
    }
  }
  deleteToLineStart() {
    if (this.cursor === 0)
      return;
    this.pushUndo();
    const deletedText = this.value.slice(0, this.cursor);
    this.killRing.push(deletedText, { prepend: true, accumulate: this.lastAction === "kill" });
    this.lastAction = "kill";
    this.value = this.value.slice(this.cursor);
    this.cursor = 0;
  }
  deleteToLineEnd() {
    if (this.cursor >= this.value.length)
      return;
    this.pushUndo();
    const deletedText = this.value.slice(this.cursor);
    this.killRing.push(deletedText, { prepend: false, accumulate: this.lastAction === "kill" });
    this.lastAction = "kill";
    this.value = this.value.slice(0, this.cursor);
  }
  deleteWordBackwards() {
    if (this.cursor === 0)
      return;
    const wasKill = this.lastAction === "kill";
    this.pushUndo();
    const oldCursor = this.cursor;
    this.moveWordBackwards();
    const deleteFrom = this.cursor;
    this.cursor = oldCursor;
    const deletedText = this.value.slice(deleteFrom, this.cursor);
    this.killRing.push(deletedText, { prepend: true, accumulate: wasKill });
    this.lastAction = "kill";
    this.value = this.value.slice(0, deleteFrom) + this.value.slice(this.cursor);
    this.cursor = deleteFrom;
  }
  deleteWordForward() {
    if (this.cursor >= this.value.length)
      return;
    const wasKill = this.lastAction === "kill";
    this.pushUndo();
    const oldCursor = this.cursor;
    this.moveWordForwards();
    const deleteTo = this.cursor;
    this.cursor = oldCursor;
    const deletedText = this.value.slice(this.cursor, deleteTo);
    this.killRing.push(deletedText, { prepend: false, accumulate: wasKill });
    this.lastAction = "kill";
    this.value = this.value.slice(0, this.cursor) + this.value.slice(deleteTo);
  }
  yank() {
    const text = this.killRing.peek();
    if (!text)
      return;
    this.pushUndo();
    this.value = this.value.slice(0, this.cursor) + text + this.value.slice(this.cursor);
    this.cursor += text.length;
    this.lastAction = "yank";
  }
  yankPop() {
    if (this.lastAction !== "yank" || this.killRing.length <= 1)
      return;
    this.pushUndo();
    const prevText = this.killRing.peek() || "";
    this.value = this.value.slice(0, this.cursor - prevText.length) + this.value.slice(this.cursor);
    this.cursor -= prevText.length;
    this.killRing.rotate();
    const text = this.killRing.peek() || "";
    this.value = this.value.slice(0, this.cursor) + text + this.value.slice(this.cursor);
    this.cursor += text.length;
    this.lastAction = "yank";
  }
  pushUndo() {
    this.undoStack.push({ value: this.value, cursor: this.cursor });
  }
  undo() {
    const snapshot = this.undoStack.pop();
    if (!snapshot)
      return;
    this.value = snapshot.value;
    this.cursor = snapshot.cursor;
    this.lastAction = null;
  }
  moveWordBackwards() {
    if (this.cursor === 0)
      return;
    this.lastAction = null;
    this.cursor = findWordBackward(this.value, this.cursor);
  }
  moveWordForwards() {
    if (this.cursor >= this.value.length)
      return;
    this.lastAction = null;
    this.cursor = findWordForward(this.value, this.cursor);
  }
  handlePaste(pastedText) {
    this.lastAction = null;
    this.pushUndo();
    const cleanText = pastedText.replace(/\r\n/g, "").replace(/\r/g, "").replace(/\n/g, "").replace(/\t/g, "    ");
    this.value = this.value.slice(0, this.cursor) + cleanText + this.value.slice(this.cursor);
    this.cursor += cleanText.length;
  }
  invalidate() {
  }
  render(width) {
    const availableWidth = width - visibleWidth(this.prompt);
    if (availableWidth <= 0) {
      return [truncateToWidth(this.prompt, width, "")];
    }
    if (this.value.length === 0 && this.placeholder) {
      const placeholder = truncateToWidth(this.placeholder, availableWidth, "");
      const graphemes2 = [...segmenter.segment(placeholder)];
      const atCursor2 = graphemes2[0]?.segment ?? " ";
      const afterCursor2 = placeholder.slice(atCursor2.length);
      const marker2 = this.focused ? CURSOR_MARKER : "";
      const cursorChar2 = renderFakeCursor(this.placeholderStyle(atCursor2));
      const textWithCursor2 = marker2 + cursorChar2 + this.placeholderStyle(afterCursor2);
      const padding2 = " ".repeat(Math.max(0, availableWidth - visibleWidth(textWithCursor2)));
      return [this.prompt + textWithCursor2 + padding2];
    }
    let visibleText = "";
    let cursorDisplay = this.cursor;
    this.renderedStartColumn = 0;
    const totalWidth = visibleWidth(this.value);
    if (totalWidth < availableWidth) {
      visibleText = this.value;
    } else {
      const scrollWidth = this.cursor === this.value.length ? availableWidth - 1 : availableWidth;
      const cursorCol = visibleWidth(this.value.slice(0, this.cursor));
      if (scrollWidth > 0) {
        const halfWidth = Math.floor(scrollWidth / 2);
        let startCol = 0;
        if (cursorCol < halfWidth) {
          startCol = 0;
        } else if (cursorCol > totalWidth - halfWidth) {
          startCol = Math.max(0, totalWidth - scrollWidth);
        } else {
          startCol = Math.max(0, cursorCol - halfWidth);
        }
        this.renderedStartColumn = startCol;
        visibleText = sliceByColumn(this.value, startCol, scrollWidth, true);
        const beforeCursor2 = sliceByColumn(this.value, startCol, Math.max(0, cursorCol - startCol), true);
        cursorDisplay = beforeCursor2.length;
      } else {
        visibleText = "";
        cursorDisplay = 0;
      }
    }
    const graphemes = [...segmenter.segment(visibleText.slice(cursorDisplay))];
    const cursorGrapheme = graphemes[0];
    const beforeCursor = visibleText.slice(0, cursorDisplay);
    const atCursor = cursorGrapheme?.segment ?? " ";
    const afterCursor = visibleText.slice(cursorDisplay + atCursor.length);
    const marker = this.focused ? CURSOR_MARKER : "";
    const cursorChar = renderFakeCursor(atCursor);
    const textWithCursor = beforeCursor + marker + cursorChar + afterCursor;
    const visualLength = visibleWidth(textWithCursor);
    const padding = " ".repeat(Math.max(0, availableWidth - visualLength));
    const line = this.prompt + textWithCursor + padding;
    return [line];
  }
};

// node_modules/marked-cjk-friendly/dist/index.js
var CJK = "\\u1100-\\u11ff\\u20a9\\u2329-\\u232a\\u2630-\\u2637\\u268a-\\u268f\\u2e80-\\u2e99\\u2e9b-\\u2ef3\\u2f00-\\u2fd5\\u2ff0-\\u303e\\u3041-\\u3096\\u3099-\\u30ff\\u3105-\\u312f\\u3131-\\u318e\\u3190-\\u31e5\\u31ef-\\u321e\\u3220-\\u3247\\u3250-\\ua48c\\ua490-\\ua4c6\\ua960-\\ua97c\\uac00-\\ud7a3\\ud7b0-\\ud7c6\\ud7cb-\\ud7fb\\uf900-\\ufaff\\ufe10-\\ufe19\\ufe30-\\ufe52\\ufe54-\\ufe66\\ufe68-\\ufe6b\\uff01-\\uffbe\\uffc2-\\uffc7\\uffca-\\uffcf\\uffd2-\\uffd7\\uffda-\\uffdc\\uffe0-\\uffe6\\uffe8-\\uffee\\u{16fe0}-\\u{16fe4}\\u{16ff0}-\\u{16ff6}\\u{17000}-\\u{18cda}\\u{18cff}-\\u{18d20}\\u{18d80}-\\u{18df2}\\u{18e00}-\\u{19191}\\u{191a0}-\\u{191d2}\\u{1aff0}-\\u{1aff3}\\u{1aff5}-\\u{1affb}\\u{1affd}-\\u{1affe}\\u{1b000}-\\u{1b128}\\u{1b132}\\u{1b150}-\\u{1b152}\\u{1b155}\\u{1b164}-\\u{1b168}\\u{1b170}-\\u{1b2fb}\\u{1d300}-\\u{1d356}\\u{1d360}-\\u{1d376}\\u{1f1ae}\\u{1f200}\\u{1f202}\\u{1f210}-\\u{1f219}\\u{1f21b}-\\u{1f22e}\\u{1f230}-\\u{1f231}\\u{1f237}\\u{1f23b}\\u{1f240}-\\u{1f248}\\u{1f260}-\\u{1f265}\\u{1f7da}\\u{20000}-\\u{3fffd}";
var cjkTest = new RegExp(`[${CJK}]`, "u");
var punctuationCjk = new RegExp(`^((?![*_])[\\s\\p{P}\\p{S}${CJK}])`, "u");
function buildRDelimAst(punct, punctSpace, notPunctSpace) {
  return new RegExp(`^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)${punct}(\\*+)(?=[\\s]|$)|${notPunctSpace}(\\*+)(?!\\*)(?=${punctSpace}|$)|(?!\\*)${punctSpace}(\\*+)(?=${notPunctSpace})|[\\s](\\*+)(?!\\*)(?=${punct})|(?!\\*)${punct}(\\*+)(?!\\*)(?=${punct})|${notPunctSpace}(\\*+)(?=${notPunctSpace})`, "gu");
}
function buildRDelimUnd(punct, punctSpace, notPunctSpace) {
  return new RegExp(`^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)${punct}(_+)(?=[\\s]|$)|${notPunctSpace}(_+)(?!_)(?=${punctSpace}|$)|(?!_)${punctSpace}(_+)(?=${notPunctSpace})|[\\s](_+)(?!_)(?=${punct})|(?!_)${punct}(_+)(?!_)(?=${punct})`, "gu");
}
function buildRDelimDel(punct, punctSpace, notPunctSpace) {
  return new RegExp(`^[^~]+(?=[^~])|(?!~)${punct}(~~?)(?=[\\s]|$)|${notPunctSpace}(~~?)(?!~)(?=${punctSpace}|$)|(?!~)${punctSpace}(~~?)(?=${notPunctSpace})|[\\s](~~?)(?!~)(?=${punct})|(?!~)${punct}(~~?)(?!~)(?=${punct})|${notPunctSpace}(~~?)(?=${notPunctSpace})`, "gu");
}
var cjkPunct = `[\\p{P}\\p{S}${CJK}]`;
var cjkPunctSpace = `[\\s\\p{P}\\p{S}${CJK}]`;
var cjkNotPunctSpace = `[^\\s\\p{P}\\p{S}${CJK}]`;
var cjkDelPunct = `(?![*_])[\\p{P}\\p{S}${CJK}]`;
var cjkDelPunctSpace = `(?![*_])[\\s\\p{P}\\p{S}${CJK}]`;
var cjkDelNotPunctSpace = `(?:[^\\s\\p{P}\\p{S}${CJK}]|[*_])`;
var cjkPunctGfm = `(?!~)[\\p{P}\\p{S}${CJK}]`;
var cjkPunctSpaceGfm = `(?!~)[\\s\\p{P}\\p{S}${CJK}]`;
var cjkNotPunctSpaceGfm = `(?:[^\\s\\p{P}\\p{S}${CJK}]|~)`;
var emStrongRDelimAstCjk = buildRDelimAst(cjkPunct, cjkPunctSpace, cjkNotPunctSpace);
var emStrongRDelimAstCjkGfm = buildRDelimAst(cjkPunctGfm, cjkPunctSpaceGfm, cjkNotPunctSpaceGfm);
var emStrongRDelimUndCjk = buildRDelimUnd(cjkPunct, cjkPunctSpace, cjkNotPunctSpace);
var delRDelimCjk = buildRDelimDel(cjkDelPunct, cjkDelPunctSpace, cjkDelNotPunctSpace);
function isPrevCharCjk(prevChar, maskedSrc, src) {
  let prevIsCjk = punctuationCjk.test(prevChar);
  if (!prevIsCjk && prevChar) {
    const prevIdx = maskedSrc.length - src.length;
    if (prevIdx >= 1) {
      let idx = prevIdx - 1;
      let code = maskedSrc.charCodeAt(idx);
      if (code >= 65024 && code <= 65038 && idx >= 1) {
        idx--;
        code = maskedSrc.charCodeAt(idx);
      }
      if ((code & 64512) === 56320 && idx >= 1) {
        const cp = maskedSrc.codePointAt(idx - 1);
        if (cp !== void 0 && cp > 65535) {
          if (cp >= 917760 && cp <= 917999) prevIsCjk = true;
          else prevIsCjk = cjkTest.test(String.fromCodePoint(cp));
        }
      } else prevIsCjk = cjkTest.test(String.fromCharCode(code));
    }
  }
  return prevIsCjk;
}
function isCjkAdjacentToDelimiter(rightMatch, clippedMaskedSrc) {
  if (!(rightMatch[1] || rightMatch[2] || rightMatch[3] || rightMatch[4])) return false;
  const charBefore = String.fromCodePoint(rightMatch[0].codePointAt(0));
  const afterPos = rightMatch.index + rightMatch[0].length;
  const charAfter = afterPos < clippedMaskedSrc.length ? String.fromCodePoint(clippedMaskedSrc.codePointAt(afterPos)) : "";
  return cjkTest.test(charBefore) || cjkTest.test(charAfter);
}
function usesModernEmStrongLayout(match) {
  return match.length >= 5;
}
function hasEmStrongLeadContent(match) {
  return Boolean(match[1] || match[2] || match[3] || match[4]);
}
function isEmStrongUnderscoreWordChar(match) {
  return usesModernEmStrongLayout(match) ? Boolean(match[4]) : Boolean(match[3]);
}
function getEmStrongOpeningPunctuation(match) {
  if (usesModernEmStrongLayout(match)) return match[1] || match[3] || "";
  return match[1] || match[2] || "";
}
function markedCjkFriendly() {
  return { tokenizer: {
    emStrong(src, maskedSrc, prevChar = "") {
      const { rules } = this;
      const match = rules.inline.emStrongLDelim.exec(src);
      if (!match) return false;
      const modernEmStrongLayout = usesModernEmStrongLayout(match);
      if (modernEmStrongLayout && !hasEmStrongLeadContent(match)) return;
      if (isEmStrongUnderscoreWordChar(match) && prevChar.match(rules.other.unicodeAlphaNumeric)) return false;
      const nextChar = getEmStrongOpeningPunctuation(match);
      const prevIsCjk = isPrevCharCjk(prevChar, maskedSrc, src);
      if (!nextChar || !prevChar || rules.inline.punctuation.exec(prevChar) || prevIsCjk || cjkTest.test(nextChar)) {
        const lLength = [...match[0]].length - 1;
        let rDelim;
        let rLength;
        let delimTotal = lLength;
        let midDelimTotal = 0;
        const prevCharIsSameDelimiter = modernEmStrongLayout && prevChar === match[0][0];
        const isGfm = rules.inline.emStrongRDelimAst.source.includes("(?!~)");
        let endReg;
        if (match[0][0] === "*") endReg = isGfm ? emStrongRDelimAstCjkGfm : emStrongRDelimAstCjk;
        else endReg = emStrongRDelimUndCjk;
        endReg.lastIndex = 0;
        const clippedMaskedSrc = maskedSrc.slice(-1 * src.length + lLength);
        let rMatch;
        while ((rMatch = endReg.exec(clippedMaskedSrc)) != null) {
          rDelim = rMatch[1] || rMatch[2] || rMatch[3] || rMatch[4] || rMatch[5] || rMatch[6];
          if (!rDelim) continue;
          rLength = [...rDelim].length;
          const isCjkAdjacent = isCjkAdjacentToDelimiter(rMatch, clippedMaskedSrc);
          const isLeftOnly = Boolean(rMatch[3] || rMatch[4]);
          const isBoth = Boolean(rMatch[5] || rMatch[6]);
          if (isLeftOnly && !isCjkAdjacent) {
            delimTotal += rLength;
            continue;
          }
          if (isBoth || isCjkAdjacent) {
            if (lLength % 3 && !((lLength + rLength) % 3)) {
              midDelimTotal += rLength;
              continue;
            }
            if (prevCharIsSameDelimiter && isBoth) break;
          }
          delimTotal -= rLength;
          if (delimTotal > 0) continue;
          rLength = Math.min(rLength, rLength + delimTotal + midDelimTotal);
          const lastCharLength = rMatch[0].codePointAt(0) > 65535 ? 2 : 1;
          const raw = src.slice(0, lLength + rMatch.index + lastCharLength + rLength);
          if (Math.min(lLength, rLength) % 2) {
            const text2 = raw.slice(1, -1);
            return {
              type: "em",
              raw,
              text: text2,
              tokens: this.lexer.inlineTokens(text2)
            };
          }
          const text = raw.slice(2, -2);
          return {
            type: "strong",
            raw,
            text,
            tokens: this.lexer.inlineTokens(text)
          };
        }
      }
    },
    del(src, maskedSrc, prevChar = "") {
      const { rules } = this;
      const match = rules.inline.delLDelim.exec(src);
      if (!match) return false;
      const nextChar = match[1] || "";
      const prevIsCjk = isPrevCharCjk(prevChar, maskedSrc, src);
      if (!nextChar || !prevChar || rules.inline.punctuation.exec(prevChar) || prevIsCjk || cjkTest.test(nextChar)) {
        const lLength = [...match[0]].length - 1;
        let rDelim;
        let rLength;
        let delimTotal = lLength;
        delRDelimCjk.lastIndex = 0;
        const clippedMaskedSrc = maskedSrc.slice(-1 * src.length + lLength);
        let rMatch;
        while ((rMatch = delRDelimCjk.exec(clippedMaskedSrc)) != null) {
          rDelim = rMatch[1] || rMatch[2] || rMatch[3] || rMatch[4] || rMatch[5] || rMatch[6];
          if (!rDelim) continue;
          rLength = [...rDelim].length;
          if (rLength !== lLength) continue;
          const isCjkAdjacent = isCjkAdjacentToDelimiter(rMatch, clippedMaskedSrc);
          if ((rMatch[3] || rMatch[4]) && !isCjkAdjacent) {
            delimTotal += rLength;
            continue;
          }
          delimTotal -= rLength;
          if (delimTotal > 0) continue;
          rLength = Math.min(rLength, rLength + delimTotal);
          const lastCharLength = rMatch[0].codePointAt(0) > 65535 ? 2 : 1;
          const raw = src.slice(0, lLength + rMatch.index + lastCharLength + rLength);
          const text = raw.slice(lLength, -lLength);
          return {
            type: "del",
            raw,
            text,
            tokens: this.lexer.inlineTokens(text)
          };
        }
      }
    }
  } };
}

// node_modules/@earendil-works/pi-tui/dist/components/markdown.js
var STRICT_STRIKETHROUGH_REGEX = /^(~~)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/;
var MarkdownTokenizer = class extends y {
  url(src) {
    const token = super.url(src);
    if (!token)
      return void 0;
    const punctuationIndex = token.raw.search(cjkPunctuationRegex);
    return punctuationIndex < 0 ? token : super.url(token.raw.slice(0, punctuationIndex));
  }
  del(src) {
    const match = STRICT_STRIKETHROUGH_REGEX.exec(src);
    if (!match) {
      return void 0;
    }
    const text = match[2];
    return {
      type: "del",
      raw: match[0],
      text,
      tokens: this.lexer.inlineTokens(text)
    };
  }
};
function isEscaped(source, index) {
  let backslashes = 0;
  for (let position = index - 1; position >= 0 && source[position] === "\\"; position--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}
function findClosingDelimiter(source, closing, start) {
  let index = source.indexOf(closing, start);
  while (index >= 0 && isEscaped(source, index)) {
    index = source.indexOf(closing, index + closing.length);
  }
  return index;
}
function looksLikePendingDollarMath(source) {
  return /\\[A-Za-z]+|[_^=+*/<>()[\]|±≤≥≠≈∈→⇒∞∫∑√-]/.test(source);
}
function tokenizeInlineLatex(source) {
  let opening = "";
  let closing = "";
  if (source.startsWith("$$")) {
    opening = "$$";
    closing = "$$";
  } else if (source.startsWith("\\(")) {
    opening = "\\(";
    closing = "\\)";
  } else if (source.startsWith("\\[")) {
    opening = "\\[";
    closing = "\\]";
  } else if (source.startsWith("$") && !/^\$\s/.test(source)) {
    opening = "$";
    closing = "$";
  } else {
    return void 0;
  }
  const closingIndex = findClosingDelimiter(source, closing, opening.length);
  if (closingIndex >= 0 && opening === "$" && (/\s$/.test(source.slice(opening.length, closingIndex)) || /^\d/.test(source.slice(closingIndex + 1)) || /^[A-Z_][A-Z0-9_]*(?:[^A-Za-z0-9_\s])?$/.test(source.slice(opening.length, closingIndex)) && /^[A-Za-z_][A-Za-z0-9_]*/.test(source.slice(closingIndex + 1)) || source.slice(opening.length, closingIndex).includes("`"))) {
    return void 0;
  }
  if (closingIndex < 0) {
    const pendingSource = source.slice(opening.length);
    if (opening.startsWith("\\") || looksLikePendingDollarMath(pendingSource)) {
      return { type: "latex", raw: source, text: pendingSource, pending: true };
    }
    return void 0;
  }
  const text = source.slice(opening.length, closingIndex);
  if (!text || text.includes("\n")) {
    return void 0;
  }
  const raw = source.slice(0, closingIndex + closing.length);
  return { type: "latex", raw, text };
}
var TABLE_DELIMITER_ROW_REGEX = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
function containsTableStart(source) {
  const lines = source.split("\n");
  for (let index = 0; index < lines.length - 1; index++) {
    const delimiterRow = lines[index + 1];
    if ((delimiterRow.includes("|") || lines[index].includes("|")) && TABLE_DELIMITER_ROW_REGEX.test(delimiterRow)) {
      return true;
    }
  }
  return false;
}
function tokenizeBlockLatex(source) {
  const dollarMatch = /^ {0,3}\$\$[ \t]*(?:\n)?([\s\S]*?)\$\$[ \t]*(?:\n|$)/.exec(source);
  if (dollarMatch?.[1] && !containsTableStart(dollarMatch[1])) {
    return { type: "latexBlock", raw: dollarMatch[0], text: dollarMatch[1].trim() };
  }
  const bracketMatch = /^ {0,3}\\\[[ \t]*(?:\n)?([\s\S]*?)\\\][ \t]*(?:\n|$)/.exec(source);
  if (bracketMatch?.[1] && !containsTableStart(bracketMatch[1])) {
    return { type: "latexBlock", raw: bracketMatch[0], text: bracketMatch[1].trim() };
  }
  const pendingBracket = /^ {0,3}\\\[[ \t]*(?:\n)?([\s\S]*)$/.exec(source);
  if (pendingBracket?.[1] && !containsTableStart(pendingBracket[1])) {
    return { type: "latexBlock", raw: pendingBracket[0], text: pendingBracket[1], pending: true };
  }
  const pendingDollar = /^ {0,3}\$\$[ \t]*(?:\n)?([\s\S]*)$/.exec(source);
  if (pendingDollar?.[1] && looksLikePendingDollarMath(pendingDollar[1]) && !containsTableStart(pendingDollar[1])) {
    return { type: "latexBlock", raw: pendingDollar[0], text: pendingDollar[1], pending: true };
  }
  return void 0;
}
var LATEX_MARKDOWN_EXTENSIONS = [
  {
    name: "latexBlock",
    level: "block",
    start(source) {
      const match = /(?:^|\n) {0,3}(?:\$\$|\\\[)/.exec(source);
      return match ? match.index + (match[0].startsWith("\n") ? 1 : 0) : void 0;
    },
    tokenizer: tokenizeBlockLatex
  },
  {
    name: "latex",
    level: "inline",
    start(source) {
      const indices = [source.indexOf("$"), source.indexOf("\\("), source.indexOf("\\[")].filter((index) => index >= 0);
      return indices.length > 0 ? Math.min(...indices) : void 0;
    },
    tokenizer: tokenizeInlineLatex
  }
];
var markdownParser = new Z();
markdownParser.setOptions({
  tokenizer: new MarkdownTokenizer()
});
markdownParser.use({
  tokenizer: { emStrong: markedCjkFriendly().tokenizer?.emStrong },
  extensions: [...LATEX_MARKDOWN_EXTENSIONS]
});

// node_modules/@earendil-works/pi-tui/dist/components/scroll-view.js
var ScrollView = class extends Container {
  child;
  followEnd;
  primary;
  overscroll;
  scrollbarTrackStyle;
  scrollbarThumbStyle;
  currentScrollbar;
  scrollbarHideDelayMs;
  currentScrollTop = 0;
  contentHeight = 0;
  currentViewportHeight = 0;
  followingEnd;
  followSuppressedAtEnd = false;
  requestRenderCallback;
  transientScrollbarVisible = false;
  scrollbarActive = false;
  scrollbarHideTimer;
  constructor(component, options = {}) {
    super();
    if (options.axis !== void 0 && options.axis !== "vertical") {
      throw new Error(`Unsupported ScrollView axis: ${options.axis}`);
    }
    this.child = component;
    this.children.push(component);
    this.followEnd = (options.follow ?? "none") === "end";
    this.followingEnd = this.followEnd;
    this.primary = options.primary ?? false;
    this.overscroll = options.overscroll ?? "chain";
    this.currentScrollbar = options.scrollbar ?? "hidden";
    this.scrollbarTrackStyle = options.scrollbarTrackStyle ?? ((text) => `\x1B[90m${text}\x1B[39m`);
    this.scrollbarThumbStyle = options.scrollbarThumbStyle ?? ((text) => `\x1B[37m${text}\x1B[39m`);
    this.scrollbarHideDelayMs = Math.max(0, Math.floor(options.scrollbarHideDelayMs ?? 1e3));
  }
  get scrollTop() {
    return this.currentScrollTop;
  }
  get isFollowingEnd() {
    return this.followingEnd;
  }
  get viewportHeight() {
    return this.currentViewportHeight;
  }
  get scrollbar() {
    return this.currentScrollbar;
  }
  get isScrollbarVisible() {
    if (this.scrollbar === "always")
      return this.currentViewportHeight > 0;
    return this.scrollbar === "auto" && this.contentHeight > this.currentViewportHeight && this.transientScrollbarVisible;
  }
  get isScrollbarActive() {
    return this.scrollbarActive;
  }
  setScrollbar(scrollbar) {
    if (scrollbar === this.currentScrollbar)
      return;
    this.currentScrollbar = scrollbar;
    if (scrollbar !== "auto")
      this.hideTransientScrollbar();
    else if (this.scrollbarActive)
      this.markScrollbarActivity();
    this.requestRenderCallback?.();
  }
  getContentWidth(width) {
    return this.scrollbar === "always" && width > 1 ? width - 1 : width;
  }
  markScrollbarActivity() {
    if (this.scrollbar !== "auto" || this.contentHeight <= this.currentViewportHeight)
      return;
    this.transientScrollbarVisible = true;
    if (this.scrollbarHideTimer) {
      clearTimeout(this.scrollbarHideTimer);
      this.scrollbarHideTimer = void 0;
    }
    if (this.scrollbarActive)
      return;
    this.scrollbarHideTimer = setTimeout(() => {
      this.scrollbarHideTimer = void 0;
      this.transientScrollbarVisible = false;
      this.requestRenderCallback?.();
    }, this.scrollbarHideDelayMs);
    this.scrollbarHideTimer.unref();
  }
  hideTransientScrollbar() {
    this.transientScrollbarVisible = false;
    if (!this.scrollbarHideTimer)
      return;
    clearTimeout(this.scrollbarHideTimer);
    this.scrollbarHideTimer = void 0;
  }
  setScrollbarActive(active) {
    if (active === this.scrollbarActive)
      return;
    this.scrollbarActive = active;
    this.markScrollbarActivity();
    this.requestRenderCallback?.();
  }
  scrollTo(scrollTop, options = {}) {
    const requested = Number.isFinite(scrollTop) ? Math.trunc(scrollTop) : this.currentScrollTop;
    const maxScrollTop = Math.max(0, this.contentHeight - this.currentViewportHeight);
    const next = Math.max(0, Math.min(maxScrollTop, requested));
    const nextFollowSuppressedAtEnd = options.disableFollow === true && next === maxScrollTop;
    const nextFollowingEnd = !nextFollowSuppressedAtEnd && this.followEnd && next === maxScrollTop;
    if (next === this.currentScrollTop && nextFollowingEnd === this.followingEnd && nextFollowSuppressedAtEnd === this.followSuppressedAtEnd) {
      return;
    }
    const moved = next !== this.currentScrollTop;
    this.currentScrollTop = next;
    this.followingEnd = nextFollowingEnd;
    this.followSuppressedAtEnd = nextFollowSuppressedAtEnd;
    if (moved)
      this.markScrollbarActivity();
    this.requestRenderCallback?.();
  }
  scrollBy(lines) {
    const requested = Number.isFinite(lines) ? Math.trunc(lines) : 0;
    if (requested === 0)
      return 0;
    const maxScrollTop = Math.max(0, this.contentHeight - this.currentViewportHeight);
    const start = this.followingEnd ? maxScrollTop : this.currentScrollTop;
    const next = Math.max(0, Math.min(maxScrollTop, start + requested));
    const moved = next - start;
    const wasFollowingEnd = this.followingEnd;
    this.currentScrollTop = next;
    this.followingEnd = this.followEnd && next === maxScrollTop;
    this.followSuppressedAtEnd = false;
    if (moved !== 0)
      this.markScrollbarActivity();
    if (moved !== 0 || this.followingEnd !== wasFollowingEnd)
      this.requestRenderCallback?.();
    return requested - moved;
  }
  scrollToStart() {
    const changed = this.currentScrollTop !== 0 || this.followingEnd !== (this.followEnd && this.contentHeight <= this.currentViewportHeight);
    this.currentScrollTop = 0;
    this.followingEnd = this.followEnd && this.contentHeight <= this.currentViewportHeight;
    this.followSuppressedAtEnd = false;
    if (changed) {
      this.markScrollbarActivity();
      this.requestRenderCallback?.();
    }
  }
  scrollToEnd() {
    const next = Math.max(0, this.contentHeight - this.currentViewportHeight);
    const changed = this.currentScrollTop !== next || this.followingEnd !== this.followEnd;
    this.currentScrollTop = next;
    this.followingEnd = this.followEnd;
    this.followSuppressedAtEnd = false;
    if (changed) {
      this.markScrollbarActivity();
      this.requestRenderCallback?.();
    }
  }
  updateLayout(contentHeight, viewportHeight, requestRender) {
    this.contentHeight = Math.max(0, Math.floor(contentHeight));
    this.currentViewportHeight = Math.max(0, Math.floor(viewportHeight));
    this.requestRenderCallback = requestRender;
    const maxScrollTop = Math.max(0, this.contentHeight - this.currentViewportHeight);
    if (this.followingEnd)
      this.currentScrollTop = maxScrollTop;
    else
      this.currentScrollTop = Math.max(0, Math.min(this.currentScrollTop, maxScrollTop));
    if (this.currentScrollTop < maxScrollTop)
      this.followSuppressedAtEnd = false;
    if (this.followEnd && this.currentScrollTop === maxScrollTop && !this.followSuppressedAtEnd) {
      this.followingEnd = true;
    }
    if (this.contentHeight <= this.currentViewportHeight)
      this.hideTransientScrollbar();
  }
  addChild(_component) {
    throw new Error("ScrollView has exactly one child");
  }
  removeChild(_component) {
    throw new Error("ScrollView child cannot be removed");
  }
  clear() {
    throw new Error("ScrollView child cannot be cleared");
  }
  render(width) {
    const contentWidth = this.getContentWidth(width);
    const lines = this.child.render(contentWidth);
    return contentWidth === width ? lines : lines.map((line) => `${line} `);
  }
  [LAYOUT_NODE]() {
    return { type: "scroll", component: this.child, state: this };
  }
};

// node_modules/@earendil-works/pi-tui/dist/native-platform.js
import { createRequire as createRequire2 } from "node:module";

// node_modules/@earendil-works/pi-tui/dist/native-module-path.js
import { createRequire } from "node:module";
var moduleRequire = createRequire(import.meta.url);

// node_modules/@earendil-works/pi-tui/dist/native-platform.js
var cjsRequire = createRequire2(import.meta.url);

// node_modules/@earendil-works/pi-tui/dist/terminal.js
var DESIRED_KITTY_KEYBOARD_PROTOCOL_FLAGS = 7;
var KITTY_KEYBOARD_PROTOCOL_QUERY = `\x1B[>${DESIRED_KITTY_KEYBOARD_PROTOCOL_FLAGS}u\x1B[?u`;

// node_modules/@earendil-works/pi-tui/dist/alt-screen-search.js
var segmenter2 = getGraphemeSegmenter();
var PRINTABLE_ASCII = /^[\x20-\x7e]*$/;
function buildSearchCorpus(lines) {
  const chunks = [];
  const spans = [];
  let textLength = 0;
  let pendingSeparator = false;
  const appendSeparator = () => {
    if (!pendingSeparator)
      return;
    chunks.push(" ");
    textLength += 1;
    pendingSeparator = false;
  };
  for (let row = 0; row < lines.length; row++) {
    const line = stripTerminalSequences(lines[row] ?? "");
    let column = 0;
    if (PRINTABLE_ASCII.test(line)) {
      let index = 0;
      while (index < line.length) {
        if (line.charCodeAt(index) === 32) {
          if (textLength > 0)
            pendingSeparator = true;
          column += 1;
          index += 1;
          continue;
        }
        let end = index + 1;
        while (end < line.length && line.charCodeAt(end) !== 32)
          end += 1;
        appendSeparator();
        const text = line.slice(index, end);
        chunks.push(text);
        spans.push({
          textStart: textLength,
          textEnd: textLength + text.length,
          row,
          startCol: column,
          endCol: column + text.length,
          linearColumns: true
        });
        textLength += text.length;
        column += text.length;
        index = end;
      }
    } else {
      for (const grapheme of segmenter2.segment(line)) {
        const text = grapheme.segment;
        const width = visibleWidth(text);
        if (/^\s+$/u.test(text)) {
          if (textLength > 0)
            pendingSeparator = true;
          column += width;
          continue;
        }
        appendSeparator();
        chunks.push(text);
        spans.push({
          textStart: textLength,
          textEnd: textLength + text.length,
          row,
          startCol: column,
          endCol: column + width,
          linearColumns: false
        });
        textLength += text.length;
        column += width;
      }
    }
    if (textLength > 0)
      pendingSeparator = true;
  }
  return { text: chunks.join(""), spans };
}
function normalizeQuery(query) {
  return query.replace(/\s+/gu, " ").trim();
}
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function findSearchCorpusMatches(corpus, normalizedQuery) {
  if (!normalizedQuery)
    return [];
  const expression = new RegExp(escapeRegExp(normalizedQuery), "giu");
  const matches = [];
  let spanIndex = 0;
  for (const match of corpus.text.matchAll(expression)) {
    const start = match.index;
    const end = start + match[0].length;
    while (spanIndex < corpus.spans.length && corpus.spans[spanIndex].textEnd <= start)
      spanIndex += 1;
    const segments = [];
    for (let index = spanIndex; index < corpus.spans.length; index++) {
      const span = corpus.spans[index];
      if (span.textStart >= end)
        break;
      if (span.textEnd <= start)
        continue;
      const startCol = span.linearColumns ? span.startCol + Math.max(start, span.textStart) - span.textStart : span.startCol;
      const endCol = span.linearColumns ? span.startCol + Math.min(end, span.textEnd) - span.textStart : span.endCol;
      const previous = segments[segments.length - 1];
      if (previous && previous.row === span.row && startCol <= previous.endCol) {
        previous.endCol = Math.max(previous.endCol, endCol);
      } else {
        segments.push({ row: span.row, startCol, endCol });
      }
    }
    while (spanIndex < corpus.spans.length && corpus.spans[spanIndex].textEnd <= end)
      spanIndex += 1;
    if (segments.length > 0)
      matches.push({ segments });
  }
  return matches;
}
var AltScreenSearchIndex = class {
  sourceLines;
  corpus;
  normalizedQuery;
  matches = [];
  search(lines, query) {
    let sourceChanged = this.sourceLines?.length !== lines.length;
    if (!sourceChanged && this.sourceLines) {
      for (let index = 0; index < lines.length; index++) {
        if (this.sourceLines[index] === lines[index])
          continue;
        sourceChanged = true;
        break;
      }
    }
    if (sourceChanged || !this.corpus) {
      this.sourceLines = Array.from(lines);
      this.corpus = buildSearchCorpus(lines);
    }
    const normalizedQuery = normalizeQuery(query);
    const changed = sourceChanged || normalizedQuery !== this.normalizedQuery;
    if (changed) {
      this.normalizedQuery = normalizedQuery;
      this.matches = findSearchCorpusMatches(this.corpus, normalizedQuery);
    }
    return { matches: this.matches, changed };
  }
};
function getAltScreenSearchMatchKey(match) {
  const first = match.segments[0];
  const last = match.segments[match.segments.length - 1];
  return first && last ? `${first.row}:${first.startCol}:${last.row}:${last.endCol}` : "";
}
var AltScreenSearchComponent = class {
  input = new Input({
    prompt: " ",
    placeholder: "Find in transcript",
    placeholderStyle: (text) => `\x1B[2m${text}\x1B[22m`
  });
  onQueryChange;
  navigationButtonStyle;
  resultCount = 0;
  resultIndex = -1;
  previousButtonStart = -1;
  previousButtonEnd = -1;
  nextButtonStart = -1;
  nextButtonEnd = -1;
  hoveredNavigationDirection;
  _focused = false;
  constructor(onQueryChange, navigationButtonStyle = (text) => text) {
    this.onQueryChange = onQueryChange;
    this.navigationButtonStyle = navigationButtonStyle;
  }
  get focused() {
    return this._focused;
  }
  set focused(value) {
    this._focused = value;
    this.input.focused = value;
  }
  setResult(index, count) {
    this.resultIndex = index;
    this.resultCount = count;
  }
  getNavigationDirectionAt(row, column) {
    if (row !== 2)
      return void 0;
    if (column >= this.previousButtonStart && column < this.previousButtonEnd)
      return -1;
    if (column >= this.nextButtonStart && column < this.nextButtonEnd)
      return 1;
    return void 0;
  }
  setHoveredNavigationDirection(direction) {
    if (direction === this.hoveredNavigationDirection)
      return false;
    this.hoveredNavigationDirection = direction;
    return true;
  }
  handleInput(data) {
    const previous = this.input.getValue();
    this.input.handleInput(data);
    const query = this.input.getValue();
    if (query !== previous)
      this.onQueryChange(query);
  }
  invalidate() {
    this.input.invalidate();
  }
  render(width) {
    const safeWidth = Math.max(1, width);
    const innerWidth = Math.max(0, safeWidth - 2);
    const formatKey = (key) => key ? key.split("+").map((part) => {
      if (process.platform === "darwin" && part.toLowerCase() === "alt")
        return "Option";
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join("+") : "Unbound";
    const keybindings = getKeybindings();
    const previousKey = formatKey(keybindings.getKeys("tui.altScreen.searchPrevious")[0]);
    const nextKey = formatKey(keybindings.getKeys("tui.altScreen.searchNext")[0]);
    const query = this.input.getValue();
    const result = !query ? "" : this.resultCount === 0 ? "No matches" : `${this.resultIndex + 1}/${this.resultCount}`;
    const resultSpace = Math.max(0, innerWidth - 3);
    const visibleResult = truncateToWidth(result, resultSpace, "");
    const resultText = visibleResult ? `\x1B[2m ${visibleResult} \x1B[22m` : "";
    const inputWidth = Math.max(0, innerWidth - visibleWidth(resultText));
    const inputLine = truncateToWidth(this.input.render(Math.max(1, inputWidth))[0] ?? "", inputWidth, "");
    const inputPadding = " ".repeat(Math.max(0, inputWidth - visibleWidth(inputLine)));
    const content = `${inputLine}${inputPadding}${resultText}`;
    let previousButton = `\u2191 ${previousKey}`;
    let nextButton = `\u2193 ${nextKey}`;
    let separator = " \xB7 ";
    const outerGapWidth = 1;
    const availableControlsWidth = Math.max(0, innerWidth - outerGapWidth * 2 - 1);
    let controlsWidth = visibleWidth(previousButton) + visibleWidth(separator) + visibleWidth(nextButton);
    if (controlsWidth > availableControlsWidth) {
      previousButton = "\u2191";
      nextButton = "\u2193";
      separator = " ";
      controlsWidth = visibleWidth(previousButton) + visibleWidth(separator) + visibleWidth(nextButton);
    }
    const showButtons = controlsWidth <= availableControlsWidth;
    const renderedButtons = showButtons ? this.navigationButtonStyle(previousButton, this.hoveredNavigationDirection === -1) + separator + this.navigationButtonStyle(nextButton, this.hoveredNavigationDirection === 1) : "";
    const outerGapsWidth = showButtons ? outerGapWidth * 2 : 0;
    const rightRuleWidth = renderedButtons && innerWidth > controlsWidth + outerGapsWidth ? 1 : 0;
    const leftRuleWidth = Math.max(0, innerWidth - (showButtons ? controlsWidth : 0) - outerGapsWidth - rightRuleWidth);
    const previousStart = 1 + leftRuleWidth + outerGapWidth;
    this.previousButtonStart = showButtons ? previousStart : -1;
    this.previousButtonEnd = showButtons ? previousStart + visibleWidth(previousButton) : -1;
    this.nextButtonStart = showButtons ? this.previousButtonEnd + visibleWidth(separator) : -1;
    this.nextButtonEnd = showButtons ? this.nextButtonStart + visibleWidth(nextButton) : -1;
    if (safeWidth === 1)
      return ["\u250C", "\u2502", "\u2514"];
    return [
      `\u250C${"\u2500".repeat(innerWidth)}\u2510`,
      `\u2502${content}\u2502`,
      `\u2514${"\u2500".repeat(leftRuleWidth)}${renderedButtons ? " " : ""}${renderedButtons}${renderedButtons ? " " : ""}${"\u2500".repeat(rightRuleWidth)}\u2518`
    ];
  }
};

// node_modules/@earendil-works/pi-tui/dist/components/alt-screen-flash.js
var DEFAULT_DURATION_MS = 1e3;
var AltScreenFlashContainer = class {
  entries = [];
  nextId = 0;
  requestRender;
  constructor(requestRender) {
    this.requestRender = requestRender;
  }
  flash(message, durationMs = DEFAULT_DURATION_MS) {
    const id = this.nextId++;
    const timer = setTimeout(() => {
      const index = this.entries.findIndex((entry) => entry.id === id);
      if (index === -1)
        return;
      this.entries.splice(index, 1);
      this.requestRender();
    }, Math.max(0, durationMs));
    timer.unref();
    this.entries.push({ id, message, timer });
    this.requestRender();
  }
  dispose() {
    for (const entry of this.entries)
      clearTimeout(entry.timer);
    this.entries.length = 0;
  }
  invalidate() {
  }
  render(width) {
    return this.entries.map((entry) => {
      const message = truncateToWidth(` ${entry.message} `, width, "");
      return `\x1B[7m${message}\x1B[27m`;
    });
  }
};

// node_modules/@earendil-works/pi-tui/dist/layout.js
var OSC133_ZONE_PREFIX = /^(?:\x1b\]133;[ABC](?:\x07|\x1b\\))+/;
function intersect(a, b2) {
  const x2 = Math.max(a.x, b2.x);
  const y2 = Math.max(a.y, b2.y);
  const right = Math.min(a.x + a.width, b2.x + b2.width);
  const bottom = Math.min(a.y + a.height, b2.y + b2.height);
  return { x: x2, y: y2, width: Math.max(0, right - x2), height: Math.max(0, bottom - y2) };
}
function renderCached(context, component, width) {
  const safeWidth = Math.max(1, Math.floor(width));
  let widths = context.renderCache.get(component);
  if (!widths) {
    widths = /* @__PURE__ */ new Map();
    context.renderCache.set(component, widths);
  }
  let lines = widths.get(safeWidth);
  if (!lines) {
    lines = component.render(safeWidth);
    widths.set(safeWidth, lines);
  }
  return lines;
}
function measureHeight(context, component, width) {
  return renderCached(context, component, width).length;
}
function measureWidth(context, component, width) {
  return renderCached(context, component, width).reduce((max, line) => Math.max(max, visibleWidth(line)), 0);
}
function withParent(box, parent) {
  box.parent = parent;
  return box;
}
function translateBox(box, deltaY) {
  box.rect.y += deltaY;
  for (const child of box.children)
    translateBox(child, deltaY);
}
function updateClips(box, parentClip) {
  box.clip = intersect(parentClip, box.rect);
  for (const child of box.children)
    updateClips(child, box.clip);
}
function layoutComponent(context, component, x2, y2, width, height, clip) {
  const safeWidth = Math.max(1, Math.floor(width));
  const node = getLayoutNode(component);
  if (!node) {
    const lines = renderCached(context, component, safeWidth);
    const allocatedHeight2 = height === void 0 ? lines.length : Math.max(0, Math.floor(height));
    let lineOffset = 0;
    if (lines.length > allocatedHeight2 && allocatedHeight2 > 0) {
      const cursorLine = lines.findIndex((line) => line.includes(CURSOR_MARKER));
      if (cursorLine >= allocatedHeight2)
        lineOffset = cursorLine - allocatedHeight2 + 1;
    }
    return {
      component,
      rect: { x: x2, y: y2, width: safeWidth, height: allocatedHeight2 },
      clip: intersect(clip, { x: x2, y: y2, width: safeWidth, height: allocatedHeight2 }),
      children: [],
      lines,
      lineOffset,
      layer: 0
    };
  }
  if (node.type === "scroll") {
    const previousScrollTop = node.state.scrollTop;
    const contentWidth = node.state.getContentWidth(safeWidth);
    const childBox = layoutComponent(context, node.component, x2, y2 - previousScrollTop, contentWidth, void 0, clip);
    const contentHeight = childBox.rect.height;
    const viewportHeight = height === void 0 ? contentHeight : Math.max(0, Math.floor(height));
    node.state.updateLayout(contentHeight, viewportHeight, context.requestRender);
    translateBox(childBox, previousScrollTop - node.state.scrollTop);
    const scrollView = node.state;
    if (node.state.primary || !context.primaryScrollView)
      context.primaryScrollView = scrollView;
    const rect2 = { x: x2, y: y2, width: safeWidth, height: viewportHeight };
    const childClip = intersect(clip, rect2);
    const box2 = {
      component,
      rect: rect2,
      clip: childClip,
      children: [childBox],
      scrollView,
      scrollContentLines: renderCached(context, node.component, contentWidth),
      layer: 0
    };
    childBox.parent = box2;
    updateClips(childBox, childClip);
    return box2;
  }
  const entries = visibleStackEntries(node.entries, context.viewport);
  const gapTotal = Math.max(0, entries.length - 1) * node.gap;
  if (node.type === "vstack") {
    const intrinsicHeights2 = entries.map((entry) => typeof entry.basis === "number" ? entry.basis : measureHeight(context, entry.component, safeWidth));
    const sizes = allocateStackSizes(entries, intrinsicHeights2, height, node.gap);
    const naturalHeight = sizes.reduce((sum, size) => sum + size, 0) + gapTotal;
    const allocatedHeight2 = height === void 0 ? naturalHeight : Math.max(0, Math.floor(height));
    const rect2 = { x: x2, y: y2, width: safeWidth, height: allocatedHeight2 };
    const box2 = {
      component,
      rect: rect2,
      clip: intersect(clip, rect2),
      children: [],
      layer: 0
    };
    let childY = y2;
    for (let index = 0; index < entries.length; index++) {
      box2.children.push(withParent(layoutComponent(context, entries[index].component, x2, childY, safeWidth, sizes[index], box2.clip), box2));
      childY += sizes[index] + node.gap;
    }
    return box2;
  }
  const intrinsicWidths = entries.map((entry) => typeof entry.basis === "number" ? entry.basis : measureWidth(context, entry.component, safeWidth));
  const widths = allocateStackSizes(entries, intrinsicWidths, safeWidth, node.gap);
  const intrinsicHeights = entries.map((entry, index) => measureHeight(context, entry.component, Math.max(1, widths[index])));
  const allocatedHeight = height === void 0 ? intrinsicHeights.reduce((max, childHeight) => Math.max(max, childHeight), 0) : Math.max(0, height);
  const rect = { x: x2, y: y2, width: safeWidth, height: allocatedHeight };
  const box = {
    component,
    rect,
    clip: intersect(clip, rect),
    children: [],
    layer: 0
  };
  let childX = x2;
  for (let index = 0; index < entries.length; index++) {
    const naturalChildHeight = intrinsicHeights[index];
    const childHeight = node.align === "stretch" ? allocatedHeight : Math.min(allocatedHeight, naturalChildHeight);
    let childY = y2;
    if (node.align === "center")
      childY += Math.floor((allocatedHeight - childHeight) / 2);
    else if (node.align === "end")
      childY += allocatedHeight - childHeight;
    const childWidth = widths[index];
    if (childWidth === 0) {
      box.children.push({
        component: entries[index].component,
        rect: { x: childX, y: childY, width: 0, height: childHeight },
        clip: { x: childX, y: childY, width: 0, height: 0 },
        children: [],
        parent: box,
        layer: 0
      });
    } else {
      box.children.push(withParent(layoutComponent(context, entries[index].component, childX, childY, childWidth, childHeight, box.clip), box));
    }
    childX += childWidth + node.gap;
  }
  return box;
}
function replaceScrollbarCell(line, column, totalWidth, replacement, preserveTargetBackground) {
  if (isImageLine(line))
    return line;
  const graphemeRange = getGraphemeCellRange(line, column);
  const start = graphemeRange?.start ?? column;
  const end = graphemeRange?.end ?? column + 1;
  const before = sliceByColumn(line, 0, start, true);
  const target = sliceByColumn(line, start, end - start, true);
  const after = sliceByColumn(line, end, Math.max(0, totalWidth - end), true);
  let targetPrefix = "";
  let targetIndex = 0;
  while (targetIndex < target.length) {
    const ansi = extractAnsiCode(target, targetIndex);
    if (!ansi)
      break;
    targetPrefix += ansi.code;
    targetIndex += ansi.length;
  }
  const beforePadding = " ".repeat(Math.max(0, start - visibleWidth(before)));
  const cellPaddingBefore = " ".repeat(Math.max(0, column - start));
  const cellPaddingAfter = " ".repeat(Math.max(0, end - column - 1));
  const targetStyle = `\x1B[0m\x1B]8;;\x07${preserveTargetBackground ? getActiveBackgroundAnsi(targetPrefix) : ""}`;
  return `${before}${beforePadding}${targetStyle}${cellPaddingBefore}${replacement}${cellPaddingAfter}${after}`;
}
function getScrollbarGeometry(box, includeHiddenAuto = false) {
  if (!box.scrollView || box.rect.width <= 0 || box.rect.height <= 0)
    return void 0;
  const contentHeight = box.children[0]?.rect.height ?? box.scrollContentLines?.length ?? 0;
  const trackHeight = box.rect.height;
  const canRevealHiddenAuto = includeHiddenAuto && box.scrollView.scrollbar === "auto" && contentHeight > trackHeight;
  if (!box.scrollView.isScrollbarVisible && !canRevealHiddenAuto)
    return void 0;
  const minThumbHeight = Math.min(2, trackHeight);
  const thumbHeight = Math.max(minThumbHeight, Math.min(trackHeight, Math.round(trackHeight * trackHeight / contentHeight)));
  const maxScrollTop = Math.max(0, contentHeight - trackHeight);
  const maxThumbTop = trackHeight - thumbHeight;
  const thumbOffset = maxScrollTop === 0 ? 0 : Math.round(box.scrollView.scrollTop / maxScrollTop * maxThumbTop);
  const column = box.rect.x + box.rect.width - 1;
  if (column < box.clip.x || column >= box.clip.x + box.clip.width)
    return void 0;
  return {
    column,
    trackTop: box.rect.y,
    trackHeight,
    thumbTop: box.rect.y + thumbOffset,
    thumbHeight,
    maxScrollTop
  };
}
function paintScrollbar(box, screen, totalWidth) {
  const geometry = getScrollbarGeometry(box);
  if (!geometry || !box.scrollView)
    return;
  for (let offset = 0; offset < geometry.trackHeight; offset++) {
    const row = geometry.trackTop + offset;
    if (row < box.clip.y || row >= box.clip.y + box.clip.height || row < 0 || row >= screen.length)
      continue;
    const isThumb = row >= geometry.thumbTop && row < geometry.thumbTop + geometry.thumbHeight;
    const replacement = isThumb ? box.scrollView.scrollbarThumbStyle(box.scrollView.isScrollbarActive ? "\u2588" : "\u2503") : box.scrollView.scrollbarTrackStyle("\u2502");
    screen[row] = replaceScrollbarCell(screen[row] ?? "", geometry.column, totalWidth, replacement, box.scrollView.scrollbar !== "always");
  }
}
function paintBox(box, screen, totalWidth) {
  if (box.lines) {
    const offset = box.lineOffset ?? 0;
    const firstRow = Math.max(box.rect.y, box.clip.y, 0);
    const lastRow = Math.min(box.rect.y + box.rect.height, box.clip.y + box.clip.height, screen.length);
    for (let row = firstRow; row < lastRow; row++) {
      const sourceLine = box.lines[offset + row - box.rect.y];
      if (sourceLine === void 0)
        continue;
      let line = sourceLine.replace(OSC133_ZONE_PREFIX, "");
      const imageMetadata = getKittyImageMetadata(line);
      if (imageMetadata) {
        const clipBottom = Math.min(screen.length, box.clip.y + box.clip.height);
        const visibleRows = Math.min(imageMetadata.rows, clipBottom - row);
        if (visibleRows < imageMetadata.rows)
          line = cropKittyImageLine(line, 0, visibleRows);
      }
      if (box.rect.x === 0 && box.rect.width >= totalWidth && (isImageLine(line) || !screen[row])) {
        screen[row] = line;
      } else {
        screen[row] = compositeTuiLine(screen[row] ?? "", line, box.rect.x, box.rect.width, totalWidth);
      }
    }
  }
  for (const child of box.children)
    paintBox(child, screen, totalWidth);
  if (box.scrollView && box.scrollContentLines && box.scrollView.scrollTop > 0 && box.rect.height > 0) {
    const scrollTop = box.scrollView.scrollTop;
    const minRow = Math.max(0, scrollTop - getMaxKittyImageRows());
    for (let imageRow = scrollTop - 1; imageRow >= minRow; imageRow--) {
      const imageLine = box.scrollContentLines[imageRow] ?? "";
      if (!isImageLine(imageLine))
        continue;
      const metadata = getKittyImageMetadata(imageLine);
      if (!metadata)
        continue;
      const hiddenRows = scrollTop - imageRow;
      if (hiddenRows < metadata.rows) {
        const visibleRows = Math.min(box.rect.height, metadata.rows - hiddenRows);
        const cropped = cropKittyImageLine(imageLine, hiddenRows, visibleRows);
        if (box.rect.x === 0 && box.rect.width >= totalWidth)
          screen[box.rect.y] = cropped;
      }
      break;
    }
  }
  paintScrollbar(box, screen, totalWidth);
}
function renderLayoutFrame(root, width, height, requestRender) {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  const context = {
    viewport: { width: safeWidth, height: safeHeight },
    renderCache: /* @__PURE__ */ new Map(),
    requestRender,
    primaryScrollView: void 0
  };
  const rootBox = layoutComponent(context, root, 0, 0, safeWidth, safeHeight, {
    x: 0,
    y: 0,
    width: safeWidth,
    height: safeHeight
  });
  const lines = Array.from({ length: safeHeight }, () => "");
  paintBox(rootBox, lines, safeWidth);
  return {
    root: rootBox,
    width: safeWidth,
    height: safeHeight,
    lines,
    ...context.primaryScrollView === void 0 ? {} : { primaryScrollView: context.primaryScrollView }
  };
}
function containsPoint(rect, x2, y2) {
  return x2 >= rect.x && x2 < rect.x + rect.width && y2 >= rect.y && y2 < rect.y + rect.height;
}
function getLayoutBoxesAt(frame, x2, y2) {
  const result = [];
  const visit = (box, depth) => {
    if (!containsPoint(box.clip, x2, y2))
      return;
    result.push({ box, depth });
    for (const child of box.children)
      visit(child, depth + 1);
  };
  visit(frame.root, 0);
  result.sort((a, b2) => b2.box.layer - a.box.layer || b2.depth - a.depth);
  return result.map(({ box }) => box);
}
function getScrollViewBox(frame, scrollView) {
  const visit = (box) => {
    if (box.scrollView === scrollView)
      return box;
    for (const child of box.children) {
      const match = visit(child);
      if (match)
        return match;
    }
    return void 0;
  };
  return visit(frame.root);
}
function getScrollViewsAt(frame, x2, y2) {
  const result = [];
  const visit = (box, depth) => {
    if (!containsPoint(box.clip, x2, y2))
      return;
    if (box.scrollView && containsPoint(box.rect, x2, y2))
      result.push({ scrollView: box.scrollView, depth });
    for (const child of box.children)
      visit(child, depth + 1);
  };
  visit(frame.root, 0);
  result.sort((a, b2) => b2.depth - a.depth);
  return result.map((entry) => entry.scrollView);
}

// node_modules/@earendil-works/pi-tui/dist/wheel-scroll.js
var BURST_GAP_MS = 5;
var GESTURE_GAP_MS = 200;
var REFERENCE_GAP_MS = 100;
var MAX_AUTO_LINES = 6;
function terminalAcceleratesWheel() {
  const env = process.env;
  return process.platform === "darwin" && env.SSH_CONNECTION === void 0 && env.SSH_CLIENT === void 0 && env.SSH_TTY === void 0;
}
var WheelScrollAccelerator = class {
  lines;
  accelerate;
  lastTime = Number.NEGATIVE_INFINITY;
  lastDirection = 0;
  averageGap;
  carry = 0;
  constructor(lines = "auto", accelerate = !terminalAcceleratesWheel()) {
    this.lines = lines;
    this.accelerate = accelerate;
  }
  setLines(lines) {
    this.lines = lines;
    this.reset();
  }
  /** Return the positive line count for a wheel event in `direction` at time `now` (milliseconds). */
  next(direction, now) {
    if (this.lines !== "auto")
      return Number.isFinite(this.lines) ? Math.max(1, Math.floor(this.lines)) : 1;
    if (!this.accelerate)
      return 1;
    const gap = now - this.lastTime;
    const sameGesture = direction === this.lastDirection && gap <= GESTURE_GAP_MS;
    this.lastTime = now;
    this.lastDirection = direction;
    if (!sameGesture) {
      this.averageGap = void 0;
      this.carry = 0;
      return 1;
    }
    if (gap < BURST_GAP_MS)
      return 1;
    this.averageGap = this.averageGap === void 0 ? gap : (this.averageGap + gap) / 2;
    const lines = Math.min(MAX_AUTO_LINES, Math.max(1, REFERENCE_GAP_MS / this.averageGap)) + this.carry;
    const whole = Math.floor(lines);
    this.carry = lines - whole;
    return whole;
  }
  reset() {
    this.lastTime = Number.NEGATIVE_INFINITY;
    this.lastDirection = 0;
    this.averageGap = void 0;
    this.carry = 0;
  }
};

// node_modules/@earendil-works/pi-tui/dist/tui-alt-screen.js
var ENTER_ALT_SCREEN = "\x1B[?1049h";
var EXIT_ALT_SCREEN = "\x1B[?1049l";
var DISABLE_AUTOWRAP = "\x1B[?7l";
var ENABLE_AUTOWRAP = "\x1B[?7h";
var ENABLE_BUTTON_MOTION_MOUSE = "\x1B[?1000h\x1B[?1002h\x1B[?1004h\x1B[?1006h";
var ENABLE_ALL_MOTION_MOUSE = "\x1B[?1000h\x1B[?1002h\x1B[?1003h\x1B[?1004h\x1B[?1006h";
var DISABLE_MOUSE = "\x1B[?1006l\x1B[?1004l\x1B[?1003l\x1B[?1002l\x1B[?1000l";
var FOCUS_IN = "\x1B[I";
var FOCUS_OUT = "\x1B[O";
var BEGIN_SYNCHRONIZED_OUTPUT = "\x1B[?2026h";
var END_SYNCHRONIZED_OUTPUT = "\x1B[?2026l";
var OSC133_ZONE_PREFIX2 = /^(?:\x1b\]133;[ABC](?:\x07|\x1b\\))+/;
var OSC133_PROMPT_START = /^\x1b\]133;A(?:\x07|\x1b\\)/;
var PAGE_SCROLL_OVERLAP = 4;
var ALT_WHEEL_SCROLL_MULTIPLIER = 5;
var MAX_CACHED_OFFSCREEN_KITTY_IMAGES = 16;
var MAX_CACHED_OFFSCREEN_KITTY_TRANSMISSION_BYTES = 32 * 1024 * 1024;
var MAX_CACHED_OFFSCREEN_KITTY_DECODED_BYTES = 64 * 1024 * 1024;
var DOUBLE_CLICK_INTERVAL_MS = 500;
var COPY_ERROR_FLASH_DURATION_MS = 5e3;
var TERMINAL_WORD_SELECTION_JOINERS = /* @__PURE__ */ new Set(["/", "-", "+", "\\", "~", "_", "."]);
var wordSegmenter4 = getWordSegmenter();
var TuiAltScreen = class extends TuiBase {
  mode = "fullscreen";
  [VIEWPORT_TUI] = true;
  previousScreen = [];
  lastDocument = [];
  previousScreenWidth = 0;
  previousScreenHeight = 0;
  layoutRoot;
  currentLayout;
  implicitDocument;
  implicitScrollView;
  flashes;
  altScreenActive = false;
  imageProtocol = null;
  savedCapabilities;
  uploadedKittyImages = /* @__PURE__ */ new Map();
  selectionAnchor;
  selectionFocus;
  selectionGranularity = "character";
  selectionInitialRange;
  lastClick;
  selectionDragPointer;
  selectionAutoScrollDirection = 0;
  selectionAutoScrollTimer;
  selectionPressActive = false;
  scrollbarDrag;
  scrollbarHover;
  scrollToEndIndicatorRect;
  activeSearch;
  pressedUrl;
  selectionDragged = false;
  mouseCapture;
  mousePressTarget;
  mousePressPoint;
  mousePressMoved = false;
  lastComponentClick;
  wheelScroll;
  mouseEnabled;
  searchMatchStyle;
  searchCurrentMatchStyle;
  searchNavigationButtonStyle;
  scrollToEndIndicator;
  openUrl;
  onRightClickPaste;
  copyOnSelect;
  copySelection;
  constructor(terminal, showHardwareCursor, logDirectory, options = {}) {
    super(terminal, showHardwareCursor, logDirectory);
    this.implicitDocument = {
      render: (width) => super.render(width),
      handleMouse: (event) => super.handleMouse(event),
      invalidate: () => {
        for (const child of this.children)
          child.invalidate();
      }
    };
    this.implicitScrollView = new ScrollView(this.implicitDocument, { follow: "end", primary: true });
    this.flashes = new AltScreenFlashContainer(() => this.requestRender());
    this.wheelScroll = new WheelScrollAccelerator(options.wheelScrollLines ?? 1);
    this.mouseEnabled = options.mouse ?? true;
    this.searchMatchStyle = options.searchMatchStyle ?? ((text) => `\x1B[4m${text}\x1B[24m`);
    this.searchCurrentMatchStyle = options.searchCurrentMatchStyle ?? ((text) => `\x1B[1;7m${text}\x1B[22;27m`);
    this.searchNavigationButtonStyle = options.searchNavigationButtonStyle ?? ((text) => text);
    this.scrollToEndIndicator = options.scrollToEndIndicator;
    this.openUrl = options.openUrl;
    this.onRightClickPaste = options.onRightClickPaste;
    this.copyOnSelect = options.copyOnSelect ?? true;
    this.copySelection = options.copySelection;
    this.addInputListener((data) => this.handleViewportInput(data));
  }
  get viewportTop() {
    return this.getPrimaryScrollView().scrollTop;
  }
  get isFollowingOutput() {
    return this.getPrimaryScrollView().isFollowingEnd;
  }
  setWheelScrollLines(lines) {
    this.wheelScroll.setLines(lines);
  }
  getCopyOnSelect() {
    return this.copyOnSelect;
  }
  setCopyOnSelect(enabled) {
    this.copyOnSelect = enabled;
  }
  /** Whether the fullscreen viewport has a non-empty active text selection. */
  hasActiveSelection() {
    return this.getActiveSelectionText() !== void 0;
  }
  /** Copy the active fullscreen text selection, if any, using the configured selection clipboard path. */
  async copyActiveSelectionToClipboard() {
    const text = this.getActiveSelectionText();
    if (!text)
      return false;
    return this.copyTextToClipboard(text);
  }
  /** Drop the text selection and multi-click history, e.g. before the host replaces the transcript. */
  resetTextSelection() {
    this.clearTextSelection();
    this.lastClick = void 0;
  }
  /** The lines of the last rendered frame, one per terminal row, as written to the terminal. */
  getScreenLines() {
    return [...this.previousScreen];
  }
  setLayoutRoot(component) {
    if (this.layoutRoot === component)
      return;
    this.layoutRoot = component;
    this.currentLayout = void 0;
    this.requestRender();
  }
  render(width) {
    return this.layoutRoot?.render(width) ?? super.render(width);
  }
  getMountedRoots() {
    return this.layoutRoot ? [this.layoutRoot] : this.children;
  }
  getPrimaryScrollView() {
    return this.currentLayout?.primaryScrollView ?? this.implicitScrollView;
  }
  beforeTerminalStart() {
    this.stopSelectionAutoScroll();
    this.selectionPressActive = false;
    this.stopScrollbarHover();
    this.stopScrollbarDrag();
    this.flashes.dispose();
    this.altScreenActive = true;
    const capabilities = getCapabilities();
    this.imageProtocol = capabilities.images;
    this.uploadedKittyImages.clear();
    if (capabilities.images === "iterm2") {
      this.savedCapabilities = capabilities;
      setCapabilities({ ...capabilities, images: null });
      this.invalidate();
    }
    this.lastDocument = [];
    this.selectionAnchor = void 0;
    this.selectionFocus = void 0;
    this.selectionGranularity = "character";
    this.selectionInitialRange = void 0;
    this.lastClick = void 0;
    this.pressedUrl = void 0;
    this.selectionDragged = false;
    this.clearComponentMouseGesture();
    this.lastComponentClick = void 0;
    this.resetRenderState();
    const term = process.env.TERM?.toLowerCase() ?? "";
    const mouseSequence = process.env.TMUX !== void 0 || process.env.ZELLIJ !== void 0 || process.env.STY !== void 0 || term.startsWith("tmux") || term.startsWith("screen") ? ENABLE_BUTTON_MOTION_MOUSE : ENABLE_ALL_MOTION_MOUSE;
    this.terminal.write(`${ENTER_ALT_SCREEN}${DISABLE_AUTOWRAP}${this.mouseEnabled ? mouseSequence : ""}\x1B[2J\x1B[H\x1B[?25l`);
  }
  beforeTerminalStop(_options) {
    this.closeSearch();
    this.stopSelectionAutoScroll();
    this.selectionPressActive = false;
    this.stopScrollbarHover();
    this.stopScrollbarDrag();
    this.clearComponentMouseGesture();
    this.flashes.dispose();
    if (!this.altScreenActive)
      return;
    this.terminal.write(`${BEGIN_SYNCHRONIZED_OUTPUT}${this.deleteKittyImages()}${this.mouseEnabled ? DISABLE_MOUSE : ""}${ENABLE_AUTOWRAP}${END_SYNCHRONIZED_OUTPUT}`);
    this.uploadedKittyImages.clear();
  }
  afterTerminalStop(options) {
    if (!this.altScreenActive)
      return;
    this.altScreenActive = false;
    if (options.preserveScreen) {
      this.terminal.write(`${BEGIN_SYNCHRONIZED_OUTPUT}${EXIT_ALT_SCREEN}\x1B[?25h${END_SYNCHRONIZED_OUTPUT}`);
    } else {
      const width = Math.max(1, this.terminal.columns);
      const documentLines = this.resolveFakeCursors(this.render(width)).map((line) => line.replace(OSC133_ZONE_PREFIX2, ""));
      this.lastDocument = this.applyLineResets(documentLines.map((line) => line.replaceAll(CURSOR_MARKER, ""))).map((line) => isImageLine(line) || visibleWidth(line) <= width ? line : sliceByColumn(line, 0, width, true));
      let buffer = `${BEGIN_SYNCHRONIZED_OUTPUT}${EXIT_ALT_SCREEN}${DISABLE_AUTOWRAP}`;
      for (let row = 0; row < this.lastDocument.length; row++) {
        if (row > 0)
          buffer += "\r\n";
        buffer += `\r\x1B[2K${this.lastDocument[row] ?? ""}`;
      }
      buffer += `\x1B[0m${ENABLE_AUTOWRAP}\r
\x1B[?25h${END_SYNCHRONIZED_OUTPUT}`;
      this.terminal.write(buffer);
    }
    if (this.savedCapabilities) {
      setCapabilities(this.savedCapabilities);
      this.savedCapabilities = void 0;
    }
  }
  getExitRestorePrefix() {
    const prefix = super.getExitRestorePrefix();
    if (!this.altScreenActive)
      return prefix;
    return `${END_SYNCHRONIZED_OUTPUT}${this.mouseEnabled ? DISABLE_MOUSE : ""}${ENABLE_AUTOWRAP}${prefix}`;
  }
  getExitRestoreSuffix() {
    return `${super.getExitRestoreSuffix()}${this.altScreenActive ? `${EXIT_ALT_SCREEN}\x1B[?25h` : ""}`;
  }
  deleteKittyImages() {
    return this.imageProtocol === "kitty" ? deleteAllKittyImages() : "";
  }
  prepareKittyScreen(screen) {
    const visibleImageIds = /* @__PURE__ */ new Set();
    const lines = screen.map((line) => {
      const placement = getKittyImagePlacement(line);
      if (!placement)
        return line;
      visibleImageIds.add(placement.imageId);
      const cachedImage = this.uploadedKittyImages.get(placement.imageId);
      const nextCachedImage = {
        transmissionGeneration: placement.transmissionGeneration,
        transmissionBytes: placement.transmissionBytes,
        estimatedDecodedBytes: placement.estimatedDecodedBytes
      };
      if (cachedImage)
        this.uploadedKittyImages.delete(placement.imageId);
      this.uploadedKittyImages.set(placement.imageId, nextCachedImage);
      return cachedImage?.transmissionGeneration === placement.transmissionGeneration ? placement.replacementLine : line;
    });
    let cachedOffscreenImageCount = 0;
    let cachedOffscreenTransmissionBytes = 0;
    let cachedOffscreenDecodedBytes = 0;
    for (const [imageId, cachedImage] of this.uploadedKittyImages) {
      if (visibleImageIds.has(imageId))
        continue;
      cachedOffscreenImageCount += 1;
      cachedOffscreenTransmissionBytes += cachedImage.transmissionBytes;
      cachedOffscreenDecodedBytes += cachedImage.estimatedDecodedBytes;
    }
    let evictedImageDeletion = "";
    for (const [imageId, cachedImage] of this.uploadedKittyImages) {
      if (cachedOffscreenImageCount <= MAX_CACHED_OFFSCREEN_KITTY_IMAGES && cachedOffscreenTransmissionBytes <= MAX_CACHED_OFFSCREEN_KITTY_TRANSMISSION_BYTES && cachedOffscreenDecodedBytes <= MAX_CACHED_OFFSCREEN_KITTY_DECODED_BYTES) {
        break;
      }
      if (visibleImageIds.has(imageId))
        continue;
      evictedImageDeletion += deleteKittyImage(imageId);
      this.uploadedKittyImages.delete(imageId);
      cachedOffscreenImageCount -= 1;
      cachedOffscreenTransmissionBytes -= cachedImage.transmissionBytes;
      cachedOffscreenDecodedBytes -= cachedImage.estimatedDecodedBytes;
    }
    return { lines, evictedImageDeletion };
  }
  resetRenderState() {
    this.previousScreen = [];
    this.previousScreenWidth = 0;
    this.previousScreenHeight = 0;
    this.currentLayout = void 0;
  }
  scrollBy(lines) {
    this.getPrimaryScrollView().scrollBy(lines);
    this.requestRender();
  }
  scrollToTop() {
    this.getPrimaryScrollView().scrollToStart();
    this.requestRender();
  }
  scrollToBottom() {
    this.getPrimaryScrollView().scrollToEnd();
    this.requestRender();
  }
  scrollToPrompt(direction) {
    if (!this.currentLayout)
      return;
    const scrollView = this.getPrimaryScrollView();
    const lines = getScrollViewBox(this.currentLayout, scrollView)?.scrollContentLines;
    if (!lines)
      return;
    for (let row = scrollView.scrollTop + direction; row >= 0 && row < lines.length; row += direction) {
      if (!OSC133_PROMPT_START.test(lines[row] ?? ""))
        continue;
      scrollView.scrollTo(row);
      this.requestRender();
      return;
    }
  }
  toggleSearch() {
    if (this.activeSearch) {
      this.closeSearch();
      return;
    }
    const component = new AltScreenSearchComponent((query) => this.updateSearchQuery(query), this.searchNavigationButtonStyle);
    const search = {
      component,
      index: new AltScreenSearchIndex(),
      query: "",
      matches: [],
      selectedIndex: -1,
      anchorRow: this.getPrimaryScrollView().scrollTop,
      selectionMode: "query"
    };
    this.activeSearch = search;
    search.overlay = this.showOverlay(component, {
      anchor: "top-right",
      width: "40%",
      minWidth: 32,
      margin: 1
    });
  }
  closeSearch() {
    const search = this.activeSearch;
    if (!search)
      return;
    this.activeSearch = void 0;
    search.overlay?.hide();
    this.requestRender();
  }
  updateSearchQuery(query) {
    const search = this.activeSearch;
    if (!search || query === search.query)
      return;
    const selected = search.matches[search.selectedIndex];
    search.anchorRow = selected?.segments[0]?.row ?? this.getPrimaryScrollView().scrollTop;
    search.query = query;
    search.selectionMode = "query";
    search.component.setResult(-1, 0);
    this.requestRender();
  }
  navigateSearch(direction) {
    const search = this.activeSearch;
    if (!search?.query)
      return;
    search.selectionMode = direction < 0 ? "previous" : "next";
    this.requestRender();
  }
  getSearchNavigationDirectionAt(x2, y2) {
    const search = this.activeSearch;
    const bounds = search?.overlay?.getBounds();
    if (!search || !bounds)
      return void 0;
    if (x2 < bounds.col || x2 >= bounds.col + bounds.width || y2 < bounds.row || y2 >= bounds.row + bounds.height) {
      return void 0;
    }
    return search.component.getNavigationDirectionAt(y2 - bounds.row, x2 - bounds.col);
  }
  handleSearchMouseEvent(event) {
    const search = this.activeSearch;
    if (!search)
      return false;
    const direction = this.getSearchNavigationDirectionAt(event.x, event.y);
    if (search.component.setHoveredNavigationDirection(direction))
      this.requestRender();
    if (direction === void 0 || event.release || (event.button & 32) !== 0 || (event.button & 3) !== 0) {
      return false;
    }
    this.navigateSearch(direction);
    return true;
  }
  refreshSearch(layout) {
    const search = this.activeSearch;
    if (!search)
      return false;
    const scrollView = layout.primaryScrollView ?? this.implicitScrollView;
    const box = getScrollViewBox(layout, scrollView);
    const lines = box?.scrollContentLines;
    if (!lines || !search.query.trim()) {
      search.matches = [];
      search.selectedIndex = -1;
      search.selectedKey = void 0;
      search.selectionMode = "retain";
      search.component.setResult(-1, 0);
      return false;
    }
    const shouldRevealSelection = search.selectionMode !== "retain";
    const result = search.index.search(lines, search.query);
    const matches = result.matches;
    search.matches = matches;
    if (!result.changed && search.selectionMode === "retain")
      return false;
    const exactIndex = result.changed ? search.selectedKey ? matches.findIndex((match) => getAltScreenSearchMatchKey(match) === search.selectedKey) : -1 : search.selectedIndex;
    let selectedIndex = -1;
    if (matches.length > 0) {
      if (search.selectionMode === "query") {
        let low = 0;
        let high = matches.length;
        while (low < high) {
          const middle = low + Math.floor((high - low) / 2);
          if ((matches[middle].segments[0]?.row ?? 0) < search.anchorRow)
            low = middle + 1;
          else
            high = middle;
        }
        selectedIndex = low < matches.length ? low : 0;
      } else if (search.selectionMode === "next") {
        const baseIndex = exactIndex >= 0 ? exactIndex : Math.min(search.selectedIndex, matches.length - 1);
        selectedIndex = baseIndex < 0 ? 0 : (baseIndex + 1) % matches.length;
      } else if (search.selectionMode === "previous") {
        const baseIndex = exactIndex >= 0 ? exactIndex : Math.min(search.selectedIndex, matches.length - 1);
        selectedIndex = baseIndex < 0 ? matches.length - 1 : (baseIndex - 1 + matches.length) % matches.length;
      } else {
        selectedIndex = exactIndex >= 0 ? exactIndex : Math.min(Math.max(0, search.selectedIndex), matches.length - 1);
      }
    }
    search.selectedIndex = selectedIndex;
    search.selectedKey = selectedIndex >= 0 ? getAltScreenSearchMatchKey(matches[selectedIndex]) : void 0;
    search.selectionMode = "retain";
    search.component.setResult(selectedIndex, matches.length);
    if (!shouldRevealSelection)
      return false;
    const selected = matches[selectedIndex];
    const firstSegment = selected?.segments[0];
    const lastSegment = selected?.segments[selected.segments.length - 1];
    if (!box || !firstSegment || !lastSegment || scrollView.viewportHeight <= 0)
      return false;
    const before = scrollView.scrollTop;
    const visibleBottom = before + scrollView.viewportHeight - 1;
    let target = before;
    if (firstSegment.row < before || lastSegment.row > visibleBottom) {
      target = firstSegment.row - Math.floor(scrollView.viewportHeight / 3);
    }
    scrollView.scrollTo(target, { disableFollow: true });
    return scrollView.scrollTop !== before;
  }
  /** Show a transient message in the alternate-screen flash stack. */
  flash(message, durationMs) {
    this.flashes.flash(message, durationMs);
  }
  /** Focused overlays and components that capture viewport input receive viewport keys instead of the transcript. */
  shouldDeferViewportInput() {
    if (this.getFocusedComponent()?.capturesViewportInput)
      return true;
    return this.isOverlayFocused() && this.activeSearch?.overlay?.isFocused() !== true;
  }
  clearComponentMouseGesture() {
    this.mouseCapture = void 0;
    this.mousePressTarget = void 0;
    this.mousePressPoint = void 0;
    this.mousePressMoved = false;
  }
  handleViewportInput(data) {
    if (data === FOCUS_OUT) {
      const hadActiveSelection = this.selectionPressActive;
      const hadNonEmptyActiveSelection = hadActiveSelection && this.getSelectionBounds() !== void 0;
      this.selectionPressActive = false;
      this.stopSelectionAutoScroll();
      this.stopScrollbarHover();
      if (this.activeSearch?.component.setHoveredNavigationDirection(void 0))
        this.requestRender();
      this.stopScrollbarDrag();
      this.pressedUrl = void 0;
      this.selectionDragged = false;
      this.clearComponentMouseGesture();
      this.lastComponentClick = void 0;
      if (hadActiveSelection) {
        this.selectionAnchor = void 0;
        this.selectionFocus = void 0;
        this.selectionGranularity = "character";
        this.selectionInitialRange = void 0;
        if (hadNonEmptyActiveSelection)
          this.requestRender();
      }
      this.lastClick = void 0;
      return { consume: true };
    }
    if (data === FOCUS_IN)
      return { consume: true };
    const wheelEvent = this.parseWheelEvent(data);
    if (wheelEvent) {
      const lines = this.wheelScroll.next(wheelEvent.direction, performance.now());
      const wheelDelta = wheelEvent.direction * ((wheelEvent.button & 8) !== 0 ? lines * ALT_WHEEL_SCROLL_MULTIPLIER : lines);
      const event = this.createMouseEvent("wheel", wheelEvent.button, wheelEvent.x, wheelEvent.y, { wheelDelta });
      const overlay = this.dispatchMouseToOverlay(event);
      const result = overlay.result ?? (overlay.hit ? void 0 : this.dispatchMouseToLayout(event));
      if (result) {
        if (this.applyMouseDispatchResult(event, result))
          this.requestRender();
        return { consume: true };
      }
      this.routeWheel(wheelEvent, wheelDelta);
      return { consume: true };
    }
    const mouseEvent = this.parseSgrMouseEvent(data);
    if (mouseEvent) {
      this.handleMouseEvent(mouseEvent);
      return { consume: true };
    }
    if (this.isMouseSequence(data))
      return { consume: true };
    const keybindings = getKeybindings();
    const isRelease = isKeyRelease(data);
    if (keybindings.matches(data, "tui.altScreen.search")) {
      if (!isRelease)
        this.toggleSearch();
      return { consume: true };
    }
    if (this.activeSearch?.overlay?.isFocused()) {
      if (keybindings.matches(data, "tui.altScreen.searchNext")) {
        if (!isRelease)
          this.navigateSearch(1);
        return { consume: true };
      }
      if (keybindings.matches(data, "tui.altScreen.searchPrevious")) {
        if (!isRelease)
          this.navigateSearch(-1);
        return { consume: true };
      }
      if (keybindings.matches(data, "tui.altScreen.searchClose")) {
        if (!isRelease)
          this.closeSearch();
        return { consume: true };
      }
    }
    if (this.shouldDeferViewportInput())
      return void 0;
    if (keybindings.matches(data, "tui.altScreen.pageUp")) {
      if (!isRelease) {
        this.scrollBy(-Math.max(1, this.getPrimaryScrollView().viewportHeight - PAGE_SCROLL_OVERLAP));
      }
      return { consume: true };
    }
    if (keybindings.matches(data, "tui.altScreen.pageDown")) {
      if (!isRelease) {
        this.scrollBy(Math.max(1, this.getPrimaryScrollView().viewportHeight - PAGE_SCROLL_OVERLAP));
      }
      return { consume: true };
    }
    if (keybindings.matches(data, "tui.altScreen.halfPageUp")) {
      if (!isRelease)
        this.scrollBy(-Math.max(1, Math.floor(this.getPrimaryScrollView().viewportHeight / 2)));
      return { consume: true };
    }
    if (keybindings.matches(data, "tui.altScreen.halfPageDown")) {
      if (!isRelease)
        this.scrollBy(Math.max(1, Math.floor(this.getPrimaryScrollView().viewportHeight / 2)));
      return { consume: true };
    }
    if (keybindings.matches(data, "tui.altScreen.lineUp")) {
      if (!isRelease)
        this.scrollBy(-1);
      return { consume: true };
    }
    if (keybindings.matches(data, "tui.altScreen.lineDown")) {
      if (!isRelease)
        this.scrollBy(1);
      return { consume: true };
    }
    if (keybindings.matches(data, "tui.altScreen.previousPrompt")) {
      if (!isRelease)
        this.scrollToPrompt(-1);
      return { consume: true };
    }
    if (keybindings.matches(data, "tui.altScreen.nextPrompt")) {
      if (!isRelease)
        this.scrollToPrompt(1);
      return { consume: true };
    }
    if (keybindings.matches(data, "tui.altScreen.top")) {
      if (!isRelease)
        this.scrollToTop();
      return { consume: true };
    }
    if (keybindings.matches(data, "tui.altScreen.bottom")) {
      if (!isRelease)
        this.scrollToBottom();
      return { consume: true };
    }
    return void 0;
  }
  decodeMouseButton(button) {
    switch (button & 3) {
      case 0:
        return "left";
      case 1:
        return "middle";
      case 2:
        return "right";
      default:
        return "none";
    }
  }
  createMouseEvent(type, button, x2, y2, extra = {}) {
    return {
      type,
      button: type === "wheel" ? "none" : this.decodeMouseButton(button),
      x: x2,
      y: y2,
      screenX: x2,
      screenY: y2,
      width: Math.max(1, this.terminal.columns),
      height: Math.max(1, this.terminal.rows),
      shift: (button & 4) !== 0,
      alt: (button & 8) !== 0,
      ctrl: (button & 16) !== 0,
      ...extra.wheelDelta === void 0 ? {} : { wheelDelta: extra.wheelDelta },
      ...extra.clickCount === void 0 ? {} : { clickCount: extra.clickCount }
    };
  }
  dispatchMouseToLayout(event) {
    if (!this.currentLayout)
      return void 0;
    const visited = /* @__PURE__ */ new Set();
    const boxes = getLayoutBoxesAt(this.currentLayout, event.screenX, event.screenY);
    for (const box of boxes) {
      if (visited.has(box.component))
        continue;
      if (getLayoutNode(box.component) && box.component.handleMouse === Container.prototype.handleMouse)
        continue;
      visited.add(box.component);
      const result = dispatchMouseEvent(box.component, {
        ...event,
        x: event.screenX - box.rect.x,
        y: event.screenY - box.rect.y,
        width: box.rect.width,
        height: box.rect.height
      });
      if (result)
        return result;
    }
    return void 0;
  }
  applyMouseDispatchResult(event, result) {
    const focusTarget = this.resolveMouseFocusTarget(result.focusTarget ?? result.target.component);
    const focusChanged = result.focus === true && this.getFocusedComponent() !== focusTarget;
    if (result.focus)
      this.setFocus(focusTarget);
    if (result.capture)
      this.mouseCapture = result.target;
    return result.render ?? (focusChanged || event.type === "press" || event.type === "click" || event.type === "drag" || event.type === "wheel");
  }
  dispatchMouseToTarget(event, target) {
    return dispatchMouseEvent(target.component, retargetMouseEvent(event, target));
  }
  getComponentClickCount(target, x2, y2) {
    const now = Date.now();
    const previous = this.lastComponentClick;
    const count = previous && now - previous.timestamp <= DOUBLE_CLICK_INTERVAL_MS && previous.component === target.component && previous.x === x2 && previous.y === y2 ? previous.count % 3 + 1 : 1;
    this.lastComponentClick = { timestamp: now, count, component: target.component, x: x2, y: y2 };
    return count;
  }
  clearTextSelection() {
    this.stopSelectionAutoScroll();
    this.selectionPressActive = false;
    this.selectionAnchor = void 0;
    this.selectionFocus = void 0;
    this.selectionGranularity = "character";
    this.selectionInitialRange = void 0;
    this.pressedUrl = void 0;
    this.selectionDragged = false;
  }
  handleMouseEvent(raw) {
    const isMotion = (raw.button & 32) !== 0;
    const type = raw.release ? "release" : isMotion ? this.decodeMouseButton(raw.button) === "none" ? "move" : "drag" : "press";
    const event = this.createMouseEvent(type, raw.button, raw.x, raw.y);
    if (this.mouseCapture || this.mousePressTarget) {
      const target = this.mouseCapture ?? this.mousePressTarget;
      if (this.mousePressPoint && (raw.x !== this.mousePressPoint.x || raw.y !== this.mousePressPoint.y)) {
        this.mousePressMoved = true;
        this.lastComponentClick = void 0;
      }
      let render = false;
      const targetResult = this.dispatchMouseToTarget(event, target);
      if (targetResult)
        render = this.applyMouseDispatchResult(event, targetResult);
      if (raw.release) {
        if (!this.mousePressMoved && this.mousePressPoint?.x === raw.x && this.mousePressPoint.y === raw.y) {
          const clickEvent = this.createMouseEvent("click", raw.button, raw.x, raw.y, {
            clickCount: this.getComponentClickCount(target, raw.x, raw.y)
          });
          const clickResult = this.dispatchMouseToTarget(clickEvent, target);
          if (clickResult)
            render = this.applyMouseDispatchResult(clickEvent, clickResult) || render;
        }
        this.clearComponentMouseGesture();
      }
      if (render)
        this.requestRender();
      return;
    }
    if (this.handleSearchMouseEvent(raw))
      return;
    const overlay = this.dispatchMouseToOverlay(event);
    if (!overlay.hit) {
      if (this.handleScrollToEndIndicatorMouseEvent(raw))
        return;
      const scrollbarHandled = this.handleScrollbarMouseEvent(raw);
      if (!this.scrollbarDrag)
        this.updateScrollbarHover(raw.x, raw.y);
      if (scrollbarHandled)
        return;
    } else {
      this.stopScrollbarHover();
    }
    const result = overlay.result ?? (overlay.hit ? void 0 : this.dispatchMouseToLayout(event));
    if (result) {
      const render = this.applyMouseDispatchResult(event, result);
      if (type === "press") {
        this.clearTextSelection();
        this.mousePressTarget = result.target;
        this.mousePressPoint = { x: raw.x, y: raw.y };
        this.mousePressMoved = false;
      }
      if (render)
        this.requestRender();
      return;
    }
    if (this.handleRightClickPaste(raw))
      return;
    this.handleSelectionMouseEvent(raw);
  }
  parseWheelEvent(data) {
    const sgr = /^\x1b\[<(\d+);(\d+);(\d+)[Mm]$/.exec(data);
    if (sgr) {
      const button = Number.parseInt(sgr[1], 10);
      if ((button & 64) === 0)
        return void 0;
      const direction = button & 3;
      if (direction !== 0 && direction !== 1)
        return void 0;
      return {
        direction: direction === 0 ? -1 : 1,
        x: Number.parseInt(sgr[2], 10) - 1,
        y: Number.parseInt(sgr[3], 10) - 1,
        button
      };
    }
    if (data.length === 6 && data.startsWith("\x1B[M")) {
      const button = data.charCodeAt(3) - 32;
      if ((button & 64) === 0)
        return void 0;
      const direction = button & 3;
      if (direction !== 0 && direction !== 1)
        return void 0;
      return {
        direction: direction === 0 ? -1 : 1,
        x: data.charCodeAt(4) - 33,
        y: data.charCodeAt(5) - 33,
        button
      };
    }
    return void 0;
  }
  routeWheel(event, delta) {
    let remaining = delta;
    const seen = /* @__PURE__ */ new Set();
    for (const scrollView of this.currentLayout ? getScrollViewsAt(this.currentLayout, event.x, event.y) : []) {
      seen.add(scrollView);
      remaining = scrollView.scrollBy(remaining);
      if (remaining === 0 || scrollView.overscroll === "contain")
        break;
    }
    const primary = this.getPrimaryScrollView();
    if (remaining !== 0 && !seen.has(primary))
      primary.scrollBy(remaining);
    this.updateScrollbarHover(event.x, event.y);
    this.requestRender();
  }
  parseSgrMouseEvent(data) {
    const match = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/.exec(data);
    if (!match)
      return void 0;
    return {
      button: Number.parseInt(match[1], 10),
      x: Number.parseInt(match[2], 10) - 1,
      y: Number.parseInt(match[3], 10) - 1,
      release: match[4] === "m"
    };
  }
  handleRightClickPaste(event) {
    if (!this.onRightClickPaste || process.platform !== "win32" || process.env.TERM_PROGRAM?.toLowerCase() === "vscode" || event.release || event.button !== 2) {
      return false;
    }
    try {
      this.onRightClickPaste();
    } catch {
    }
    return true;
  }
  handleScrollToEndIndicatorMouseEvent(event) {
    const rect = this.scrollToEndIndicatorRect;
    if (!rect || event.release || (event.button & 32) !== 0 || (event.button & 3) !== 0)
      return false;
    if (event.y !== rect.row || event.x < rect.column || event.x >= rect.column + rect.width)
      return false;
    this.scrollToBottom();
    return true;
  }
  getScrollbarTargetAt(x2, y2, includeHiddenAuto = false) {
    if (this.hasOverlay() || !this.currentLayout)
      return void 0;
    for (const scrollView of getScrollViewsAt(this.currentLayout, x2, y2)) {
      const box = getScrollViewBox(this.currentLayout, scrollView);
      const geometry = box ? getScrollbarGeometry(box, includeHiddenAuto) : void 0;
      if (geometry && x2 === geometry.column && y2 >= geometry.trackTop && y2 < geometry.trackTop + geometry.trackHeight) {
        return { scrollView, geometry };
      }
    }
    return void 0;
  }
  setScrollbarHover(scrollView) {
    if (scrollView === this.scrollbarHover)
      return;
    this.scrollbarHover?.setScrollbarActive(false);
    this.scrollbarHover = scrollView;
    this.scrollbarHover?.setScrollbarActive(true);
  }
  updateScrollbarHover(x2, y2) {
    this.setScrollbarHover(this.getScrollbarTargetAt(x2, y2, true)?.scrollView);
  }
  stopScrollbarHover() {
    this.setScrollbarHover(void 0);
  }
  scrollScrollbarToPointer(scrollView, geometry, pointerY, grabOffset) {
    const maxThumbOffset = geometry.trackHeight - geometry.thumbHeight;
    const thumbOffset = Math.max(0, Math.min(maxThumbOffset, pointerY - geometry.trackTop - grabOffset));
    const scrollTop = maxThumbOffset === 0 ? 0 : Math.round(thumbOffset / maxThumbOffset * geometry.maxScrollTop);
    scrollView.scrollTo(scrollTop);
  }
  handleScrollbarMouseEvent(event) {
    if (this.scrollbarDrag) {
      if (event.release) {
        this.stopScrollbarDrag();
        return true;
      }
      const box = this.currentLayout ? getScrollViewBox(this.currentLayout, this.scrollbarDrag.scrollView) : void 0;
      const geometry = box ? getScrollbarGeometry(box) : void 0;
      if (geometry) {
        this.scrollScrollbarToPointer(this.scrollbarDrag.scrollView, geometry, event.y, this.scrollbarDrag.grabOffset);
      }
      return true;
    }
    if (event.release || (event.button & 32) !== 0 || (event.button & 3) !== 0)
      return false;
    const target = this.getScrollbarTargetAt(event.x, event.y);
    if (!target)
      return false;
    this.stopSelectionAutoScroll();
    this.selectionPressActive = false;
    this.selectionAnchor = void 0;
    this.selectionFocus = void 0;
    this.selectionGranularity = "character";
    this.selectionInitialRange = void 0;
    this.lastClick = void 0;
    this.pressedUrl = void 0;
    this.selectionDragged = false;
    this.setScrollbarHover(target.scrollView);
    const onThumb = event.y >= target.geometry.thumbTop && event.y < target.geometry.thumbTop + target.geometry.thumbHeight;
    const grabOffset = onThumb ? event.y - target.geometry.thumbTop : Math.floor(target.geometry.thumbHeight / 2);
    if (!onThumb)
      this.scrollScrollbarToPointer(target.scrollView, target.geometry, event.y, grabOffset);
    this.scrollbarDrag = {
      scrollView: target.scrollView,
      grabOffset
    };
    return true;
  }
  stopScrollbarDrag() {
    this.scrollbarDrag = void 0;
  }
  getScrollSelectionPoint(scrollView, x2, y2) {
    if (!this.currentLayout)
      return void 0;
    const box = getScrollViewBox(this.currentLayout, scrollView);
    if (!box || box.rect.height <= 0 || box.clip.height <= 0)
      return void 0;
    const visibleTop = Math.max(0, box.rect.y, box.clip.y);
    const visibleBottom = Math.min(this.terminal.rows - 1, box.rect.y + box.rect.height - 1, box.clip.y + box.clip.height - 1);
    if (visibleBottom < visibleTop)
      return void 0;
    const pointerRow = Math.max(visibleTop, Math.min(visibleBottom, y2));
    const maxContentRow = Math.max(0, (box.scrollContentLines?.length ?? 1) - 1);
    return {
      row: Math.max(0, Math.min(maxContentRow, scrollView.scrollTop + pointerRow - box.rect.y)),
      col: Math.max(0, Math.min(box.rect.width - 1, x2 - box.rect.x)),
      scrollView
    };
  }
  getSelectionPoint(event, scrollView) {
    if (scrollView) {
      const point = this.getScrollSelectionPoint(scrollView, event.x, event.y);
      if (point)
        return point;
    }
    return {
      row: Math.max(0, Math.min(this.terminal.rows - 1, event.y)),
      col: Math.max(0, Math.min(this.terminal.columns - 1, event.x))
    };
  }
  getSelectionSourceLine(point) {
    if (point.scrollView && this.currentLayout) {
      const lines = getScrollViewBox(this.currentLayout, point.scrollView)?.scrollContentLines;
      if (lines)
        return lines[point.row] ?? "";
    }
    return this.previousScreen[point.row] ?? "";
  }
  getWordSelection(point) {
    const line = stripTerminalSequences(this.getSelectionSourceLine(point));
    const segments = [];
    let start = 0;
    for (const segment of wordSegmenter4.segment(line)) {
      const end = start + visibleWidth(segment.segment);
      const joiner = TERMINAL_WORD_SELECTION_JOINERS.has(segment.segment);
      segments.push({ start, end, selectable: segment.isWordLike === true || joiner, joiner });
      start = end;
    }
    const clickedSegmentIndex = segments.findIndex((segment) => point.col >= segment.start && point.col < segment.end);
    if (clickedSegmentIndex < 0)
      return void 0;
    const canJoin = (left, right) => left.selectable && right.selectable && (left.joiner || right.joiner);
    let selectionStart = segments[clickedSegmentIndex].start;
    let selectionEnd = segments[clickedSegmentIndex].end;
    for (let index = clickedSegmentIndex; index > 0 && canJoin(segments[index - 1], segments[index]); index--) {
      selectionStart = segments[index - 1].start;
    }
    for (let index = clickedSegmentIndex; index < segments.length - 1 && canJoin(segments[index], segments[index + 1]); index++) {
      selectionEnd = segments[index + 1].end;
    }
    return {
      start: { ...point, col: selectionStart },
      end: { ...point, col: selectionEnd, boundary: true }
    };
  }
  getLineSelection(point) {
    return {
      start: { ...point, col: 0 },
      end: { ...point, col: visibleWidth(this.getSelectionSourceLine(point)), boundary: true }
    };
  }
  updateSelectionFocus(point) {
    if (this.selectionGranularity === "character" || !this.selectionInitialRange) {
      this.selectionFocus = point;
      return;
    }
    const range = this.selectionGranularity === "word" ? this.getWordSelection(point) : this.getLineSelection(point);
    if (!range)
      return;
    const initial = this.selectionInitialRange;
    const targetBeforeInitial = range.start.row < initial.start.row || range.start.row === initial.start.row && range.start.col < initial.start.col;
    if (targetBeforeInitial) {
      this.selectionAnchor = initial.end;
      this.selectionFocus = range.start;
    } else {
      this.selectionAnchor = initial.start;
      this.selectionFocus = range.end;
    }
  }
  getClickCount(point, word) {
    const now = Date.now();
    const previous = this.lastClick;
    const count = word && previous && now - previous.timestamp <= DOUBLE_CLICK_INTERVAL_MS && previous.row === point.row && previous.scrollView === point.scrollView && previous.wordStart === word.start.col && previous.wordEnd === word.end.col ? previous.count % 3 + 1 : 1;
    this.lastClick = word ? {
      timestamp: now,
      count,
      row: point.row,
      scrollView: point.scrollView,
      wordStart: word.start.col,
      wordEnd: word.end.col
    } : void 0;
    return count;
  }
  updateSelectionAutoScroll(event) {
    const scrollView = this.selectionAnchor?.scrollView;
    if (!scrollView || !this.currentLayout) {
      this.stopSelectionAutoScroll();
      return;
    }
    const box = getScrollViewBox(this.currentLayout, scrollView);
    if (!box || box.rect.height <= 0 || box.clip.height <= 0) {
      this.stopSelectionAutoScroll();
      return;
    }
    const visibleTop = Math.max(0, box.rect.y, box.clip.y);
    const visibleBottom = Math.min(this.terminal.rows - 1, box.rect.y + box.rect.height - 1, box.clip.y + box.clip.height - 1);
    this.selectionDragPointer = { x: event.x, y: event.y };
    this.selectionAutoScrollDirection = event.y <= visibleTop ? -1 : event.y >= visibleBottom ? 1 : 0;
    if (this.selectionAutoScrollDirection === 0) {
      this.stopSelectionAutoScroll();
      return;
    }
    if (this.selectionAutoScrollTimer)
      return;
    this.selectionAutoScrollTimer = setInterval(() => this.autoScrollSelection(), 50);
    this.selectionAutoScrollTimer.unref();
  }
  autoScrollSelection() {
    const scrollView = this.selectionAnchor?.scrollView;
    const pointer = this.selectionDragPointer;
    const direction = this.selectionAutoScrollDirection;
    if (!scrollView || !pointer || direction === 0) {
      this.stopSelectionAutoScroll();
      return;
    }
    const remaining = scrollView.scrollBy(direction);
    if (remaining === direction) {
      this.stopSelectionAutoScroll();
      return;
    }
    const point = this.getScrollSelectionPoint(scrollView, pointer.x, pointer.y);
    if (point)
      this.updateSelectionFocus(point);
    this.requestRender();
  }
  stopSelectionAutoScroll() {
    if (this.selectionAutoScrollTimer) {
      clearInterval(this.selectionAutoScrollTimer);
      this.selectionAutoScrollTimer = void 0;
    }
    this.selectionAutoScrollDirection = 0;
    this.selectionDragPointer = void 0;
  }
  handleSelectionMouseEvent(event) {
    const button = event.button & 3;
    if (button !== 0 && !(event.release && button === 3))
      return;
    const anchorScrollView = this.selectionAnchor?.scrollView;
    const point = this.getSelectionPoint(event, anchorScrollView);
    if (event.release) {
      if (!this.selectionPressActive)
        return;
      this.selectionPressActive = false;
      this.stopSelectionAutoScroll();
      if (!this.selectionAnchor)
        return;
      this.updateSelectionFocus(point);
      const isClick = !this.selectionDragged && this.selectionAnchor.scrollView === point.scrollView && this.selectionAnchor.row === point.row && this.selectionAnchor.col === point.col;
      const clickedUrl = isClick ? this.pressedUrl : void 0;
      this.pressedUrl = void 0;
      if (clickedUrl && this.openUrl) {
        this.selectionAnchor = void 0;
        this.selectionFocus = void 0;
        try {
          this.openUrl(clickedUrl);
        } catch {
        }
        this.requestRender();
        return;
      }
      if (isClick) {
        const clickEvent = this.createMouseEvent("click", event.button, event.x, event.y, {
          clickCount: this.lastClick?.count ?? 1
        });
        const overlay = this.dispatchMouseToOverlay(clickEvent);
        const result = overlay.result ?? (overlay.hit ? void 0 : this.dispatchMouseToLayout(clickEvent));
        if (result) {
          const render = this.applyMouseDispatchResult(clickEvent, result);
          this.clearTextSelection();
          if (render)
            this.requestRender();
          return;
        }
      }
      if (this.copyOnSelect)
        void this.copySelectionToClipboard();
      this.requestRender();
      return;
    }
    if ((event.button & 32) !== 0) {
      if (!this.selectionPressActive || !this.selectionAnchor)
        return;
      this.selectionDragged = true;
      this.lastClick = void 0;
      this.pressedUrl = void 0;
      this.updateSelectionFocus(point);
      this.updateSelectionAutoScroll(event);
      this.requestRender();
      return;
    }
    this.stopSelectionAutoScroll();
    this.selectionPressActive = true;
    const scrollView = !this.hasOverlay() && this.currentLayout ? getScrollViewsAt(this.currentLayout, event.x, event.y)[0] : void 0;
    const anchor = this.getSelectionPoint(event, scrollView);
    const word = this.getWordSelection(anchor);
    const clickCount = this.getClickCount(anchor, word);
    const range = clickCount === 2 ? word : clickCount === 3 ? this.getLineSelection(anchor) : void 0;
    this.selectionGranularity = range ? clickCount === 2 ? "word" : "line" : "character";
    this.selectionInitialRange = range;
    this.selectionAnchor = range?.start ?? anchor;
    this.selectionFocus = range?.end ?? anchor;
    this.selectionDragged = false;
    this.pressedUrl = range ? void 0 : getOsc8LinkAtColumn(this.previousScreen[Math.max(0, Math.min(this.terminal.rows - 1, event.y))] ?? "", Math.max(0, Math.min(this.terminal.columns - 1, event.x)));
    this.requestRender();
  }
  getSelectionBounds() {
    if (!this.selectionAnchor || !this.selectionFocus)
      return void 0;
    if (this.selectionAnchor.scrollView !== this.selectionFocus.scrollView)
      return void 0;
    const anchorBeforeFocus = this.selectionAnchor.row < this.selectionFocus.row || this.selectionAnchor.row === this.selectionFocus.row && this.selectionAnchor.col < this.selectionFocus.col;
    if (this.selectionAnchor.row === this.selectionFocus.row && this.selectionAnchor.col === this.selectionFocus.col) {
      return void 0;
    }
    return anchorBeforeFocus ? { start: this.selectionAnchor, end: this.selectionFocus } : { start: this.selectionFocus, end: this.selectionAnchor };
  }
  getSelectionColumns(line, row, selection, minColumn = 0, maxColumn = visibleWidth(line)) {
    const lineWidth = visibleWidth(line);
    let start = Math.max(0, minColumn);
    let end = Math.min(lineWidth, maxColumn);
    if (row === selection.start.row) {
      start = getGraphemeCellRange(line, selection.start.col)?.start ?? Math.min(selection.start.col, lineWidth);
    }
    if (row === selection.end.row) {
      end = selection.end.boundary ? Math.min(selection.end.col, lineWidth) : getGraphemeCellRange(line, selection.end.col)?.end ?? Math.min(selection.end.col + 1, lineWidth);
    }
    return { start: Math.max(minColumn, start), end: Math.min(maxColumn, end) };
  }
  getActiveSelectionText() {
    const selection = this.getSelectionBounds();
    if (!selection)
      return void 0;
    let sourceLines = this.previousScreen;
    if (selection.start.scrollView) {
      if (!this.currentLayout)
        return void 0;
      const box = getScrollViewBox(this.currentLayout, selection.start.scrollView);
      if (!box?.scrollContentLines)
        return void 0;
      sourceLines = box.scrollContentLines;
    }
    const lines = [];
    for (let row = selection.start.row; row <= selection.end.row; row++) {
      const line = sourceLines[row] ?? "";
      const columns = this.getSelectionColumns(line, row, selection);
      lines.push(stripTerminalSequences(sliceByColumn(line, columns.start, Math.max(0, columns.end - columns.start), true)).trimEnd());
    }
    const text = lines.join("\n");
    return text.length === 0 ? void 0 : text;
  }
  async copySelectionToClipboard() {
    const text = this.getActiveSelectionText();
    if (!text)
      return false;
    return this.copyTextToClipboard(text);
  }
  async copyTextToClipboard(text) {
    if (this.copySelection) {
      const result = await this.copySelection(text);
      const ok = result === true;
      this.flash(ok ? "Copied!" : typeof result === "string" ? result : "Copy failed", ok ? void 0 : COPY_ERROR_FLASH_DURATION_MS);
      return ok;
    }
    this.terminal.write(`\x1B]52;c;${Buffer.from(text).toString("base64")}\x07`);
    this.flash("Copied!");
    return true;
  }
  applySearchTextHighlight(text, current) {
    const style = current ? this.searchCurrentMatchStyle : this.searchMatchStyle;
    let result = "";
    let plainStart = 0;
    let index = 0;
    while (index < text.length) {
      const ansi = extractAnsiCode(text, index);
      if (!ansi) {
        index += 1;
        continue;
      }
      if (index > plainStart)
        result += style(text.slice(plainStart, index));
      result += ansi.code;
      index += ansi.length;
      plainStart = index;
    }
    if (plainStart < text.length)
      result += style(text.slice(plainStart));
    return result;
  }
  applySearchHighlights(screen, layout) {
    const search = this.activeSearch;
    if (!search || search.selectedIndex < 0 || search.matches.length === 0)
      return screen;
    const scrollView = layout.primaryScrollView ?? this.implicitScrollView;
    const box = getScrollViewBox(layout, scrollView);
    if (!box)
      return screen;
    const rangesByRow = /* @__PURE__ */ new Map();
    const scrollbarColumn = getScrollbarGeometry(box)?.column;
    const minRow = Math.max(0, box.rect.y, box.clip.y);
    const maxRow = Math.min(screen.length, box.rect.y + box.rect.height, box.clip.y + box.clip.height);
    const minColumn = Math.max(0, box.rect.x, box.clip.x);
    const maxColumn = Math.min(this.terminal.columns, box.rect.x + box.rect.width, box.clip.x + box.clip.width, scrollbarColumn ?? Number.POSITIVE_INFINITY);
    const minContentRow = scrollView.scrollTop + minRow - box.rect.y;
    const maxContentRow = scrollView.scrollTop + maxRow - box.rect.y - 1;
    let low = 0;
    let high = search.matches.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      const match = search.matches[middle];
      const lastRow = match.segments[match.segments.length - 1]?.row ?? -1;
      if (lastRow < minContentRow)
        low = middle + 1;
      else
        high = middle;
    }
    for (let matchIndex = low; matchIndex < search.matches.length; matchIndex++) {
      const match = search.matches[matchIndex];
      if ((match.segments[0]?.row ?? 0) > maxContentRow)
        break;
      for (const segment of match.segments) {
        const row = box.rect.y + segment.row - scrollView.scrollTop;
        if (row < minRow || row >= maxRow)
          continue;
        const startCol = Math.max(minColumn, box.rect.x + segment.startCol);
        const endCol = Math.min(maxColumn, box.rect.x + segment.endCol);
        if (endCol <= startCol)
          continue;
        const ranges = rangesByRow.get(row) ?? [];
        ranges.push({ startCol, endCol, current: matchIndex === search.selectedIndex });
        rangesByRow.set(row, ranges);
      }
    }
    const result = [...screen];
    for (const [row, ranges] of rangesByRow) {
      let line = result[row] ?? "";
      if (isImageLine(line))
        continue;
      const lineWidth = visibleWidth(line);
      for (const range of ranges.sort((a, b2) => b2.startCol - a.startCol)) {
        const startCol = Math.min(range.startCol, lineWidth);
        const endCol = Math.min(range.endCol, lineWidth);
        if (endCol <= startCol)
          continue;
        const before = sliceByColumn(line, 0, startCol, true);
        const highlighted = sliceByColumn(line, startCol, endCol - startCol, true);
        const after = sliceByColumn(line, endCol, Math.max(0, lineWidth - endCol), true);
        line = `${before}${this.applySearchTextHighlight(highlighted, range.current)}${after}`;
      }
      result[row] = line;
    }
    return result;
  }
  applySelectionHighlight(text) {
    let result = "\x1B[7m";
    let index = 0;
    while (index < text.length) {
      const ansi = extractAnsiCode(text, index);
      if (!ansi) {
        result += text[index];
        index += 1;
        continue;
      }
      result += ansi.code;
      if (ansi.code.endsWith("m"))
        result += "\x1B[7m";
      index += ansi.length;
    }
    return `${result}\x1B[27m`;
  }
  applySelection(screen, layout = this.currentLayout) {
    const selection = this.getSelectionBounds();
    if (!selection)
      return screen;
    let screenSelection = selection;
    let minRow = 0;
    let maxRow = screen.length - 1;
    let minColumn = 0;
    let maxColumn = this.terminal.columns;
    if (selection.start.scrollView) {
      if (!layout)
        return screen;
      const box = getScrollViewBox(layout, selection.start.scrollView);
      if (!box)
        return screen;
      minRow = Math.max(0, box.rect.y, box.clip.y);
      maxRow = Math.min(screen.length - 1, box.rect.y + box.rect.height - 1, box.clip.y + box.clip.height - 1);
      minColumn = Math.max(0, box.rect.x, box.clip.x);
      maxColumn = Math.min(this.terminal.columns, box.rect.x + box.rect.width, box.clip.x + box.clip.width);
      screenSelection = {
        start: {
          ...selection.start,
          row: box.rect.y + selection.start.row - selection.start.scrollView.scrollTop,
          col: box.rect.x + selection.start.col
        },
        end: {
          ...selection.end,
          row: box.rect.y + selection.end.row - selection.start.scrollView.scrollTop,
          col: box.rect.x + selection.end.col
        }
      };
    }
    return screen.map((line, row) => {
      if (row < minRow || row > maxRow || row < screenSelection.start.row || row > screenSelection.end.row || isImageLine(line)) {
        return line;
      }
      const lineWidth = visibleWidth(line);
      const columns = this.getSelectionColumns(line, row, screenSelection, minColumn, maxColumn);
      if (columns.end <= columns.start)
        return line;
      const before = sliceByColumn(line, 0, columns.start, true);
      const selected = sliceByColumn(line, columns.start, columns.end - columns.start, true);
      const after = sliceByColumn(line, columns.end, Math.max(0, lineWidth - columns.end), true);
      return `${before}${this.applySelectionHighlight(selected)}${after}`;
    });
  }
  isMouseSequence(data) {
    return /^\x1b\[<\d+;\d+;\d+[Mm]$/.test(data) || data.length === 6 && data.startsWith("\x1B[M");
  }
  compositeScrollToEndIndicator(screen, layout, width) {
    this.scrollToEndIndicatorRect = void 0;
    const scrollView = layout.primaryScrollView ?? this.implicitScrollView;
    if (!this.scrollToEndIndicator || !scrollView.followEnd || scrollView.isFollowingEnd)
      return screen;
    const box = getScrollViewBox(layout, scrollView);
    const clip = box?.clip;
    if (!clip || clip.width <= 0 || clip.height <= 0)
      return screen;
    const row = clip.y + clip.height - 1;
    if (row >= screen.length || isImageLine(screen[row] ?? ""))
      return screen;
    const scrollbarColumn = box ? getScrollbarGeometry(box)?.column : void 0;
    const label = truncateToWidth(this.scrollToEndIndicator(), clip.width, "");
    const labelWidth = visibleWidth(label);
    const column = clip.x + Math.floor((clip.width - labelWidth) / 2);
    const rightEdge = scrollbarColumn ?? clip.x + clip.width;
    const availableWidth = Math.max(0, rightEdge - column);
    const text = truncateToWidth(label, availableWidth, "");
    const textWidth = visibleWidth(text);
    if (textWidth === 0)
      return screen;
    const result = [...screen];
    result[row] = compositeTuiLine(result[row] ?? "", text, column, textWidth, width);
    this.scrollToEndIndicatorRect = { row, column, width: textWidth };
    return result;
  }
  compositeFlashes(screen, width, height) {
    const flashLines = this.flashes.render(width).slice(-height);
    if (flashLines.length === 0)
      return screen;
    const result = [...screen];
    while (result.length < height)
      result.push("");
    for (let row = 0; row < flashLines.length; row++) {
      const line = flashLines[row];
      const flashWidth = visibleWidth(line);
      if (flashWidth === 0)
        continue;
      result[row] = compositeTuiLine(result[row] ?? "", line, width - flashWidth, flashWidth, width);
    }
    return result;
  }
  doRender() {
    if (this.stopped || !this.altScreenActive)
      return;
    const width = Math.max(1, this.terminal.columns);
    const height = Math.max(1, this.terminal.rows);
    const root = this.layoutRoot ?? this.implicitScrollView;
    let nextLayout = renderLayoutFrame(root, width, height, () => this.requestRender());
    if (this.refreshSearch(nextLayout)) {
      nextLayout = renderLayoutFrame(root, width, height, () => this.requestRender());
    }
    let screen = this.resolveFakeCursors(nextLayout.lines.map((line) => line.replace(OSC133_ZONE_PREFIX2, "")));
    screen = this.applySearchHighlights(screen, nextLayout);
    screen = this.compositeScrollToEndIndicator(screen, nextLayout, width);
    screen = this.compositeOverlays(screen, width, height);
    if (screen.length > height)
      screen = screen.slice(screen.length - height);
    screen = this.applySelection(screen, nextLayout);
    screen = this.compositeFlashes(screen, width, height);
    const cursorPos = this.extractCursorPosition(screen, height);
    screen = this.applyLineResets(screen).map((line) => {
      if (isImageLine(line) || visibleWidth(line) <= width)
        return line;
      return sliceByColumn(line, 0, width, true);
    });
    const fullRedraw = this.previousScreen.length === 0 || this.previousScreenWidth !== width || this.previousScreenHeight !== height;
    const changedRows = screen.map((line, row) => line !== this.previousScreen[row]);
    const imageAnchorsNeedRedraw = screen.some((line, row) => changedRows[row] && (isImageLine(line) || isImageLine(this.previousScreen[row] ?? "")));
    const isWezTerm = Boolean(process.env.WEZTERM_PANE) || process.env.TERM_PROGRAM?.toLowerCase() === "wezterm";
    const imageCellsNeedRedraw = !imageAnchorsNeedRedraw && isWezTerm && this.imageProtocol === "kitty" && changedRows.some(Boolean) && screen.some((line, row) => {
      const placementRows = getKittyImagePlacementRows(line);
      if (placementRows === void 0)
        return false;
      for (let coveredRow = row; coveredRow < row + placementRows; coveredRow++) {
        if (changedRows[coveredRow])
          return true;
      }
      return false;
    });
    const imagesNeedRedraw = imageAnchorsNeedRedraw || imageCellsNeedRedraw;
    const redrawImages = fullRedraw || imagesNeedRedraw;
    const hadUploadedKittyImages = this.uploadedKittyImages.size > 0;
    const preparedKittyScreen = redrawImages && this.imageProtocol === "kitty" ? this.prepareKittyScreen(screen) : { lines: screen, evictedImageDeletion: "" };
    let buffer = BEGIN_SYNCHRONIZED_OUTPUT;
    if (fullRedraw) {
      this.fullRedrawCount += 1;
      const clearImages = this.imageProtocol === "kitty" && hadUploadedKittyImages ? deleteAllKittyPlacements() : this.deleteKittyImages();
      buffer += `${clearImages}\x1B[2J`;
    } else if (imagesNeedRedraw) {
      if (this.imageProtocol === "iterm2")
        buffer += "\x1B[2J";
      else if (this.imageProtocol === "kitty")
        buffer += deleteAllKittyPlacements();
    }
    buffer += preparedKittyScreen.evictedImageDeletion;
    const drawKittyImagesLast = redrawImages && this.imageProtocol === "kitty" && screen.some(isImageLine) && isWezTerm;
    if (drawKittyImagesLast) {
      for (let row = 0; row < height; row++) {
        if (!fullRedraw && !imagesNeedRedraw && screen[row] === this.previousScreen[row])
          continue;
        buffer += `\x1B[${row + 1};1H\x1B[2K`;
      }
      for (let row = 0; row < height; row++) {
        if (!fullRedraw && !imagesNeedRedraw && screen[row] === this.previousScreen[row])
          continue;
        if (isImageLine(preparedKittyScreen.lines[row] ?? ""))
          continue;
        buffer += `\x1B[${row + 1};1H${preparedKittyScreen.lines[row] ?? ""}`;
      }
      for (let row = 0; row < height; row++) {
        if (!fullRedraw && !imagesNeedRedraw && screen[row] === this.previousScreen[row])
          continue;
        if (!isImageLine(preparedKittyScreen.lines[row] ?? ""))
          continue;
        buffer += `\x1B[${row + 1};1H${preparedKittyScreen.lines[row] ?? ""}`;
      }
    } else {
      for (let row = 0; row < height; row++) {
        if (!fullRedraw && !imagesNeedRedraw && screen[row] === this.previousScreen[row])
          continue;
        buffer += `\x1B[${row + 1};1H\x1B[2K${preparedKittyScreen.lines[row] ?? ""}`;
      }
    }
    if (cursorPos) {
      buffer += `\x1B[${cursorPos.row + 1};${Math.min(width, cursorPos.col) + 1}H`;
      buffer += this.getShowHardwareCursor() ? "\x1B[?25h" : "\x1B[?25l";
    } else {
      buffer += "\x1B[?25l";
    }
    buffer += END_SYNCHRONIZED_OUTPUT;
    this.terminal.write(buffer);
    this.previousScreen = screen;
    this.previousScreenWidth = width;
    this.previousScreenHeight = height;
    this.currentLayout = nextLayout;
  }
};

// node_modules/@earendil-works/pi-tui/dist/tui-main-screen.js
var MAX_RENDER_WRITE_CHARS = 1024 * 1024;

// src/credits.ts
function creditNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
function creditsToUsd(credits) {
  return credits * 20 / 1500;
}
function chargedCredits(usage) {
  if (usage.billable === false) return 0;
  return usage.billable === true ? creditNumber(usage.credits) : void 0;
}
function applyQoderCredits(usage, raw, provider) {
  if (provider) usage.qoder_provider = provider;
  if ("credits" in raw) usage.credits = creditNumber(raw.credits);
  if ("original_credits" in raw) usage.original_credits = creditNumber(raw.original_credits);
  if ("billable" in raw) usage.billable = typeof raw.billable === "boolean" ? raw.billable : void 0;
  usage.charged_credits = chargedCredits(usage);
  usage.usd_equivalent = usage.charged_credits === void 0 ? void 0 : creditsToUsd(usage.charged_credits);
}

// src/session-usage.ts
function collectSessionUsage(entries) {
  const totals = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    credits: /* @__PURE__ */ new Map()
  };
  const add = (usage, provider) => {
    totals.input += usage.input;
    totals.output += usage.output;
    totals.cacheRead += usage.cacheRead;
    totals.cacheWrite += usage.cacheWrite;
    totals.cost += usage.cost.total;
    const creditUsage = usage;
    const creditProvider = provider ?? creditUsage.qoder_provider;
    if (creditProvider !== "qoder" && creditProvider !== "qoder-cn") return;
    const creditTotals = totals.credits.get(creditProvider) ?? { charged: 0, known: 0, unknown: 0, free: 0 };
    const charged = chargedCredits(creditUsage);
    if (charged === void 0) creditTotals.unknown++;
    else {
      creditTotals.charged += charged;
      creditTotals.known++;
      if (creditUsage.billable === false) creditTotals.free++;
    }
    totals.credits.set(creditProvider, creditTotals);
  };
  for (const entry of entries) {
    if (entry.type === "usage") add(entry.usage, entry.provider);
    else if (entry.type === "message" && entry.message.role === "assistant") {
      add(entry.message.usage, entry.message.provider);
      const usage = entry.message.usage;
      const prompt = usage.input + usage.cacheRead + usage.cacheWrite;
      totals.cacheHitRate = prompt > 0 ? usage.cacheRead / prompt * 100 : void 0;
    } else if (entry.type === "message" && entry.message.role === "toolResult" && entry.message.usage) {
      add(entry.message.usage);
    } else if ((entry.type === "branch_summary" || entry.type === "compaction") && entry.usage) {
      add(entry.usage);
    }
  }
  return totals;
}
var SessionUsageCache = class {
  manager;
  sessionId;
  leafId;
  totals;
  read(manager) {
    const sessionId = manager.getSessionId();
    const leafId = manager.getLeafId();
    if (this.manager !== manager || this.sessionId !== sessionId || this.leafId !== leafId || !this.totals) {
      this.totals = collectSessionUsage(manager.getEntries());
      this.manager = manager;
      this.sessionId = sessionId;
      this.leafId = leafId;
    }
    return this.totals;
  }
};

// src/credit-footer.ts
function qoderMode(provider) {
  return provider === "qoder" ? "global" : provider === "qoder-cn" ? "cn" : void 0;
}
function singleLine(text) {
  return stripTerminalSequences(text).replace(/\p{Cc}|\p{Cf}/gu, " ").replace(/\s+/g, " ").trim();
}
function formatCredits(value) {
  if (value === void 0) return "?";
  if (value > 0 && value < 1e-8) return "<0.00000001";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(value);
}
function bucketText(bucket) {
  const unit = bucket.unit ? singleLine(bucket.unit) : "units unknown";
  return `${formatCredits(bucket.used)} used \xB7 ${formatCredits(bucket.remaining)} left (${unit})`;
}
function quotaSummary(state, provider = "qoder") {
  const name = provider === "qoder-cn" ? "Qoder CN" : "Qoder";
  const suffix = state?.status === "stale" ? " [stale]" : state?.status === "loading" ? " [updating]" : "";
  if (!state?.snapshot) {
    return [`${name} account period: ${state?.status === "loading" ? "loading\u2026" : "quota unavailable"}`];
  }
  const { userQuota, addOnQuota, orgResourcePackage } = state.snapshot;
  const lines = [
    `${name} account period: ${userQuota ? bucketText(userQuota) : "personal quota unavailable"}${suffix}`
  ];
  if (addOnQuota) lines.push(`${name} add-on: ${bucketText(addOnQuota)}${suffix}`);
  if (orgResourcePackage) lines.push(`Organization period: ${bucketText(orgResourcePackage)}${suffix}`);
  return lines;
}
function quotaDetails(state, provider) {
  const lines = quotaSummary(state, provider);
  if (state?.snapshot) {
    for (const [name, bucket] of [
      ["Personal", state.snapshot.userQuota],
      ["Add-on", state.snapshot.addOnQuota],
      ["Organization", state.snapshot.orgResourcePackage]
    ]) {
      if (bucket?.total !== void 0) lines.push(`${name} period allowance: ${formatCredits(bucket.total)}`);
    }
    if (state.snapshot.expiresAt !== void 0) {
      lines.push(`Period expires: ${new Date(state.snapshot.expiresAt).toISOString()}`);
    }
  }
  lines.push("Account-wide period totals, including other Qoder clients; not this session's spend.");
  if (state?.status === "stale") {
    lines.push(
      state.error ? "Refresh failed. Showing the last successful account snapshot." : "Cached account snapshot is older than the refresh interval. Run /qoder-usage to refresh."
    );
  }
  return lines.join("\n");
}
function compact(count) {
  if (count < 1e3) return String(count);
  if (count < 1e4) return `${(count / 1e3).toFixed(1)}k`;
  if (count < 1e6) return `${Math.round(count / 1e3)}k`;
  if (count < 1e7) return `${(count / 1e6).toFixed(1)}M`;
  return `${Math.round(count / 1e6)}M`;
}
function displayPath(cwd) {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return cwd;
  const path = relative(resolve(home), resolve(cwd));
  return path === "" ? "~" : path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path) ? `~${sep}${path}` : cwd;
}
var QODER_STATUS_KEY = "qoder-quota";
function sessionCreditSummary(ctx, totals = collectSessionUsage(ctx.sessionManager.getEntries())) {
  return creditSummary(totals);
}
function creditSummary(totals) {
  const lines = [];
  for (const [provider, total] of totals.credits) {
    const name = provider === "qoder-cn" ? "Qoder CN" : "Qoder";
    const amount = total.known ? formatCredits(total.charged) : "?";
    const notes = [
      total.free ? `${total.free} non-billable` : "",
      total.unknown ? `${total.unknown} unknown` : ""
    ].filter(Boolean);
    const line = `${name} session: ${amount} Credits${notes.length ? ` (${notes.join(", ")})` : ""}`;
    lines.push(line);
  }
  return lines;
}
function renderCreditFooter(ctx, footerData, theme, state, width, totals = collectSessionUsage(ctx.sessionManager.getEntries())) {
  if (width < 1) return [];
  const cacheHitRate = totals.cacheHitRate;
  const branch = footerData.getGitBranch();
  const session = ctx.sessionManager.getSessionName();
  const path = `${displayPath(ctx.cwd)}${branch ? ` (${branch})` : ""}${session ? ` \u2022 ${session}` : ""}`;
  const lines = [truncateToWidth(theme.fg("dim", singleLine(path)), width)];
  const stats = [`\u2191${compact(totals.input)}`, `\u2193${compact(totals.output)}`];
  if (totals.cacheRead) stats.push(`R${compact(totals.cacheRead)}`);
  if (totals.cacheWrite) stats.push(`W${compact(totals.cacheWrite)}`);
  if ((totals.cacheRead || totals.cacheWrite) && cacheHitRate !== void 0)
    stats.push(`CH${cacheHitRate.toFixed(1)}%`);
  if (totals.cost > 0) stats.push(`session $${totals.cost.toFixed(3)}`);
  const context = ctx.getContextUsage();
  const percent = context?.percent;
  const contextText = `${percent == null ? "?" : `${percent.toFixed(1)}%`}/${compact(context?.contextWindow ?? ctx.model?.contextWindow ?? 0)}`;
  stats.push(
    theme.fg(
      percent != null && percent > 90 ? "error" : percent != null && percent > 70 ? "warning" : "dim",
      contextText
    )
  );
  const model = `${footerData.getAvailableProviderCount() > 1 ? `(${ctx.model?.provider}) ` : ""}${ctx.model?.id ?? "no-model"}${ctx.model?.reasoning ? ` \u2022 ${ctx.thinkingLevel ?? "off"}` : ""}`;
  const left = stats.join(" ");
  if (visibleWidth(left) + visibleWidth(model) + 2 <= width) {
    lines.push(
      theme.fg("dim", left + " ".repeat(width - visibleWidth(left) - visibleWidth(model)) + singleLine(model))
    );
  } else {
    lines.push(...wrapTextWithAnsi(theme.fg("dim", left), width));
    lines.push(truncateToWidth(theme.fg("dim", singleLine(model)), width));
  }
  const color = state?.status === "stale" || state?.status === "unavailable" ? "warning" : "accent";
  for (const line of creditSummary(totals)) {
    lines.push(...wrapTextWithAnsi(theme.fg(line.includes("unknown") ? "warning" : "accent", line), width));
  }
  for (const line of quotaSummary(state, ctx.model?.provider)) {
    lines.push(...wrapTextWithAnsi(theme.fg(color, line), width));
  }
  const statuses = [...footerData.getExtensionStatuses()].filter(([key]) => key !== QODER_STATUS_KEY).sort(([a], [b2]) => a.localeCompare(b2)).map(([, text]) => singleLine(text));
  if (statuses.length) lines.push(...wrapTextWithAnsi(theme.fg("dim", statuses.join(" ")), width));
  return lines.map((line) => truncateToWidth(line, width));
}

// src/quota.ts
var UNAVAILABLE = "Qoder quota unavailable";
var DEFAULT_TTL_MS = 3e4;
var DEFAULT_TIMEOUT_MS = 1e4;
var QoderQuotaService = class {
  entries = /* @__PURE__ */ new Map();
  fetchUsage;
  now;
  ttlMs;
  timeoutMs;
  constructor(options = {}) {
    this.fetchUsage = options.fetchUsage ?? fetchQoderUsageForMode;
    this.now = options.now ?? (() => performance.now());
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.ttlMs) || this.ttlMs < 0) throw new Error("Invalid quota cache TTL");
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new Error("Invalid quota fetch timeout");
  }
  read(mode, credentials, force = false) {
    let entry = this.entries.get(mode);
    if (entry && entry.identity !== credentials.access) {
      this.clear(mode);
      entry = void 0;
    }
    if (!entry) {
      entry = { identity: credentials.access, state: { status: "unavailable" } };
      this.entries.set(mode, entry);
    }
    if (!credentials.access) {
      entry.state = { status: "unavailable", error: UNAVAILABLE };
      return Promise.resolve(entry.state);
    }
    if (entry.pending) {
      if (!force) return entry.pending;
      if (!entry.forced) {
        const current = entry;
        const selectedCredentials = { ...credentials };
        entry.forced = entry.pending.then(() => {
          if (this.entries.get(mode) !== current) return current.state;
          return this.read(mode, selectedCredentials, true);
        }).finally(() => {
          current.forced = void 0;
        });
      }
      return entry.forced;
    }
    if (!force && entry.checkedAt !== void 0 && this.now() - entry.checkedAt < this.ttlMs) {
      return Promise.resolve(entry.state);
    }
    entry.state = { snapshot: entry.state.snapshot, updatedAt: entry.state.updatedAt, status: "loading" };
    const controller = new AbortController();
    entry.controller = controller;
    entry.pending = this.refresh(entry, { ...credentials }, mode, controller);
    return entry.pending;
  }
  /** Delay for a one-shot stale-state repaint; this never triggers a request. */
  staleAfterMs(mode) {
    const entry = this.entries.get(mode);
    if (entry?.state.status !== "fresh" || entry.checkedAt === void 0) return void 0;
    return Math.max(0, this.ttlMs - (this.now() - entry.checkedAt));
  }
  /** Current region/account only; peeking never fetches or refreshes credentials. */
  peek(mode) {
    const entry = this.entries.get(mode);
    if (!entry) return void 0;
    if (entry.state.status === "fresh" && entry.checkedAt !== void 0 && this.now() - entry.checkedAt >= this.ttlMs) {
      entry.state = { ...entry.state, status: "stale" };
    }
    return entry.state;
  }
  clear(mode) {
    if (mode === void 0) {
      for (const entry of this.entries.values()) entry.controller?.abort();
      this.entries.clear();
    } else {
      this.entries.get(mode)?.controller?.abort();
      this.entries.delete(mode);
    }
  }
  async refresh(entry, credentials, mode, controller) {
    let rejectAbort = () => {
    };
    const aborted = new Promise((_resolve, reject) => {
      rejectAbort = () => reject(new Error(UNAVAILABLE));
      controller.signal.addEventListener("abort", rejectAbort, { once: true });
    });
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const usage = await Promise.race([
        Promise.resolve().then(() => {
          controller.signal.throwIfAborted();
          return this.fetchUsage(credentials, mode, controller.signal);
        }),
        aborted
      ]);
      const snapshot = normalizeQoderQuotaSnapshot(usage.raw);
      if (!snapshot) throw new Error(UNAVAILABLE);
      entry.state = { snapshot, status: "fresh", updatedAt: this.now() };
    } catch {
      entry.state = {
        snapshot: entry.state.snapshot,
        updatedAt: entry.state.updatedAt,
        status: entry.state.snapshot ? "stale" : "unavailable",
        error: UNAVAILABLE
      };
    } finally {
      clearTimeout(timeout);
      controller.signal.removeEventListener("abort", rejectAbort);
      entry.checkedAt = this.now();
      entry.pending = void 0;
      entry.controller = void 0;
    }
    return entry.state;
  }
};

// src/credit-display.ts
function registerQoderCreditDisplay(pi, service = new QoderQuotaService()) {
  if (typeof pi.registerCommand !== "function") return;
  pi.registerFlag?.("qoder-credit-footer", {
    type: "boolean",
    default: false,
    description: "Opt in to the Qoder account-credit footer (replaces other custom footers)"
  });
  const sessionUsage = new SessionUsageCache();
  let enabled = false;
  let initialized = false;
  let owned = false;
  let latestContext;
  let quota;
  let refreshId = 0;
  let requestRender;
  let expiryTimer;
  async function resolveAccess(ctx) {
    let timer;
    try {
      return await Promise.race([
        ctx.modelRegistry.getApiKeyForProvider(ctx.model?.provider ?? "qoder"),
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Quota authentication unavailable")), 1e4);
          timer.unref?.();
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  function release(ctx) {
    if (!owned) return;
    owned = false;
    ctx.ui.setFooter(void 0);
    requestRender = void 0;
  }
  function syncFooter(ctx) {
    latestContext = ctx;
    if (!enabled || !ctx.hasUI || !qoderMode(ctx.model?.provider)) {
      release(ctx);
      return;
    }
    if (owned || ctx.mode !== "tui" || typeof ctx.ui.setFooter !== "function") return;
    ctx.ui.setFooter((tui, theme, footerData) => {
      owned = true;
      requestRender = () => tui.requestRender();
      const unsubscribe = footerData.onBranchChange(requestRender);
      return {
        invalidate() {
        },
        render: (width) => {
          const current = latestContext ?? ctx;
          return renderCreditFooter(
            current,
            footerData,
            theme,
            quota,
            width,
            sessionUsage.read(current.sessionManager)
          );
        },
        dispose() {
          unsubscribe();
          requestRender = void 0;
          if (owned) enabled = false;
          owned = false;
        }
      };
    });
  }
  function publish(ctx) {
    if (ctx.hasUI) {
      const status = qoderMode(ctx.model?.provider) && !owned ? [
        ...sessionCreditSummary(ctx, sessionUsage.read(ctx.sessionManager)),
        ...quotaSummary(quota, ctx.model?.provider)
      ].join(" \xB7 ") : void 0;
      ctx.ui.setStatus(QODER_STATUS_KEY, status);
    }
    requestRender?.();
  }
  async function refresh(ctx, force = false) {
    const id = ++refreshId;
    clearTimeout(expiryTimer);
    const mode = qoderMode(ctx.model?.provider);
    latestContext = ctx;
    if (!mode || !ctx.hasUI) {
      quota = void 0;
      syncFooter(ctx);
      publish(ctx);
      return;
    }
    quota = { status: "loading" };
    syncFooter(ctx);
    publish(ctx);
    try {
      const access = await resolveAccess(ctx);
      if (id !== refreshId) return;
      if (!access) {
        service.clear(mode);
        quota = { status: "unavailable" };
      } else {
        const pending = service.read(mode, { access, refresh: "", expires: Number.POSITIVE_INFINITY }, force);
        quota = service.peek(mode);
        publish(ctx);
        const result = await pending;
        if (id !== refreshId) return;
        quota = result;
      }
    } catch {
      if (id !== refreshId) return;
      service.clear(mode);
      quota = { status: "unavailable" };
    }
    publish(ctx);
    const delay = service.staleAfterMs?.(mode);
    if (delay !== void 0) {
      expiryTimer = setTimeout(() => {
        if (id !== refreshId) return;
        quota = service.peek(mode);
        publish(ctx);
      }, Math.ceil(delay) + 1);
      expiryTimer.unref?.();
    }
  }
  pi.on("session_start", (_event, ctx) => {
    if (!initialized) {
      enabled = pi.getFlag?.("qoder-credit-footer") === true;
      initialized = true;
    }
    void refresh(ctx);
  });
  pi.on("model_select", (_event, ctx) => {
    void refresh(ctx);
  });
  pi.on("before_agent_start", (_event, ctx) => {
    void refresh(ctx);
  });
  pi.on("agent_end", (_event, ctx) => {
    void refresh(ctx, true);
  });
  pi.on("session_shutdown", (_event, ctx) => {
    ++refreshId;
    clearTimeout(expiryTimer);
    release(ctx);
    service.clear();
  });
  pi.registerCommand("qoder-usage", {
    description: "Refresh account-period quota; footer on/off opts into/out of credit footer",
    handler: async (args, ctx) => {
      const argument = args.trim().toLowerCase();
      if (argument === "footer on" || argument === "footer off") {
        enabled = argument === "footer on";
        if (enabled && (ctx.mode !== "tui" || typeof ctx.ui.setFooter !== "function")) {
          enabled = false;
          ctx.ui.notify(
            "The credit footer requires an interactive pi terminal. /qoder-usage still shows account quota.",
            "warning"
          );
          return;
        }
        syncFooter(ctx);
        publish(ctx);
        ctx.ui.notify(
          enabled ? "Qoder credit footer enabled for this session. This replaces any other custom footer." : "Qoder credit footer disabled.",
          "info"
        );
        if (enabled) await refresh(ctx);
        return;
      }
      if (argument) {
        ctx.ui.notify("Usage: /qoder-usage [footer on|footer off]", "info");
        return;
      }
      if (!qoderMode(ctx.model?.provider)) {
        ctx.ui.notify("Select a qoder or qoder-cn model to inspect its account quota.", "info");
        return;
      }
      const nextRefresh = refreshId + 1;
      await refresh(ctx, true);
      if (refreshId !== nextRefresh) return;
      ctx.ui.notify(
        [
          ...sessionCreditSummary(ctx, sessionUsage.read(ctx.sessionManager)),
          quotaDetails(quota, ctx.model?.provider ?? "qoder")
        ].join("\n"),
        quota?.status === "fresh" ? "info" : "warning"
      );
    }
  });
}

// src/endpoints.ts
import { existsSync as existsSync5, mkdirSync as mkdirSync5, readFileSync as readFileSync5, writeFileSync as writeFileSync5 } from "node:fs";
import { homedir as homedir5 } from "node:os";
import { dirname as dirname5, join as join5 } from "node:path";

// src/protocol/encoding.ts
var qoderCustomAlphabet = "_doRTgHZBKcGVjlvpC,@aFSx#DPuNJme&i*MzLOEn)sUrthbf%Y^w.(kIQyXqWA!";
var qoderStdAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var encodeTable = new Uint8Array(256);
for (let i = 0; i < encodeTable.length; i++) {
  encodeTable[i] = i;
}
for (let i = 0; i < qoderStdAlphabet.length; i++) {
  encodeTable[qoderStdAlphabet.charCodeAt(i)] = qoderCustomAlphabet.charCodeAt(i);
}
encodeTable["=".charCodeAt(0)] = "$".charCodeAt(0);
var decodeTable = new Uint8Array(256);
for (let i = 0; i < decodeTable.length; i++) {
  decodeTable[i] = i;
}
for (let i = 0; i < qoderStdAlphabet.length; i++) {
  decodeTable[qoderCustomAlphabet.charCodeAt(i)] = qoderStdAlphabet.charCodeAt(i);
}
decodeTable["$".charCodeAt(0)] = "=".charCodeAt(0);
function qoderEncodeBody(plaintext) {
  const std = Buffer.isBuffer(plaintext) ? plaintext.toString("base64") : Buffer.from(plaintext).toString("base64");
  const n = std.length;
  const a = Math.floor(n / 3);
  const out = Buffer.allocUnsafe(n);
  let dst = 0;
  for (let i = n - a; i < n; i++) {
    out[dst++] = encodeTable[std.charCodeAt(i)];
  }
  for (let i = a; i < n - a; i++) {
    out[dst++] = encodeTable[std.charCodeAt(i)];
  }
  for (let i = 0; i < a; i++) {
    out[dst++] = encodeTable[std.charCodeAt(i)];
  }
  return out;
}
function qoderDecodeBody(encoded) {
  const src = Buffer.isBuffer(encoded) ? encoded : Buffer.from(encoded, "ascii");
  const n = src.length;
  if (n === 0) return "";
  const a = Math.floor(n / 3);
  const std = Buffer.allocUnsafe(n);
  for (let i = 0; i < a; i++) {
    std[n - a + i] = decodeTable[src[i]];
  }
  for (let i = a; i < n - a; i++) {
    std[i] = decodeTable[src[i]];
  }
  for (let i = n - a; i < n; i++) {
    std[i - (n - a)] = decodeTable[src[i]];
  }
  return Buffer.from(std.toString("latin1"), "base64").toString("utf8");
}

// src/endpoints.ts
var CACHE_VERSION = 1;
var CACHE_TTL_MS = 60 * 60 * 1e3;
var discovered = /* @__PURE__ */ new Map();
function getHomeDir5() {
  return process.env.HOME || process.env.USERPROFILE || homedir5();
}
function getCachePath() {
  return process.env.QODER_ENDPOINTS_CACHE_PATH || join5(getHomeDir5(), ".pi", "agent", "qoder-endpoints-cache.json");
}
function normalizeBaseUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) return void 0;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.endsWith("/") ? withScheme : `${withScheme}/`;
}
function asRecord2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function stringArray(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = normalizeBaseUrl(item);
    if (normalized) out.push(normalized);
  }
  return out;
}
function parseQoderRegionEndpoints(payload) {
  const root = asRecord2(payload);
  if (!root) return void 0;
  const dataNodes = asRecord2(root.dataNodeMap) ?? {};
  const endpoints = {
    inferNodes: stringArray(root.inferNodes),
    remoteAgentNodes: stringArray(dataNodes.remote_agent),
    securityNodes: stringArray(root.security),
    centerNodes: stringArray(root.centerNodes)
  };
  if (endpoints.inferNodes.length === 0 && endpoints.remoteAgentNodes.length === 0 && endpoints.securityNodes.length === 0) {
    return void 0;
  }
  return endpoints;
}
function chatEndpointCandidates(endpoints, fallback) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const push = (url) => {
    if (!url) return;
    const normalized = normalizeBaseUrl(url);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };
  push(fallback);
  for (const url of endpoints?.remoteAgentNodes ?? []) push(url);
  for (const url of endpoints?.inferNodes ?? []) push(url);
  for (const url of endpoints?.securityNodes ?? []) push(url);
  return out;
}
function readCacheFile() {
  const path = getCachePath();
  if (!existsSync5(path)) return { version: CACHE_VERSION, modes: {} };
  try {
    const parsed = JSON.parse(readFileSync5(path, "utf8"));
    const modes = asRecord2(parsed.modes) ?? {};
    const clean = {};
    for (const [key, value] of Object.entries(modes)) {
      const entry = asRecord2(value);
      if (!entry) continue;
      const chatBaseUrl = typeof entry.chatBaseUrl === "string" ? normalizeBaseUrl(entry.chatBaseUrl) : void 0;
      const updatedAt = typeof entry.updatedAt === "number" ? entry.updatedAt : 0;
      if (chatBaseUrl) clean[key] = { chatBaseUrl, updatedAt };
    }
    return { version: CACHE_VERSION, modes: clean };
  } catch {
    return { version: CACHE_VERSION, modes: {} };
  }
}
function writeCacheFile(file) {
  const path = getCachePath();
  try {
    mkdirSync5(dirname5(path), { recursive: true });
    writeFileSync5(path, JSON.stringify({ ...file, version: CACHE_VERSION }, null, 2), { encoding: "utf8", mode: 384 });
  } catch {
  }
}
function getCachedChatBaseUrl(mode, now = Date.now()) {
  const entry = readCacheFile().modes[mode];
  if (!entry) return void 0;
  if (now - entry.updatedAt > CACHE_TTL_MS) return void 0;
  return entry.chatBaseUrl;
}
function rememberChatBaseUrl(mode, chatBaseUrl, now = Date.now()) {
  const normalized = normalizeBaseUrl(chatBaseUrl);
  if (!normalized) return;
  const file = readCacheFile();
  file.modes[mode] = { chatBaseUrl: normalized, updatedAt: now };
  writeCacheFile(file);
}
function applyCachedChatEndpoint(mode) {
  const cached = getCachedChatBaseUrl(mode);
  if (!cached) return void 0;
  setQoderChatBaseUrl(mode, cached);
  return cached;
}
function getRegionEndpointsURL(mode) {
  return `${getQoderRegionConfig(mode).centerUrl}/algo/api/v3/service/region/endpoints`;
}
async function fetchQoderRegionEndpoints(mode, credentials) {
  const url = getRegionEndpointsURL(mode);
  try {
    const headers = buildAuthHeaders(null, url, {
      userID: credentials.userID,
      authToken: credentials.authToken,
      name: credentials.name ?? "",
      email: credentials.email ?? "",
      machineID: credentials.machineID
    });
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", ...headers }
    });
    if (!response.ok) return void 0;
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = JSON.parse(qoderDecodeBody(text));
    }
    return parseQoderRegionEndpoints(payload);
  } catch {
    return void 0;
  }
}
async function getRegionEndpoints(mode, credentials) {
  const cached = discovered.get(mode);
  if (cached && Date.now() - cached.at <= CACHE_TTL_MS) return cached.endpoints;
  const endpoints = await fetchQoderRegionEndpoints(mode, credentials);
  if (!endpoints) return cached?.endpoints;
  discovered.set(mode, { at: Date.now(), endpoints });
  return endpoints;
}
async function refreshChatEndpoint(mode, credentials) {
  if (!credentials?.authToken) return void 0;
  const endpoints = await getRegionEndpoints(mode, credentials);
  if (!endpoints) return void 0;
  const candidates = chatEndpointCandidates(endpoints, getQoderBaseUrl(mode));
  const preferred = candidates.find((url) => endpoints.remoteAgentNodes.includes(url)) ?? candidates[0];
  if (!preferred) return void 0;
  setQoderChatBaseUrl(mode, preferred);
  rememberChatBaseUrl(mode, preferred);
  return preferred;
}
async function rotateChatEndpoint(mode, credentials, attempted) {
  const current = normalizeBaseUrl(getQoderChatBaseUrl(mode));
  if (current) attempted.add(current);
  const endpoints = credentials ? await getRegionEndpoints(mode, credentials) : void 0;
  const candidates = chatEndpointCandidates(endpoints, getQoderBaseUrl(mode));
  const next = candidates.find((url) => !attempted.has(url));
  if (!next) return void 0;
  attempted.add(next);
  setQoderChatBaseUrl(mode, next);
  return next;
}

// src/protocol/stream.ts
import crypto3 from "node:crypto";
import * as PiAi from "@earendil-works/pi-ai";
import {
  clampThinkingLevel
} from "@earendil-works/pi-ai";

// src/protocol/thinking.ts
var THINKING_TAG_VARIANTS = [
  { open: "<thinking>", close: "</thinking>" },
  { open: "<think>", close: "</think>" },
  { open: "<reasoning>", close: "</reasoning>" },
  { open: "<thought>", close: "</thought>" }
];
var ALL_THINKING_TAGS = THINKING_TAG_VARIANTS.flatMap((variant) => [variant.open, variant.close]);
function getTrailingPossibleTagPrefixLength(text, tag) {
  const maxPrefixLength = Math.min(text.length, tag.length - 1);
  for (let len = maxPrefixLength; len > 0; len--) {
    if (text.endsWith(tag.slice(0, len))) return len;
  }
  return 0;
}
function getMaxTrailingPossibleTagPrefixLength(text, tags) {
  let maxLength = 0;
  for (const tag of tags) {
    maxLength = Math.max(maxLength, getTrailingPossibleTagPrefixLength(text, tag));
  }
  return maxLength;
}
function stripThinkingTags(text) {
  let out = text;
  for (const { open, close } of THINKING_TAG_VARIANTS) {
    if (open.length > 0 && out.includes(open)) out = out.split(open).join("");
    if (close.length > 0 && out.includes(close)) out = out.split(close).join("");
  }
  return out;
}
var DSML_TAG = /<\/?[\uFF5C|]{0,2}\s*DSML\s*[\uFF5C|]{0,2}[^>]*>|<\/?(?:invoke|invocation|parameter|function_call|function_calls)\b[^>]*>/g;
var DEGENERATE_DSML_TAIL = /(?:(?:<\/?(?:invoke|invocation|parameter|function_call|function_calls)\b[^>]*>)\s*|(?:<\/?[\uFF5C|]{0,2}\s*DSML\s*[\uFF5C|]{0,2}[^>]*>)\s*){2,}$/;
function stripDsmlResidue(text) {
  return text.replace(DSML_TAG, "").replace(/\n{3,}/g, "\n\n");
}
function isDegenerateDsmlTurn(message, rawReasoning) {
  if (message.stopReason === "toolUse") return false;
  const content = Array.isArray(message.content) ? message.content : [];
  if (content.some((block) => block.type === "text" && block.text.trim().length > 0)) return false;
  return DEGENERATE_DSML_TAIL.test(rawReasoning);
}
var ThinkingTagParser = class {
  constructor(output, stream) {
    this.output = output;
    this.stream = stream;
  }
  output;
  stream;
  textBuffer = "";
  inThinking = false;
  thinkingExtracted = false;
  thinkingBlockIndex = null;
  textBlockIndex = null;
  lastTextBlockIndex = null;
  activeEndTag = THINKING_TAG_VARIANTS[0].close;
  processChunk(chunk) {
    this.textBuffer += chunk;
    while (this.textBuffer.length > 0) {
      const prevLength = this.textBuffer.length;
      if (!this.inThinking && !this.thinkingExtracted) {
        this.processBeforeThinking();
        if (this.textBuffer.length === 0) break;
      }
      if (this.inThinking) {
        this.processInsideThinking();
        if (this.textBuffer.length === 0) break;
      }
      if (this.thinkingExtracted) {
        this.processAfterThinking();
        break;
      }
      if (this.textBuffer.length >= prevLength) break;
    }
  }
  finalize() {
    if (this.textBuffer.length === 0) return;
    if (this.inThinking && this.thinkingBlockIndex !== null) {
      const block = this.output.content[this.thinkingBlockIndex];
      block.thinking += this.textBuffer;
      this.stream.push({
        type: "thinking_delta",
        contentIndex: this.thinkingBlockIndex,
        delta: this.textBuffer,
        partial: this.output
      });
      this.stream.push({
        type: "thinking_end",
        contentIndex: this.thinkingBlockIndex,
        content: block.thinking,
        partial: this.output
      });
    } else {
      this.emitText(this.textBuffer);
    }
    this.textBuffer = "";
  }
  getTextBlockIndex() {
    return this.textBlockIndex ?? this.lastTextBlockIndex;
  }
  processBeforeThinking() {
    let bestOpenPos = -1;
    let bestOpenVariant = null;
    let bestClosePos = -1;
    let bestCloseVariant = null;
    for (const variant of THINKING_TAG_VARIANTS) {
      const openPos = this.textBuffer.indexOf(variant.open);
      if (openPos !== -1 && (bestOpenPos === -1 || openPos < bestOpenPos)) {
        bestOpenPos = openPos;
        bestOpenVariant = variant;
      }
      const closePos = this.textBuffer.indexOf(variant.close);
      if (closePos !== -1 && (bestClosePos === -1 || closePos < bestClosePos)) {
        bestClosePos = closePos;
        bestCloseVariant = variant;
      }
    }
    if (bestOpenVariant !== null && (bestCloseVariant === null || bestOpenPos < bestClosePos)) {
      if (bestOpenPos > 0) this.emitText(this.textBuffer.slice(0, bestOpenPos));
      this.textBuffer = this.textBuffer.slice(bestOpenPos + bestOpenVariant.open.length);
      this.activeEndTag = bestOpenVariant.close;
      this.inThinking = true;
      return;
    }
    if (bestCloseVariant !== null) {
      if (bestClosePos > 0) this.emitText(this.textBuffer.slice(0, bestClosePos));
      this.textBuffer = this.textBuffer.slice(bestClosePos + bestCloseVariant.close.length);
      if (this.textBuffer.startsWith("\n\n")) this.textBuffer = this.textBuffer.slice(2);
      else if (this.textBuffer.startsWith("\n")) this.textBuffer = this.textBuffer.slice(1);
      return;
    }
    const trailingPrefixLength = getMaxTrailingPossibleTagPrefixLength(this.textBuffer, ALL_THINKING_TAGS);
    const safeLen = this.textBuffer.length - trailingPrefixLength;
    if (safeLen > 0) {
      this.emitText(this.textBuffer.slice(0, safeLen));
      this.textBuffer = this.textBuffer.slice(safeLen);
    }
  }
  processInsideThinking() {
    const endPos = this.textBuffer.indexOf(this.activeEndTag);
    if (endPos !== -1) {
      if (endPos > 0) this.emitThinking(this.textBuffer.slice(0, endPos));
      if (this.thinkingBlockIndex !== null) {
        const block = this.output.content[this.thinkingBlockIndex];
        this.stream.push({
          type: "thinking_end",
          contentIndex: this.thinkingBlockIndex,
          content: block.thinking,
          partial: this.output
        });
      }
      this.textBuffer = this.textBuffer.slice(endPos + this.activeEndTag.length);
      this.inThinking = false;
      this.thinkingExtracted = true;
      this.lastTextBlockIndex = this.textBlockIndex;
      this.textBlockIndex = null;
      if (this.textBuffer.startsWith("\n\n")) this.textBuffer = this.textBuffer.slice(2);
      return;
    }
    const trailingPrefixLength = getTrailingPossibleTagPrefixLength(this.textBuffer, this.activeEndTag);
    const safeLen = this.textBuffer.length - trailingPrefixLength;
    if (safeLen > 0) {
      this.emitThinking(this.textBuffer.slice(0, safeLen));
      this.textBuffer = this.textBuffer.slice(safeLen);
    }
  }
  processAfterThinking() {
    this.emitText(this.textBuffer);
    this.textBuffer = "";
  }
  emitText(text) {
    if (!text) return;
    if (this.textBlockIndex === null) {
      this.textBlockIndex = this.output.content.length;
      this.output.content.push({ type: "text", text: "" });
      this.stream.push({ type: "text_start", contentIndex: this.textBlockIndex, partial: this.output });
    }
    const block = this.output.content[this.textBlockIndex];
    block.text += text;
    this.stream.push({ type: "text_delta", contentIndex: this.textBlockIndex, delta: text, partial: this.output });
  }
  emitThinking(thinking) {
    if (!thinking) return;
    if (this.thinkingBlockIndex === null) {
      if (this.textBlockIndex !== null) {
        this.thinkingBlockIndex = this.textBlockIndex;
        this.output.content.splice(this.thinkingBlockIndex, 0, { type: "thinking", thinking: "" });
        this.textBlockIndex = this.textBlockIndex + 1;
      } else {
        this.thinkingBlockIndex = this.output.content.length;
        this.output.content.push({ type: "thinking", thinking: "" });
      }
      this.stream.push({ type: "thinking_start", contentIndex: this.thinkingBlockIndex, partial: this.output });
    }
    const block = this.output.content[this.thinkingBlockIndex];
    block.thinking += thinking;
    this.stream.push({
      type: "thinking_delta",
      contentIndex: this.thinkingBlockIndex,
      delta: thinking,
      partial: this.output
    });
  }
};

// src/protocol/tool-call-id.ts
import { createHash } from "node:crypto";
var VALID_WIRE_ID = /^[a-zA-Z0-9_-]{1,64}$/;
var RESERVED_WIRE_ID = /^qtc_[0-9a-f]{60}$/;
function digestToolCallId(original) {
  return `qtc_${createHash("sha256").update("qoder-tool-call-id:v1\0").update(original).digest("hex").slice(0, 60)}`;
}
function createQoderToolCallIdMapper(digest = digestToolCallId) {
  const byOriginal = /* @__PURE__ */ new Map();
  const byWire = /* @__PURE__ */ new Map();
  return (original) => {
    if (typeof original !== "string" || original.length === 0) {
      throw new Error("Qoder tool call ID must be a non-empty string");
    }
    const cached = byOriginal.get(original);
    if (cached !== void 0) return cached;
    const wireId = VALID_WIRE_ID.test(original) && !RESERVED_WIRE_ID.test(original) ? original : digest(original);
    const owner = byWire.get(wireId);
    if (owner !== void 0 && owner !== original) {
      throw new Error("Qoder tool call ID mapping collision");
    }
    byOriginal.set(original, wireId);
    byWire.set(wireId, original);
    return wireId;
  };
}

// src/protocol/transform.ts
function getContentText(msg) {
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content.map((c) => {
      if (c.type === "text") return c.text;
      if (c.type === "thinking") return c.thinking;
      return "";
    }).join("");
  }
  return "";
}
function getContentImages(msg) {
  if (!Array.isArray(msg.content)) return [];
  return msg.content.filter((c) => c.type === "image");
}
function transformTools(tools) {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }));
}
function transformMessagesForQoder(messages) {
  const normalizedMessages = [];
  const mapToolCallId = createQoderToolCallIdMapper();
  const droppedToolCallIds = /* @__PURE__ */ new Set();
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "assistant" && (msg.stopReason === "error" || msg.stopReason === "aborted")) {
      const am = msg;
      if (Array.isArray(am.content)) {
        for (const block of am.content) {
          if (block.type === "toolCall") {
            const id = block.id;
            if (id) droppedToolCallIds.add(id);
          }
        }
      }
      continue;
    }
    if (msg.role === "user") {
      let content = "";
      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        const hasImage = msg.content.some((c) => c.type === "image");
        if (hasImage) {
          content = msg.content.map((c) => {
            if (c.type === "text") {
              return { type: "text", text: c.text };
            }
            if (c.type === "image") {
              const img = c;
              return {
                type: "image_url",
                image_url: {
                  url: `data:${img.mimeType};base64,${img.data}`
                }
              };
            }
            return null;
          }).filter((p) => p !== null);
        } else {
          content = getContentText(msg);
        }
      }
      normalizedMessages.push({
        role: "user",
        content
      });
    } else if (msg.role === "assistant") {
      const am = msg;
      let content = "";
      let reasoningContent = "";
      const toolCalls = [];
      if (Array.isArray(am.content)) {
        for (const block of am.content) {
          if (block.type === "text") {
            content += block.text;
          } else if (block.type === "thinking") {
            reasoningContent += stripDsmlResidue(block.thinking);
          } else if (block.type === "toolCall") {
            const tc = block;
            toolCalls.push({
              id: mapToolCallId(tc.id),
              type: "function",
              function: {
                name: tc.name,
                arguments: typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments)
              }
            });
          }
        }
      } else {
        content = am.content || "";
      }
      const mapped = {
        role: "assistant",
        content: content || (toolCalls.length > 0 || reasoningContent ? " " : null)
      };
      if (reasoningContent) {
        mapped.reasoning_content = reasoningContent;
      }
      if (toolCalls.length > 0) {
        mapped.tool_calls = toolCalls;
      }
      normalizedMessages.push(mapped);
    } else if (msg.role === "toolResult") {
      const imageBlocks = [];
      let j2 = i;
      for (; j2 < messages.length; j2++) {
        const trMsg = messages[j2];
        if (trMsg.role !== "toolResult") break;
        const tr = trMsg;
        if (droppedToolCallIds.has(tr.toolCallId)) continue;
        normalizedMessages.push({
          role: "tool",
          tool_call_id: mapToolCallId(tr.toolCallId),
          content: getContentText(tr)
        });
        for (const img of getContentImages(tr)) {
          imageBlocks.push({
            type: "image_url",
            image_url: { url: `data:${img.mimeType};base64,${img.data}` }
          });
        }
      }
      i = j2 - 1;
      if (imageBlocks.length > 0) {
        normalizedMessages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: `[${imageBlocks.length} image${imageBlocks.length === 1 ? "" : "s"} returned by the previous tool call]`
            },
            ...imageBlocks
          ]
        });
      }
    }
  }
  return normalizedMessages;
}

// src/protocol/stream.ts
var MODEL_BUSY_CODE = "10605";
var DEFAULT_MODEL_BUSY_RETRIES = 2;
var MAX_MODEL_BUSY_RETRIES = 10;
var MODEL_BUSY_MAX_WAIT_MS = 5e3;
var DAILY_CHAT_LIMIT_CODE = "110";
var MAX_CHAT_ENDPOINT_SWITCHES = 3;
var QoderDailyChatLimitError = class extends Error {
  constructor(message, sawModelOutput = false) {
    super(message);
    this.sawModelOutput = sawModelOutput;
    this.name = "QoderDailyChatLimitError";
  }
  sawModelOutput;
};
var QoderModelBusyError = class extends Error {
  constructor(message, retryAfterMs, sawModelOutput = false) {
    super(message);
    this.retryAfterMs = retryAfterMs;
    this.sawModelOutput = sawModelOutput;
    this.name = "QoderModelBusyError";
  }
  retryAfterMs;
  sawModelOutput;
};
function parseJsonObject(value, depth = 0) {
  if (depth > 4) return void 0;
  if (typeof value === "string") {
    try {
      return parseJsonObject(JSON.parse(value), depth + 1);
    } catch {
      return void 0;
    }
  }
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function isDailyChatLimitRejection(body) {
  const root = parseJsonObject(body);
  if (!root) return false;
  const code = root.code;
  return code === DAILY_CHAT_LIMIT_CODE || code === Number(DAILY_CHAT_LIMIT_CODE);
}
function parseModelBusyRejection(body) {
  const outer = parseJsonObject(body);
  const busy = parseJsonObject(outer?.message);
  if (busy?.code !== MODEL_BUSY_CODE) return void 0;
  const queue = parseJsonObject(busy.message);
  if (!queue) return void 0;
  if (queue.serviceAvailable !== true) return void 0;
  const seconds = (value) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
    const milliseconds = Math.round(value * 1e3);
    return Number.isSafeInteger(milliseconds) && milliseconds > 0 ? milliseconds : 0;
  };
  if (queue.isQueued === false) {
    return { kind: "ready", retryAfterMs: seconds(queue.retryAfterSeconds) };
  }
  if (queue.isQueued === true) {
    const waitMs = seconds(queue.waitTime) || seconds(queue.retryAfterSeconds);
    const queueCount = typeof queue.queueCount === "number" ? queue.queueCount : void 0;
    const queueType = typeof queue.queueType === "string" ? queue.queueType : void 0;
    return { kind: "queued", waitMs, queueCount, queueType };
  }
  return void 0;
}
function formatQueuedBusyError(snapshot) {
  const waitSeconds = Math.round(snapshot.waitMs / 1e3);
  const ahead = snapshot.queueCount !== void 0 ? `, ${snapshot.queueCount} ahead` : "";
  const tier = snapshot.queueType ? ` (${snapshot.queueType})` : "";
  return new Error(
    `Qoder model is busy: request queued (10605 CALL_COUNT_LIMIT${tier}${ahead}, ~${waitSeconds}s wait, rate limit, retry-after-ms=${snapshot.waitMs})`
  );
}
function sleepWithAbort(ms, signal) {
  if (signal?.aborted) return Promise.reject(new Error("Aborted"));
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve2, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve2();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
function refreshToolIndexes(output, toolCalls) {
  const lastToolState = toolCalls.lastToolState;
  if (!lastToolState || output.content[lastToolState.contentIndex] === lastToolState.block) return;
  for (let index = 0; index < output.content.length; index++) {
    const block = output.content[index];
    if (block.type !== "toolCall") continue;
    const state = toolCalls.statesByBlock.get(block);
    if (state) state.contentIndex = index;
  }
}
function retireCompleteCandidates(toolCalls, candidates) {
  for (const state of candidates.complete) {
    parseToolArguments(state);
    candidates.states.delete(state);
    state.candidates.delete(candidates);
    if (state.candidates.size === 0 && !state.unindexed) toolCalls.unscopedCandidates.delete(state);
  }
  candidates.complete.clear();
  candidates.unique = candidates.states.size === 1 ? candidates.states.values().next().value : void 0;
}
var TOOL_ARGUMENT_STRUCTURE = /["\\{}[\]]/g;
var NON_JSON_WHITESPACE = /[^ \t\r\n]/;
var UnusableToolCallError = class extends Error {
};
function invalidToolArguments(state) {
  return new UnusableToolCallError(`Invalid or incomplete tool-call JSON (characters=${state.argumentLength})`);
}
function lostToolArgumentStream() {
  return new Error("Qoder server error: tool-call argument stream was cut off (unparseable upstream payload)");
}
function appendToolArguments(state, fragment) {
  state.argumentChunks.push(fragment);
  state.argumentLength += fragment.length;
  if (state.complete) {
    if (NON_JSON_WHITESPACE.test(fragment)) throw invalidToolArguments(state);
    return;
  }
  let start = 0;
  if (state.objectRoot === void 0) {
    start = fragment.search(NON_JSON_WHITESPACE);
    if (start === -1) return;
    state.objectRoot = fragment[start] === "{";
  }
  if (!state.objectRoot) return;
  if (state.escaped) {
    start = 1;
    state.escaped = false;
  }
  TOOL_ARGUMENT_STRUCTURE.lastIndex = start;
  while (true) {
    const match = TOOL_ARGUMENT_STRUCTURE.exec(fragment);
    if (!match) break;
    const character = match[0];
    if (state.inString) {
      if (character === "\\") {
        if (TOOL_ARGUMENT_STRUCTURE.lastIndex === fragment.length) state.escaped = true;
        else TOOL_ARGUMENT_STRUCTURE.lastIndex++;
      } else if (character === '"') {
        state.inString = false;
      }
    } else if (character === '"') {
      state.inString = true;
    } else if (character === "{" || character === "[") {
      state.depth++;
    } else if (character === "}" || character === "]") {
      state.depth--;
      if (state.depth === 0) {
        state.complete = true;
        if (NON_JSON_WHITESPACE.test(fragment.slice(TOOL_ARGUMENT_STRUCTURE.lastIndex))) {
          throw invalidToolArguments(state);
        }
        return;
      }
    }
  }
}
function parseToolArguments(state) {
  if (state.parsedArguments) return state.parsedArguments;
  let args = {};
  if (state.argumentLength > 0) {
    try {
      args = JSON.parse(state.argumentChunks.join(""));
    } catch {
      throw invalidToolArguments(state);
    }
  }
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    throw new UnusableToolCallError(`Non-object tool-call arguments (characters=${state.argumentLength})`);
  }
  state.parsedArguments = args;
  return state.parsedArguments;
}
function stableHash(prefix, ...inputs) {
  const hash = crypto3.createHash("sha256");
  hash.update(prefix);
  for (const input of inputs) {
    hash.update("\0");
    hash.update(input);
  }
  return hash.digest("hex").slice(0, 16);
}
function stableChatRecordID(model, messages, tools, maxTokens) {
  const hash = crypto3.createHash("sha256");
  hash.update("qoder-record");
  hash.update("\0");
  hash.update(model);
  for (const msg of messages) {
    if (msg?.role) {
      hash.update("\0");
      hash.update(msg.role);
    }
    if (msg?.content) {
      hash.update("\0");
      hash.update(typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content));
    }
  }
  if (tools) {
    hash.update("\0");
    hash.update(JSON.stringify(tools));
  }
  hash.update("\0");
  hash.update(`mt=${maxTokens}`);
  return hash.digest("hex").slice(0, 16);
}
function contentToText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) return part.text;
      return "";
    }).join("\n");
  }
  return "";
}
function resolveRequestContext(piAi, context) {
  const {
    collapseSystemMessages,
    getCurrentTools,
    getInitialSystemMessage,
    getSystemMessageText,
    withoutInitialSystemMessage
  } = piAi;
  const hasTranscript = typeof collapseSystemMessages === "function" && typeof getCurrentTools === "function" && typeof getInitialSystemMessage === "function" && typeof getSystemMessageText === "function" && typeof withoutInitialSystemMessage === "function";
  if (!hasTranscript) {
    return {
      messages: context.messages,
      systemText: contentToText(context.systemPrompt || ""),
      tools: context.tools ?? []
    };
  }
  const collapsed = collapseSystemMessages(context);
  const transcriptMessages = collapsed.messages;
  const initialSystem = getInitialSystemMessage(transcriptMessages);
  if (!initialSystem) {
    return {
      messages: context.messages,
      systemText: contentToText(context.systemPrompt || ""),
      tools: context.tools ?? []
    };
  }
  const tools = getCurrentTools(transcriptMessages);
  const systemText = contentToText(getSystemMessageText?.(initialSystem) ?? context.systemPrompt ?? "");
  const messages = withoutInitialSystemMessage(transcriptMessages);
  return { messages, systemText, tools };
}
function streamQoder(model, context, options) {
  const StreamCtor = PiAi.AssistantMessageEventStream;
  const stream = new StreamCtor();
  const output = {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
    },
    stopReason: "stop",
    timestamp: Date.now()
  };
  let droppedPayloads = 0;
  (async () => {
    try {
      const providerMode = model.provider === "qoder-cn" ? "cn" : "global";
      const region = getQoderRegionConfig(providerMode);
      const accessToken = options?.apiKey;
      if (!accessToken) {
        throw new Error(
          providerMode === "cn" ? "Qoder CN credentials not set. Run /login qoder-cn or set QODERCN_PERSONAL_ACCESS_TOKEN." : "Qoder credentials not set. Run /login qoder or set QODER_PERSONAL_ACCESS_TOKEN."
        );
      }
      const ident = await resolveQoderIdentity(accessToken, model.provider, providerMode);
      const userID = ident.userID || "qoder-user";
      const name = ident.name || region.userNameFallback;
      const email = ident.email || region.userEmailFallback;
      const machineID = ident.machineID || getMachineId();
      const modelConfig = getCachedModelConfig(model.id, providerMode);
      if (!modelConfig?.key) {
        throw new Error(`Unknown Qoder model id: ${model.id}`);
      }
      const qoderModel = modelConfig.key;
      const isReasoning = !!modelConfig.is_reasoning;
      const resolved = resolveRequestContext(PiAi, context);
      const normalizedMessages = transformMessagesForQoder(resolved.messages);
      const systemText = resolved.systemText;
      let lastUserText = "";
      for (let i = normalizedMessages.length - 1; i >= 0; i--) {
        if (normalizedMessages[i].role === "user") {
          const content = normalizedMessages[i].content;
          lastUserText = typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => "text" in c ? c.text : "").join("") : "";
          break;
        }
      }
      const stablePart = stableHash("qoder-session", userID, qoderModel);
      const sessionID = options?.sessionId ? `${stablePart}-${options.sessionId}` : `${stablePart}-${crypto3.randomUUID()}`;
      let maxTokens = MAX_OUTPUT_TOKENS;
      if (options?.maxTokens && options.maxTokens < maxTokens) {
        maxTokens = options.maxTokens;
      }
      const toolsRaw = resolved.tools.length > 0 ? transformTools(resolved.tools) : void 0;
      const recordID = stableChatRecordID(qoderModel, normalizedMessages, toolsRaw, maxTokens);
      const requestedLevel = options?.reasoning;
      const extOptions = options;
      const explicitlyOff = extOptions?.disableReasoning === true || extOptions?.forceReasoningOff === true || requestedLevel === false || requestedLevel === "off";
      const clamped = !explicitlyOff && requestedLevel ? clampThinkingLevel(model, requestedLevel) : void 0;
      const reasoningLevel = clamped === "off" ? void 0 : clamped;
      const parameters = { max_tokens: maxTokens };
      if (reasoningLevel) {
        parameters.enable_thinking = true;
        const mapped = model.thinkingLevelMap?.[reasoningLevel];
        const effort = mapped && mapped !== "enabled" && mapped !== "disabled" ? mapped : reasoningLevel;
        if (modelConfig?.thinking_config?.enabled?.efforts && typeof effort === "string") {
          parameters.reasoning_effort = effort;
        }
      } else {
        parameters.enable_thinking = false;
        const tc = modelConfig?.thinking_config;
        const lacksDisabledBranch = tc?.enabled?.efforts && !tc.disabled || model.thinkingLevelMap?.off === null;
        if (!lacksDisabledBranch) {
          parameters.reasoning_effort = "none";
        }
      }
      const reqBody = {
        request_id: crypto3.randomUUID(),
        request_set_id: recordID,
        chat_record_id: recordID,
        session_id: sessionID,
        stream: true,
        chat_task: "FREE_INPUT",
        is_reply: true,
        is_retry: false,
        source: 1,
        version: "3",
        session_type: "qodercli",
        agent_id: "agent_common",
        task_id: "common",
        code_language: "",
        chat_prompt: "",
        image_urls: null,
        aliyun_user_type: "",
        // Qoder's server ignores the top-level `system` field (verified: the
        // model never sees it). Inject the system prompt as a leading
        // role:system message instead, which the server does honor.
        system: "",
        messages: systemText ? [{ role: "system", content: systemText }, ...normalizedMessages] : normalizedMessages,
        tools: toolsRaw || [],
        parameters,
        chat_context: {
          chatPrompt: "",
          imageUrls: null,
          extra: {
            context: [],
            modelConfig: {
              key: qoderModel,
              is_reasoning: reasoningLevel ? isReasoning : false
            },
            originalContent: lastUserText
          },
          features: [],
          text: lastUserText
        },
        model_config: reasoningLevel ? modelConfig : { ...modelConfig, is_reasoning: false },
        business: {
          product: "cli",
          version: "1.0.0",
          type: "agent",
          stage: "start",
          id: crypto3.randomUUID(),
          name: lastUserText.substring(0, 30),
          begin_at: Date.now()
        }
      };
      let chatURL = getQoderChatURL(providerMode);
      const attemptedChatBases = /* @__PURE__ */ new Set();
      let switchedChatEndpoint = false;
      let chatEndpointSwitches = 0;
      const modelSource = modelConfig.source || "system";
      const requestedRetries = options?.maxRetries;
      const modelBusyRetries = Math.min(
        Math.max(
          0,
          typeof requestedRetries === "number" && Number.isFinite(requestedRetries) ? Math.floor(requestedRetries) : DEFAULT_MODEL_BUSY_RETRIES
        ),
        MAX_MODEL_BUSY_RETRIES
      );
      const requestedMaxWaitMs = options?.maxRetryDelayMs;
      const modelBusyMaxWaitMs = typeof requestedMaxWaitMs === "number" && Number.isFinite(requestedMaxWaitMs) && requestedMaxWaitMs > 0 ? Math.min(MODEL_BUSY_MAX_WAIT_MS, requestedMaxWaitMs) : MODEL_BUSY_MAX_WAIT_MS;
      let encodedBytes = qoderEncodeBody(Buffer.from(JSON.stringify(reqBody)));
      let headers = buildAuthHeaders(encodedBytes, chatURL, {
        userID,
        authToken: accessToken,
        name,
        email,
        machineID
      });
      const thinkingEnabled = options?.reasoning !== false && options?.reasoning !== "off";
      stream.push({ type: "start", partial: output });
      const runAttempt = async () => {
        options?.signal?.throwIfAborted();
        output.stopReason = "stop";
        output.errorMessage = void 0;
        output.responseId = void 0;
        output.responseModel = void 0;
        output.usage = {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
        };
        const response = await fetch(chatURL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            "Cache-Control": "no-cache",
            "Accept-Encoding": "identity",
            "X-Model-Key": qoderModel,
            "X-Model-Source": modelSource,
            ...headers
          },
          body: encodedBytes,
          signal: options?.signal
        });
        if (!response.ok) {
          const errText = await response.text();
          if (isDailyChatLimitRejection(errText)) {
            throw new QoderDailyChatLimitError(`Upstream status ${response.status}: ${errText}`, false);
          }
          throw new Error(`Qoder API request failed: ${response.status} ${response.statusText}. Response: ${errText}`);
        }
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");
        const decoder = new TextDecoder();
        let buffer = "";
        let bufferStart = 0;
        let contentBlockIndex = -1;
        let thinkingBlockIndex = -1;
        let rawReasoningTail = "";
        let toolCalls;
        const thinkingParser = thinkingEnabled ? new ThinkingTagParser(output, stream) : null;
        let sawModelOutput = false;
        droppedPayloads = 0;
        let sawDone = false;
        try {
          while (!sawDone) {
            const { done, value } = await reader.read();
            if (done) break;
            if (bufferStart > 0) {
              buffer = buffer.substring(bufferStart);
              bufferStart = 0;
            }
            buffer += decoder.decode(value, { stream: true });
            while (true) {
              const lineEnd = buffer.indexOf("\n", bufferStart);
              if (lineEnd === -1) break;
              const line = buffer.substring(bufferStart, lineEnd).trim();
              bufferStart = lineEnd + 1;
              if (!line.startsWith("data:")) continue;
              const dataStr = line.substring(5).trim();
              if (dataStr === "[DONE]") {
                sawDone = true;
                break;
              }
              let parsePhase = "envelope";
              try {
                const envelope = JSON.parse(dataStr);
                if (envelope.statusCodeValue && envelope.statusCodeValue !== 200) {
                  const busy = parseModelBusyRejection(envelope.body);
                  if (busy?.kind === "ready") {
                    throw new QoderModelBusyError(
                      `Upstream status ${envelope.statusCodeValue}: ${envelope.body}`,
                      busy.retryAfterMs,
                      sawModelOutput
                    );
                  }
                  if (busy?.kind === "queued") {
                    if (sawModelOutput) {
                      throw new Error("Qoder model rejected the request after partial output (10605 RESOURCE_LIMIT)");
                    }
                    throw formatQueuedBusyError(busy);
                  }
                  if (isDailyChatLimitRejection(envelope.body)) {
                    throw new QoderDailyChatLimitError(
                      `Upstream status ${envelope.statusCodeValue}: ${envelope.body}`,
                      sawModelOutput
                    );
                  }
                  throw new Error(`Upstream status ${envelope.statusCodeValue}: ${envelope.body}`);
                }
                const innerStr = envelope.body;
                if (innerStr === "[DONE]") {
                  sawDone = true;
                  break;
                }
                if (!innerStr) continue;
                parsePhase = "payload";
                const inner = JSON.parse(innerStr);
                if (inner.id) output.responseId = inner.id;
                if (inner.model) output.responseModel = inner.model;
                if (inner.usage) {
                  applyQoderCredits(output.usage, inner.usage, model.provider === "qoder-cn" ? "qoder-cn" : "qoder");
                  const u = inner.usage;
                  const promptTokens = u.prompt_tokens ?? 0;
                  const cacheReadTokens = u.prompt_tokens_details?.cached_tokens ?? 0;
                  const cacheWriteTokens = u.prompt_tokens_details?.cache_write_tokens ?? 0;
                  output.usage.input = Math.max(0, promptTokens - cacheReadTokens - cacheWriteTokens);
                  output.usage.output = u.completion_tokens ?? 0;
                  output.usage.totalTokens = u.total_tokens ?? 0;
                  output.usage.cacheRead = cacheReadTokens;
                  output.usage.cacheWrite = cacheWriteTokens;
                }
                if (inner.choices && inner.choices.length > 0) {
                  const choice = inner.choices[0];
                  const delta = choice.delta;
                  if (delta) {
                    if (delta.reasoning_content || delta.content || Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
                      sawModelOutput = true;
                    }
                    if (delta.reasoning_content) {
                      rawReasoningTail = (rawReasoningTail + delta.reasoning_content).slice(-512);
                      const reasoningChunk = stripDsmlResidue(stripThinkingTags(delta.reasoning_content));
                      if (reasoningChunk) {
                        if (thinkingBlockIndex === -1) {
                          thinkingBlockIndex = output.content.length;
                          output.content.push({ type: "thinking", thinking: "" });
                          stream.push({ type: "thinking_start", contentIndex: thinkingBlockIndex, partial: output });
                        }
                        const block = output.content[thinkingBlockIndex];
                        block.thinking += reasoningChunk;
                        stream.push({
                          type: "thinking_delta",
                          contentIndex: thinkingBlockIndex,
                          delta: reasoningChunk,
                          partial: output
                        });
                      }
                    }
                    if (delta.content) {
                      if (thinkingBlockIndex !== -1) {
                        const block = output.content[thinkingBlockIndex];
                        stream.push({
                          type: "thinking_end",
                          contentIndex: thinkingBlockIndex,
                          content: block.thinking,
                          partial: output
                        });
                        thinkingBlockIndex = -1;
                      }
                      if (thinkingParser) {
                        thinkingParser.processChunk(delta.content);
                        if (toolCalls?.lastToolState) refreshToolIndexes(output, toolCalls);
                      } else {
                        if (contentBlockIndex === -1) {
                          contentBlockIndex = output.content.length;
                          output.content.push({ type: "text", text: "" });
                          stream.push({ type: "text_start", contentIndex: contentBlockIndex, partial: output });
                        }
                        const block = output.content[contentBlockIndex];
                        block.text += delta.content;
                        stream.push({
                          type: "text_delta",
                          contentIndex: contentBlockIndex,
                          delta: delta.content,
                          partial: output
                        });
                      }
                    }
                    if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
                      for (const tc of delta.tool_calls) {
                        const id = tc.id || "";
                        const name2 = tc.function?.name || "";
                        const argDelta = tc.function?.arguments ?? "";
                        if (typeof id !== "string" || typeof name2 !== "string") {
                          throw new Error("Tool-call identity conflict: invalid metadata");
                        }
                        if (typeof argDelta !== "string") throw new Error("Invalid tool-call argument fragment");
                        if (!id && !name2 && !argDelta) continue;
                        toolCalls ??= {
                          states: [],
                          byId: /* @__PURE__ */ new Map(),
                          byIndex: /* @__PURE__ */ new Map(),
                          unscopedCandidates: /* @__PURE__ */ new Set(),
                          statesByBlock: /* @__PURE__ */ new Map()
                        };
                        const index = typeof tc.index === "number" ? tc.index : void 0;
                        let candidates;
                        if (index !== void 0) {
                          candidates = toolCalls.byIndex.get(index);
                          if (!candidates) {
                            candidates = { states: /* @__PURE__ */ new Set(), complete: /* @__PURE__ */ new Set(), unique: void 0 };
                            toolCalls.byIndex.set(index, candidates);
                          }
                        }
                        let state = id ? toolCalls.byId.get(id) : void 0;
                        let associated = !!state && !!candidates && candidates.states.has(state);
                        if (id && candidates && !associated && candidates.complete.size > 0) {
                          retireCompleteCandidates(toolCalls, candidates);
                        }
                        const available = candidates?.states ?? toolCalls.unscopedCandidates;
                        if (!state) {
                          const only = available.size === 1 ? candidates ? candidates.unique : available.values().next().value : void 0;
                          if (!id && available.size > 1) {
                            throw new Error(`Ambiguous tool-call continuation (candidates=${available.size})`);
                          }
                          if (only && (!id || !only.id)) {
                            state = only;
                            associated = candidates !== void 0;
                          } else {
                            state = {
                              argumentChunks: [],
                              argumentLength: 0,
                              depth: 0,
                              inString: false,
                              escaped: false,
                              complete: false,
                              id: "",
                              name: "",
                              contentIndex: -1,
                              candidates: /* @__PURE__ */ new Set(),
                              unindexed: index === void 0
                            };
                            toolCalls.states.push(state);
                          }
                        }
                        if (name2 && state.name && name2 !== state.name) {
                          throw new Error("Tool-call identity conflict: inconsistent name");
                        }
                        const newlyIdentified = !!id && !state.id;
                        const newlyNamed = !!name2 && !state.name;
                        if (newlyIdentified) {
                          state.id = id;
                          toolCalls.byId.set(id, state);
                        }
                        if (newlyNamed) state.name = name2;
                        if (!associated) {
                          toolCalls.unscopedCandidates.add(state);
                          if (candidates) {
                            state.unindexed = false;
                            state.candidates.add(candidates);
                            candidates.states.add(state);
                            candidates.unique = candidates.states.size === 1 ? state : void 0;
                            if (state.complete && state.id) candidates.complete.add(state);
                          }
                        }
                        const wasComplete = state.complete;
                        if (argDelta) appendToolArguments(state, argDelta);
                        if (state.complete && state.id && (!wasComplete || newlyIdentified)) {
                          for (const scope of state.candidates) scope.complete.add(state);
                        }
                        if (!state.block && (state.id || state.name)) {
                          state.block = { type: "toolCall", id: state.id, name: state.name, arguments: {} };
                          state.contentIndex = output.content.length;
                          output.content.push(state.block);
                          toolCalls.statesByBlock.set(state.block, state);
                          toolCalls.lastToolState = state;
                          stream.push({ type: "toolcall_start", contentIndex: state.contentIndex, partial: output });
                          for (const fragment of state.argumentChunks) {
                            stream.push({
                              type: "toolcall_delta",
                              contentIndex: state.contentIndex,
                              delta: fragment,
                              partial: output
                            });
                          }
                        } else if (state.block) {
                          if (newlyIdentified) state.block.id = state.id;
                          if (newlyNamed) state.block.name = state.name;
                          if (argDelta) {
                            stream.push({
                              type: "toolcall_delta",
                              contentIndex: state.contentIndex,
                              delta: argDelta,
                              partial: output
                            });
                          }
                        }
                      }
                    }
                  }
                  if (choice.finish_reason) {
                    output.stopReason = choice.finish_reason;
                  }
                }
              } catch (e) {
                if (e instanceof SyntaxError) {
                  if (parsePhase === "payload") droppedPayloads += 1;
                  if (process.env.QODER_DEBUG) {
                    console.error("[pi-provider-qoder] skipping malformed SSE line:", dataStr.slice(0, 200));
                  }
                  continue;
                }
                throw e;
              }
            }
          }
        } finally {
          try {
            await reader.cancel().catch(() => {
            });
          } finally {
            reader.releaseLock();
          }
        }
        if (thinkingParser) {
          thinkingParser.finalize();
          if (toolCalls?.lastToolState) refreshToolIndexes(output, toolCalls);
        }
        if (thinkingBlockIndex !== -1) {
          const block = output.content[thinkingBlockIndex];
          stream.push({
            type: "thinking_end",
            contentIndex: thinkingBlockIndex,
            content: block.thinking,
            partial: output
          });
        }
        if (toolCalls) {
          for (const state of toolCalls.states) {
            if (!state.id || !state.name) {
              throw new UnusableToolCallError(`Unresolved tool-call identity (characters=${state.argumentLength})`);
            }
            parseToolArguments(state);
          }
          for (const [block, state] of toolCalls.statesByBlock) {
            block.arguments = parseToolArguments(state);
            stream.push({
              type: "toolcall_end",
              contentIndex: state.contentIndex,
              toolCall: block,
              partial: output
            });
          }
          if (toolCalls.statesByBlock.size > 0 && output.stopReason !== "length") {
            output.stopReason = "toolUse";
          }
        }
        if (isDegenerateDsmlTurn(output, rawReasoningTail)) {
          output.stopReason = "error";
          output.errorMessage = "Qoder server error: degenerate model output (unparseable DSML tool-call markup, no tool call executed)";
          stream.push({ type: "error", reason: "error", error: output });
          stream.end();
          return;
        }
        stream.push({
          type: "done",
          reason: output.stopReason,
          message: output
        });
        stream.end();
      };
      for (let attempt = 0; ; attempt++) {
        try {
          await runAttempt();
          if (switchedChatEndpoint) {
            rememberChatBaseUrl(providerMode, getQoderChatBaseUrl(providerMode));
          }
          return;
        } catch (e) {
          if (e instanceof QoderDailyChatLimitError) {
            if (!e.sawModelOutput && chatEndpointSwitches < MAX_CHAT_ENDPOINT_SWITCHES) {
              const nextBase = await rotateChatEndpoint(
                providerMode,
                { userID, authToken: accessToken, name, email, machineID },
                attemptedChatBases
              );
              if (nextBase) {
                chatEndpointSwitches++;
                switchedChatEndpoint = true;
                chatURL = getQoderChatURL(providerMode);
                headers = buildAuthHeaders(encodedBytes, chatURL, {
                  userID,
                  authToken: accessToken,
                  name,
                  email,
                  machineID
                });
                continue;
              }
            }
            throw e;
          }
          if (!(e instanceof QoderModelBusyError)) throw e;
          if (e.sawModelOutput || output.content.length > 0) {
            throw new Error("Qoder model rejected the request after partial output (10605 RESOURCE_LIMIT)");
          }
          const requestedWaitMs = e.retryAfterMs ?? 0;
          if (attempt >= modelBusyRetries) {
            throw new QoderModelBusyError(
              `Qoder server error: model is busy (10605 RESOURCE_LIMIT, retryAfterSeconds=${Math.round(requestedWaitMs / 1e3)}, attempts=${attempt + 1})`,
              requestedWaitMs
            );
          }
          if (requestedWaitMs > modelBusyMaxWaitMs) {
            throw new QoderModelBusyError(
              `Qoder server error: model is busy (10605 RESOURCE_LIMIT, requested delay ${requestedWaitMs}ms exceeds local cap ${modelBusyMaxWaitMs}ms)`,
              requestedWaitMs
            );
          }
          await sleepWithAbort(requestedWaitMs, options?.signal);
          options?.signal?.throwIfAborted();
          const nextId = crypto3.randomUUID();
          reqBody.request_id = nextId;
          reqBody.chat_record_id = nextId;
          encodedBytes = qoderEncodeBody(Buffer.from(JSON.stringify(reqBody)));
          headers = buildAuthHeaders(encodedBytes, chatURL, {
            userID,
            authToken: accessToken,
            name,
            email,
            machineID
          });
        }
      }
    } catch (e) {
      const aborted = options?.signal?.aborted === true;
      if (!aborted && droppedPayloads > 0 && e instanceof UnusableToolCallError) {
        if (process.env.QODER_DEBUG) {
          console.error(
            `[pi-provider-qoder] lost tool-call argument stream: ${e.message}, droppedPayloads=${droppedPayloads}`
          );
        }
        const terminal = {
          ...output,
          content: output.content.filter((block) => block.type !== "toolCall"),
          stopReason: "error",
          errorMessage: lostToolArgumentStream().message
        };
        stream.push({ type: "error", reason: "error", error: terminal });
        try {
          stream.end();
        } catch {
        }
        return;
      }
      output.stopReason = aborted ? "aborted" : "error";
      output.errorMessage = e instanceof Error ? e.message : String(e);
      stream.push({ type: "error", reason: output.stopReason, error: output });
      try {
        stream.end();
      } catch {
      }
    }
  })();
  return stream;
}

// src/update-check.ts
var PACKAGE_NAME = "pi-provider-qoder";
var REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
var DEFAULT_TIMEOUT_MS2 = 2e3;
function parseSemver(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
function compareVersions(a, b2) {
  const left = parseSemver(a);
  const right = parseSemver(b2);
  if (!left || !right) return 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}
function upgradeCommand(hostExecutable) {
  const binary = (hostExecutable ?? "").split(/[\\/]/).pop() ?? "";
  if (/omp/i.test(binary)) return `omp plugin upgrade ${PACKAGE_NAME}`;
  if (/^pi/i.test(binary)) return `pi install npm:${PACKAGE_NAME}`;
  return `omp plugin upgrade ${PACKAGE_NAME} (pi: pi install npm:${PACKAGE_NAME})`;
}
function formatUpdateNotice(current, latest, hostExecutable) {
  if (compareVersions(latest, current) <= 0) return null;
  return `[${PACKAGE_NAME}] ${latest} is available (running ${current}). Upgrade: ${upgradeCommand(hostExecutable)}`;
}
async function fetchLatestVersion(fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS2) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(REGISTRY_URL, {
      signal: controller.signal,
      headers: { accept: "application/json" }
    });
    if (!response.ok) return null;
    const body = await response.json();
    return typeof body.version === "string" ? body.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
async function checkForUpdate(options) {
  if (options.disabled) return null;
  const latest = await fetchLatestVersion(options.fetchImpl ?? fetch, options.timeoutMs);
  if (!latest) return null;
  return formatUpdateNotice(options.currentVersion, latest, options.hostExecutable);
}

// src/usage-provider.ts
var KNOWN_UNITS = {
  percent: true,
  tokens: true,
  requests: true,
  credits: true,
  usd: true,
  minutes: true,
  bytes: true
};
function unitFor(raw) {
  const lowered = raw?.toLowerCase();
  if (!lowered) return "credits";
  return KNOWN_UNITS[lowered] === true ? lowered : "unknown";
}
function statusFor(usedFraction, remaining, exceeded) {
  if (exceeded || remaining !== void 0 && remaining <= 0) return "exhausted";
  if (usedFraction !== void 0 && usedFraction >= 0.9) return "warning";
  return "ok";
}
var NO_EXPIRY_FROM_MS = Date.UTC(3e3, 0, 1);
function toUsageReport(usage, providerID, fetchedAt = Date.now()) {
  const buckets = usage.usageBuckets ?? [];
  if (buckets.length === 0) return null;
  const parsedReset = usage.resetAt === void 0 ? Number.NaN : Date.parse(usage.resetAt);
  const resetsAt = Number.isFinite(parsedReset) && parsedReset < NO_EXPIRY_FROM_MS ? parsedReset : void 0;
  const raw = usage.raw;
  const exceeded = raw?.isQuotaExceeded === true;
  const snapshot = normalizeQoderQuotaSnapshot(usage.raw);
  const amountsFor = (id) => {
    if (id === "user-quota") return snapshot?.userQuota;
    if (id === "add-on-quota") return snapshot?.addOnQuota;
    if (id === "org-resource-package") return snapshot?.orgResourcePackage;
    return void 0;
  };
  const limits = buckets.map((bucket) => {
    const amounts = amountsFor(bucket.id);
    const usedFraction = amounts?.used !== void 0 && amounts.total !== void 0 && amounts.total > 0 ? amounts.used / amounts.total : void 0;
    return {
      id: bucket.id,
      label: bucket.label,
      scope: { provider: providerID },
      ...resetsAt !== void 0 ? {
        window: {
          id: "period",
          label: usage.subscriptionTitle ?? "Billing period",
          resetsAt,
          resetLabel: usage.subscriptionTitle ? "plan expires" : "resets"
        }
      } : {},
      amount: {
        unit: unitFor(amounts?.unit ?? bucket.unit),
        ...amounts?.used !== void 0 ? { used: amounts.used } : {},
        ...amounts?.total !== void 0 ? { limit: amounts.total } : {},
        ...amounts?.remaining !== void 0 ? { remaining: amounts.remaining } : {},
        ...usedFraction !== void 0 ? { usedFraction: Math.min(1, Math.max(0, usedFraction)) } : {}
      },
      status: statusFor(usedFraction, amounts?.remaining, exceeded)
    };
  });
  const notes = [];
  if (typeof raw?.userType === "string" && raw.userType) notes.push(`Account kind: ${raw.userType}`);
  if (usage.summary) notes.push(usage.summary);
  if (usage.manageUrl) notes.push(`Manage: ${usage.manageUrl}`);
  return { provider: providerID, fetchedAt, limits, ...notes.length > 0 ? { notes } : {} };
}
function createQoderUsageProvider(mode, providerID) {
  return {
    id: providerID,
    validatesCredentials: false,
    async fetchUsage(params) {
      const cred = params.credential;
      const access = typeof cred?.accessToken === "string" ? cred.accessToken : cred?.access;
      if (typeof access !== "string" || access.length === 0) return null;
      try {
        const usage = await fetchQoderUsageForMode({ ...cred, access }, mode, params.signal);
        return toUsageReport(usage, providerID);
      } catch {
        return null;
      }
    }
  };
}

// src/index.ts
var QODER_API = "qoder-api";
var requirePackageJson = createRequire3(import.meta.url);
var CURRENT_VERSION = requirePackageJson("../package.json").version ?? "0.0.0";
async function registerQoderApi() {
  try {
    const compat = await import("@earendil-works/pi-ai/compat");
    const register = compat.registerApiProvider;
    if (typeof register !== "function") return;
    register(
      { api: QODER_API, stream: streamQoder, streamSimple: streamQoder },
      "provider:qoder"
    );
  } catch {
  }
}
function modelsForProvider(mode, providerID) {
  const cached = getCachedModels(mode);
  const modelsToUse = cached.length > 0 ? cached : mode === "cn" ? staticCnModels : staticModels;
  return modelsToUse.map((m2) => ({
    ...m2,
    provider: providerID,
    baseUrl: getQoderBaseUrl(mode)
  }));
}
function createQoderOAuth(mode) {
  const region = getQoderRegionConfig(mode);
  return {
    name: region.loginName,
    login: (callbacks) => loginQoderForMode(callbacks, mode),
    refreshToken: (credentials) => refreshQoderTokenForMode(credentials, mode),
    getApiKey: (cred) => cred.access,
    // NOTE: no `modifyModels` hook on purpose. OMP (Bun) does a whole-catalog
    // structuredClone before invoking it, and its bundled catalog contains a
    // model with a non-cloneable property -> "The object can not be cloned."
    // removes qoder from `omp models`. Models are supplied at registration
    // via `modelsForProvider` and refreshed by the startup/session cache hooks.
    fetchUsage: (credentials) => fetchQoderUsageForMode(credentials, mode)
  };
}
function registerQoderProvider(pi, mode) {
  const providerID = getQoderRegionConfig(mode).providerID;
  const oauth = createQoderOAuth(mode);
  const config = {
    baseUrl: getQoderBaseUrl(mode),
    api: QODER_API,
    models: modelsForProvider(mode, providerID),
    oauth,
    // pi-coding-agent resolves its own nested @earendil-works/pi-ai copy, so the
    // structurally identical Model/Context types are nominally distinct here.
    streamSimple: streamQoder,
    usage: createQoderUsageProvider(mode, providerID)
  };
  pi.registerProvider(providerID, config);
}
async function refreshModelsAtStartup(mode) {
  const providerID = getQoderRegionConfig(mode).providerID;
  if (!isCacheStale(mode)) return;
  const credentials = getCachedCredentials("", providerID);
  if (!credentials?.access) return;
  const region = getQoderRegionConfig(mode);
  await updateQoderModelsCache(
    credentials.access,
    credentials.userID || "qoder-user",
    credentials.name || region.userNameFallback,
    credentials.email || region.userEmailFallback,
    mode
  );
}
async function index_default(pi) {
  await registerQoderApi();
  void checkForUpdate({
    currentVersion: CURRENT_VERSION,
    hostExecutable: process.argv[1],
    disabled: process.env.PI_PROVIDER_QODER_SKIP_UPDATE_CHECK === "1"
  }).then((notice) => {
    if (notice) console.error(notice);
  });
  for (const mode of QODER_MODES) {
    const providerID = getQoderRegionConfig(mode).providerID;
    applyCachedChatEndpoint(mode);
    try {
      await autoLoginQoderFromEnvironment(providerID, mode);
      const credentials = getCachedCredentials("", providerID);
      if (credentials?.access) {
        await refreshChatEndpoint(mode, {
          userID: credentials.userID || "qoder-user",
          authToken: credentials.access,
          name: credentials.name,
          email: credentials.email,
          machineID: credentials.machineID
        });
      }
      await refreshModelsAtStartup(mode);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[pi-provider-qoder] Automatic login failed for ${providerID}: ${message}`);
    }
  }
  pi.on("session_start", async (_event, ctx) => {
    for (const mode of QODER_MODES) {
      try {
        const region = getQoderRegionConfig(mode);
        const providerID = region.providerID;
        const accessToken = await ctx.modelRegistry.getApiKeyForProvider(providerID);
        if (!accessToken || !isCacheStale(mode)) continue;
        const creds = getCachedCredentials(accessToken, providerID);
        const userID = creds?.userID || "qoder-user";
        const name = creds?.name || region.userNameFallback;
        const email = creds?.email || region.userEmailFallback;
        await updateQoderModelsCache(accessToken, userID, name, email, mode);
      } catch {
      }
    }
  });
  for (const mode of QODER_MODES) registerQoderProvider(pi, mode);
  registerQoderCreditDisplay(pi);
}
export {
  index_default as default
};
