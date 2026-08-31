import { describe, expect, it } from "vitest";
import {
  getQoderBaseUrl,
  getQoderCenterUrl,
  getQoderChatURL,
  getQoderExchangeURL,
  getQoderManageUrl,
  getQoderMode,
  getQoderModelListURL,
  getQoderOpenApiUrl,
  getQoderRefreshURL,
  getQoderUsageURL,
  getQoderUserEmailFallback,
  getQoderUserInfoURL,
  isQoderCNMode,
  toQoderCNModelId,
} from "../cosy.js";

// ── getQoderMode ──────────────────────────────────────────────────────────

describe("getQoderMode", () => {
  it('returns "cn" for explicit CN variants', () => {
    expect(getQoderMode("cn")).toBe("cn");
    expect(getQoderMode("china")).toBe("cn");
    expect(getQoderMode("qodercn")).toBe("cn");
    expect(getQoderMode("qoder-cn")).toBe("cn");
    expect(getQoderMode("CN")).toBe("cn");
    expect(getQoderMode("China")).toBe("cn");
  });

  it('returns "global" for explicit global variants', () => {
    expect(getQoderMode("global")).toBe("global");
    expect(getQoderMode("intl")).toBe("global");
    expect(getQoderMode("international")).toBe("global");
    expect(getQoderMode("qoder")).toBe("global");
  });

  it("falls back to global for unknown strings", () => {
    expect(getQoderMode("unknown")).toBe("global");
    expect(getQoderMode("")).toBe("global");
  });
});

// ── isQoderCNMode ─────────────────────────────────────────────────────────

describe("isQoderCNMode", () => {
  it("returns true for CN modes", () => {
    expect(isQoderCNMode("cn")).toBe(true);
    expect(isQoderCNMode("china")).toBe(true);
  });

  it("returns false for global modes", () => {
    expect(isQoderCNMode("global")).toBe(false);
    expect(isQoderCNMode("intl")).toBe(false);
  });
});

// ── URL builders ──────────────────────────────────────────────────────────

describe("getQoderBaseUrl", () => {
  it("returns CN URL for cn mode", () => {
    expect(getQoderBaseUrl("cn")).toBe("https://gateway.qoder.com.cn/");
  });

  it("returns global URL for global mode", () => {
    expect(getQoderBaseUrl("global")).toBe("https://api3.qoder.sh/");
  });
});

describe("getQoderOpenApiUrl", () => {
  it("returns CN URL for cn mode", () => {
    expect(getQoderOpenApiUrl("cn")).toBe("https://openapi.qoder.com.cn");
  });

  it("returns global URL for global mode", () => {
    expect(getQoderOpenApiUrl("global")).toBe("https://openapi.qoder.sh");
  });
});

describe("getQoderCenterUrl", () => {
  it("returns CN URL for cn mode", () => {
    expect(getQoderCenterUrl("cn")).toBe("https://gateway.qoder.com.cn");
  });

  it("returns global URL for global mode", () => {
    expect(getQoderCenterUrl("global")).toBe("https://center.qoder.sh");
  });
});

describe("getQoderModelListURL", () => {
  it("constructs correct CN URL", () => {
    expect(getQoderModelListURL("cn")).toBe("https://gateway.qoder.com.cn/algo/api/v2/model/list?Encode=1");
  });

  it("constructs correct global URL", () => {
    expect(getQoderModelListURL("global")).toBe("https://api3.qoder.sh/algo/api/v2/model/list?Encode=1");
  });
});

describe("getQoderChatURL", () => {
  it("contains base URL and chat path", () => {
    const url = getQoderChatURL("global");
    expect(url).toContain("https://api3.qoder.sh/");
    expect(url).toContain("algo/api/v2/service/pro/sse/agent_chat_generation");
    expect(url).toContain("Encode=1");
  });
});

describe("getQoderExchangeURL", () => {
  it("constructs correct CN URL", () => {
    expect(getQoderExchangeURL("cn")).toBe("https://openapi.qoder.com.cn/api/v1/jobToken/exchange");
  });

  it("constructs correct global URL", () => {
    expect(getQoderExchangeURL("global")).toBe("https://openapi.qoder.sh/api/v1/jobToken/exchange");
  });
});

describe("getQoderUserInfoURL", () => {
  it("constructs correct URL", () => {
    expect(getQoderUserInfoURL("global")).toBe("https://openapi.qoder.sh/api/v1/userinfo");
  });
});

describe("getQoderUsageURL", () => {
  it("constructs correct URL", () => {
    expect(getQoderUsageURL("global")).toBe("https://openapi.qoder.sh/api/v2/quota/usage");
  });
});

describe("getQoderRefreshURL", () => {
  it("constructs correct CN URL", () => {
    expect(getQoderRefreshURL("cn")).toBe("https://gateway.qoder.com.cn/algo/api/v3/user/refresh_token");
  });

  it("constructs correct global URL", () => {
    expect(getQoderRefreshURL("global")).toBe("https://center.qoder.sh/algo/api/v3/user/refresh_token");
  });
});

describe("getQoderManageUrl", () => {
  it("returns CN URL", () => {
    expect(getQoderManageUrl("cn")).toBe("https://qoder.com.cn");
  });

  it("returns global URL", () => {
    expect(getQoderManageUrl("global")).toBe("https://qoder.com");
  });
});

describe("getQoderUserEmailFallback", () => {
  it("returns CN email", () => {
    expect(getQoderUserEmailFallback("cn")).toBe("user@qoder.com.cn");
  });

  it("returns global email", () => {
    expect(getQoderUserEmailFallback("global")).toBe("user@qoder.com");
  });
});

// ── toQoderCNModelId ──────────────────────────────────────────────────────

describe("toQoderCNModelId", () => {
  it("strips whitespace from the upstream display_name", () => {
    // The display name is used directly as the pi-visible model id, with
    // whitespace removed so it stays a clean token for persistence keys and
    // search. "Qwen3.8-Flash" has no spaces already.
    expect(toQoderCNModelId("Qwen3.8-Flash")).toBe("Qwen3.8-Flash");
  });

  it("collapses internal spaces", () => {
    expect(toQoderCNModelId("Qwen 3.8 Max")).toBe("Qwen3.8Max");
    expect(toQoderCNModelId("DeepSeek V4 Pro")).toBe("DeepSeekV4Pro");
  });

  it("falls back to a default when no display name is given", () => {
    expect(toQoderCNModelId()).toBe("QoderCNModel");
    expect(toQoderCNModelId("")).toBe("QoderCNModel");
  });
});
