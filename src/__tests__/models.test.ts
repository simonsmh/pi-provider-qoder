import { describe, expect, it } from "vitest";
import { staticCnModels, staticModels, ZERO_COST } from "../models.js";

// ── staticModels ──────────────────────────────────────────────────────────

describe("staticModels", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(staticModels)).toBe(true);
    expect(staticModels.length).toBeGreaterThan(0);
  });

  it("has auto as first entry", () => {
    expect(staticModels[0].id).toBe("auto");
  });

  it("every model has required fields", () => {
    for (const m of staticModels) {
      expect(m.id).toBeTruthy();
      expect(m.name).toBeTruthy();
      expect(m.api).toBe("qoder-api");
      expect(m.provider).toBe("qoder");
      expect(m.baseUrl).toBeTruthy();
      expect(typeof m.reasoning).toBe("boolean");
      expect(typeof m.supportsEffort).toBe("boolean");
      expect(Array.isArray(m.input)).toBe(true);
      expect(m.cost).toBe(ZERO_COST);
      expect(m.contextWindow).toBeGreaterThan(0);
      expect(m.maxTokens).toBeGreaterThan(0);
    }
  });

  it("has unique IDs", () => {
    const ids = staticModels.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── staticCnModels ────────────────────────────────────────────────────────

describe("staticCnModels", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(staticCnModels)).toBe(true);
    expect(staticCnModels.length).toBeGreaterThan(0);
  });

  it("has Auto as first entry", () => {
    expect(staticCnModels[0].id).toBe("Auto");
  });

  it("every CN model has required fields", () => {
    for (const m of staticCnModels) {
      expect(m.id).toBeTruthy();
      expect(m.name).toBeTruthy();
      expect(m.api).toBe("qoder-api");
      expect(m.provider).toBe("qoder-cn");
      expect(m.baseUrl).toContain("qoder.com.cn");
      expect(typeof m.reasoning).toBe("boolean");
      expect(typeof m.supportsEffort).toBe("boolean");
      expect(Array.isArray(m.input)).toBe(true);
      expect(m.cost).toBe(ZERO_COST);
      expect(m.contextWindow).toBeGreaterThan(0);
      expect(m.maxTokens).toBeGreaterThan(0);
    }
  });

  it("has unique IDs", () => {
    const ids = staticCnModels.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every CN model has a description", () => {
    for (const m of staticCnModels) {
      expect(m.description).toBeTruthy();
    }
  });
});

// ── ZERO_COST ─────────────────────────────────────────────────────────────

describe("ZERO_COST", () => {
  it("has all zero values", () => {
    expect(ZERO_COST).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  });

  it("is frozen", () => {
    expect(Object.isFrozen(ZERO_COST)).toBe(true);
  });
});
