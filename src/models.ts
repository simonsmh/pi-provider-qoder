import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ThinkingLevel, ThinkingLevelMap } from "@earendil-works/pi-ai";
import {
  buildAuthHeaders,
  getQoderBaseUrl,
  getQoderMode,
  getQoderModelListURL,
  isQoderCNMode,
  toQoderCNModelId,
} from "./cosy.js";

export const ZERO_COST = Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

/**
 * Maximum output tokens sent per request. Aliyun Model Studio (the upstream
 * behind Qoder's CN catalog) documents Max Output Length = 131072 for every
 * model we expose (qwen3.8-max/flash, qwen3.7-max/plus/flash), in both normal
 * and thinking modes (thinking chain alone goes up to 262144). The Qoder
 * /model/list catalog does not return a per-model output cap, so this single
 * constant is the source of truth for both static models and request sending.
 * qodercli ships a conservative 32e3 default and caps its UI at 65536; we use
 * the documented upstream ceiling so reasoning chains and long generations
 * are not truncated.
 */
export const MAX_OUTPUT_TOKENS = 131072;

/** Shape of a single entry returned by the Qoder /model/list endpoint. */
export interface QoderModelEntry {
  key?: string;
  enable?: boolean;
  display_name?: string;
  max_input_tokens?: number;
  context_config?: Record<string, { token_count?: number; is_default?: boolean }>;
  is_vl?: boolean;
  is_reasoning?: boolean;
  thinking_config?: {
    disabled?: unknown;
    enabled?: { efforts?: Record<string, { is_default?: boolean }>; is_default?: boolean };
  };
  source?: string;
  [key: string]: unknown;
}

export interface QoderModelDef {
  id: string;
  name: string;
  api: "qoder-api";
  provider: "qoder" | "qoder-cn";
  baseUrl: string;
  reasoning: boolean;
  supportsEffort: boolean;
  thinkingLevelMap?: ThinkingLevelMap;
  input: ("text" | "image")[];
  cost: typeof ZERO_COST;
  contextWindow: number;
  maxTokens: number;
  description?: string;
}

function getQoderCachePath(mode?: string): string {
  return join(
    homedir(),
    ".pi",
    "agent",
    isQoderCNMode(mode) ? "qoder-cn-models-cache.json" : "qoder-models-cache.json",
  );
}

export const staticModels: QoderModelDef[] = [
  {
    id: "auto",
    name: "Qoder Auto",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: "https://api3.qoder.sh/",
    reasoning: true,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: 180000,
    maxTokens: MAX_OUTPUT_TOKENS,
  },
  {
    id: "ultimate",
    name: "Qoder Ultimate",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: "https://api3.qoder.sh/",
    reasoning: true,
    supportsEffort: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: 1000000,
    maxTokens: MAX_OUTPUT_TOKENS,
  },
  {
    id: "performance",
    name: "Qoder Performance",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: "https://api3.qoder.sh/",
    reasoning: true,
    supportsEffort: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: 1000000,
    maxTokens: MAX_OUTPUT_TOKENS,
  },
  {
    id: "efficient",
    name: "Qoder Efficient",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: "https://api3.qoder.sh/",
    reasoning: false,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: 180000,
    maxTokens: MAX_OUTPUT_TOKENS,
  },
  {
    id: "lite",
    name: "Qoder Lite",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: "https://api3.qoder.sh/",
    reasoning: false,
    supportsEffort: false,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: 180000,
    maxTokens: MAX_OUTPUT_TOKENS,
  },
  {
    id: "qmodel",
    name: "Qwen3.7 Plus (Qoder)",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: "https://api3.qoder.sh/",
    reasoning: false,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: 1000000,
    maxTokens: MAX_OUTPUT_TOKENS,
  },
  {
    id: "cmodel",
    name: "Cantus (Qoder)",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: "https://api3.qoder.sh/",
    reasoning: true,
    supportsEffort: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: 1000000,
    maxTokens: MAX_OUTPUT_TOKENS,
  },
  {
    id: "qmodel_preview",
    name: "Qwen3.8 Max Preview (Qoder)",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: "https://api3.qoder.sh/",
    reasoning: true,
    supportsEffort: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: 1000000,
    maxTokens: MAX_OUTPUT_TOKENS,
  },
  {
    id: "qmodel_latest",
    name: "Qwen3.7 Max (Qoder)",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: "https://api3.qoder.sh/",
    reasoning: false,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: 1000000,
    maxTokens: MAX_OUTPUT_TOKENS,
  },
  {
    id: "dmodel",
    name: "DeepSeek V4 Pro (Qoder)",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: "https://api3.qoder.sh/",
    reasoning: true,
    supportsEffort: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: 1000000,
    maxTokens: MAX_OUTPUT_TOKENS,
  },
  {
    id: "dfmodel",
    name: "DeepSeek V4 Flash (Qoder)",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: "https://api3.qoder.sh/",
    reasoning: true,
    supportsEffort: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: 1000000,
    maxTokens: MAX_OUTPUT_TOKENS,
  },
  {
    id: "gm51model",
    name: "GLM 5.2 (Qoder)",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: "https://api3.qoder.sh/",
    reasoning: true,
    supportsEffort: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: 1000000,
    maxTokens: MAX_OUTPUT_TOKENS,
  },
  {
    id: "kmodel",
    name: "Kimi K2.7 Code (Qoder)",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: "https://api3.qoder.sh/",
    reasoning: false,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: 256000,
    maxTokens: MAX_OUTPUT_TOKENS,
  },
  {
    id: "kmodel_latest",
    name: "Kimi K3 (Qoder)",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: "https://api3.qoder.sh/",
    reasoning: false,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: 1000000,
    maxTokens: MAX_OUTPUT_TOKENS,
  },
  {
    id: "mmodel",
    name: "MiniMax M3 (Qoder)",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: "https://api3.qoder.sh/",
    reasoning: false,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: 1000000,
    maxTokens: MAX_OUTPUT_TOKENS,
  },
];

export const staticCnModels: QoderModelDef[] = [
  {
    id: "Auto",
    name: "Auto",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: true,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: 200000,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN smart routing; fallback context window of 200K.",
  },
  {
    id: "Qwen3.7-Max",
    name: "Qwen3.7-Max",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: true,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: 1000000,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN qmodel_latest; context options 200K/400K/1M.",
  },
  {
    id: "Qwen3.7-Plus",
    name: "Qwen3.7-Plus",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: true,
    supportsEffort: false,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: 1000000,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN qmodel; context options 200K/400K/1M.",
  },
  {
    id: "Qwen3.6-Flash",
    name: "Qwen3.6-Flash",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: true,
    supportsEffort: false,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: 1000000,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN q36fmodel; context options 200K/400K/1M.",
  },
  {
    id: "DeepSeek-V4-Pro",
    name: "DeepSeek-V4-Pro",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: true,
    supportsEffort: false,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: 1000000,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN dmodel; context options 200K/400K/1M.",
  },
  {
    id: "DeepSeek-V4-Flash",
    name: "DeepSeek-V4-Flash",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: false,
    supportsEffort: false,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: 1000000,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN dfmodel; context options 200K/400K/1M.",
  },
  {
    id: "GLM-5.2",
    name: "GLM-5.2",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: true,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: 200000,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN gm51model; live catalog currently displays GLM-5.2 with 200K context.",
  },
  {
    id: "Kimi-K2.7-Code",
    name: "Kimi-K2.7-Code",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: true,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: 256000,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN kmodel; context option 256K.",
  },
  {
    id: "MiniMax-M2.7",
    name: "MiniMax-M2.7",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: false,
    supportsEffort: false,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: 200000,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN mmodel; live catalog reports 200K context.",
  },
];

/** pi thinking levels in display order (matches the pi-ai SDK this build targets). */
const PI_THINKING_LEVELS: readonly ThinkingLevel[] = ["minimal", "low", "medium", "high", "xhigh"];

/**
 * Map Qoder's `thinking_config` to pi's `thinkingLevelMap` so the TUI exposes
 * the levels the upstream model actually supports.
 *
 * Qoder has two shapes:
 *   - effort-based: `thinking_config.enabled.efforts = { low, medium, xhigh, ... }`
 *     Each effort key is already a pi level name, so supported levels map to
 *     themselves and the rest are pinned to null (hidden in the picker).
 *     `xhigh`/`max` are only shown when the map carries them, otherwise the
 *     picker tops out at `high`.
 *   - toggle-based: `thinking_config.enabled` without `efforts` (only on/off).
 *     Every pi level is exposed and maps to "enabled" so a user picking any
 *     level turns thinking on; the exact effort sent upstream is decided at
 *     request time.
 * Returns undefined for models that do not support thinking, so pi falls back
 * to `reasoning: false`-style behavior (only `off`).
 */
function buildThinkingLevelMap(entry: QoderModelEntry): ThinkingLevelMap | undefined {
  const tc = entry.thinking_config;
  if (!tc) return undefined;
  const efforts = tc.enabled?.efforts;
  if (efforts && typeof efforts === "object") {
    const supported = new Set(Object.keys(efforts));
    // `off` (disable thinking) is selectable when the catalog advertises a
    // `disabled` option; otherwise pin it to null to hide it.
    const map: ThinkingLevelMap = { off: tc.disabled ? "disabled" : null };
    for (const level of PI_THINKING_LEVELS) {
      map[level] = supported.has(level) ? level : null;
    }
    return map;
  }
  // toggle-only (enabled/disabled, no efforts) — expose every level as "on".
  // `off` is selectable when the catalog advertises `disabled`.
  if (tc.enabled) {
    const map: ThinkingLevelMap = { off: tc.disabled ? "disabled" : null };
    for (const level of PI_THINKING_LEVELS) {
      map[level] = "enabled";
    }
    return map;
  }
  return undefined;
}

export function getCachedModels(mode?: string): QoderModelDef[] {
  const cachePath = getQoderCachePath(mode);
  if (existsSync(cachePath)) {
    try {
      const data = JSON.parse(readFileSync(cachePath, "utf8"));
      if (data && Array.isArray(data.models)) {
        // Older releases injected `auto` without a corresponding service config.
        // Keep an explicitly enabled service model, but drop the legacy fallback.
        if (data.configs && typeof data.configs === "object" && !data.configs.auto) {
          return data.models.filter((model: QoderModelDef) => model.id !== "auto");
        }
        return data.models;
      }
    } catch {}
  }
  return isQoderCNMode(mode) ? staticCnModels : staticModels;
}

export function getCachedModelConfig(modelKey: string, mode?: string): QoderModelEntry | null {
  const cachePath = getQoderCachePath(mode);
  if (existsSync(cachePath)) {
    try {
      const data = JSON.parse(readFileSync(cachePath, "utf8"));
      if (data?.configs?.[modelKey]) {
        return withMaxContextAsDefault(data.configs[modelKey] as QoderModelEntry);
      }
    } catch {}
  }

  // No cached config. This only happens before the first successful catalog
  // fetch (e.g. not yet logged in), in which case the request cannot succeed
  // anyway. Return a minimal entry carrying the id as the key so callers have
  // something to read; reasoning is unknown so default to false.
  if (isQoderCNMode(mode)) {
    return {
      key: modelKey,
      is_reasoning: false,
      source: "system",
    };
  }

  return null;
}

/** Prefer the largest context option when Qoder exposes selectable contexts. */
function withMaxContextAsDefault(entry: QoderModelEntry): QoderModelEntry {
  const contextConfig = entry.context_config;
  if (!contextConfig || typeof contextConfig !== "object") return entry;

  const maxTokenCount = Math.max(
    ...Object.values(contextConfig).map((config) => (typeof config?.token_count === "number" ? config.token_count : 0)),
  );
  if (maxTokenCount <= 0) return entry;

  return {
    ...entry,
    context_config: Object.fromEntries(
      Object.entries(contextConfig).map(([name, config]) => [
        name,
        { ...config, is_default: config.token_count === maxTokenCount },
      ]),
    ),
  };
}

export function isCacheStale(mode?: string): boolean {
  const cachePath = getQoderCachePath(mode);
  if (!existsSync(cachePath)) return true;
  try {
    const data = JSON.parse(readFileSync(cachePath, "utf8"));
    if (!data || typeof data.updatedAt !== "number") return true;
    // Stale if older than 1 hour
    return Date.now() - data.updatedAt > 3600_000;
  } catch {
    return true;
  }
}

export async function updateQoderModelsCache(
  authToken: string,
  userID: string,
  name: string,
  email: string,
  mode: string = getQoderMode(),
): Promise<void> {
  const modelListURL = getQoderModelListURL(mode);
  try {
    const headers = buildAuthHeaders(null, modelListURL, {
      userID,
      authToken,
      name,
      email,
    });

    const response = await fetch(modelListURL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...headers,
      },
    });

    if (!response.ok) {
      return;
    }

    const resData = (await response.json()) as { chat?: QoderModelEntry[] };
    const chatModels = resData.chat || [];
    if (chatModels.length === 0) return;

    const newModels: QoderModelDef[] = [];
    const configs: Record<string, QoderModelEntry> = {};

    for (const entry of chatModels) {
      const key = entry.key;
      if (!key || !entry.enable) continue;

      const display = entry.display_name || key;
      // The context window is the largest selectable context option the upstream
      // catalog exposes (e.g. 1M when 200K/400K/1M are offered). Fall back to
      // 200K when no context_config is present. `max_input_tokens` is not used:
      // it is a flat base value (180K) that every catalog entry with selectable
      // contexts already exceeds, so it only ever acted as a redundant floor.
      let ctxLen = 200000;
      if (entry.context_config && typeof entry.context_config === "object") {
        for (const configVal of Object.values(entry.context_config)) {
          if (configVal && typeof configVal === "object" && typeof configVal.token_count === "number") {
            if (configVal.token_count > ctxLen) {
              ctxLen = configVal.token_count;
            }
          }
        }
      }
      const isVL = !!entry.is_vl;
      const isReasoning = !!entry.is_reasoning || !!entry.thinking_config;
      const supportsEffort = !!entry.thinking_config?.enabled?.efforts;
      const thinkingLevelMap = buildThinkingLevelMap(entry);
      // CN models expose the upstream display_name (whitespace-stripped) as the
      // pi-visible id; the original `key` is stored in `configs` and read back at
      // request time, so no key<->friendlyId mapping table is needed.
      const modelInfo = isQoderCNMode(mode)
        ? { id: toQoderCNModelId(display), name: display }
        : { id: key, name: display };

      configs[key] = entry;
      if (modelInfo.id !== key) configs[modelInfo.id] = entry;

      newModels.push({
        id: modelInfo.id,
        name: modelInfo.name,
        api: "qoder-api",
        provider: isQoderCNMode(mode) ? "qoder-cn" : "qoder",
        baseUrl: getQoderBaseUrl(mode),
        reasoning: isReasoning,
        supportsEffort,
        thinkingLevelMap,
        input: isVL ? ["text", "image"] : ["text"],
        cost: ZERO_COST,
        contextWindow: ctxLen,
        maxTokens: MAX_OUTPUT_TOKENS,
      });
    }

    if (newModels.length === 0) return;

    const cacheData = {
      updatedAt: Date.now(),
      models: newModels,
      configs,
    };

    const cachePath = getQoderCachePath(mode);
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), "utf-8");
  } catch {}
}
