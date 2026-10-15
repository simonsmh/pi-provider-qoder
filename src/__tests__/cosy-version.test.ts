import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUNDLED_GATEWAY_COSY_VERSION,
  clearCosyVersionMemCache,
  compareCliVersions,
  getGatewayCosyVersion,
  isCliVersion,
  refreshGatewayCosyVersion,
} from "../cosy-version.js";

const cachePath = join(process.env.HOME as string, ".pi", "agent", "qoder-cosy-version-cache.json");

function seedCache(data: unknown): void {
  writeFileSync(cachePath, JSON.stringify(data), "utf-8");
  clearCosyVersionMemCache();
}

function stubReleasesFetch(releases: unknown, ok = true): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => releases,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  rmSync(cachePath, { force: true });
  clearCosyVersionMemCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(cachePath, { force: true });
  clearCosyVersionMemCache();
});

describe("cosy version resolution", () => {
  it("falls back to the bundled version when no cache exists", () => {
    expect(getGatewayCosyVersion()).toBe(BUNDLED_GATEWAY_COSY_VERSION);
  });

  it("uses a cached version that is ahead of the bundled fallback", () => {
    seedCache({ version: "1.1.99", checkedAt: Date.now() });
    expect(getGatewayCosyVersion()).toBe("1.1.99");
  });

  it("never lets a stale cached version downgrade the bundled fallback", () => {
    seedCache({ version: "1.1.1", checkedAt: Date.now() });
    expect(getGatewayCosyVersion()).toBe(BUNDLED_GATEWAY_COSY_VERSION);
  });

  it("ignores malformed cache content", () => {
    writeFileSync(cachePath, "not json", "utf-8");
    clearCosyVersionMemCache();
    expect(getGatewayCosyVersion()).toBe(BUNDLED_GATEWAY_COSY_VERSION);
  });

  it("validates and compares x.y.z versions numerically", () => {
    expect(isCliVersion("1.1.72")).toBe(true);
    expect(isCliVersion("v1.1.72")).toBe(false);
    expect(isCliVersion("1.1")).toBe(false);
    expect(isCliVersion(172)).toBe(false);
    expect(compareCliVersions("1.1.72", "1.1.71")).toBeGreaterThan(0);
    expect(compareCliVersions("1.2.0", "1.1.99")).toBeGreaterThan(0);
    expect(compareCliVersions("1.1.72", "1.1.72")).toBe(0);
  });
});

describe("refreshGatewayCosyVersion", () => {
  it("caches the latest stable release tag and signs with it", async () => {
    stubReleasesFetch([
      { tag_name: "1.1.73", draft: false, prerelease: false },
      { tag_name: "1.1.72", draft: false, prerelease: false },
    ]);
    await refreshGatewayCosyVersion({ force: true });
    expect(getGatewayCosyVersion()).toBe("1.1.73");
    const saved = JSON.parse(readFileSync(cachePath, "utf8")) as { version?: string };
    expect(saved.version).toBe("1.1.73");
  });

  it("skips drafts, prereleases, and malformed tags", async () => {
    stubReleasesFetch([
      { tag_name: "1.1.99", draft: false, prerelease: true },
      { tag_name: "1.1.98", draft: true, prerelease: false },
      { tag_name: "nightly", draft: false, prerelease: false },
      { tag_name: "1.1.80", draft: false, prerelease: false },
    ]);
    await refreshGatewayCosyVersion({ force: true });
    expect(getGatewayCosyVersion()).toBe("1.1.80");
  });

  it("does not downgrade when the feed is behind the bundled fallback", async () => {
    stubReleasesFetch([{ tag_name: "1.1.1", draft: false, prerelease: false }]);
    await refreshGatewayCosyVersion({ force: true });
    expect(getGatewayCosyVersion()).toBe(BUNDLED_GATEWAY_COSY_VERSION);
  });

  it("keeps the bundled fallback when the fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await refreshGatewayCosyVersion({ force: true });
    expect(getGatewayCosyVersion()).toBe(BUNDLED_GATEWAY_COSY_VERSION);
    expect(existsSync(cachePath)).toBe(false);
  });

  it("keeps the bundled fallback on a non-OK response", async () => {
    stubReleasesFetch([], false);
    await refreshGatewayCosyVersion({ force: true });
    expect(getGatewayCosyVersion()).toBe(BUNDLED_GATEWAY_COSY_VERSION);
  });

  it("throttles repeat checks within the refresh interval", async () => {
    const fetchMock = stubReleasesFetch([{ tag_name: "1.1.90", draft: false, prerelease: false }]);
    await refreshGatewayCosyVersion({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await refreshGatewayCosyVersion();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await refreshGatewayCosyVersion({ now: Date.now() + 25 * 60 * 60 * 1000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
