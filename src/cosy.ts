import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const qoderRSAPublicKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDA8iMH5c02LilrsERw9t6Pv5Nc
4k6Pz1EaDicBMpdpxKduSZu5OANqUq8er4GM95omAGIOPOh+Nx0spthYA2BqGz+l
6HRkPJ7S236FZz73In/KVuLnwI8JJ2CbuJap8kvheCCZpmAWpb/cPx/3Vr/J6I17
XcW+ML9FoCI6AOvOzwIDAQAB
-----END PUBLIC KEY-----`;

const QoderIDEVersion = "1.0.0";
const QoderClientType = "5";
const QoderDataPolicy = "disagree";
const QoderLoginVersion = "v2";
const QoderMachineOS = "x86_64_windows";
const QoderMachineTypeMagic = "5";

const QoderModeEnv = process.env.QODER_REGION || process.env.QODER_BACKEND || process.env.QODER_MODE || "";

export type QoderMode = "global" | "cn";

interface UserInfo {
  uid: string;
  security_oauth_token: string;
  name: string;
  aid: string;
  email: string;
}

interface CosyPayload {
  version: string;
  requestId: string;
  info: string;
  cosyVersion: string;
  ideVersion: string;
}

export interface CosyCredentials {
  userID: string;
  authToken: string;
  name: string;
  email: string;
  machineID?: string;
}

export function getQoderMode(modeOverride?: string): QoderMode {
  const mode = (modeOverride || QoderModeEnv).toLowerCase();
  if (["cn", "china", "qodercn", "qoder-cn"].includes(mode)) return "cn";
  if (["global", "intl", "international", "qoder"].includes(mode)) return "global";
  if (
    (process.env.QODERCN_PERSONAL_ACCESS_TOKEN || process.env.QODERCN_PAT) &&
    !(process.env.QODER_PERSONAL_ACCESS_TOKEN || process.env.QODER_PAT)
  ) {
    return "cn";
  }
  return "global";
}

export function isQoderCNMode(modeOverride?: string): boolean {
  return getQoderMode(modeOverride) === "cn";
}

export function getQoderCNPat(): string {
  return process.env.QODERCN_PERSONAL_ACCESS_TOKEN || process.env.QODERCN_PAT || "";
}

export function getQoderBaseUrl(mode?: string): string {
  return isQoderCNMode(mode) ? "https://gateway.qoder.com.cn/" : "https://api3.qoder.sh/";
}

export const QODER_CN_DIRECT_BASE_URL = getQoderBaseUrl("cn");

export function getQoderOpenApiUrl(mode?: string): string {
  return isQoderCNMode(mode) ? "https://openapi.qoder.com.cn" : "https://openapi.qoder.sh";
}

export function getQoderCenterUrl(mode?: string): string {
  return isQoderCNMode(mode) ? "https://gateway.qoder.com.cn" : "https://center.qoder.sh";
}

export function getQoderModelListURL(mode?: string): string {
  return `${getQoderBaseUrl(mode)}algo/api/v2/model/list`;
}

export function getQoderChatURL(mode?: string): string {
  return `${getQoderBaseUrl(mode)}algo/api/v2/service/pro/sse/agent_chat_generation?FetchKeys=llm_model_result&AgentId=agent_common&Encode=1`;
}

export function getQoderExchangeURL(mode?: string): string {
  return `${getQoderOpenApiUrl(mode)}/api/v1/jobToken/exchange`;
}

export function getQoderUserInfoURL(mode?: string): string {
  return `${getQoderOpenApiUrl(mode)}/api/v1/userinfo`;
}

export function getQoderUsageURL(mode?: string): string {
  return `${getQoderOpenApiUrl(mode)}/api/v2/quota/usage`;
}

export function getQoderRefreshURL(mode?: string): string {
  return `${getQoderCenterUrl(mode)}/algo/api/v3/user/refresh_token`;
}

export function getQoderCNDirectModel(modelID?: string): string {
  return (
    {
      "qoder-cn": "auto",
      "qwen3.7-max": "qmodel_latest",
      "qwen3.7-plus": "qmodel",
      "qwen3.6-plus": "qmodel",
      "qwen3.6-flash": "q36fmodel",
      "deepseek-v4-pro": "dmodel",
      "deepseek-v4-flash": "dfmodel",
      "glm-5.2": "gm51model",
      "glm-5.1": "gm51model",
      "kimi-k2.6": "kmodel",
      "minimax-m2.7": "mmodel",
      "minimax-m3": "mmodel",
    }[modelID || ""] ||
    modelID ||
    "auto"
  );
}

const qoderCNFriendlyModels: Record<string, { id: string; name: string }> = {
  auto: { id: "auto", name: "Auto · Qoder CN" },
  "qoder-cn": { id: "qoder-cn", name: "Auto · Qoder CN" },
  qmodel_latest: { id: "qwen3.7-max", name: "Qwen 3.7 Max · Qoder CN" },
  qmodel: { id: "qwen3.7-plus", name: "Qwen 3.7 Plus · Qoder CN" },
  q36fmodel: { id: "qwen3.6-flash", name: "Qwen 3.6 Flash · Qoder CN" },
  qfmodel: { id: "qwen3.6-flash", name: "Qwen 3.6 Flash · Qoder CN" },
  dmodel: { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro · Qoder CN" },
  dfmodel: { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash · Qoder CN" },
  gm51model: { id: "glm-5.2", name: "GLM 5.2 · Qoder CN" },
  kmodel: { id: "kimi-k2.6", name: "Kimi K2.6 · Qoder CN" },
  mmodel: { id: "minimax-m2.7", name: "MiniMax M2.7 · Qoder CN" },
};

function prettifyQoderCNModelName(name: string): string {
  const pretty = (name || "Qoder CN Model")
    .replace(/Qwen(\d)/g, "Qwen $1")
    .replace(/Qwen([\d.]+)-/g, "Qwen $1 ")
    .replace(/DeepSeek\s*V(\d)-/g, "DeepSeek V$1 ")
    .replace(/\s+/g, " ")
    .trim();
  return pretty.includes("Qoder CN") ? pretty : `${pretty} · Qoder CN`;
}

export function getQoderCNFriendlyModelInfo(key: string, display?: string): { id: string; name: string } {
  return qoderCNFriendlyModels[key] || { id: key, name: prettifyQoderCNModelName(display || key) };
}

export function toQoderCNFriendlyModel<T extends { id: string; name: string }>(model: T): T {
  const info = getQoderCNFriendlyModelInfo(model.id, model.name);
  return {
    ...model,
    id: info.id,
    name: info.name,
  };
}

export function getQoderManageUrl(mode?: string): string {
  return isQoderCNMode(mode) ? "https://qoder.com.cn" : "https://qoder.com";
}

export function getQoderUserEmailFallback(mode?: string): string {
  return isQoderCNMode(mode) ? "user@qoder.com.cn" : "user@qoder.com";
}

function rsaEncryptBase64(data: Buffer | string): string {
  const key = {
    key: qoderRSAPublicKey,
    padding: crypto.constants.RSA_PKCS1_PADDING,
  };
  const encrypted = crypto.publicEncrypt(key, typeof data === "string" ? Buffer.from(data) : data);
  return encrypted.toString("base64");
}

function aesEncryptCBCBase64(plaintext: string, keyStr: string): string {
  const cipher = crypto.createCipheriv("aes-128-cbc", Buffer.from(keyStr), Buffer.from(keyStr));
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

function computeSigPath(urlStr: string): string {
  const parsed = new URL(urlStr);
  let sigPath = parsed.pathname;
  if (sigPath.startsWith("/algo")) {
    sigPath = sigPath.substring("/algo".length);
  }
  return sigPath;
}

export function getMachineId(): string {
  const paths = [join(homedir(), ".qoder", ".auth", "machine_id"), join(homedir(), ".pi", "agent", "qoder-machine-id")];
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        const val = readFileSync(p, "utf8").trim();
        if (val) return val;
      } catch {}
    }
  }
  const newId = crypto.randomUUID();
  try {
    const savePath = paths[1];
    mkdirSync(dirname(savePath), { recursive: true });
    writeFileSync(savePath, newId, "utf8");
  } catch {}
  return newId;
}

export function buildAuthHeaders(
  body: Buffer | string | null,
  requestURL: string,
  creds: CosyCredentials,
): Record<string, string> {
  if (!creds.userID) {
    throw new Error("cosy: user id is empty");
  }
  if (!creds.authToken) {
    throw new Error("cosy: auth token is empty");
  }

  const aesKey = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const userInfo: UserInfo = {
    uid: creds.userID,
    security_oauth_token: creds.authToken,
    name: creds.name || "",
    aid: "",
    email: creds.email || "",
  };

  const infoB64 = aesEncryptCBCBase64(JSON.stringify(userInfo), aesKey);
  const cosyKey = rsaEncryptBase64(aesKey);

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const requestId = crypto.randomUUID();

  const cosyPayload: CosyPayload = {
    version: "v1",
    requestId,
    info: infoB64,
    cosyVersion: QoderIDEVersion,
    ideVersion: "",
  };

  const payloadB64 = Buffer.from(JSON.stringify(cosyPayload)).toString("base64");
  const sigPath = computeSigPath(requestURL);

  const bodyStr = body ? (Buffer.isBuffer(body) ? body.toString("utf8") : body) : "";
  const sigInput = `${payloadB64}\n${cosyKey}\n${timestamp}\n${bodyStr}\n${sigPath}`;
  const sig = crypto.createHash("md5").update(sigInput).digest("hex");

  const bodyHash = crypto
    .createHash("md5")
    .update(body || "")
    .digest("hex");
  const bodyLen = body ? (Buffer.isBuffer(body) ? body.length : Buffer.from(body).length).toString() : "0";

  const machineID = creds.machineID || getMachineId();

  return {
    Authorization: `Bearer COSY.${payloadB64}.${sig}`,
    "Cosy-Key": cosyKey,
    "Cosy-User": creds.userID,
    "Cosy-Date": timestamp,
    "Cosy-Version": QoderIDEVersion,
    "Cosy-Machineid": machineID,
    "Cosy-Machinetoken": machineID,
    "Cosy-Machinetype": QoderMachineTypeMagic,
    "Cosy-Machineos": QoderMachineOS,
    "Cosy-Clienttype": QoderClientType,
    "Cosy-Clientip": "127.0.0.1",
    "Cosy-Bodyhash": bodyHash,
    "Cosy-Bodylength": bodyLen,
    "Cosy-Sigpath": sigPath,
    "Cosy-Data-Policy": QoderDataPolicy,
    "Cosy-Organization-Id": "",
    "Cosy-Organization-Tags": "",
    "Login-Version": QoderLoginVersion,
    "X-Request-Id": crypto.randomUUID(),
  };
}
