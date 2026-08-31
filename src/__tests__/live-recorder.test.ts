import { describe, expect, it } from "vitest";
import { classify } from "../../scripts/live-fixture-recorder.js";

describe("live fixture recorder endpoint classification", () => {
  it.each([
    "https://api3.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation?FetchKeys=llm_model_result&AgentId=agent_common&Encode=1",
    "https://gateway.qoder.com.cn/algo/api/v2/service/pro/sse/agent_chat_generation?FetchKeys=llm_model_result&AgentId=agent_common&Encode=1",
  ])("classifies the live %s endpoint as chat", (url) => {
    expect(classify(url)).toBe("chat");
  });
});
