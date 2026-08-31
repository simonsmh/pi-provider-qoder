import type { Message, Tool } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { getContentText, transformMessagesForQoder, transformTools } from "../transform.js";

// ── getContentText ────────────────────────────────────────────────────────

describe("getContentText", () => {
  it("returns string content directly", () => {
    const msg = { role: "user", content: "hello" } as Message;
    expect(getContentText(msg)).toBe("hello");
  });

  it("joins text and thinking blocks from array content", () => {
    const msg = {
      role: "assistant",
      content: [
        { type: "text", text: "answer" },
        { type: "thinking", thinking: "reasoning" },
      ],
    } as unknown as Message;
    expect(getContentText(msg)).toBe("answerreasoning");
  });

  it("skips non-text/non-thinking blocks", () => {
    const msg = {
      role: "assistant",
      content: [
        { type: "text", text: "a" },
        { type: "image", data: "base64", mimeType: "image/png" },
        { type: "text", text: "b" },
      ],
    } as unknown as Message;
    expect(getContentText(msg)).toBe("ab");
  });

  it("returns empty string for null content", () => {
    const msg = { role: "assistant", content: null } as unknown as Message;
    expect(getContentText(msg)).toBe("");
  });

  it("returns empty string for undefined content", () => {
    const msg = { role: "assistant" } as unknown as Message;
    expect(getContentText(msg)).toBe("");
  });
});

// ── transformTools ────────────────────────────────────────────────────────

describe("transformTools", () => {
  it("transforms tools to Qoder format", () => {
    const tools: Tool[] = [
      {
        name: "read_file",
        description: "Read a file",
        parameters: { type: "object", properties: { path: { type: "string" } } },
      },
    ];

    const result = transformTools(tools);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: "function",
      function: {
        name: "read_file",
        description: "Read a file",
        parameters: { type: "object", properties: { path: { type: "string" } } },
      },
    });
  });

  it("handles empty tools array", () => {
    expect(transformTools([])).toEqual([]);
  });

  it("preserves all tool properties", () => {
    const tools: Tool[] = [
      { name: "a", description: "desc a", parameters: { p: 1 } },
      { name: "b", description: "desc b", parameters: { q: 2 } },
    ];
    const result = transformTools(tools);
    expect(result).toHaveLength(2);
    expect(result[0].function.name).toBe("a");
    expect(result[1].function.name).toBe("b");
  });
});

// ── transformMessagesForQoder ─────────────────────────────────────────────

describe("transformMessagesForQoder", () => {
  it("passes through simple user string messages", () => {
    const msgs: Message[] = [{ role: "user", content: "hello" } as Message];
    const result = transformMessagesForQoder(msgs);
    expect(result).toEqual([{ role: "user", content: "hello" }]);
  });

  it("skips assistant messages with error stopReason", () => {
    const msgs = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "err", stopReason: "error" },
    ] as unknown as Message[];
    const result = transformMessagesForQoder(msgs);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
  });

  it("skips assistant messages with aborted stopReason", () => {
    const msgs = [{ role: "assistant", content: "aborted", stopReason: "aborted" }] as unknown as Message[];
    const result = transformMessagesForQoder(msgs);
    expect(result).toHaveLength(0);
  });

  it("handles user message with array content (text only)", () => {
    const msgs = [
      {
        role: "user",
        content: [
          { type: "text", text: "part1" },
          { type: "text", text: "part2" },
        ],
      },
    ] as unknown as Message[];
    const result = transformMessagesForQoder(msgs);
    expect(result[0].content).toBe("part1part2");
  });

  it("handles user message with image content", () => {
    const msgs = [
      {
        role: "user",
        content: [
          { type: "text", text: "look at " },
          { type: "image", data: "abc123", mimeType: "image/png" },
        ],
      },
    ] as unknown as Message[];
    const result = transformMessagesForQoder(msgs);
    const content = result[0].content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({ type: "text", text: "look at " });
    expect(content[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,abc123" },
    });
  });

  it("handles assistant message with text and tool calls", () => {
    const msgs = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "I'll read the file" },
          {
            type: "toolCall",
            id: "call_1",
            name: "read_file",
            arguments: { path: "/tmp/test" },
          },
        ],
      },
    ] as unknown as Message[];
    const result = transformMessagesForQoder(msgs);
    expect(result[0].role).toBe("assistant");
    expect(result[0].content).toBe("I'll read the file");
    const msg0 = result[0] as {
      role: string;
      content: unknown;
      tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
    };
    expect(msg0.tool_calls).toHaveLength(1);
    expect(msg0.tool_calls?.[0]).toMatchObject({
      id: "call_1",
      type: "function",
      function: {
        name: "read_file",
        arguments: JSON.stringify({ path: "/tmp/test" }),
      },
    });
  });

  it("handles assistant message with thinking block", () => {
    const msgs = [
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "let me think" },
          { type: "text", text: "answer" },
        ],
      },
    ] as unknown as Message[];
    const result = transformMessagesForQoder(msgs);
    expect(result[0].content).toContain("<thinking>let me think</thinking>");
    expect(result[0].content).toContain("answer");
  });

  it("handles toolResult messages", () => {
    const msgs = [
      {
        role: "toolResult",
        toolCallId: "call_1",
        content: "file content here",
      },
    ] as unknown as Message[];
    const result = transformMessagesForQoder(msgs);
    expect(result[0]).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: "file content here",
    });
  });

  it("forwards images returned by a tool call", () => {
    // pi's `read` tool returns a text note plus an image block for a png. The
    // `tool` role is a plain string in the OpenAI shape, so the image has to
    // follow as a user message; before this it was dropped and the model saw
    // only the note, then reported that it could not see images.
    const msgs = [
      {
        role: "toolResult",
        toolCallId: "call_1",
        content: [
          { type: "text", text: "Read image file [image/png]" },
          { type: "image", data: "abc123", mimeType: "image/png" },
        ],
      },
    ] as unknown as Message[];
    const result = transformMessagesForQoder(msgs);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: "Read image file [image/png]",
    });
    expect(result[1].role).toBe("user");
    const parts = result[1].content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
    expect(parts[0]).toEqual({
      type: "text",
      text: "[1 image returned by the previous tool call]",
    });
    expect(parts[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,abc123" },
    });
  });

  it("forwards several images from one tool call", () => {
    const msgs = [
      {
        role: "toolResult",
        toolCallId: "call_1",
        content: [
          { type: "text", text: "two shots" },
          { type: "image", data: "one", mimeType: "image/png" },
          { type: "image", data: "two", mimeType: "image/jpeg" },
        ],
      },
    ] as unknown as Message[];
    const result = transformMessagesForQoder(msgs);
    const parts = result[1].content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
    expect(parts[0].text).toBe("[2 images returned by the previous tool call]");
    expect(parts[1].image_url?.url).toBe("data:image/png;base64,one");
    expect(parts[2].image_url?.url).toBe("data:image/jpeg;base64,two");
  });

  it("adds no extra message when a tool result has no images", () => {
    // The common case by far; it must stay a single `tool` message.
    const msgs = [
      {
        role: "toolResult",
        toolCallId: "call_1",
        content: [{ type: "text", text: "plain text result" }],
      },
    ] as unknown as Message[];
    const result = transformMessagesForQoder(msgs);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("tool");
  });

  it("handles assistant message with string content", () => {
    const msgs = [
      {
        role: "assistant",
        content: "simple response",
      },
    ] as unknown as Message[];
    const result = transformMessagesForQoder(msgs);
    expect(result[0]).toEqual({
      role: "assistant",
      content: "simple response",
    });
  });

  it("uses a placeholder content for assistant messages with only tool calls (gateway workaround)", () => {
    // Regression: Qoder's gateway drops assistant messages with content:null,
    // which orphans the following tool_result and causes dmodel/ultimate to
    // reject the request with provider_error 400. Content must be non-null
    // whenever tool_calls are present.
    const msgs = [
      {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "c1",
            name: "fn",
            arguments: {},
          },
        ],
      },
    ] as unknown as Message[];
    const result = transformMessagesForQoder(msgs);
    const msg0 = result[0] as { role: string; content: unknown; tool_calls?: unknown[] };
    expect(msg0.content).not.toBeNull();
    expect(typeof msg0.content).toBe("string");
    expect(msg0.tool_calls).toHaveLength(1);
  });

  it("preserves tool_call_id pairing across assistant+toolResult when assistant has only tool calls", () => {
    // End-to-end regression: a toolCall-only assistant followed by a toolResult
    // must produce a valid OpenAI message sequence that upstreams accept.
    const msgs = [
      { role: "user", content: "do it" },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_abc123", name: "bash", arguments: { command: "ls" } }],
      },
      {
        role: "toolResult",
        toolCallId: "call_abc123",
        content: "file1\nfile2",
      },
    ] as unknown as Message[];
    const result = transformMessagesForQoder(msgs);

    const asst = result[1] as {
      role: string;
      content: unknown;
      tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
    };
    const tool = result[2] as { role: string; tool_call_id: string; content: string };

    // Assistant must keep the message (non-null content) so the tool pairs up.
    expect(asst.content).not.toBeNull();
    expect(asst.tool_calls).toHaveLength(1);
    expect(asst.tool_calls?.[0].id).toBe("call_abc123");

    // Tool result must reference the assistant's tool_call id.
    expect(tool.role).toBe("tool");
    expect(tool.tool_call_id).toBe("call_abc123");
  });
  it("drops the tool result whose assistant turn was aborted", () => {
    // Cancelling a turn mid-tool used to drop only the assistant message and
    // keep its tool result, leaving a `tool` message with no matching
    // tool_calls. Upstreams reject that with "tool must follow a message with
    // tool_calls", so every later request in the session failed.
    const msgs = [
      { role: "user", content: "go" },
      {
        role: "assistant",
        stopReason: "aborted",
        content: [{ type: "toolCall", id: "call_gone", name: "bash", arguments: {} }],
      },
      { role: "toolResult", toolCallId: "call_gone", content: "output" },
      { role: "user", content: "again" },
    ] as unknown as Message[];
    const result = transformMessagesForQoder(msgs);

    expect(result.map((m) => (m as { role: string }).role)).toEqual(["user", "user"]);
    expect(result.some((m) => (m as { role: string }).role === "tool")).toBe(false);
  });

  it("keeps a healthy tool round-trip while dropping an aborted one", () => {
    const msgs = [
      {
        role: "assistant",
        stopReason: "error",
        content: [{ type: "toolCall", id: "call_bad", name: "x", arguments: {} }],
      },
      { role: "toolResult", toolCallId: "call_bad", content: "r1" },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_good", name: "y", arguments: {} }],
      },
      { role: "toolResult", toolCallId: "call_good", content: "r2" },
    ] as unknown as Message[];
    const result = transformMessagesForQoder(msgs);

    expect(result).toHaveLength(2);
    const asst = result[0] as { tool_calls?: Array<{ id: string }> };
    const tool = result[1] as { role: string; tool_call_id: string };
    expect(asst.tool_calls?.map((t) => t.id)).toEqual(["call_good"]);
    expect(tool.tool_call_id).toBe("call_good");

    // Every tool message must have a declaring tool_calls entry.
    const declared = new Set(
      result.flatMap((m) => ((m as { tool_calls?: Array<{ id: string }> }).tool_calls ?? []).map((t) => t.id)),
    );
    for (const m of result) {
      const tm = m as { role: string; tool_call_id?: string };
      if (tm.role === "tool") expect(declared.has(tm.tool_call_id as string)).toBe(true);
    }
  });
});
