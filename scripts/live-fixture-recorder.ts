export type RecorderStage = "patExchange" | "userinfo" | "modelList" | "chat";

export function classify(url: string): RecorderStage {
  if (url.includes("/jobToken/exchange")) return "patExchange";
  if (url.includes("/userinfo")) return "userinfo";
  if (url.includes("/model/list")) return "modelList";
  if (url.includes("/chat") || url.includes("/agent_chat_generation")) return "chat";
  throw new Error(`[live] refusing to record unexpected endpoint: ${new URL(url).pathname}`);
}
