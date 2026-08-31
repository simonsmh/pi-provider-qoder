import crypto from "node:crypto";
import * as PiAi from "@earendil-works/pi-ai";
import {
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  clampThinkingLevel,
  type Model,
  type SimpleStreamOptions,
  type TextContent,
  type ThinkingContent,
  type ToolCall,
} from "@earendil-works/pi-ai";
import {
  buildAuthHeaders,
  getMachineId,
  getQoderChatURL,
  getQoderMode,
  getQoderUserEmailFallback,
  isQoderCNMode,
} from "./cosy.js";
import { getCachedModelConfig, MAX_OUTPUT_TOKENS } from "./models.js";
import { getCachedCredentials } from "./oauth.js";
import { qoderEncodeBody } from "./qoder-encoding.js";
import { stripThinkingTags, ThinkingTagParser } from "./thinking-parser.js";
import { transformMessagesForQoder, transformTools } from "./transform.js";

interface ToolCallState {
  arguments: string;
  id: string;
  name: string;
  emittedStart?: boolean;
  emittedEnd?: boolean;
  contentIndex: number;
}

function stableHash(prefix: string, ...inputs: string[]): string {
  const hash = crypto.createHash("sha256");
  hash.update(prefix);
  for (const input of inputs) {
    hash.update("\0");
    hash.update(input);
  }
  return hash.digest("hex").slice(0, 16);
}

function stableChatRecordID(
  model: string,
  messages: Array<{ role?: string; content?: unknown }>,
  tools: unknown,
  maxTokens: number,
): string {
  const hash = crypto.createHash("sha256");
  hash.update("qoder-record");
  hash.update("\0");
  hash.update(model);
  for (const msg of messages) {
    if (msg?.role) {
      hash.update("\0");
      hash.update(msg.role);
    }
    if (msg?.content) {
      hash.update("\0");
      hash.update(typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content));
    }
  }
  if (tools) {
    hash.update("\0");
    hash.update(JSON.stringify(tools));
  }
  hash.update("\0");
  hash.update(`mt=${maxTokens}`);
  return hash.digest("hex").slice(0, 16);
}

export function streamQoder(
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  const StreamCtor = (PiAi as unknown as { AssistantMessageEventStream: new () => AssistantMessageEventStream })
    .AssistantMessageEventStream;
  const stream = new StreamCtor();

  const output: AssistantMessage = {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };

  (async () => {
    try {
      const providerMode = model.provider === "qoder-cn" ? "cn" : getQoderMode();
      const accessToken = options?.apiKey;
      if (!accessToken) {
        throw new Error(
          isQoderCNMode(providerMode)
            ? "Qoder CN credentials not set. Run /login qoder-cn or set QODERCN_PERSONAL_ACCESS_TOKEN."
            : "Qoder credentials not set. Run /login qoder or set QODER_PERSONAL_ACCESS_TOKEN.",
        );
      }

      // Resolve user details from cached credentials
      const cachedCreds = getCachedCredentials(accessToken, model.provider);
      const userID = cachedCreds?.userID || "qoder-user";
      const name = cachedCreds?.name || (isQoderCNMode(providerMode) ? "Qoder CN User" : "Qoder User");
      const email = cachedCreds?.email || getQoderUserEmailFallback(providerMode);
      const machineID = cachedCreds?.machineID || getMachineId();

      // The model `id` pi exposes is the upstream display_name (whitespace
      // stripped) for CN, or the raw key for the international site. The
      // request-time upstream `key` is read back from the cached model config
      // (which stores the original entry keyed by both `key` and `id`), so no
      // key<->friendlyId mapping table is needed here.
      const modelConfig = getCachedModelConfig(model.id, providerMode) || {
        key: model.id,
        is_reasoning: false,
        source: "system",
      };
      // Use the cached entry's original upstream key when available; fall back to
      // the pi id (international site already uses the key as id).
      const qoderModel = modelConfig.key || model.id;

      const isReasoning = !!modelConfig.is_reasoning;

      const normalizedMessages = transformMessagesForQoder(context.messages);
      const systemText = context.systemPrompt || "";

      let lastUserText = "";
      for (let i = normalizedMessages.length - 1; i >= 0; i--) {
        if (normalizedMessages[i].role === "user") {
          const content = normalizedMessages[i].content;
          lastUserText =
            typeof content === "string"
              ? content
              : Array.isArray(content)
                ? content.map((c) => ("text" in c ? c.text : "")).join("")
                : "";
          break;
        }
      }

      // Use a stable session id when pi provides one (per agent session) so
      // the Qoder server can maintain prompt cache affinity across consecutive
      // requests. Fall back to a random id only when no sessionId is available.
      const stablePart = stableHash("qoder-session", userID, qoderModel);
      const sessionID = options?.sessionId
        ? `${stablePart}-${options.sessionId}`
        : `${stablePart}-${crypto.randomUUID()}`;

      // Qoder's catalog exposes no per-model output cap, so we use the
      // documented upstream ceiling (MAX_OUTPUT_TOKENS = 131072, see models.ts)
      // and let pi cap it lower when the caller sets options.maxTokens (e.g.
      // compaction at 40K). This avoids truncating reasoning chains / long
      // generations that the 32K default would cut off.
      let maxTokens = MAX_OUTPUT_TOKENS;
      if (options?.maxTokens && options.maxTokens < maxTokens) {
        maxTokens = options.maxTokens;
      }

      const toolsRaw = context.tools && context.tools.length > 0 ? transformTools(context.tools) : undefined;
      const recordID = stableChatRecordID(qoderModel, normalizedMessages, toolsRaw, maxTokens);

      // Map pi's thinking level (options.reasoning) to Qoder's request fields.
      // Confirmed from @qoder-ai/qodercli: the chat body carries `reasoning_effort`
      // ("none"|"low"|"medium"|"high"|"xhigh"|"max") and `enable_thinking` (bool)
      // inside `parameters`, alongside `max_tokens`.
      //
      // This mirrors the pattern the pi-ai OpenAI provider uses: clamp the
      // requested level to what the model advertises via thinkingLevelMap, then
      // map to the upstream effort name. clampThinkingLevel returns "off" when
      // the level is unsupported or the user disabled thinking.
      const requestedLevel = options?.reasoning;
      const clamped = requestedLevel ? clampThinkingLevel(model, requestedLevel) : undefined;
      const reasoningLevel = clamped === "off" ? undefined : clamped;
      const parameters: Record<string, unknown> = { max_tokens: maxTokens };
      if (reasoningLevel) {
        parameters.enable_thinking = true;
        // Effort-based models advertise concrete effort names in the map
        // (low/medium/xhigh/max). Toggle-only models map every level to
        // "enabled"/"disabled" and accept no effort value — only the on/off
        // switch matters, so we send enable_thinking alone.
        const mapped = model.thinkingLevelMap?.[reasoningLevel];
        const effort = mapped && mapped !== "enabled" && mapped !== "disabled" ? mapped : reasoningLevel;
        // Only send reasoning_effort when the upstream model actually exposes
        // effort levels (thinking_config.enabled.efforts).
        if (modelConfig?.thinking_config?.enabled?.efforts && typeof effort === "string") {
          parameters.reasoning_effort = effort;
        }
      } else {
        // No reasoning level selected (or clamped to off): explicitly disable
        // thinking so the model does not reason by default.
        parameters.enable_thinking = false;
      }

      const reqBody: Record<string, unknown> = {
        request_id: crypto.randomUUID(),
        request_set_id: recordID,
        chat_record_id: recordID,
        session_id: sessionID,
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
        // Qoder's server ignores the top-level `system` field (verified: the
        // model never sees it). Inject the system prompt as a leading
        // role:system message instead, which the server does honor.
        system: "",
        messages: systemText ? [{ role: "system", content: systemText }, ...normalizedMessages] : normalizedMessages,
        tools: toolsRaw || [],
        parameters,
        chat_context: {
          chatPrompt: "",
          imageUrls: null,
          extra: {
            context: [],
            modelConfig: {
              key: qoderModel,
              is_reasoning: isReasoning,
            },
            originalContent: lastUserText,
          },
          features: [],
          text: lastUserText,
        },
        model_config: modelConfig,
        business: {
          product: "cli",
          version: "1.0.0",
          type: "agent",
          stage: "start",
          id: crypto.randomUUID(),
          name: lastUserText.substring(0, 30),
          begin_at: Date.now(),
        },
      };

      const bodyBytes = Buffer.from(JSON.stringify(reqBody));
      const encodedBody = qoderEncodeBody(bodyBytes);
      const encodedBytes = Buffer.from(encodedBody, "utf8");

      const chatURL = getQoderChatURL(providerMode);

      const headers = buildAuthHeaders(encodedBytes, chatURL, {
        userID,
        authToken: accessToken,
        name,
        email,
        machineID,
      });

      const modelSource = modelConfig.source || "system";

      const response = await fetch(chatURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          "Accept-Encoding": "identity",
          "X-Model-Key": qoderModel,
          "X-Model-Source": modelSource,
          ...headers,
        },
        body: encodedBytes,
        signal: options?.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Qoder API request failed: ${response.status} ${response.statusText}. Response: ${errText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer = "";

      let contentBlockIndex = -1;
      let thinkingBlockIndex = -1;
      const toolCallsState: ToolCallState[] = [];

      const thinkingEnabled = (options?.reasoning as unknown) !== false && (options?.reasoning as unknown) !== "off";
      const thinkingParser = thinkingEnabled ? new ThinkingTagParser(output, stream) : null;

      stream.push({ type: "start", partial: output });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const lineEnd = buffer.indexOf("\n");
          if (lineEnd === -1) break;

          const line = buffer.substring(0, lineEnd).trim();
          buffer = buffer.substring(lineEnd + 1);

          if (!line.startsWith("data:")) continue;

          const dataStr = line.substring(5).trim();
          if (dataStr === "[DONE]") {
            break;
          }

          try {
            const envelope = JSON.parse(dataStr);
            if (envelope.statusCodeValue && envelope.statusCodeValue !== 200) {
              throw new Error(`Upstream status ${envelope.statusCodeValue}: ${envelope.body}`);
            }

            const innerStr = envelope.body;
            if (!innerStr || innerStr === "[DONE]") continue;

            const inner = JSON.parse(innerStr);
            if (inner.id) output.responseId = inner.id as string;
            if (inner.model) output.responseModel = inner.model as string;
            if (inner.usage) {
              const u = inner.usage as {
                prompt_tokens?: number;
                completion_tokens?: number;
                total_tokens?: number;
                completion_tokens_details?: { reasoning_tokens?: number };
                prompt_tokens_details?: {
                  cacheable_tokens?: number;
                  cached_tokens?: number;
                  cache_write_tokens?: number;
                };
              };
              // pi-core computes `promptTokens = input + cacheRead + cacheWrite`
              // (Anthropic convention: `input` EXCLUDES cached/written tokens).
              // Qoder follows OpenAI semantics where `prompt_tokens` INCLUDES
              // `cached_tokens`, so subtract cacheRead (and cache_write_tokens
              // when reported) to match the contract pi-ai's own OpenAI
              // provider uses. `cacheable_tokens` is a capacity metric, not a
              // write count (it is 0 even on first-turn writes), so it is NOT
              // mapped to cacheWrite.
              const promptTokens = u.prompt_tokens ?? 0;
              const cacheReadTokens = u.prompt_tokens_details?.cached_tokens ?? 0;
              const cacheWriteTokens = u.prompt_tokens_details?.cache_write_tokens ?? 0;
              output.usage.input = Math.max(0, promptTokens - cacheReadTokens - cacheWriteTokens);
              output.usage.output = u.completion_tokens ?? 0;
              output.usage.totalTokens = u.total_tokens ?? 0;
              output.usage.cacheRead = cacheReadTokens;
              output.usage.cacheWrite = cacheWriteTokens;
            }
            if (inner.choices && inner.choices.length > 0) {
              const choice = inner.choices[0];
              const delta = choice.delta;

              if (delta) {
                // 1. Process reasoning/thinking content (API reasoning)
                if (delta.reasoning_content) {
                  // Qoder's backend sometimes routes a literal `<thinking>`
                  // opener into reasoning_content (with the matching
                  // `</thinking>` closer landing in the content stream). Strip
                  // tag artifacts so the thinking block stays clean, matching
                  // the SDK's ContentBlock model.
                  const reasoningChunk = stripThinkingTags(delta.reasoning_content);
                  if (reasoningChunk) {
                    if (thinkingBlockIndex === -1) {
                      thinkingBlockIndex = output.content.length;
                      output.content.push({ type: "thinking", thinking: "" });
                      stream.push({ type: "thinking_start", contentIndex: thinkingBlockIndex, partial: output });
                    }
                    const block = output.content[thinkingBlockIndex] as ThinkingContent;
                    block.thinking += reasoningChunk;
                    stream.push({
                      type: "thinking_delta",
                      contentIndex: thinkingBlockIndex,
                      delta: reasoningChunk,
                      partial: output,
                    });
                  }
                }

                // 2. Process text content
                if (delta.content) {
                  // End API thinking block if active
                  if (thinkingBlockIndex !== -1) {
                    const block = output.content[thinkingBlockIndex] as ThinkingContent;
                    stream.push({
                      type: "thinking_end",
                      contentIndex: thinkingBlockIndex,
                      content: block.thinking,
                      partial: output,
                    });
                    thinkingBlockIndex = -1;
                  }

                  if (thinkingParser) {
                    thinkingParser.processChunk(delta.content);
                  } else {
                    if (contentBlockIndex === -1) {
                      contentBlockIndex = output.content.length;
                      output.content.push({ type: "text", text: "" });
                      stream.push({ type: "text_start", contentIndex: contentBlockIndex, partial: output });
                    }
                    const block = output.content[contentBlockIndex] as TextContent;
                    block.text += delta.content;
                    stream.push({
                      type: "text_delta",
                      contentIndex: contentBlockIndex,
                      delta: delta.content,
                      partial: output,
                    });
                  }
                }

                // 3. Process tool calls
                if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    if (!toolCallsState[idx]) {
                      toolCallsState[idx] = { arguments: "", id: "", name: "", contentIndex: 0 };
                    }
                    const state = toolCallsState[idx];
                    if (tc.id) state.id = tc.id;
                    if (tc.function?.name) state.name = tc.function.name;

                    // Open the block as soon as the call is IDENTIFIABLE, not
                    // when its first argument byte arrives. A call whose
                    // arguments are absent or an empty string — a no-argument
                    // tool, or a model that sends id+name and then stops — used
                    // to create a toolCallsState entry and no content block, so
                    // the finalizer below saw a non-empty state array, set
                    // stopReason "toolUse", and handed back a message with no
                    // tool call in it. The agent loop then had nothing to run
                    // and the turn simply ended, mid-task and without an error.
                    if (state.emittedStart === undefined && (state.id || state.name)) {
                      state.emittedStart = true;
                      state.contentIndex = output.content.length;
                      output.content.push({
                        type: "toolCall",
                        id: state.id,
                        name: state.name,
                        arguments: {},
                      } satisfies ToolCall);
                      stream.push({ type: "toolcall_start", contentIndex: state.contentIndex, partial: output });
                    }

                    // id and name can arrive after the block is open; keep it
                    // in step, since the finalizer only rewrites `arguments`.
                    if (state.emittedStart) {
                      const block = output.content[state.contentIndex] as ToolCall;
                      block.id = state.id;
                      block.name = state.name;
                    }

                    if (tc.function?.arguments) {
                      const argDelta = tc.function.arguments;
                      state.arguments += argDelta;
                      stream.push({
                        type: "toolcall_delta",
                        contentIndex: state.contentIndex,
                        delta: argDelta,
                        partial: output,
                      });
                    }
                  }
                }
              }

              if (choice.finish_reason) {
                // Preserve the real upstream finish_reason (e.g. "length",
                // "content_filter") instead of forcing "stop" later.
                output.stopReason = choice.finish_reason as AssistantMessage["stopReason"];
              }
            }
          } catch (e) {
            // A single malformed SSE line shouldn't kill the stream — skip it.
            // But a genuine upstream error (thrown below) must propagate to the
            // outer catch and surface as stopReason="error", not be swallowed.
            if (e instanceof SyntaxError) {
              if (process.env.QODER_DEBUG) {
                console.error("[pi-provider-qoder] skipping malformed SSE line:", dataStr.slice(0, 200));
              }
              continue;
            }
            throw e;
          }
        }
      }

      if (thinkingParser) {
        thinkingParser.finalize();
      }

      if (thinkingBlockIndex !== -1) {
        const block = output.content[thinkingBlockIndex] as ThinkingContent;
        stream.push({
          type: "thinking_end",
          contentIndex: thinkingBlockIndex,
          content: block.thinking,
          partial: output,
        });
      }

      for (const state of toolCallsState) {
        if (state?.emittedStart && !state.emittedEnd) {
          state.emittedEnd = true;
          let args = {};
          try {
            args = JSON.parse(state.arguments || "{}");
          } catch {}
          const block = output.content[state.contentIndex] as ToolCall;
          block.arguments = args;
          stream.push({
            type: "toolcall_end",
            contentIndex: state.contentIndex,
            toolCall: {
              type: "toolCall",
              id: state.id,
              name: state.name,
              arguments: args,
            },
            partial: output,
          });
        }
      }

      // Guarded on blocks that actually reached the message, not on the state
      // array being non-empty. Claiming "toolUse" for a message carrying no
      // tool call is what turned a malformed stream into a silent dead end.
      if (toolCallsState.some((state) => state?.emittedStart)) {
        output.stopReason = "toolUse";
      }
      // Otherwise keep whatever finish_reason set upstream (defaults to "stop").
      // Never overwrite a meaningful finish_reason ("length", "content_filter",
      // ...) with "stop".
      stream.push({
        type: "done",
        reason: output.stopReason as Extract<AssistantMessage["stopReason"], "stop" | "length" | "toolUse">,
        message: output,
      });
      stream.end();
    } catch (e: unknown) {
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage = e instanceof Error ? e.message : String(e);
      stream.push({ type: "error", reason: output.stopReason, error: output });
      try {
        stream.end();
      } catch {}
    }
  })();

  return stream;
}
