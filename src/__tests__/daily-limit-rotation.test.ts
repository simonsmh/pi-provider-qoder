import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, AssistantMessageEvent, AssistantMessageEventStream, Context, Model } from "@earendil-works/pi-ai";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { clearQoderEndpointsCache, getCachedChatBaseUrl } from "../endpoints.js";
import { streamQoder } from "../protocol/stream.js";
import { clearQoderChatBaseUrlOverrides, getQoderChatBaseUrl } from "../region.js";
import { loadLiveFixture } from "./live-fixture.js";

vi.mock("../auth/oauth.js", () => ({
  resolveQoderIdentity: vi.fn().mockResolvedValue({
    access: "fake",
    userID: "test-user",
    email: "test@example.com",
    name: "Test User",
    machineID: "test-machine",
    refresh: "",
    expires: 0,
  }),
}));

const SUCCESS_SSE = loadLiveFixture("global").interactions.chat.response.body as string;

function sseEnvelope(body: object, statusCodeValue = 200, statusCode = "OK"): string {
  return (
    "data:" +
    JSON.stringify({
      headers: { "Content-Type": ["application/json"] },
      body: JSON.stringify(body),
      statusCodeValue,
      statusCode,
    }) +
    "\n\n"
  );
}

const DAILY_LIMIT_SSE = sseEnvelope({ code: "110", message: "Billing daily count exceeded" }, 403);

function makeModel(): Model<Api> {
  return { id: "Lite", api: "qoder-api" as Api, provider: "qoder" } as Model<Api>;
}

function makeContext(): Context {
  return {
    systemPrompt: "test",
    messages: [{ role: "user", content: "hi" }],
    tools: [],
  } as unknown as Context;
}

async function consume(stream: AssistantMessageEventStream): Promise<AssistantMessageEvent[]> {
  const events: AssistantMessageEvent[] = [];
  for await (const ev of stream) {
    events.push(ev);
    if (ev.type === "done" || ev.type === "error") break;
  }
  return events;
}

// Keep the endpoints cache off the real HOME file: the rotation persists the
// serving node into it, and parallel test files would otherwise race on it.
const originalCachePath = process.env.QODER_ENDPOINTS_CACHE_PATH;
process.env.QODER_ENDPOINTS_CACHE_PATH = join(mkdtempSync(join(tmpdir(), "qoder-endpoints-test-")), "cache.json");

afterAll(() => {
  if (originalCachePath === undefined) delete process.env.QODER_ENDPOINTS_CACHE_PATH;
  else process.env.QODER_ENDPOINTS_CACHE_PATH = originalCachePath;
});

describe("daily chat limit recovery", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearQoderChatBaseUrlOverrides();
    clearQoderEndpointsCache();
    vi.restoreAllMocks();
  });

  it("switches to the remote-agent node, retries, and persists the node", async () => {
    const endpointsFixture = JSON.parse(
      await import("node:fs").then((fs) =>
        fs.readFileSync(new URL("../__fixtures__/region-endpoints.json", import.meta.url), "utf8"),
      ),
    ) as { encoded: string };
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push(url);
      if (url.includes("/service/region/endpoints")) {
        return new Response(endpointsFixture.encoded, { status: 200 });
      }
      if (url.startsWith("https://api3.qoder.sh/")) {
        return new Response(DAILY_LIMIT_SSE, { status: 200 });
      }
      if (url.startsWith("https://api2.qoder.sh/")) {
        return new Response(SUCCESS_SSE, { status: 200 });
      }
      return new Response("unexpected url", { status: 500 });
    }) as unknown as typeof fetch;

    const events = await consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake" }));

    expect(events.some((ev) => ev.type === "error")).toBe(false);
    const chatCalls = calls.filter((url) => url.includes("agent_chat_generation"));
    expect(chatCalls[0]?.startsWith("https://api3.qoder.sh/")).toBe(true);
    expect(chatCalls[1]?.startsWith("https://api2.qoder.sh/")).toBe(true);
    expect(getQoderChatBaseUrl("global")).toBe("https://api2.qoder.sh/");
    expect(getCachedChatBaseUrl("global")).toBe("https://api2.qoder.sh/");
  });

  it("also rotates when the 110 rejection arrives as a plain HTTP error", async () => {
    const endpointsFixture = JSON.parse(
      await import("node:fs").then((fs) =>
        fs.readFileSync(new URL("../__fixtures__/region-endpoints.json", import.meta.url), "utf8"),
      ),
    ) as { encoded: string };
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push(url);
      if (url.includes("/service/region/endpoints")) {
        return new Response(endpointsFixture.encoded, { status: 200 });
      }
      if (url.startsWith("https://api3.qoder.sh/")) {
        return new Response(JSON.stringify({ code: "110", message: "Billing daily count exceeded" }), {
          status: 403,
        });
      }
      if (url.startsWith("https://api2.qoder.sh/")) {
        return new Response(SUCCESS_SSE, { status: 200 });
      }
      return new Response("unexpected url", { status: 500 });
    }) as unknown as typeof fetch;

    const events = await consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake" }));

    expect(events.some((ev) => ev.type === "error")).toBe(false);
    const chatCalls = calls.filter((url) => url.includes("agent_chat_generation"));
    expect(chatCalls[0]?.startsWith("https://api3.qoder.sh/")).toBe(true);
    expect(chatCalls[1]?.startsWith("https://api2.qoder.sh/")).toBe(true);
    expect(getQoderChatBaseUrl("global")).toBe("https://api2.qoder.sh/");
    expect(getCachedChatBaseUrl("global")).toBe("https://api2.qoder.sh/");
  });

  it("surfaces the rejection when no other node is available", async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/service/region/endpoints")) return new Response("no", { status: 500 });
      return new Response(DAILY_LIMIT_SSE, { status: 200 });
    }) as unknown as typeof fetch;

    const events = await consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake" }));

    const error = events.find((ev) => ev.type === "error");
    expect(error).toBeDefined();
    expect(JSON.stringify(error)).toContain("110");
  });
});
