/**
 * Opt-in recorder for the real Qoder protocol.
 *
 * It exercises PAT exchange, userinfo, model list, and one tiny streaming chat
 * through the provider's production functions, then writes a redacted replay
 * fixture. Nothing here runs under `npm test`.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classify, type RecorderStage as Stage } from "./live-fixture-recorder.js";

type Region = "global" | "cn";

interface RecordedInteraction {
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: unknown;
  };
  response: {
    status: number;
    headers: Record<string, string>;
    body: unknown;
  };
}

// These tables are used by fetch interception during recordRegion(). Keep them
// initialized before the top-level recording awaits begin.
const retainedHeaders = new Set([
  "accept",
  "content-type",
  "user-agent",
  "cosy-version",
  "cosy-clienttype",
  "x-model-key",
  "x-model-source",
]);

const sensitiveKeys = new Set([
  "token",
  "access_token",
  "refresh_token",
  "job_token",
  "job_refresh_token",
  "security_oauth_token",
  "personal_token",
  "authorization",
  "cookie",
  "set-cookie",
  "user_id",
  "userid",
  "uid",
  "machine_id",
  "machineid",
  "request_id",
  "requestid",
  "request_set_id",
  "chat_record_id",
  "session_id",
]);

const regions = parseRegions(process.argv.slice(2));
const pats = new Map<Region, string>();
for (const region of regions) {
  const pat = getPat(region);
  if (!pat) {
    const names =
      region === "global"
        ? "QODER_PAT / QODER_PERSONAL_ACCESS_TOKEN / QODER_API_KEY"
        : "QODERCN_PAT / QODERCN_PERSONAL_ACCESS_TOKEN / QODERCN_API_KEY";
    console.error(`[live] ${region}: missing ${names}; no requests were made`);
    process.exit(2);
  }
  pats.set(region, pat);
}

const workspace = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = join(workspace, "src", "__fixtures__", "live");
const temporaryHome = mkdtempSync(join(tmpdir(), "pi-provider-qoder-live-"));
process.env.HOME = temporaryHome;
process.env.USERPROFILE = temporaryHome;

const originalFetch = globalThis.fetch;

try {
  for (const region of regions) {
    await recordRegion(region, pats.get(region) as string);
  }
} finally {
  globalThis.fetch = originalFetch;
  rmSync(temporaryHome, { recursive: true, force: true });
}

function parseRegions(args: string[]): Region[] {
  const index = args.indexOf("--region");
  if (index === -1) return ["global", "cn"];
  const value = args[index + 1];
  if (value === "global" || value === "cn") return [value];
  console.error("Usage: npm run test:live -- [--region global|cn]");
  process.exit(2);
}

function getPat(region: Region): string {
  if (region === "cn") {
    return process.env.QODERCN_PAT || process.env.QODERCN_PERSONAL_ACCESS_TOKEN || process.env.QODERCN_API_KEY || "";
  }
  return process.env.QODER_PAT || process.env.QODER_PERSONAL_ACCESS_TOKEN || process.env.QODER_API_KEY || "";
}

async function recordRegion(region: Region, pat: string): Promise<void> {
  console.log(`[live] ${region}: recording PAT exchange, userinfo, model list, and chat`);
  const interactions = new Map<Stage, RecordedInteraction>();
  const pending: Promise<void>[] = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
    const stage = classify(url);
    const request = recordRequest(input, init, stage);
    const response = await originalFetch(input, init);
    const clone = response.clone();
    pending.push(
      readResponseText(clone, stage).then((text) => {
        interactions.set(stage, {
          request,
          response: {
            status: clone.status,
            headers: recordHeaders(clone.headers),
            body: redactResponseBody(stage, text),
          },
        });
      }),
    );
    return response;
  }) as typeof fetch;

  const { credentialsFromPat } = await import("../src/pat.js");
  const { getCachedModelConfig, getCachedModels, updateQoderModelsCache } = await import("../src/models.js");
  const { streamQoder } = await import("../src/stream.js");

  const credentials = (await credentialsFromPat(pat, region)) as unknown as {
    access: string;
    userID: string;
    email: string;
    name: string;
    machineID: string;
  };
  if (!credentials.access || !credentials.userID) {
    throw new Error(`[live] ${region}: PAT exchange/userinfo did not return a usable identity`);
  }

  const providerID = region === "cn" ? "qoder-cn" : "qoder";
  const authPath = join(temporaryHome, ".pi", "agent", "auth.json");
  mkdirSync(dirname(authPath), { recursive: true });
  const auth = existsSync(authPath) ? JSON.parse(readFileSync(authPath, "utf8")) : {};
  auth[providerID] = { type: "oauth", ...credentials };
  writeFileSync(authPath, JSON.stringify(auth), { mode: 0o600 });

  await updateQoderModelsCache(credentials.access, credentials.userID, credentials.name, credentials.email, region);
  const models = getCachedModels(region);
  const model =
    region === "global"
      ? models.find((candidate) => getCachedModelConfig(candidate.id, region)?.key === "lite")
      : models[0];
  if (!model) throw new Error(`[live] ${region}: model catalog returned no enabled model`);

  const events: Array<{
    type: string;
    message?: { content?: Array<{ type: string; text?: string }> };
    error?: unknown;
  }> = [];
  for await (const event of streamQoder(
    { ...model, provider: providerID } as never,
    {
      systemPrompt: "",
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      tools: [],
    } as never,
    { apiKey: credentials.access, maxTokens: 16 } as never,
  )) {
    events.push(event as (typeof events)[number]);
    if (event.type === "done" || event.type === "error") break;
  }
  const done = events.find((event) => event.type === "done");
  const text = done?.message?.content
    ?.filter((part) => part.type === "text")
    .map((part) => part.text || "")
    .join("")
    .trim();
  if (text !== "OK") throw new Error(`[live] ${region}: expected chat response "OK", received ${JSON.stringify(text)}`);

  await Promise.all(pending);
  for (const stage of ["patExchange", "userinfo", "modelList", "chat"] as const) {
    if (!interactions.has(stage)) throw new Error(`[live] ${region}: did not capture ${stage}`);
  }

  const fixture = {
    formatVersion: 1,
    source: "recorded",
    region,
    recordedAt: new Date().toISOString(),
    interactions: Object.fromEntries(interactions),
  };
  const output = `${JSON.stringify(fixture, null, 2)}\n`;
  assertRedacted(output);
  mkdirSync(fixtureDir, { recursive: true });
  const outputPath = join(fixtureDir, `recorded-${region}.json`);
  writeFileSync(outputPath, output, { mode: 0o600 });
  console.log(`[live] ${region}: PASS; wrote ${outputPath}`);
}

async function readResponseText(response: Response, stage: Stage): Promise<string> {
  if (stage !== "chat" || !response.body) return response.text();

  // Qoder sometimes sends the [DONE] sentinel without closing the HTTP body.
  // Stop the recording branch at that sentinel just like streamQoder does.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.includes('"body":"[DONE]"') || /(?:^|\n)data:\s*\[DONE\]\s*(?:\n|$)/.test(text)) {
        await reader.cancel();
        break;
      }
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function recordRequest(input: string | URL | Request, init: RequestInit | undefined, stage: Stage) {
  const url = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
  const method = init?.method || (input instanceof Request ? input.method : "GET");
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers) {
    for (const [name, value] of new Headers(init.headers)) headers.set(name, value);
  }
  let body: unknown = null;
  if (stage === "patExchange") {
    body = { personal_token: "<redacted:pat>" };
  } else if (stage === "chat") {
    const byteLength =
      typeof init?.body === "string"
        ? Buffer.byteLength(init.body)
        : init?.body instanceof Uint8Array
          ? init.body.byteLength
          : 0;
    body = { encoding: "qoder-waf", byteLength, value: "<redacted:encoded-request-body>" };
  }
  return { method, url, headers: recordHeaders(headers), body };
}

function recordHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(
    [...headers.entries()]
      .filter(([name]) => retainedHeaders.has(name.toLowerCase()))
      .map(([name, value]) => [name.toLowerCase(), value]),
  );
}

function redactResponseBody(stage: Stage, text: string): unknown {
  if (stage === "chat") return redactSse(text);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return redactString(text);
  }
  if (stage === "userinfo") return redactIdentity(value);
  return redactValue(value);
}

function redactIdentity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactIdentity);
  if (!value || typeof value !== "object") return redactValue(value);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => {
      const normalized = key.toLowerCase();
      if (["id", "user_id", "userid", "uid"].includes(normalized)) return [key, "<redacted:user-id>"];
      if (normalized === "email") return [key, "<redacted:email>"];
      if (normalized === "name" || normalized === "username") return [key, "<redacted:name>"];
      return [key, redactIdentity(child)];
    }),
  );
}

function redactSse(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (!line.startsWith("data:")) return line;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") return line;
      try {
        const envelope = JSON.parse(payload) as Record<string, unknown>;
        if (typeof envelope.body === "string" && envelope.body !== "[DONE]") {
          const envelopeBody = envelope.body;
          try {
            envelope.body = JSON.stringify(redactValue(JSON.parse(envelopeBody)));
          } catch {
            envelope.body = redactString(envelopeBody);
          }
        }
        return `data:${JSON.stringify(redactValue(envelope))}`;
      } catch {
        return `data:${redactString(payload)}`;
      }
    })
    .join("\n");
}

function redactValue(value: unknown, key = ""): unknown {
  const normalizedKey = key.toLowerCase();
  if (sensitiveKeys.has(normalizedKey) || normalizedKey === "id") {
    return `<redacted:${normalizedKey.replaceAll("_", "-")}>`;
  }
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
        childKey,
        redactValue(child, childKey),
      ]),
    );
  }
  return value;
}

function redactString(value: string): string {
  return value
    .replace(/\b(?:pt|jt|jrt)-[A-Za-z0-9._~-]+\b/g, "<redacted:token>")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "<redacted:email>");
}

function assertRedacted(output: string): void {
  const forbidden = [
    /\b(?:pt|jt|jrt)-[A-Za-z0-9._~-]{4,}\b/i,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /"authorization"\s*:/i,
    /"cookie"\s*:/i,
    /"cosy-key"\s*:/i,
    /Bearer\s+COSY\./i,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(output)) throw new Error(`[live] redaction failed: output matched ${pattern}`);
  }
}
