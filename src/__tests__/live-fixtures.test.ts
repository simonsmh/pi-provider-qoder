import { describe, expect, it } from "vitest";
import { loadLiveFixture } from "./live-fixture.js";

describe.each(["global", "cn"] as const)("%s protocol replay fixture", (region) => {
  const fixture = loadLiveFixture(region);

  it("contains all live recorder protocol stages", () => {
    expect(fixture).toMatchObject({
      formatVersion: 1,
      source: "sample",
      region,
      recordedAt: null,
    });
    expect(Object.keys(fixture.interactions).sort()).toEqual(["chat", "modelList", "patExchange", "userinfo"]);
  });

  it("preserves the Qoder SSE envelope with a JSON-string body", () => {
    const body = fixture.interactions.chat.response.body;
    expect(typeof body).toBe("string");
    const dataLines = (body as string).split("\n").filter((line) => line.startsWith("data:"));
    expect(dataLines.length).toBeGreaterThanOrEqual(3);

    const firstEnvelope = JSON.parse(dataLines[0].slice(5)) as {
      body: string;
      statusCodeValue: number;
    };
    expect(firstEnvelope.statusCodeValue).toBe(200);
    expect(typeof firstEnvelope.body).toBe("string");
    expect(() => JSON.parse(firstEnvelope.body)).not.toThrow();
    expect(dataLines.some((line) => line.includes('"body":"[DONE]"'))).toBe(true);
  });

  it("contains placeholders, not credential-shaped values", () => {
    const serialized = JSON.stringify(fixture);
    expect(serialized).toContain("<redacted:");
    expect(serialized).not.toMatch(/\b(?:pt|jt|jrt)-[A-Za-z0-9._~-]{4,}\b/);
    expect(serialized).not.toMatch(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
    expect(serialized).not.toMatch(/Bearer\s+COSY\./i);
    expect(serialized).not.toMatch(/"authorization"\s*:/i);
    expect(serialized).not.toMatch(/"cookie"\s*:/i);
  });
});
