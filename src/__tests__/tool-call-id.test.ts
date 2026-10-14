import { describe, expect, it } from "vitest";
import { createQoderToolCallIdMapper } from "../protocol/tool-call-id.js";

const WIRE_ID = /^[a-zA-Z0-9_-]{1,64}$/;

describe("createQoderToolCallIdMapper", () => {
  it("passes through IDs that are already wire-valid", () => {
    const map = createQoderToolCallIdMapper();
    for (const id of ["call_abc123", "fc_1", "a", "-_AZaz09", "x".repeat(64)]) {
      expect(map(id)).toBe(id);
    }
  });

  it("rewrites IDs containing '|' to a 64-char qtc_ hex ID", () => {
    const map = createQoderToolCallIdMapper();
    const wire = map("call_1|fc_1");
    expect(wire).toMatch(/^qtc_[0-9a-f]{60}$/);
    expect(wire).toMatch(WIRE_ID);
    expect(wire).toHaveLength(64);
  });

  it("pins the digest scheme to a known vector", () => {
    // sha256("qoder-tool-call-id:v1\0" + original)[0:60] — changing the
    // domain separator, hash, or truncation changes every wire ID in existing
    // sessions, so the exact value is pinned here.
    const map = createQoderToolCallIdMapper();
    expect(map("call_fixture|fc_fixture")).toBe("qtc_ae79c0553526986e103018301821c6e48a4181aa373a996474e105442b1a");
  });

  it("returns the same wire ID for repeated sightings of one original", () => {
    // The assistant tool_calls entry and the later tool result carry the same
    // internal ID; both must map to the same wire value to stay paired.
    const map = createQoderToolCallIdMapper();
    expect(map("call_1|fc_1")).toBe(map("call_1|fc_1"));
  });

  it("hashes the complete ID, so a shared call_id prefix does not collide", () => {
    const map = createQoderToolCallIdMapper();
    expect(map("call_A|fc_A")).not.toBe(map("call_A|fc_B"));
  });

  it("rewrites overlong IDs even when their charset is valid", () => {
    const map = createQoderToolCallIdMapper();
    const wire = map(`call_${"x".repeat(100)}`);
    expect(wire).toMatch(/^qtc_[0-9a-f]{60}$/);
    expect(wire).toMatch(WIRE_ID);
  });

  it("re-hashes an input that already looks like a generated ID", () => {
    // The qtc_ + 60 hex namespace is reserved for generated values; letting
    // such an input pass through could collide with another ID's digest.
    const map = createQoderToolCallIdMapper();
    const spoof = `qtc_${"0".repeat(60)}`;
    const wire = map(spoof);
    expect(wire).not.toBe(spoof);
    expect(wire).toMatch(/^qtc_[0-9a-f]{60}$/);
  });

  it("is deterministic across mapper instances (cross-request stability)", () => {
    // Session history keeps raw IDs; a later request re-transforms them, and
    // the wire ID must be the one already sent or the tool pairing breaks.
    const original = "call_1|fc_1";
    expect(createQoderToolCallIdMapper()(original)).toBe(createQoderToolCallIdMapper()(original));
  });

  it("produces wire-valid output for arbitrary nasty inputs", () => {
    const map = createQoderToolCallIdMapper();
    for (const id of ["a|b|c", "has space", "uni✓code", "qtc_", "qtc_nothex", "|", "a".repeat(500)]) {
      expect(map(id)).toMatch(WIRE_ID);
    }
  });

  it("throws on empty or non-string IDs instead of sending an invalid request", () => {
    const map = createQoderToolCallIdMapper();
    expect(() => map("")).toThrow("non-empty string");
    expect(() => map(undefined as unknown as string)).toThrow("non-empty string");
    expect(() => map(null as unknown as string)).toThrow("non-empty string");
  });

  it("throws on a wire-ID collision instead of remapping silently", () => {
    const constantDigest = () => `qtc_${"f".repeat(60)}`;
    const map = createQoderToolCallIdMapper(constantDigest);
    map("call_A|fc_A");
    expect(() => map("call_B|fc_B")).toThrow("collision");
  });

  it("treats a pass-through ID as occupying its wire value", () => {
    const map = createQoderToolCallIdMapper(() => "plain_id");
    map("plain_id");
    expect(() => map("call_A|fc_A")).toThrow("collision");
  });
});
