import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildAuthHeaders } from "../cosy.js";

describe("COSY client identity", () => {
  it("sends Cosy-Version and cosyVersion as current qodercli 1.1.38", () => {
    const headers = buildAuthHeaders(null, "https://api3.qoder.sh/algo/api/v2/model/list", {
      userID: "user-1",
      authToken: "token-1",
      name: "Test",
      email: "test@example.com",
      machineID: "machine-1",
    });
    expect(headers["Cosy-Version"]).toBe("1.1.38");

    const auth = headers.Authorization;
    expect(auth.startsWith("Bearer COSY.")).toBe(true);
    const payloadB64 = auth.slice("Bearer COSY.".length).split(".")[0];
    const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf8")) as { cosyVersion: string };
    expect(payload.cosyVersion).toBe("1.1.38");
  });

  it("matches the legacy full-string Cosy signature for a known body Buffer", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee") // aes key source
      .mockReturnValueOnce("11111111-2222-3333-4444-555555555555") // requestId
      .mockReturnValueOnce("99999999-8888-7777-6666-555555555555"); // X-Request-Id

    const body = Buffer.from('{"hello":"world","n":1}', "utf8");
    const url = "https://api3.qoder.sh/algo/api/v1/chat";
    const headers = buildAuthHeaders(body, url, {
      userID: "user-1",
      authToken: "token-1",
      name: "Test",
      email: "test@example.com",
      machineID: "machine-1",
    });

    const auth = headers.Authorization;
    const match = auth.match(/^Bearer COSY\.([^.]+)\.([0-9a-f]+)$/);
    expect(match).toBeTruthy();
    const payloadB64 = match?.[1] ?? "";
    const sig = match?.[2] ?? "";
    const cosyKey = headers["Cosy-Key"];
    const timestamp = headers["Cosy-Date"];
    const sigPath = headers["Cosy-Sigpath"];

    const legacyInput = `${payloadB64}\n${cosyKey}\n${timestamp}\n${body.toString("utf8")}\n${sigPath}`;
    const legacySig = crypto.createHash("md5").update(legacyInput).digest("hex");
    expect(sig).toBe(legacySig);

    const legacyBodyHash = crypto.createHash("md5").update(body).digest("hex");
    expect(headers["Cosy-Bodyhash"]).toBe(legacyBodyHash);
    expect(headers["Cosy-Bodylength"]).toBe(String(body.length));

    vi.restoreAllMocks();
  });
});
