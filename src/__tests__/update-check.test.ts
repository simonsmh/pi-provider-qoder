import { describe, expect, it, vi } from "vitest";
import {
  checkForUpdate,
  compareVersions,
  fetchLatestVersion,
  formatUpdateNotice,
  parseSemver,
  REGISTRY_URL,
} from "../update-check.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("parseSemver", () => {
  it("accepts plain, prefixed, and prerelease versions", () => {
    expect(parseSemver("0.6.9")).toEqual([0, 6, 9]);
    expect(parseSemver("v1.2.3")).toEqual([1, 2, 3]);
    expect(parseSemver("1.2.3-beta.1")).toEqual([1, 2, 3]);
  });

  it("rejects values without a numeric triple", () => {
    expect(parseSemver("latest")).toBeNull();
    expect(parseSemver("")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("orders by each numeric segment", () => {
    expect(compareVersions("0.6.9", "0.6.1")).toBeGreaterThan(0);
    expect(compareVersions("0.5.0", "0.6.1")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  it("treats incomparable versions as equal so a bad registry value never nags", () => {
    expect(compareVersions("latest", "0.6.1")).toBe(0);
  });
});

describe("formatUpdateNotice", () => {
  it("reports a newer release with the upgrade command", () => {
    expect(formatUpdateNotice("0.6.1", "0.6.9")).toBe(
      "[pi-provider-qoder] 0.6.9 is available (running 0.6.1). Upgrade: omp plugin upgrade pi-provider-qoder",
    );
  });

  it("stays silent when current, newer than published, or unparsable", () => {
    expect(formatUpdateNotice("0.6.9", "0.6.9")).toBeNull();
    expect(formatUpdateNotice("0.7.0", "0.6.9")).toBeNull();
    expect(formatUpdateNotice("0.6.9", "not-a-version")).toBeNull();
  });
});

describe("fetchLatestVersion", () => {
  it("reads the version field from the registry response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ version: "0.6.9" }));
    await expect(fetchLatestVersion(fetchImpl as unknown as typeof fetch)).resolves.toBe("0.6.9");
    expect(fetchImpl).toHaveBeenCalledWith(REGISTRY_URL, expect.objectContaining({ signal: expect.anything() }));
  });

  it("returns null on a non-2xx response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    await expect(fetchLatestVersion(fetchImpl as unknown as typeof fetch)).resolves.toBeNull();
  });

  it("returns null when the payload has no string version", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ version: 1 }));
    await expect(fetchLatestVersion(fetchImpl as unknown as typeof fetch)).resolves.toBeNull();
  });

  it("swallows network errors and aborts instead of throwing", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(fetchLatestVersion(failing as unknown as typeof fetch)).resolves.toBeNull();

    const hanging = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    await expect(fetchLatestVersion(hanging as unknown as typeof fetch, 5)).resolves.toBeNull();
  });
});

describe("checkForUpdate", () => {
  it("returns the notice when the registry is ahead", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ version: "0.7.0" }));
    await expect(
      checkForUpdate({ currentVersion: "0.6.9", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toContain("0.7.0 is available");
  });

  it("skips the network entirely when disabled", async () => {
    const fetchImpl = vi.fn();
    await expect(
      checkForUpdate({ currentVersion: "0.6.9", disabled: true, fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
