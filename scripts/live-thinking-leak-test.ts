/**
 * Live reproduction of the `</thinking>` leak against the real Qoder gateway.
 *
 * What this verifies:
 *   1. Whether the server actually splits a `<thinking>...</thinking>` pair
 *      across `delta.reasoning_content` (opener) and `delta.content` (closer)
 *      — the M1 condition that caused `</thinking>` to leak into visible text.
 *   2. That the NEW ThinkingTagParser + stripThinkingTags produce clean output
 *      (no literal tags) on the real captured stream.
 *   3. For comparison, that the OLD parser logic leaks `</thinking>` into text
 *      on the same stream.
 *
 * Usage: npx tsx scripts/live-thinking-leak-test.ts [friendly-model-id] [prompt]
 *   model defaults to "Efficient" (the model that leaked historically)
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AssistantMessage, AssistantMessageEvent, AssistantMessageEventStream } from "@earendil-works/pi-ai";
import { getCachedModelConfig } from "../src/catalog.js";
import { buildAuthHeaders } from "../src/cosy.js";
import { qoderEncodeBody } from "../src/protocol/encoding.js";
import { transformMessagesForQoder } from "../src/protocol/transform.js";
import {
  THINKING_TAG_VARIANTS,
  ThinkingTagParser,
  stripThinkingTags,
} from "../src/protocol/thinking.js";
import { getQoderChatURL } from "../src/region.js";

const AUTH_FILE = join(homedir(), ".pi", "agent", "auth.json");
const MODEL_ID = process.argv[2] || "Efficient";
const MODEL = getCachedModelConfig(MODEL_ID, "global")?.key;
if (!MODEL) throw new Error(`Unknown friendly Qoder model id: ${MODEL_ID}`);
const PROMPT =
  process.argv[3] ||
  "A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost? Reason carefully step by step before answering.";

interface QoderCreds {
  access: string;
  userID: string;
  name: string;
  email: string;
  machineID?: string;
}

function loadCreds(): QoderCreds {
  const auth = JSON.parse(readFileSync(AUTH_FILE, "utf-8"));
  const c = auth.qoder;
  if (!c?.access) throw new Error("No qoder credentials in ~/.pi/agent/auth.json — run `pi login` first");
  return c;
}

function uuid() {
  return globalThis.crypto.randomUUID();
}

function buildRequestBody(model: string, messages: ReturnType<typeof transformMessagesForQoder>, isReasoning: boolean) {
  return {
    request_id: uuid(),
    request_set_id: uuid(),
    chat_record_id: uuid(),
    session_id: `qoder-session-${model}-${uuid()}`,
    stream: true,
    chat_task: "FREE_INPUT",
    is_reply: true,
    is_retry: false,
    source: 1,
    version: "3",
    session_type: "qodercli",
    agent_id: "agent_common",
    task_id: "common",
    code_language: "",
    chat_prompt: "",
    image_urls: null,
    aliyun_user_type: "",
    system: "",
    messages,
    tools: [],
    parameters: { max_tokens: 1024 },
    chat_context: {
      chatPrompt: "",
      imageUrls: null,
      extra: { context: [], modelConfig: { key: model, is_reasoning: isReasoning }, originalContent: PROMPT },
      features: [],
      text: PROMPT,
    },
    model_config: { key: model, is_reasoning: isReasoning, source: "system" },
    business: { product: "cli", version: "1.0.0", type: "agent", stage: "start", id: uuid(), name: PROMPT.slice(0, 30), begin_at: Date.now() },
  };
}

interface RawStream {
  reasoningChunks: string[];
  contentChunks: string[];
  finishReason: string | null;
  rawHead: string;
}

/** POST and collect every raw delta.reasoning_content / delta.content chunk. */
async function captureRawStream(model: string, isReasoning: boolean): Promise<RawStream> {
  const url = getQoderChatURL("global");
  const creds = loadCreds();
  const messages = transformMessagesForQoder([{ role: "user", content: PROMPT } as never]);
  const body = buildRequestBody(model, messages, isReasoning);
  const encodedBody = qoderEncodeBody(Buffer.from(JSON.stringify(body)));
  const encodedBytes = Buffer.from(encodedBody, "utf8");
  const headers = buildAuthHeaders(encodedBytes, url, {
    userID: creds.userID,
    authToken: creds.access,
    name: creds.name,
    email: creds.email,
    machineID: creds.machineID,
  });

  console.log(`\nPOST ${url}  model=${model}  is_reasoning=${isReasoning}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
      "Accept-Encoding": "identity",
      "X-Model-Key": model,
      "X-Model-Source": "system",
      ...headers,
    },
    body: encodedBytes,
  });

  const out: RawStream = { reasoningChunks: [], contentChunks: [], finishReason: null, rawHead: "" };
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    out.rawHead = `HTTP ${res.status} ${res.statusText}: ${text.slice(0, 400)}`;
    return out;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let envelopeBuffer = "";
  let headWritten = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      envelopeBuffer += line + "\n";
      // SSE lines look like: data:{"statusCodeValue":200,"body":"<json string>"}
      const m = line.match(/^data:(.*)$/);
      if (!m) continue;
      const payload = m[1].trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const envelope = JSON.parse(payload);
        if (!headWritten) {
          out.rawHead = `envelope statusCodeValue=${envelope.statusCodeValue} (first line ok)`;
          headWritten = true;
        }
        if (envelope.statusCodeValue && envelope.statusCodeValue !== 200) {
          out.rawHead = `Upstream ${envelope.statusCodeValue}: ${String(envelope.body).slice(0, 300)}`;
          return out;
        }
        const innerStr = envelope.body;
        if (!innerStr || innerStr === "[DONE]") continue;
        const inner = JSON.parse(innerStr);
        const choice = inner.choices?.[0];
        const delta = choice?.delta;
        if (delta?.reasoning_content) out.reasoningChunks.push(delta.reasoning_content);
        if (delta?.content) out.contentChunks.push(delta.content);
        if (choice?.finish_reason) out.finishReason = choice.finish_reason;
      } catch {
        // non-JSON line, skip
      }
    }
  }
  return out;
}

// ── OLD parser logic (faithful reimplementation of the pre-fix behavior) ──

function getTrailingPrefixLength(text: string, tag: string): number {
  const max = Math.min(text.length, tag.length - 1);
  for (let len = max; len > 0; len--) {
    if (text.endsWith(tag.slice(0, len))) return len;
  }
  return 0;
}
function getMaxTrailingPrefix(text: string, tags: string[]): number {
  let max = 0;
  for (const t of tags) max = Math.max(max, getTrailingPrefixLength(text, t));
  return max;
}

/** Old processBeforeThinking: openers only, NO orphan-closer handling. */
function oldParseContent(chunks: string[]): { thinking: string; text: string } {
  let buffer = "";
  let inThinking = false;
  let activeClose = THINKING_TAG_VARIANTS[0].close;
  let thinking = "";
  let text = "";
  for (const chunk of chunks) {
    buffer += chunk;
    let progress = true;
    while (buffer.length > 0 && progress) {
      progress = false;
      if (!inThinking) {
        let bestPos = -1;
        let bestV: (typeof THINKING_TAG_VARIANTS)[number] | null = null;
        for (const v of THINKING_TAG_VARIANTS) {
          const p = buffer.indexOf(v.open);
          if (p !== -1 && (bestPos === -1 || p < bestPos)) {
            bestPos = p;
            bestV = v;
          }
        }
        if (bestV) {
          if (bestPos > 0) text += buffer.slice(0, bestPos);
          buffer = buffer.slice(bestPos + bestV.open.length);
          activeClose = bestV.close;
          inThinking = true;
          progress = true;
          continue;
        }
        // no opener → emit safe text holding back open-tag prefixes only
        const trailing = getMaxTrailingPrefix(buffer, THINKING_TAG_VARIANTS.map((v) => v.open));
        const safe = buffer.length - trailing;
        if (safe > 0) {
          text += buffer.slice(0, safe);
          buffer = buffer.slice(safe);
          progress = true;
        }
      } else {
        const ep = buffer.indexOf(activeClose);
        if (ep !== -1) {
          if (ep > 0) thinking += buffer.slice(0, ep);
          buffer = buffer.slice(ep + activeClose.length);
          inThinking = false;
          if (buffer.startsWith("\n\n")) buffer = buffer.slice(2);
          progress = true;
          continue;
        }
        const trailing = getTrailingPrefixLength(buffer, activeClose);
        const safe = buffer.length - trailing;
        if (safe > 0) {
          thinking += buffer.slice(0, safe);
          buffer = buffer.slice(safe);
          progress = true;
        }
      }
    }
  }
  if (inThinking) thinking += buffer;
  else text += buffer;
  return { thinking, text };
}

// ── NEW parser (the actual shipped class) ──

function newParseContent(chunks: string[]): { thinking: string; text: string } {
  const output: AssistantMessage = {
    role: "assistant",
    content: [],
    api: "qoder-api" as never,
    provider: "qoder",
    model: "efficient",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop",
    timestamp: Date.now(),
  } as AssistantMessage;
  const events: AssistantMessageEvent[] = [];
  const stream = {
    push: (e: AssistantMessageEvent) => events.push(e),
    end: () => {},
    [Symbol.iterator]: function* () {},
    [Symbol.asyncIterator]: function* () {},
    events,
  } as unknown as AssistantMessageEventStream;
  const parser = new ThinkingTagParser(output, stream);
  for (const c of chunks) parser.processChunk(c);
  parser.finalize();
  let thinking = "";
  let text = "";
  for (const block of output.content) {
    if (block.type === "thinking") thinking += (block as { thinking: string }).thinking;
    else if (block.type === "text") text += (block as { text: string }).text;
  }
  return { thinking, text };
}

function containsAnyTag(s: string, which: "open" | "close"): string[] {
  const found: string[] = [];
  for (const v of THINKING_TAG_VARIANTS) {
    const tag = which === "open" ? v.open : v.close;
    if (tag.length > 0 && s.includes(tag)) found.push(tag);
  }
  return found;
}

function banner(s: string) {
  console.log("\n" + "─".repeat(70));
  console.log(s);
  console.log("─".repeat(70));
}

async function main() {
  banner(`Live repro: </thinking> leak  |  model=${MODEL}`);
  console.log(`prompt: ${PROMPT.slice(0, 100)}${PROMPT.length > 100 ? "…" : ""}`);

  // Try is_reasoning=false first (matches the historical leak config), then true.
  for (const isReasoning of [false, true]) {
    const raw = await captureRawStream(MODEL, isReasoning);
    if (raw.rawHead && raw.reasoningChunks.length === 0 && raw.contentChunks.length === 0) {
      console.log(`\n!! no deltas captured: ${raw.rawHead}`);
      continue;
    }
    const reasoning = raw.reasoningChunks.join("");
    const content = raw.contentChunks.join("");
    console.log(
      `\ncaptured: ${raw.reasoningChunks.length} reasoning chunks (${reasoning.length} chars), ` +
        `${raw.contentChunks.length} content chunks (${content.length} chars), finish=${raw.finishReason}`,
    );

    if (reasoning.length === 0 && content.length === 0) {
      console.log("(empty stream — nothing to analyze)");
      continue;
    }

    // ── Detect M1: server split a tag pair across the two channels ──
    const openInReasoning = containsAnyTag(reasoning, "open");
    const closeInContent = containsAnyTag(content, "close");
    const openInContent = containsAnyTag(content, "open");
    const closeInReasoning = containsAnyTag(reasoning, "close");
    const m1Split = openInReasoning.length > 0 && closeInContent.length > 0;

    banner("M1 detection (tag split across reasoning_content / content)");
    console.log(`reasoning_content has openers : ${openInReasoning.length ? openInReasoning.join(" ") : "(none)"}`);
    console.log(`content has closers          : ${closeInContent.length ? closeInContent.join(" ") : "(none)"}`);
    console.log(`content has openers          : ${openInContent.length ? openInContent.join(" ") : "(none)"}`);
    console.log(`reasoning_content has closers: ${closeInReasoning.length ? closeInReasoning.join(" ") : "(none)"}`);
    console.log(`\n>>> M1 split reproduced: ${m1Split ? "YES — server splits the tag pair across channels" : "NO (model did not emit split tags this run)"}`);

    if (content.length > 0) {
      banner("CONTENT channel — OLD vs NEW parser");
      const oldC = oldParseContent(raw.contentChunks);
      const newC = newParseContent(raw.contentChunks);
      const oldLeakTags = [...containsAnyTag(oldC.text, "close"), ...containsAnyTag(oldC.text, "open")];
      const newLeakTags = [...containsAnyTag(newC.text, "close"), ...containsAnyTag(newC.text, "open")];
      console.log(`OLD text output : ${JSON.stringify(oldC.text.slice(0, 120))}${oldC.text.length > 120 ? "…" : ""}`);
      console.log(`OLD leaks tags  : ${oldLeakTags.length ? oldLeakTags.join(" ") : "(none) ← clean"}`);
      console.log(`NEW text output : ${JSON.stringify(newC.text.slice(0, 120))}${newC.text.length > 120 ? "…" : ""}`);
      console.log(`NEW leaks tags  : ${newLeakTags.length ? newLeakTags.join(" ") : "(none) ← clean"}`);
    }

    if (reasoning.length > 0) {
      banner("REASONING_CONTENT channel — OLD (verbatim) vs NEW (stripThinkingTags)");
      const oldR = reasoning; // old stream.ts appended verbatim
      const newR = stripThinkingTags(reasoning);
      const oldRLeaks = containsAnyTag(oldR, "open").concat(containsAnyTag(oldR, "close"));
      const newRLeaks = containsAnyTag(newR, "open").concat(containsAnyTag(newR, "close"));
      console.log(`OLD reasoning head: ${JSON.stringify(oldR.slice(0, 80))}…`);
      console.log(`OLD leaks tags    : ${oldRLeaks.length ? oldRLeaks.join(" ") : "(none) ← clean"}`);
      console.log(`NEW reasoning head: ${JSON.stringify(newR.slice(0, 80))}…`);
      console.log(`NEW leaks tags    : ${newRLeaks.length ? newRLeaks.join(" ") : "(none) ← clean"}`);
    }

    // If we got a real stream, don't bother retrying the other is_reasoning flag.
    if (reasoning.length > 0 || content.length > 0) break;
  }

  banner("done");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
