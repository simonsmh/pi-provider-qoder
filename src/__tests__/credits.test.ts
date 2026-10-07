import { describe, expect, it } from "vitest";
import { applyQoderCredits, chargedCredits, creditsToUsd, type QoderUsage } from "../credits.js";

function usage(): QoderUsage {
  return {
    input: 15,
    output: 179,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 194,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

describe("Qoder request credit accounting", () => {
  it("preserves non-billable Global usage without charging its positive nominal Credits", () => {
    const result = usage();
    applyQoderCredits(result, {
      credits: 0.005221428571428571,
      original_credits: 0.005221428571428571,
      billable: false,
    });
    expect(result.credits).toBe(0.005221428571428571);
    expect(result.original_credits).toBe(result.credits);
    expect(result.billable).toBe(false);
    expect(result.charged_credits).toBe(0);
    expect(result.usd_equivalent).toBe(0);
    expect(result.cost.total).toBe(0);
  });
  it("records billable CN Credits at full precision and exposes the reference USD equivalent", () => {
    const result = usage();
    applyQoderCredits(result, { credits: 0.0006132719999999999, original_credits: 0.001226544, billable: true });
    expect(result.charged_credits).toBe(0.0006132719999999999);
    expect(result.usd_equivalent).toBeCloseTo(0.00000817696, 12);
    expect(result.cost.total).toBe(0);
    expect(creditsToUsd(1500)).toBe(20);
  });
  it("uses the latest request snapshot once, preserves metadata across token-only chunks and serialization", () => {
    const result = usage();
    applyQoderCredits(result, { credits: 1, billable: true });
    applyQoderCredits(result, { credits: 2, original_credits: 4 });
    applyQoderCredits(result, { total_tokens: 194 });
    expect(result.charged_credits).toBe(2);
    expect(chargedCredits(JSON.parse(JSON.stringify(result)))).toBe(2);
  });
  it("distinguishes a reported zero charge from missing billing metadata", () => {
    const result = usage();
    expect(chargedCredits(result)).toBeUndefined();
    applyQoderCredits(result, { credits: 0 });
    expect(result.charged_credits).toBeUndefined();
    applyQoderCredits(result, { billable: true });
    expect(result.charged_credits).toBe(0);
  });
  it.each([null, "2", -1, Number.NaN, Number.POSITIVE_INFINITY])("does not accept invalid credit value %s", (value) => {
    const result = usage();
    applyQoderCredits(result, { credits: value, original_credits: value, billable: true });
    expect(result.credits).toBeUndefined();
    expect(result.original_credits).toBeUndefined();
    expect(result.charged_credits).toBeUndefined();
  });
});
