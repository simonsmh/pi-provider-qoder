import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  applyCachedChatEndpoint,
  chatEndpointCandidates,
  clearQoderEndpointsCache,
  fetchQoderRegionEndpoints,
  getCachedChatBaseUrl,
  parseQoderRegionEndpoints,
  refreshChatEndpoint,
  rememberChatBaseUrl,
  rotateChatEndpoint,
} from "../endpoints.js";
import { qoderEncodeBody } from "../protocol/encoding.js";
import { clearQoderChatBaseUrlOverrides, getQoderChatBaseUrl, getQoderChatURL } from "../region.js";

const fixture = JSON.parse(readFileSync(new URL("../__fixtures__/region-endpoints.json", import.meta.url), "utf8")) as {
  encoded: string;
  plaintext: string;
};

const credentials = {
  userID: "user-id",
  authToken: "access-token",
  name: "name",
  email: "user@example.com",
  machineID: "machine-id",
};

// Keep the endpoints cache off the real HOME file: these tests write it on
// every run, and parallel test files would otherwise race on it (and pollute
// the user's own cache).
const originalCachePath = process.env.QODER_ENDPOINTS_CACHE_PATH;
process.env.QODER_ENDPOINTS_CACHE_PATH = join(mkdtempSync(join(tmpdir(), "qoder-endpoints-test-")), "cache.json");

afterAll(() => {
  if (originalCachePath === undefined) delete process.env.QODER_ENDPOINTS_CACHE_PATH;
  else process.env.QODER_ENDPOINTS_CACHE_PATH = originalCachePath;
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearQoderEndpointsCache();
  clearQoderChatBaseUrlOverrides();
});

describe("parseQoderRegionEndpoints", () => {
  it("extracts the node classes from a real account map", () => {
    expect(parseQoderRegionEndpoints(JSON.parse(fixture.plaintext))).toEqual({
      inferNodes: ["https://api3.qoder.sh/"],
      remoteAgentNodes: ["https://api2.qoder.sh/"],
      securityNodes: ["https://api2.qoder.sh/"],
      centerNodes: ["https://center.qoder.sh/"],
    });
  });

  it("rejects payloads without any usable node", () => {
    expect(parseQoderRegionEndpoints({})).toBeUndefined();
    expect(parseQoderRegionEndpoints({ inferNodes: [] })).toBeUndefined();
    expect(parseQoderRegionEndpoints(null)).toBeUndefined();
  });
});

describe("chatEndpointCandidates", () => {
  it("keeps the current node first and prefers the remote-agent node", () => {
    const endpoints = parseQoderRegionEndpoints(JSON.parse(fixture.plaintext));
    expect(chatEndpointCandidates(endpoints, "https://api3.qoder.sh/")).toEqual([
      "https://api3.qoder.sh/",
      "https://api2.qoder.sh/",
    ]);
  });

  it("falls back to the current node when discovery returned nothing", () => {
    expect(chatEndpointCandidates(undefined, "https://api3.qoder.sh")).toEqual(["https://api3.qoder.sh/"]);
  });
});

describe("chat endpoint cache", () => {
  it("returns a remembered node inside the TTL and expires it after", () => {
    const now = Date.now();
    rememberChatBaseUrl("global", "https://api2.qoder.sh", now);
    expect(getCachedChatBaseUrl("global", now + 60_000)).toBe("https://api2.qoder.sh/");
    expect(getCachedChatBaseUrl("global", now + 2 * 60 * 60 * 1000)).toBeUndefined();
  });

  it("applies the cached node to chat only", () => {
    rememberChatBaseUrl("global", "https://api2.qoder.sh");
    expect(applyCachedChatEndpoint("global")).toBe("https://api2.qoder.sh/");
    expect(getQoderChatURL("global")).toContain("https://api2.qoder.sh/algo/api/v2/service/pro/sse");
  });
});

describe("fetchQoderRegionEndpoints", () => {
  it("decodes the encoded response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(fixture.encoded, { status: 200 })));
    const endpoints = await fetchQoderRegionEndpoints("global", credentials);
    expect(endpoints?.remoteAgentNodes).toEqual(["https://api2.qoder.sh/"]);
  });

  it("accepts a plain JSON response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(fixture.plaintext, { status: 200 })));
    const endpoints = await fetchQoderRegionEndpoints("global", credentials);
    expect(endpoints?.inferNodes).toEqual(["https://api3.qoder.sh/"]);
  });

  it("returns undefined on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
    await expect(fetchQoderRegionEndpoints("global", credentials)).resolves.toBeUndefined();
  });

  it("returns undefined when the body is not parseable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));
    await expect(fetchQoderRegionEndpoints("global", credentials)).resolves.toBeUndefined();
  });
});

describe("refreshChatEndpoint", () => {
  it("routes chat to the remote-agent node and persists it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(qoderEncodeBody(fixture.plaintext).toString("ascii"), { status: 200 })),
    );
    await expect(refreshChatEndpoint("global", credentials)).resolves.toBe("https://api2.qoder.sh/");
    expect(getQoderChatBaseUrl("global")).toBe("https://api2.qoder.sh/");
    expect(getCachedChatBaseUrl("global")).toBe("https://api2.qoder.sh/");
  });

  it("keeps the default node when discovery fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));
    await expect(refreshChatEndpoint("global", credentials)).resolves.toBeUndefined();
    expect(getQoderChatBaseUrl("global")).toBe("https://api3.qoder.sh/");
  });

  it("does nothing without credentials", async () => {
    await expect(refreshChatEndpoint("global", undefined)).resolves.toBeUndefined();
    expect(getQoderChatBaseUrl("global")).toBe("https://api3.qoder.sh/");
  });
});

describe("rotateChatEndpoint", () => {
  it("moves off the failing node and stops when candidates run out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(fixture.encoded, { status: 200 })));
    const attempted = new Set<string>();

    await expect(rotateChatEndpoint("global", credentials, attempted)).resolves.toBe("https://api2.qoder.sh/");
    expect(attempted).toEqual(new Set(["https://api3.qoder.sh/", "https://api2.qoder.sh/"]));
    await expect(rotateChatEndpoint("global", credentials, attempted)).resolves.toBeUndefined();
  });

  it("without discovery it can only conclude no other node exists", async () => {
    const attempted = new Set<string>();
    await expect(rotateChatEndpoint("global", undefined, attempted)).resolves.toBeUndefined();
  });
});
