import { describe, expect, it } from "vitest";
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
});
