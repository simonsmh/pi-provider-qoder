import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodePatRefresh,
  encodePatRefresh,
  exchangeJobToken,
  fetchUserInfo,
  isPatRefresh,
  PAT_REFRESH_PREFIX,
} from "../auth/pat.js";
import { loadLiveFixture, responseFromFixture } from "./live-fixture.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── isPatRefresh ──────────────────────────────────────────────────────────

describe("isPatRefresh", () => {
  it("returns true for PAT refresh strings", () => {
    expect(isPatRefresh("pat|mytoken|refresh123|user1|machine1")).toBe(true);
  });

  it("returns true for minimal PAT prefix", () => {
    expect(isPatRefresh("pat|")).toBe(true);
  });

  it("returns false for non-PAT refresh strings", () => {
    expect(isPatRefresh("some-other-refresh-token")).toBe(false);
    expect(isPatRefresh("refresh|user|machine")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isPatRefresh("")).toBe(false);
  });
});

// ── encodePatRefresh / decodePatRefresh ───────────────────────────────────

describe("encodePatRefresh / decodePatRefresh roundtrip", () => {
  it("encodes and decodes correctly", () => {
    const encoded = encodePatRefresh("pt-abc123", "jrt-xyz", "user-42", "machine-7");
    expect(encoded).toBe("pat|pt-abc123|jrt-xyz|user-42|machine-7");

    const decoded = decodePatRefresh(encoded);
    expect(decoded).toEqual({
      pat: "pt-abc123",
      jobRefreshToken: "jrt-xyz",
      userID: "user-42",
      machineID: "machine-7",
    });
  });

  it("handles empty fields", () => {
    const encoded = encodePatRefresh("", "", "", "");
    expect(encoded).toBe("pat||||");

    const decoded = decodePatRefresh(encoded);
    expect(decoded).toEqual({
      pat: "",
      jobRefreshToken: "",
      userID: "",
      machineID: "",
    });
  });

  it("handles pipe characters in fields gracefully", () => {
    // The decode splits on |, so extra pipes shift fields
    const encoded = encodePatRefresh("pt-test", "jrt-ok", "u1", "m1");
    const decoded = decodePatRefresh(encoded);
    expect(decoded.pat).toBe("pt-test");
    expect(decoded.jobRefreshToken).toBe("jrt-ok");
    expect(decoded.userID).toBe("u1");
    expect(decoded.machineID).toBe("m1");
  });
});

describe("PAT_REFRESH_PREFIX", () => {
  it('is "pat"', () => {
    expect(PAT_REFRESH_PREFIX).toBe("pat");
  });
});

describe("recorded-format PAT protocol fixtures", () => {
  const fixture = loadLiveFixture("global");

  it("replays PAT exchange response shape", async () => {
    const interaction = fixture.interactions.patExchange;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseFromFixture(interaction)));

    const result = await exchangeJobToken("test-pat", "global");

    expect(result.jobToken).toBe("<redacted:job-token>");
    expect(result.jobRefreshToken).toBe("<redacted:refresh-token>");
    expect(result.expiresAt).toBeGreaterThan(Date.now());
    expect(fetch).toHaveBeenCalledWith(
      interaction.request.url,
      expect.objectContaining({
        method: interaction.request.method,
        headers: expect.objectContaining({
          "Cosy-Version": interaction.request.headers["cosy-version"],
        }),
      }),
    );
  });

  it("replays userinfo response shape", async () => {
    const interaction = fixture.interactions.userinfo;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseFromFixture(interaction)));
    const body = interaction.response.body as { id: string; email: string; name: string };

    await expect(fetchUserInfo("test-job-token", "global")).resolves.toEqual({
      userID: body.id,
      email: body.email,
      name: body.name,
    });
  });
});
