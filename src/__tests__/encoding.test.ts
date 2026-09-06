import { describe, expect, it } from "vitest";
import { qoderEncodeBody } from "../protocol/encoding.js";

/** Reference encoder matching the pre-Buffer string implementation (byte-identical). */
function qoderEncodeBodyLegacyString(plaintext: string | Buffer): string {
  const qoderCustomAlphabet = "_doRTgHZBKcGVjlvpC,@aFSx#DPuNJme&i*MzLOEn)sUrthbf%Y^w.(kIQyXqWA!";
  const qoderStdAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const encodeTable = new Uint8Array(256);
  for (let i = 0; i < encodeTable.length; i++) encodeTable[i] = i;
  for (let i = 0; i < qoderStdAlphabet.length; i++) {
    encodeTable[qoderStdAlphabet.charCodeAt(i)] = qoderCustomAlphabet.charCodeAt(i);
  }
  encodeTable["=".charCodeAt(0)] = "$".charCodeAt(0);

  const std = Buffer.isBuffer(plaintext) ? plaintext.toString("base64") : Buffer.from(plaintext).toString("base64");
  const src = Buffer.from(std, "ascii");
  const n = src.length;
  const a = Math.floor(n / 3);
  const out = Buffer.allocUnsafe(n);
  let dst = 0;
  for (let i = n - a; i < n; i++) out[dst++] = encodeTable[src[i]];
  for (let i = a; i < n - a; i++) out[dst++] = encodeTable[src[i]];
  for (let i = 0; i < a; i++) out[dst++] = encodeTable[src[i]];
  return out.toString("ascii");
}

describe("qoderEncodeBody", () => {
  it("encodes a simple string", () => {
    const result = qoderEncodeBody("hello");
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString("ascii")).toBeTruthy();
    expect(result.toString("ascii")).not.toContain("=");
  });

  it("encodes a Buffer", () => {
    const buf = Buffer.from("hello world");
    const result = qoderEncodeBody(buf);
    expect(result.toString("ascii")).toBeTruthy();
    expect(result.toString("ascii")).not.toContain("=");
  });

  it("produces deterministic output", () => {
    const a = qoderEncodeBody("test input");
    const b = qoderEncodeBody("test input");
    expect(a.equals(b)).toBe(true);
  });

  it("produces different output for different inputs", () => {
    const a = qoderEncodeBody("input A");
    const b = qoderEncodeBody("input B");
    expect(a.equals(b)).toBe(false);
  });

  it("handles empty string", () => {
    const result = qoderEncodeBody("");
    expect(result.length).toBe(0);
  });

  it("handles empty Buffer", () => {
    const result = qoderEncodeBody(Buffer.alloc(0));
    expect(result.length).toBe(0);
  });

  it("replaces '=' padding with '$'", () => {
    const result = qoderEncodeBody("a").toString("ascii");
    expect(result).not.toContain("=");
    expect(result).toContain("$");
  });

  it("uses custom alphabet (not standard base64)", () => {
    const result = qoderEncodeBody("The quick brown fox").toString("ascii");
    const stdBase64 = Buffer.from("The quick brown fox").toString("base64");
    expect(result).not.toBe(stdBase64);
  });

  it("handles binary content", () => {
    const binary = Buffer.from([0x00, 0xff, 0x80, 0x7f, 0x01]);
    const result = qoderEncodeBody(binary).toString("ascii");
    expect(result).toBeTruthy();
    expect(result).not.toContain("=");
  });

  it("handles JSON content", () => {
    const json = JSON.stringify({ key: "value", num: 42 });
    const result = qoderEncodeBody(json).toString("ascii");
    expect(result).toBeTruthy();
    expect(result).not.toContain("=");
  });

  it("is byte-identical to the legacy string encoder for several inputs", () => {
    const samples: Array<string | Buffer> = [
      "",
      "a",
      "hello",
      "The quick brown fox",
      JSON.stringify({ messages: [{ role: "user", content: "hi" }], n: 1 }),
      Buffer.from([0x00, 0xff, 0x80, 0x7f, 0x01]),
      Buffer.alloc(256, 0x42),
    ];
    for (const sample of samples) {
      const next = qoderEncodeBody(sample).toString("ascii");
      const legacy = qoderEncodeBodyLegacyString(sample);
      expect(next).toBe(legacy);
    }
  });
});
