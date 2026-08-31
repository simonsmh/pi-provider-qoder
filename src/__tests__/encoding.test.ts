import { describe, expect, it } from "vitest";
import { qoderEncodeBody } from "../protocol/encoding.js";

describe("qoderEncodeBody", () => {
  it("encodes a simple string", () => {
    const result = qoderEncodeBody("hello");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
    // Should not contain standard base64 padding char '='
    expect(result).not.toContain("=");
  });

  it("encodes a Buffer", () => {
    const buf = Buffer.from("hello world");
    const result = qoderEncodeBody(buf);
    expect(result).toBeTruthy();
    expect(result).not.toContain("=");
  });

  it("produces deterministic output", () => {
    const a = qoderEncodeBody("test input");
    const b = qoderEncodeBody("test input");
    expect(a).toBe(b);
  });

  it("produces different output for different inputs", () => {
    const a = qoderEncodeBody("input A");
    const b = qoderEncodeBody("input B");
    expect(a).not.toBe(b);
  });

  it("handles empty string", () => {
    const result = qoderEncodeBody("");
    expect(result).toBe("");
  });

  it("handles empty Buffer", () => {
    const result = qoderEncodeBody(Buffer.alloc(0));
    expect(result).toBe("");
  });

  it("replaces '=' padding with '$'", () => {
    // Base64 of "a" is "YQ==" which has padding — our encoding should use $
    const result = qoderEncodeBody("a");
    expect(result).not.toContain("=");
    expect(result).toContain("$");
  });

  it("uses custom alphabet (not standard base64)", () => {
    const result = qoderEncodeBody("The quick brown fox");
    // Standard base64 would use A-Za-z0-9+/=
    // Our encoding uses a custom alphabet, so the output should differ
    const stdBase64 = Buffer.from("The quick brown fox").toString("base64");
    expect(result).not.toBe(stdBase64);
  });

  it("handles binary content", () => {
    const binary = Buffer.from([0x00, 0xff, 0x80, 0x7f, 0x01]);
    const result = qoderEncodeBody(binary);
    expect(result).toBeTruthy();
    expect(result).not.toContain("=");
  });

  it("handles JSON content", () => {
    const json = JSON.stringify({ key: "value", num: 42 });
    const result = qoderEncodeBody(json);
    expect(result).toBeTruthy();
    expect(result).not.toContain("=");
  });
});
