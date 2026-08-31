/**
 * Live end-to-end test: reproduce the provider_error 400 bug against the real
 * Qoder gateway using the local machine's stored OAuth credentials.
 *
 * Scenario that triggered the bug (from historical session analysis):
 *   user → assistant(ONLY tool_calls, no text) → toolResult → new request
 *
 * Before the fix:  transform produced { content: null, tool_calls: [...] }
 *                  → Qoder gateway dropped the assistant message
 *                  → toolResult orphaned → upstream 400 provider_error
 *
 * After the fix:   transform produces { content: " ", tool_calls: [...] }
 *                  → gateway keeps the message → tool pairs up → success
 *
 * Usage: npx tsx scripts/live-bug-test.ts
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getCachedModelConfig } from "../src/catalog.js";
import { buildAuthHeaders } from "../src/cosy.js";
import { qoderEncodeBody } from "../src/protocol/encoding.js";
import { transformMessagesForQoder, transformTools } from "../src/protocol/transform.js";
import { getQoderChatURL } from "../src/region.js";

const AUTH_FILE = join(homedir(), ".pi", "agent", "auth.json");
const MODEL_ID = process.argv[2] || "Lite";
const MODEL = getCachedModelConfig(MODEL_ID, "global")?.key;
if (!MODEL) throw new Error(`Unknown friendly Qoder model id: ${MODEL_ID}`);

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

function buildRequestBody(
  model: string,
  messages: ReturnType<typeof transformMessagesForQoder>,
  tools?: ReturnType<typeof transformTools>,
) {
  const uuid = () => globalThis.crypto.randomUUID();
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
    tools: tools || [],
    parameters: { max_tokens: 1024 },
    chat_context: {
      chatPrompt: "",
      imageUrls: null,
      extra: { context: [], modelConfig: { key: model, is_reasoning: false }, originalContent: "" },
      features: [],
      text: "",
    },
    model_config: { key: model, is_reasoning: false, source: "system" },
    business: { product: "cli", version: "1.0.0", type: "agent", stage: "start", id: uuid(), name: "", begin_at: Date.now() },
  };
}

interface TestResult {
  ok: boolean;
  httpStatus: string;
  upstreamStatus: number | null;
  errorDetail: string | null;
  firstText: string | null;
}

/** Send a request, decode the SSE envelope stream, return a verdict. */
async function sendRequest(label: string, body: Record<string, unknown>): Promise<TestResult> {
  const url = getQoderChatURL("global");
  const creds = loadCreds();

  // CRITICAL: body must be encoded with qoderEncodeBody, and auth headers
  // computed on the ENCODED bytes (see stream.ts).
  const encodedBody = qoderEncodeBody(Buffer.from(JSON.stringify(body)));
  const encodedBytes = Buffer.from(encodedBody, "utf8");
  const headers = buildAuthHeaders(encodedBytes, url, {
    userID: creds.userID,
    authToken: creds.access,
    name: creds.name,
    email: creds.email,
    machineID: creds.machineID,
  });

  console.log(`\n[${label}] POST ${url}  model=${body.model_config?.key}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
      "Accept-Encoding": "identity",
      "X-Model-Key": body.model_config?.key,
      "X-Model-Source": body.model_config?.source || "system",
      ...headers,
    },
    body: encodedBytes,
  });

  const text = await res.text();
  let upstreamStatus: number | null = null;
  let errorDetail: string | null = null;
  let firstText: string | null = null;

  if (!res.ok) {
    errorDetail = `HTTP ${res.status}: ${text.slice(0, 500)}`;
  } else {
    // SSE envelope: data:{"statusCodeValue":200,"body":"<json string>"}
    for (const line of text.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const envelope = JSON.parse(payload);
        if (envelope.statusCodeValue && envelope.statusCodeValue !== 200) {
          upstreamStatus = envelope.statusCodeValue;
          errorDetail = `Upstream ${envelope.statusCodeValue}: ${String(envelope.body).slice(0, 300)}`;
          break;
        }
        const innerStr = envelope.body;
        if (!innerStr || innerStr === "[DONE]") continue;
        const inner = JSON.parse(innerStr);
        const delta = inner.choices?.[0]?.delta?.content || inner.choices?.[0]?.message?.content;
        if (delta && !firstText) firstText = String(delta).slice(0, 80);
      } catch {
        // non-JSON line, skip
      }
    }
    if (!firstText && !errorDetail) errorDetail = `no content parsed; raw head: ${text.slice(0, 400)}`;
  }

  return {
    ok: res.ok && !errorDetail,
    httpStatus: `HTTP ${res.status} ${res.statusText}`,
    upstreamStatus,
    errorDetail,
    firstText,
  };
}

function fmt(r: TestResult) {
  const verdict = r.ok ? "✅ OK" : "❌ FAIL";
  const parts = [verdict, r.httpStatus];
  if (r.upstreamStatus) parts.push(`upstream=${r.upstreamStatus}`);
  if (r.firstText) parts.push(`text="${r.firstText}…"`);
  if (r.errorDetail) parts.push(`err=${r.errorDetail}`);
  return parts.join("  |  ");
}

async function main() {
  const creds = loadCreds();
  console.log(`Loaded credentials: userID=${creds.userID} email=${creds.email} mode=global`);

  const piTools = [
    {
      name: "calculate",
      description: "Evaluate a math expression and return the result.",
      parameters: { type: "object", properties: { expr: { type: "string" } }, required: ["expr"] },
    },
  ];
  const transformedTools = transformTools(piTools);

  // ── Test 1: basic connectivity (plain user message, no tools) ──
  {
    const messages = transformMessagesForQoder([{ role: "user", content: "Reply with exactly: pong" } as never]);
    const body = buildRequestBody(MODEL, messages);
    const r = await sendRequest("1-basic-connectivity", body);
    console.log(fmt(r));
  }

  // ── Test 2: the bug scenario, FIXED transform (content: " ") ──
  {
    const messages = transformMessagesForQoder([
      { role: "user", content: "What is 2 + 3? Use the calculate tool." } as never,
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_test_1", name: "calculate", arguments: { expr: "2+3" } }],
      } as never,
      { role: "toolResult", toolCallId: "call_test_1", content: "5" } as never,
    ]);
    const asst = messages[1] as { content: unknown; tool_calls?: unknown[] };
    console.log(`\n[2-bug-fixed] transformed assistant content=${JSON.stringify(asst.content)} (expect " ")  tool_calls=${asst.tool_calls?.length}`);
    const body = buildRequestBody(MODEL, messages, transformedTools);
    const r = await sendRequest("2-bug-fixed", body);
    console.log(fmt(r));
  }

  // ── Test 3: the bug scenario, OLD buggy transform (content: null) ──
  {
    const messages = transformMessagesForQoder([
      { role: "user", content: "What is 2 + 3? Use the calculate tool." } as never,
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_test_2", name: "calculate", arguments: { expr: "2+3" } }],
      } as never,
      { role: "toolResult", toolCallId: "call_test_2", content: "5" } as never,
    ]);
    (messages[1] as { content: unknown }).content = null; // force OLD buggy behavior
    console.log(`\n[3-bug-old] transformed assistant content=null (forced old buggy behavior)`);
    const body = buildRequestBody(MODEL, messages, transformedTools);
    const r = await sendRequest("3-bug-old-null", body);
    console.log(fmt(r));
    console.log(
      r.ok
        ? "  → lite upstream TOLERATES content:null (like GLM) — bug does NOT reproduce on this model"
        : "  → lite upstream REJECTS content:null — bug reproduces here too, fix is validated",
    );
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
