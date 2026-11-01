import { describe, expect, it } from "vitest";
import {
  getQoderBaseUrl,
  getQoderChatURL,
  getQoderExchangeURL,
  getQoderModelListURL,
  getQoderRefreshURL,
  getQoderRegionConfig,
  getQoderUsageURL,
  getQoderUserInfoURL,
  QODER_MODES,
  setQoderChatBaseUrl,
} from "../region.js";

describe("Qoder regions", () => {
  it("defines only the fixed global and CN provider bindings", () => {
    expect(QODER_MODES).toEqual(["global", "cn"]);
    expect(getQoderRegionConfig("global").providerID).toBe("qoder");
    expect(getQoderRegionConfig("cn").providerID).toBe("qoder-cn");
  });

  it("builds global endpoints", () => {
    expect(getQoderBaseUrl("global")).toBe("https://api3.qoder.sh/");
    expect(getQoderModelListURL("global")).toBe("https://api3.qoder.sh/algo/api/v2/model/list?Encode=1");
    expect(getQoderChatURL("global")).toContain("api3.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation");
    expect(getQoderExchangeURL("global")).toBe("https://openapi.qoder.sh/api/v1/jobToken/exchange");
    expect(getQoderUserInfoURL("global")).toBe("https://openapi.qoder.sh/api/v1/userinfo");
    expect(getQoderUsageURL("global")).toBe("https://openapi.qoder.sh/api/v2/quota/usage");
    expect(getQoderRefreshURL("global")).toBe("https://center.qoder.sh/algo/api/v3/user/refresh_token");
  });

  it("builds CN endpoints", () => {
    expect(getQoderBaseUrl("cn")).toBe("https://gateway.qoder.com.cn/");
    expect(getQoderModelListURL("cn")).toBe("https://gateway.qoder.com.cn/algo/api/v2/model/list?Encode=1");
    expect(getQoderChatURL("cn")).toContain("gateway.qoder.com.cn/algo/api/v2/service/pro/sse/agent_chat_generation");
    expect(getQoderExchangeURL("cn")).toBe("https://openapi.qoder.com.cn/api/v1/jobToken/exchange");
    expect(getQoderUserInfoURL("cn")).toBe("https://openapi.qoder.com.cn/api/v1/userinfo");
    expect(getQoderUsageURL("cn")).toBe("https://openapi.qoder.com.cn/api/v2/quota/usage");
    expect(getQoderRefreshURL("cn")).toBe("https://gateway.qoder.com.cn/algo/api/v3/user/refresh_token");
  });

  it("routes only chat through the resolved chat node", () => {
    setQoderChatBaseUrl("global", "https://api2.qoder.sh");
    expect(getQoderChatURL("global")).toContain(
      "https://api2.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation",
    );
    expect(getQoderModelListURL("global")).toBe("https://api3.qoder.sh/algo/api/v2/model/list?Encode=1");

    setQoderChatBaseUrl("global", undefined);
    expect(getQoderChatURL("global")).toContain("https://api3.qoder.sh/algo/api/v2/service/pro/sse");
  });
});
