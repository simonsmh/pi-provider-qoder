import { describe, expect, it } from "vitest";
import {
  contextWindowFromCatalog,
  DEFAULT_CONTEXT_WINDOW,
  staticCnModels,
  staticModels,
  ZERO_COST,
} from "../models.js";

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

  it("uses a 1M context window for models confirmed to support it", () => {
    // Global lite was live-tested through 1,000K tokens (issue #13). auto,
    // efficient, and gm51model share the same Qoder 1M catalog family.
    for (const id of ["auto", "efficient", "lite", "gm51model"]) {
      const model = staticModels.find((m) => m.id === id);
      expect(model, id).toBeDefined();
      expect(model?.contextWindow).toBe(DEFAULT_CONTEXT_WINDOW);
      expect(model?.contextWindow).toBe(1_000_000);
    }
  });

  it("keeps kmodel at the catalog-advertised 256K window", () => {
    expect(staticModels.find((m) => m.id === "kmodel")?.contextWindow).toBe(256000);
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

  it("does not copy global 1M onto CN models whose live catalog is smaller", () => {
    expect(staticCnModels.find((m) => m.id === "Auto")?.contextWindow).toBe(200000);
    expect(staticCnModels.find((m) => m.id === "GLM-5.2")?.contextWindow).toBe(200000);
    expect(staticCnModels.find((m) => m.id === "MiniMax-M2.7")?.contextWindow).toBe(200000);
    expect(staticCnModels.find((m) => m.id === "Kimi-K2.7-Code")?.contextWindow).toBe(256000);
  });
});

describe("contextWindowFromCatalog", () => {
  it("uses the largest advertised context_config token_count", () => {
    expect(
      contextWindowFromCatalog({
        context_config: {
          small: { token_count: 200000 },
          large: { token_count: 1000000, is_default: true },
        },
      }),
    ).toBe(1000000);
  });

  it("keeps an advertised 200K window instead of the 1M fallback", () => {
    expect(
      contextWindowFromCatalog({
        context_config: { default: { token_count: 200000, is_default: true } },
      }),
    ).toBe(200000);
  });

  it("falls back to 1M when the catalog omits context_config", () => {
    expect(contextWindowFromCatalog({ key: "lite", max_input_tokens: 180000 })).toBe(DEFAULT_CONTEXT_WINDOW);
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
