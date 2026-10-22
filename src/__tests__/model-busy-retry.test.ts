import type {
  Api,
  AssistantMessage,
  AssistantMessageEvent,
  AssistantMessageEventStream,
  Context,
  Model,
} from "@earendil-works/pi-ai";
import { isRetryableAssistantError, retryAssistantCall } from "@earendil-works/pi-ai/utils/retry";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseModelBusyRejection, streamQoder } from "../protocol/stream.js";

vi.mock("../auth/oauth.js", () => ({
  resolveQoderIdentity: vi.fn().mockResolvedValue({
    access: "fake",
    userID: "test-user",
    email: "test@example.com",
    name: "Test User",
    machineID: "test-machine",
    refresh: "",
    expires: 0,
  }),
}));

function envelope(body: string, statusCodeValue = 200, statusCode = "OK"): string {
  return (
    "data:" +
    JSON.stringify({
      headers: { "Content-Type": ["application/json"] },
      body,
      statusCodeValue,
      statusCode,
    }) +
    "\n\n"
  );
}

const DONE_SSE = envelope("[DONE]");

function chunk(delta: object, extra: object = {}): object {
  return {
    choices: [{ delta, index: 0 }],
    created: 1,
    id: "test-id",
    model: "auto",
    object: "chat.completion.chunk",
    ...extra,
  };
}

function finishChunk(finishReason: string): object {
  return {
    choices: [{ finish_reason: finishReason, index: 0 }],
    created: 1,
    id: "test-id",
    model: "auto",
    object: "chat.completion.chunk",
    usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
  };
}

/** The exact three-layer nesting Qoder returns for a busy model. */
function busyBody(
  options: { retryAfterSeconds?: unknown; isQueued?: unknown; serviceAvailable?: unknown; code?: string } = {},
): string {
  const retryAfterSeconds = "retryAfterSeconds" in options ? options.retryAfterSeconds : 2;
  // Absent keys are meaningful: a snapshot missing isQueued is not "ready".
  const isQueued = "isQueued" in options ? options.isQueued : false;
  const serviceAvailable = "serviceAvailable" in options ? options.serviceAvailable : true;
  const code = options.code ?? "10605";
  const queue = JSON.stringify({
    isQueued,
    modelKey: "ultimate",
    queueCount: 0,
    queueType: "p4",
    retryAfterSeconds,
    serviceAvailable,
    waitTime: 0,
  });
  return JSON.stringify({
    code: "403",
    message: JSON.stringify({ code, message: queue, subCode: "RESOURCE_LIMIT" }),
  });
}

function busySse(options: Parameters<typeof busyBody>[0] = {}): string {
  return envelope(busyBody(options), 403, "Forbidden");
}

const SUCCESS_SSE =
  envelope(JSON.stringify(chunk({ content: "pong", role: "assistant" }))) +
  envelope(JSON.stringify(finishChunk("stop"))) +
  DONE_SSE;

type FetchStep = string | { body: string; status: number };

function mockFetchSequence(steps: FetchStep[]): typeof fetch {
  const queue = [...steps];
  return vi.fn(async () => {
    const step = queue.length > 1 ? queue.shift() : queue[0];
    if (step === undefined) throw new Error("mock fetch queue is empty");
    if (typeof step === "string") {
      return new Response(step, { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    return new Response(step.body, { status: step.status, headers: { "content-type": "text/event-stream" } });
  }) as unknown as typeof fetch;
}

/** A chunk with no id/model so tests can prove those fields were not carried over. */
function bareChunk(delta: object): object {
  return { choices: [{ delta, index: 0 }], created: 1, object: "chat.completion.chunk" };
}

function makeModel(): Model<Api> {
  return { id: "Ultimate", api: "qoder-api" as Api, provider: "qoder" } as Model<Api>;
}

function makeContext(): Context {
  return {
    systemPrompt: "test",
    messages: [{ role: "user", content: "hi" }],
    tools: [],
  } as unknown as Context;
}

async function consume(stream: AssistantMessageEventStream): Promise<AssistantMessageEvent[]> {
  const events: AssistantMessageEvent[] = [];
  for await (const event of stream) {
    events.push(event);
    if (event.type === "done" || event.type === "error") break;
  }
  return events;
}

function errorOf(events: AssistantMessageEvent[]): AssistantMessage {
  const error = events.find((event) => event.type === "error");
  expect(error, "expected an error event").toBeDefined();
  return (error as { error: AssistantMessage }).error;
}

function doneOf(events: AssistantMessageEvent[]): AssistantMessage {
  const done = events.find((event) => event.type === "done");
  expect(done, "expected a done event").toBeDefined();
  return (done as { message: AssistantMessage }).message;
}

function decodeRequestBody(init: RequestInit | undefined): Record<string, unknown> {
  const custom = "_doRTgHZBKcGVjlvpC,@aFSx#DPuNJme&i*MzLOEn)sUrthbf%Y^w.(kIQyXqWA!";
  const standard = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const encoded = Buffer.from(init?.body as Uint8Array).toString("utf8");
  const rearranged = [...encoded]
    .map((character) => (character === "$" ? "=" : standard[custom.indexOf(character)] || character))
    .join("");
  const third = Math.floor(rearranged.length / 3);
  const base64 =
    rearranged.slice(rearranged.length - third) +
    rearranged.slice(third, rearranged.length - third) +
    rearranged.slice(0, third);
  return JSON.parse(Buffer.from(base64, "base64").toString("utf8")) as Record<string, unknown>;
}

describe("parseModelBusyRejection", () => {
  it("reads the retry hint out of the real nested envelope body", () => {
    expect(parseModelBusyRejection(busyBody({ retryAfterSeconds: 2 }))).toEqual({ retryAfterMs: 2000 });
  });

  it("rejects a real queue instead of treating it as ready", () => {
    expect(parseModelBusyRejection(busyBody({ isQueued: true }))).toBeUndefined();
  });

  it("rejects a snapshot without the ready flags", () => {
    expect(parseModelBusyRejection(busyBody({ serviceAvailable: undefined }))).toBeUndefined();
    expect(parseModelBusyRejection(busyBody({ isQueued: undefined }))).toBeUndefined();
  });

  it("requires code 10605 and treats subCode as diagnostic only", () => {
    expect(parseModelBusyRejection(busyBody({ code: "10604" }))).toBeUndefined();
  });

  it("falls back to an immediate retry for invalid retry hints", () => {
    for (const invalid of [-1, 0, "2", Number.NaN, null]) {
      expect(parseModelBusyRejection(busyBody({ retryAfterSeconds: invalid }))).toEqual({ retryAfterMs: 0 });
    }
  });

  it("survives a non-JSON body", () => {
    expect(parseModelBusyRejection("blocked")).toBeUndefined();
    expect(parseModelBusyRejection(undefined)).toBeUndefined();
  });
});

describe("streamQoder model-busy recovery", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("retries a ready rejection and streams the retried reply", async () => {
    globalThis.fetch = mockFetchSequence([busySse({ retryAfterSeconds: 0 }), SUCCESS_SSE]);
    const events = await consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake" }));

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
    expect(doneOf(events).content.find((c) => c.type === "text")).toMatchObject({ text: "pong" });
    expect(events.filter((e) => e.type === "start")).toHaveLength(1);
    expect(events.filter((e) => e.type === "done" || e.type === "error")).toHaveLength(1);
  });

  it("keeps request_set_id/session_id and resets request_id + chat_record_id on retry", async () => {
    globalThis.fetch = mockFetchSequence([busySse({ retryAfterSeconds: 0 }), SUCCESS_SSE]);
    await consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake" }));

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    const first = decodeRequestBody(calls[0][1]);
    const second = decodeRequestBody(calls[1][1]);

    expect(second.request_id).toBe(second.chat_record_id);
    expect(second.request_id).not.toBe(first.request_id);
    expect(second.chat_record_id).not.toBe(first.chat_record_id);
    expect(second.request_set_id).toBe(first.request_set_id);
    expect(second.session_id).toBe(first.session_id);
    expect(second.model_config).toEqual(first.model_config);
    expect(second.messages).toEqual(first.messages);
    expect(second.tools).toEqual(first.tools);
    expect(second.parameters).toEqual(first.parameters);
  });

  it("re-signs the retried body", async () => {
    globalThis.fetch = mockFetchSequence([busySse({ retryAfterSeconds: 0 }), SUCCESS_SSE]);
    await consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake" }));

    const [first, second] = vi.mocked(globalThis.fetch).mock.calls;
    const firstInit = first[1] as RequestInit;
    const secondInit = second[1] as RequestInit;
    const firstHash = (firstInit.headers as Record<string, string>)["Cosy-Bodyhash"];
    const secondHash = (secondInit.headers as Record<string, string>)["Cosy-Bodyhash"];
    const crypto = await import("node:crypto");
    const expected = crypto
      .createHash("md5")
      .update(Buffer.from(secondInit.body as Uint8Array))
      .digest("hex");
    expect(secondHash).toBe(expected);
    expect(secondHash).not.toBe(firstHash);
  });

  it("exhausts the default budget with a retryable error", async () => {
    globalThis.fetch = mockFetchSequence([busySse({ retryAfterSeconds: 0 })]);
    const events = await consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake" }));
    const message = errorOf(events);

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(3);
    expect(message.errorMessage).toMatch(/model is busy/);
    expect(message.errorMessage).toMatch(/10605/);
    expect(message.errorMessage).toMatch(/attempts=3/);
    expect(isRetryableAssistantError(message)).toBe(true);
  });

  it("honors an explicit retry budget of 0 and 1", async () => {
    globalThis.fetch = mockFetchSequence([busySse({ retryAfterSeconds: 0 })]);
    let events = await consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake", maxRetries: 0 }));
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
    expect(errorOf(events).errorMessage).toMatch(/attempts=1/);

    globalThis.fetch = mockFetchSequence([busySse({ retryAfterSeconds: 0 })]);
    events = await consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake", maxRetries: 1 }));
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
    expect(errorOf(events).errorMessage).toMatch(/attempts=2/);
  });

  it("stops local recovery when the server asks for longer than the local cap", async () => {
    globalThis.fetch = mockFetchSequence([busySse({ retryAfterSeconds: 30 })]);
    const events = await consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake" }));
    const message = errorOf(events);

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
    expect(message.errorMessage).toMatch(/requested delay 30000ms/);
    expect(message.errorMessage).toMatch(/exceeds local cap 5000ms/);
    expect(isRetryableAssistantError(message)).toBe(true);
  });

  it("respects a smaller caller-provided maxRetryDelayMs", async () => {
    globalThis.fetch = mockFetchSequence([busySse({ retryAfterSeconds: 3 })]);
    const events = await consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake", maxRetryDelayMs: 1000 }));
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
    expect(errorOf(events).errorMessage).toMatch(/exceeds local cap 1000ms/);
  });

  it("treats maxRetryDelayMs:0 as no caller cap, keeping the 5s hard cap", async () => {
    globalThis.fetch = mockFetchSequence([busySse({ retryAfterSeconds: 0.001 }), SUCCESS_SSE]);
    const events = await consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake", maxRetryDelayMs: 0 }));

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
    expect(doneOf(events).content.find((c) => c.type === "text")).toMatchObject({ text: "pong" });
  });

  it("falls back to the hard cap for a non-finite maxRetryDelayMs", async () => {
    globalThis.fetch = mockFetchSequence([busySse({ retryAfterSeconds: 30 })]);
    const events = await consume(
      streamQoder(makeModel(), makeContext(), { apiKey: "fake", maxRetryDelayMs: Number.NaN }),
    );

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
    expect(errorOf(events).errorMessage).toMatch(/exceeds local cap 5000ms/);
  });

  it("falls back to the default retry budget for a non-finite maxRetries", async () => {
    globalThis.fetch = mockFetchSequence([busySse({ retryAfterSeconds: 0 })]);
    const events = await consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake", maxRetries: Number.NaN }));

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(3);
    expect(errorOf(events).errorMessage).toMatch(/attempts=3/);
  });

  it("keeps the previous behavior for a real queue", async () => {
    globalThis.fetch = mockFetchSequence([busySse({ isQueued: true }), SUCCESS_SSE]);
    const events = await consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake" }));
    const message = errorOf(events);

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
    expect(message.errorMessage).toMatch(/Upstream status 403/);
  });

  it("keeps the previous behavior when only subCode matches", async () => {
    globalThis.fetch = mockFetchSequence([busySse({ code: "10604" }), SUCCESS_SSE]);
    const events = await consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake" }));

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
    expect(errorOf(events).errorMessage).toMatch(/Upstream status 403/);
  });

  it.each([
    ["text", chunk({ content: "partial", role: "assistant" })],
    ["thinking", chunk({ reasoning_content: "considering" })],
    ["a buffered thinking tag", bareChunk({ content: "<thi" })],
    ["tool arguments", chunk({ tool_calls: [{ index: 0, function: { arguments: "{" } }] })],
    [
      "a tool call",
      chunk({
        tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "read", arguments: "{}" } }],
      }),
    ],
  ])("does not retry after %s output", async (_label, delta) => {
    const sse = envelope(JSON.stringify(delta)) + busySse({ retryAfterSeconds: 0 });
    globalThis.fetch = mockFetchSequence([sse, SUCCESS_SSE]);
    const events = await consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake" }));
    const message = errorOf(events);

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
    expect(message.errorMessage).toMatch(/after partial output/);
    expect(isRetryableAssistantError(message)).toBe(false);
    expect(events.find((e) => e.type === "done")).toBeUndefined();
  });

  it("clears metadata, finish reason and Qoder credits left by a rejected attempt", async () => {
    const failedAttempt =
      envelope(
        JSON.stringify({
          choices: [],
          created: 1,
          id: "metadata-only",
          model: "ultimate",
          object: "chat.completion.chunk",
          usage: {
            credits: 7,
            original_credits: 9,
            billable: true,
            completion_tokens: 0,
            prompt_tokens: 9,
            total_tokens: 9,
          },
        }),
      ) +
      envelope(JSON.stringify(finishChunk("length"))) +
      busySse({ retryAfterSeconds: 0 });
    // The successful attempt carries no id/model/usage/finish_reason at all, so
    // any value left in the message must come from the rejected attempt.
    const bareSuccess = envelope(JSON.stringify(bareChunk({ content: "pong" }))) + DONE_SSE;
    globalThis.fetch = mockFetchSequence([failedAttempt, bareSuccess]);
    const events = await consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake" }));
    const message = doneOf(events);
    const usage = message.usage as unknown as Record<string, unknown>;

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
    expect(message.stopReason).toBe("stop");
    expect(message.responseId).toBeUndefined();
    expect(message.responseModel).toBeUndefined();
    expect(message.errorMessage).toBeUndefined();
    expect(message.usage.input).toBe(0);
    expect(message.usage.output).toBe(0);
    expect(message.usage.totalTokens).toBe(0);
    expect(usage.credits).toBeUndefined();
    expect(usage.original_credits).toBeUndefined();
    expect(usage.billable).toBeUndefined();
    expect(usage.charged_credits).toBeUndefined();
    expect(usage.usd_equivalent).toBeUndefined();
  });

  it("clears attempt-one metadata when the retried request fails at HTTP level", async () => {
    const failedAttempt =
      envelope(
        JSON.stringify({
          choices: [],
          created: 1,
          id: "metadata-only",
          model: "ultimate",
          object: "chat.completion.chunk",
          usage: { credits: 7, prompt_tokens: 9, completion_tokens: 0, total_tokens: 9 },
        }),
      ) + busySse({ retryAfterSeconds: 0 });
    globalThis.fetch = mockFetchSequence([failedAttempt, { body: "boom", status: 503 }]);
    const events = await consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake" }));
    const message = errorOf(events);
    const usage = message.usage as unknown as Record<string, unknown>;

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
    expect(message.errorMessage).toMatch(/503/);
    expect(message.responseId).toBeUndefined();
    expect(message.usage.totalTokens).toBe(0);
    expect(usage.credits).toBeUndefined();
  });

  it("waits for retryAfterSeconds with fake timers", async () => {
    vi.useFakeTimers();
    globalThis.fetch = mockFetchSequence([busySse({ retryAfterSeconds: 2 }), SUCCESS_SSE]);
    const pending = consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake" }));

    await vi.advanceTimersByTimeAsync(1999);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const events = await pending;

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
    expect(doneOf(events).content.find((c) => c.type === "text")).toMatchObject({ text: "pong" });
  });

  it("does not sleep after the final failed attempt", async () => {
    vi.useFakeTimers();
    globalThis.fetch = mockFetchSequence([busySse({ retryAfterSeconds: 2 })]);
    const pending = consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake", maxRetries: 1 }));

    await vi.advanceTimersByTimeAsync(2000);
    const events = await pending;
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    expect(errorOf(events).errorMessage).toMatch(/attempts=2/);
  });

  it("aborts while waiting for the retry", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    globalThis.fetch = mockFetchSequence([busySse({ retryAfterSeconds: 2 }), SUCCESS_SSE]);
    const pending = consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake", signal: controller.signal }));

    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await vi.advanceTimersByTimeAsync(5000);
    const events = await pending;

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
    expect(events.filter((e) => e.type === "error")).toHaveLength(1);
    expect(errorOf(events).stopReason).toBe("aborted");
  });

  it("does not start another attempt when the abort lands while the rejected stream is cancelled", async () => {
    const controller = new AbortController();
    const body = new TextEncoder().encode(busySse({ retryAfterSeconds: 0 }));
    let cancelled = false;
    const abortingStream = new ReadableStream({
      start(streamController) {
        streamController.enqueue(body);
      },
      cancel() {
        cancelled = true;
        controller.abort();
      },
    });
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(abortingStream, { status: 200, headers: { "content-type": "text/event-stream" } });
      }
      return new Response(SUCCESS_SSE, { status: 200, headers: { "content-type": "text/event-stream" } });
    }) as unknown as typeof fetch;
    const events = await consume(
      streamQoder(makeModel(), makeContext(), { apiKey: "fake", signal: controller.signal }),
    );

    expect(cancelled).toBe(true);
    expect(calls).toBe(1);
    expect(events.filter((e) => e.type === "error")).toHaveLength(1);
    expect(errorOf(events).stopReason).toBe("aborted");
  });

  it("cancels the rejected response before the next attempt starts", async () => {
    let cancelled = false;
    let cancelObservedBeforeSecondFetch = false;
    let calls = 0;
    const body = new TextEncoder().encode(busySse({ retryAfterSeconds: 0 }));
    const busyStream = new ReadableStream({
      start(streamController) {
        streamController.enqueue(body);
      },
      cancel() {
        cancelled = true;
      },
    });
    globalThis.fetch = vi.fn(async () => {
      const index = calls;
      calls += 1;
      if (index === 1) {
        cancelObservedBeforeSecondFetch = cancelled;
        expect(busyStream.locked).toBe(false);
      }
      if (index === 0) {
        return new Response(busyStream, { status: 200, headers: { "content-type": "text/event-stream" } });
      }
      return new Response(SUCCESS_SSE, { status: 200, headers: { "content-type": "text/event-stream" } });
    }) as unknown as typeof fetch;
    await consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake" }));

    expect(calls).toBe(2);
    expect(cancelObservedBeforeSecondFetch).toBe(true);
  });
});

describe("harness retry integration", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  async function runProvider(): Promise<AssistantMessage> {
    const events = await consume(streamQoder(makeModel(), makeContext(), { apiKey: "fake" }));
    const terminal = events.at(-1);
    if (!terminal) throw new Error("no terminal event");
    if (terminal.type === "done") return terminal.message;
    if (terminal.type === "error") return terminal.error;
    throw new Error(`unexpected terminal event: ${terminal.type}`);
  }

  it("lets retryAssistantCall take over after the local budget", async () => {
    const fetchMock = mockFetchSequence([
      busySse({ retryAfterSeconds: 0 }),
      busySse({ retryAfterSeconds: 0 }),
      busySse({ retryAfterSeconds: 0 }),
      SUCCESS_SSE,
    ]);
    globalThis.fetch = fetchMock;

    const result = await retryAssistantCall(runProvider, { enabled: true, maxRetries: 1, baseDelayMs: 0 }, undefined);

    // 3 provider attempts (default budget) + 1 harness retry that succeeds.
    expect(result.stopReason).toBe("stop");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("makes no harness retry when the harness budget is disabled", async () => {
    const fetchMock = mockFetchSequence([busySse({ retryAfterSeconds: 0 })]);
    globalThis.fetch = fetchMock;

    const result = await retryAssistantCall(runProvider, { enabled: false, maxRetries: 3, baseDelayMs: 0 }, undefined);

    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toMatch(/model is busy/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
