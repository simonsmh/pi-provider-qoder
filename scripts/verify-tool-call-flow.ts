/** Synthetic, offline-only regression. Build first; no live mode or credential input is supported. */
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import crypto from "node:crypto";
import dgram from "node:dgram";
import dns from "node:dns";
import fs from "node:fs";
import http from "node:http";
import http2 from "node:http2";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import { pathToFileURL } from "node:url";
import type { AssistantMessage, Message, ToolCall } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

type WireMessage = {
  role: string;
  content?: unknown;
  tool_calls?: { id: string; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};
type Invocation = { id: string; name: string; args: unknown };
type Fixture = {
  name: string;
  deltas: object[];
  expected: Invocation[];
  providerError?: boolean;
  schemaError?: boolean;
};

function option(name: string): string {
  const index = process.argv.indexOf(name);
  assert(index > 0 && process.argv[index + 1], `Required option: ${name}`);
  return path.resolve(process.argv[index + 1]);
}
const packageRoot = option("--package-root");
const sdkRoot = option("--sdk-root");
const outputPath = option("--output");
assert.equal(process.argv.length, 8, "Only --package-root, --sdk-root and --output are supported");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "qoder-offline-flow-"));
const originalCwd = process.cwd();
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, {
  HOME: path.join(temporary, "home"),
  XDG_CONFIG_HOME: path.join(temporary, "config"),
  XDG_CACHE_HOME: path.join(temporary, "cache"),
  XDG_DATA_HOME: path.join(temporary, "data"),
  XDG_STATE_HOME: path.join(temporary, "state"),
  PI_CODING_AGENT_DIR: path.join(temporary, "home/.pi/agent"),
  TMPDIR: path.join(temporary, "tmp"),
  JITI_FS_CACHE: "false",
});
for (const directory of [
  process.env.HOME,
  process.env.XDG_CONFIG_HOME,
  process.env.XDG_CACHE_HOME,
  process.env.XDG_DATA_HOME,
  process.env.XDG_STATE_HOME,
  process.env.PI_CODING_AGENT_DIR,
  process.env.TMPDIR,
  path.join(temporary, "workspace"),
]) {
  fs.mkdirSync(directory!, { recursive: true, mode: 0o700 });
}
process.chdir(path.join(temporary, "workspace"));
const safety = { deniedNetwork: 0, deniedSubprocess: 0, selfTestsPassed: 0, notOsSandbox: true };
const denyNetwork = (): never => {
  safety.deniedNetwork++;
  throw new Error("offline-network-denied");
};
const denySubprocess = (): never => {
  safety.deniedSubprocess++;
  throw new Error("offline-subprocess-denied");
};
// These guards precede every SDK/provider import. No loopback exception is needed.
globalThis.fetch = denyNetwork;
http.request = http.get = https.request = https.get = denyNetwork;
http2.connect = denyNetwork;
net.connect = net.createConnection = net.Socket.prototype.connect = tls.connect = denyNetwork;
dgram.Socket.prototype.send = denyNetwork;
for (const target of [dns, dns.promises]) {
  for (const key of Object.keys(target)) {
    if (key === "lookup" || key.startsWith("resolve")) Object.assign(target, { [key]: denyNetwork });
  }
}
for (const key of ["exec", "execSync", "execFile", "execFileSync", "spawn", "spawnSync", "fork"]) {
  Object.assign(childProcess, { [key]: denySubprocess });
}
syncBuiltinESMExports();
for (const probe of [
  () => fetch("https://example.invalid"),
  () => net.connect(443, "192.0.2.1"),
  () => dns.promises.lookup("example.invalid"),
  () => dns.lookup("example.invalid", () => {}),
  () => tls.connect(443, "example.invalid"),
  () => http.request("http://example.invalid"),
  () => https.get("https://example.invalid"),
  () => http2.connect("https://example.invalid"),
  () => childProcess.spawnSync("sh", ["-c", "exit 0"]),
  () => childProcess.exec("true"),
]) {
  assert.throws(probe, /offline-.*-denied/);
  safety.selfTestsPassed++;
}
const expectedDenials = { network: safety.deniedNetwork, subprocess: safety.deniedSubprocess };
const sdkEntry = path.join(sdkRoot, "@earendil-works/pi-coding-agent/dist/index.js");
const aiEntry = path.join(sdkRoot, "@earendil-works/pi-ai/dist/compat.js");
const bundle = path.join(packageRoot, "dist/index.js");
// Load a production-shaped copy with no adjacent development node_modules. Jiti's native-first
// path would otherwise bypass host aliases and accidentally import the project's pi-ai 1.0.4.
const loadRoot = path.join(temporary, "package");
fs.mkdirSync(loadRoot);
fs.copyFileSync(path.join(packageRoot, "package.json"), path.join(loadRoot, "package.json"));
fs.cpSync(path.join(packageRoot, "dist"), path.join(loadRoot, "dist"), { recursive: true });
const hash = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const report: {
  passed: boolean;
  sdkEntry: string;
  aiEntry: string;
  sdkVersion?: string;
  aiVersion?: string;
  bundleSha256?: string;
  loadedBundleSha256?: string;
  safety: typeof safety;
  cases: object[];
  failure?: string;
} = {
  passed: false,
  sdkEntry,
  aiEntry,
  safety,
  cases: [],
};
const delta = (index: number, id: string | undefined, name: string | undefined, args: string) => ({
  tool_calls: [{ index, ...(id ? { id } : {}), function: { ...(name ? { name } : {}), arguments: args } }],
});
const read: Invocation = { id: "fixture_A", name: "fixture_read", args: { path: "synthetic/a.txt" } };
const list: Invocation = { id: "fixture_B", name: "fixture_ls", args: { path: "synthetic/b" } };
const fixtures: Fixture[] = [
  {
    name: "stable-indices-positive",
    deltas: [
      delta(0, read.id, read.name, JSON.stringify(read.args)),
      delta(1, list.id, list.name, '{"path":"synthetic/'),
      delta(1, undefined, undefined, 'b"}'),
    ],
    expected: [read, list],
  },
  {
    name: "reused-index-required-path",
    deltas: [
      delta(0, read.id, read.name, JSON.stringify(read.args)),
      delta(0, list.id, list.name, '{"path":"synthetic/'),
      delta(0, undefined, undefined, 'b"}'),
    ],
    expected: [read, list],
  },
  {
    name: "optional-path-positive",
    deltas: [delta(0, "optional_A", "fixture_optional", '{"path":"synthetic/optional"}')],
    expected: [{ id: "optional_A", name: "fixture_optional", args: { path: "synthetic/optional" } }],
  },
  {
    name: "reused-index-optional-path",
    deltas: [
      delta(0, "optional_A", "fixture_optional", '{"path":"synthetic/a"}'),
      delta(0, "optional_B", "fixture_optional", '{"path":"synthetic/'),
      delta(0, undefined, undefined, 'b"}'),
    ],
    expected: [
      { id: "optional_A", name: "fixture_optional", args: { path: "synthetic/a" } },
      { id: "optional_B", name: "fixture_optional", args: { path: "synthetic/b" } },
    ],
  },
  {
    name: "noargs-positive",
    deltas: [delta(0, "noargs_A", "fixture_noargs", "")],
    expected: [{ id: "noargs_A", name: "fixture_noargs", args: {} }],
  },
  {
    name: "reused-index-noargs",
    deltas: [delta(0, "noargs_A", "fixture_noargs", "{}"), delta(0, "noargs_B", "fixture_noargs", "{}")],
    expected: [
      { id: "noargs_A", name: "fixture_noargs", args: {} },
      { id: "noargs_B", name: "fixture_noargs", args: {} },
    ],
  },
  {
    name: "schema-error-sdk-positive",
    deltas: [delta(0, "schema_A", "fixture_read", '{"path":{"invalid":true}}')],
    expected: [{ id: "schema_A", name: "fixture_read", args: { path: { invalid: true } } }],
    schemaError: true,
  },
  {
    name: "invalid-json-reject-whole-batch",
    deltas: [
      delta(0, read.id, read.name, JSON.stringify(read.args)),
      delta(1, "bad_A", "fixture_optional", '{"path":'),
    ],
    expected: [],
    providerError: true,
  },
  {
    name: "ambiguous-idless-reject-whole-batch",
    deltas: [
      delta(0, "ambiguous_A", "fixture_optional", '{"path":"synthetic/'),
      delta(0, "ambiguous_B", "fixture_optional", '{"path":"synthetic/'),
      delta(0, undefined, undefined, 'b"}'),
    ],
    expected: [],
    providerError: true,
  },
  {
    name: "required-path-zero-bytes-sdk-error",
    deltas: [delta(0, "required_empty_bytes_A", "fixture_read", "")],
    expected: [{ id: "required_empty_bytes_A", name: "fixture_read", args: {} }],
    schemaError: true,
  },
  {
    name: "required-path-explicit-empty-object-sdk-error",
    deltas: [delta(0, "required_empty_object_A", "fixture_read", "{}")],
    expected: [{ id: "required_empty_object_A", name: "fixture_read", args: {} }],
    schemaError: true,
  },
];
function envelope(body: unknown): string {
  return `data:${JSON.stringify({
    headers: {},
    body: typeof body === "string" ? body : JSON.stringify(body),
    statusCodeValue: 200,
    statusCode: "OK",
  })}\n\n`;
}
function sse(deltas: object[], reason: string): string {
  return (
    deltas.map((d) => envelope({ choices: [{ index: 0, delta: d }] })).join("") +
    envelope({ choices: [{ index: 0, finish_reason: reason }], usage: { prompt_tokens: 1, completion_tokens: 1 } }) +
    envelope("[DONE]")
  );
}
// Independent decoder: reverse the protocol block permutation, then translate the custom alphabet.
function decodeBody(body: BodyInit | null | undefined): { messages: WireMessage[] } {
  const custom = "_doRTgHZBKcGVjlvpC,@aFSx#DPuNJme&i*MzLOEn)sUrthbf%Y^w.(kIQyXqWA!$";
  const standard = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  const raw = Buffer.isBuffer(body) ? body.toString("ascii") : String(body);
  const translated = [...raw].map((c) => standard[custom.indexOf(c)] ?? c).join("");
  const third = Math.floor(translated.length / 3);
  const reordered = translated.slice(-third) + translated.slice(third, -third) + translated.slice(0, third);
  return JSON.parse(Buffer.from(reordered, "base64").toString("utf8"));
}
try {
  const sdk: typeof import("@earendil-works/pi-coding-agent") = await import(pathToFileURL(sdkEntry).href);
  const ai: typeof import("@earendil-works/pi-ai/compat") = await import(pathToFileURL(aiEntry).href);
  report.sdkVersion = JSON.parse(
    fs.readFileSync(path.join(sdkRoot, "@earendil-works/pi-coding-agent/package.json"), "utf8"),
  ).version;
  report.aiVersion = JSON.parse(
    fs.readFileSync(path.join(sdkRoot, "@earendil-works/pi-ai/package.json"), "utf8"),
  ).version;
  report.bundleSha256 = hash(bundle);
  report.loadedBundleSha256 = hash(path.join(loadRoot, "dist/index.js"));
  assert.equal(report.loadedBundleSha256, report.bundleSha256);
  // Fresh synthetic metadata suppresses startup discovery without mocking the factory or catalog reader.
  for (const name of ["qoder-models-cache.json", "qoder-cn-models-cache.json"]) {
    fs.writeFileSync(
      path.join(process.env.PI_CODING_AGENT_DIR!, name),
      JSON.stringify({
        updatedAt: Date.now(),
        models: [],
        configs: { Lite: { key: "lite", display_name: "Lite", is_reasoning: false } },
      }),
    );
  }
  for (const fixture of fixtures) {
    const invocations: Invocation[] = [];
    const requests: { messages: WireMessage[] }[] = [];
    const finalMessages: Message[] = [];
    const parserEvents: string[] = [];
    let settled = 0;
    let executionStarts = 0;
    let fCalls = 0;
    let refresh = 0;
    let sdkDerivedAuth = true;
    let streamIdentity = true;
    let identityRequests = 0;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === "openapi.qoder.sh" && url.pathname === "/api/v1/userinfo") {
        identityRequests++;
        return Response.json({ id: "synthetic-user", name: "Synthetic User", email: "synthetic@example.invalid" });
      }
      if (url.hostname !== "api3.qoder.sh" || url.pathname !== "/algo/api/v2/service/pro/sse/agent_chat_generation")
        return denyNetwork();
      requests.push(decodeBody(init?.body));
      assert(requests.length <= 2, "No retry or third model request is allowed");
      const text =
        requests.length === 1 ? sse(fixture.deltas, "tool_calls") : sse([{ content: "SYNTHETIC_DONE" }], "stop");
      const bytes = new TextEncoder().encode(text);
      return new Response(
        new ReadableStream({
          start(controller) {
            for (let offset = 0; offset < bytes.length; offset += 17)
              controller.enqueue(bytes.slice(offset, offset + 17));
            controller.close();
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    };
    const record = {
      type: "oauth" as const,
      access: "synthetic-access-not-a-token",
      refresh: "synthetic-refresh-not-a-token",
      expires: Date.now() + 3600000,
    };
    const memory = new ai.InMemoryCredentialStore();
    await memory.modify("qoder", async () => record);
    const runtime = await sdk.ModelRuntime.create({
      credentials: {
        read: memory.read.bind(memory),
        list: memory.list.bind(memory),
        modify: async () => {
          refresh++;
          throw new Error("refresh-disabled");
        },
        delete: async () => {
          throw new Error("delete-disabled");
        },
      },
      modelsPath: null,
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
    const settings = sdk.SettingsManager.inMemory({
      retry: { enabled: false },
      compaction: { enabled: false },
      cacheWarming: "off",
    });
    const loader = new sdk.DefaultResourceLoader({
      cwd: process.cwd(),
      agentDir: process.env.PI_CODING_AGENT_DIR!,
      settingsManager: settings,
      additionalExtensionPaths: [loadRoot],
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, [], "Official loader must load the actual built package");
    const pending = loader.getExtensions().runtime.pendingProviderRegistrations.filter((item) => item.name === "qoder");
    assert.equal(pending.length, 1);
    const config = pending[0].config;
    const F = config.streamSimple;
    assert(F && config.oauth && !config.apiKey, "Original factory and OAuth handler required");
    const tracedF: NonNullable<typeof F> = (model, context, options) => {
      fCalls++;
      sdkDerivedAuth &&= options?.apiKey === record.access;
      const stream = F(model, context, options);
      // The constructor exists at runtime but is absent from the 1.0.4 public declarations.
      const Stream = (
        ai as unknown as {
          AssistantMessageEventStream: new () => ReturnType<typeof ai.createAssistantMessageEventStream>;
        }
      ).AssistantMessageEventStream;
      streamIdentity &&= stream instanceof Stream;
      return stream;
    };
    config.streamSimple = tracedF;
    runtime.registerProvider("qoder", config);
    const model = runtime.getModel("qoder", "Lite");
    assert(model && model.api === "qoder-api");
    const tools: ToolDefinition[] = ["fixture_read", "fixture_ls", "fixture_optional", "fixture_noargs"].map(
      (name) => ({
        name,
        label: name,
        description: "Synthetic in-memory fixture only",
        parameters: {
          type: "object",
          properties: name === "fixture_noargs" ? {} : { path: { type: "string" } },
          required: name === "fixture_read" || name === "fixture_ls" ? ["path"] : [],
          additionalProperties: false,
        } as ToolDefinition["parameters"],
        async execute(id, args) {
          invocations.push({ id, name, args: structuredClone(args) });
          return { content: [{ type: "text", text: `RESULT:${id}:${JSON.stringify(args)}` }], details: {} };
        },
      }),
    );
    const initializationErrors: string[] = [];
    const { session } = await sdk.createAgentSession({
      cwd: process.cwd(),
      agentDir: process.env.PI_CODING_AGENT_DIR!,
      modelRuntime: runtime,
      model,
      thinkingLevel: "off",
      settingsManager: settings,
      resourceLoader: loader,
      sessionManager: sdk.SessionManager.inMemory(process.cwd()),
      customTools: tools,
      tools: tools.map((tool) => tool.name),
    });
    const unsubscribe = session.subscribe((event) => {
      if (event.type === "agent_settled") settled++;
      if (event.type === "tool_execution_start") executionStarts++;
      if (event.type === "message_end") finalMessages.push(structuredClone(event.message) as Message);
      if (event.type === "message_update") parserEvents.push(event.assistantMessageEvent.type);
    });
    const caseReport: Record<string, unknown> = {
      name: fixture.name,
      passed: false,
      loadedExtensionPaths: loader.getExtensions().extensions.map((extension) => extension.resolvedPath),
    };
    try {
      await session.bindExtensions({ onError: () => initializationErrors.push("extension-initialization-error") });
      assert.deepEqual(initializationErrors, []);
      assert.equal(runtime.getRegisteredProviderConfig("qoder")?.streamSimple, tracedF);
      assert.equal(session.model?.id, model.id);
      assert.deepEqual(session.getActiveToolNames().sort(), tools.map((tool) => tool.name).sort());
      const auth = await runtime.getAuth(model);
      assert(auth?.source === "OAuth" && auth.auth.apiKey === record.access);
      await session.prompt("Run the synthetic fixture tools, then return SYNTHETIC_DONE.");
      const assistants = finalMessages.filter((m): m is AssistantMessage => m.role === "assistant");
      const calls = assistants[0]?.content.filter((c): c is ToolCall => c.type === "toolCall") ?? [];
      Object.assign(caseReport, {
        parserEvents,
        assistant: assistants[0],
        invocations,
        executionStarts,
        toolResults: finalMessages.filter((m) => m.role === "toolResult"),
        requests,
        settled,
        fCalls,
        sdkDerivedAuth,
        streamIdentity,
        identityRequests,
        refresh,
        terminal: assistants.at(-1)?.stopReason,
      });
      assert.equal(refresh, 0);
      assert(sdkDerivedAuth && streamIdentity, "The actual F must receive SDK OAuth and return this host's stream");
      assert.equal(settled, 1, "The SDK must emit the real settled event");
      if (fixture.providerError) {
        assert.equal(assistants[0]?.stopReason, "error");
        assert.deepEqual(invocations, [], "An invalid/ambiguous batch must not execute any implementation");
        assert.equal(requests.length, 1);
      } else {
        assert.deepEqual(
          calls.map((c) => ({ id: c.id, name: c.name, args: c.arguments })),
          fixture.expected,
          "Final SDK assistant preserves IDs/names/complete arguments",
        );
        assert.deepEqual(
          invocations,
          fixture.schemaError ? [] : fixture.expected,
          "Count actual implementations, not tool_execution_start",
        );
        const results = finalMessages.filter((m) => m.role === "toolResult");
        assert.deepEqual(
          results.map((m) => m.toolCallId),
          fixture.expected.map((c) => c.id),
        );
        assert(results.every((m) => m.isError === !!fixture.schemaError));
        assert.deepEqual(
          results.map((m) => m.toolName),
          fixture.expected.map((c) => c.name),
        );
        assert.equal(requests.length, 2);
        const replay = requests[1].messages.find((m) => m.role === "assistant" && m.tool_calls);
        assert.deepEqual(
          replay?.tool_calls?.map((c) => ({ id: c.id, name: c.function.name, args: JSON.parse(c.function.arguments) })),
          fixture.expected,
        );
        assert.deepEqual(
          requests[1].messages.filter((m) => m.role === "tool").map((m) => m.tool_call_id),
          fixture.expected.map((c) => c.id),
        );
        if (!fixture.schemaError)
          assert.deepEqual(
            requests[1].messages.filter((m) => m.role === "tool").map((m) => m.content),
            fixture.expected.map((c) => `RESULT:${c.id}:${JSON.stringify(c.args)}`),
          );
        else {
          const errorTexts = results.map((result) =>
            result.content.filter((content) => content.type === "text").map((content) => content.text).join(""),
          );
          assert(errorTexts.every((text, index) =>
            text.startsWith(`Validation failed for tool "${fixture.expected[index].name}":`),
          ));
          assert.deepEqual(
            requests[1].messages.filter((m) => m.role === "tool").map((m) => m.content),
            errorTexts,
          );
        }
        assert.equal(assistants.at(-1)?.stopReason, "stop");
        assert.equal(session.getLastAssistantText(), "SYNTHETIC_DONE");
      }
      caseReport.passed = true;
    } catch (error) {
      caseReport.failure = error instanceof Error ? error.message : "synthetic-flow-failed";
    } finally {
      unsubscribe();
      session.dispose();
      report.cases.push(caseReport);
    }
  }
  assert.equal(safety.deniedNetwork, expectedDenials.network, "Unexpected network attempt outside mock transport");
  assert.equal(safety.deniedSubprocess, expectedDenials.subprocess, "Unexpected child process");
  report.passed = report.cases.every((c) => (c as { passed: boolean }).passed);
} catch (error) {
  report.failure = error instanceof Error ? error.message : "offline-flow-failed";
} finally {
  globalThis.fetch = denyNetwork;
  process.chdir(originalCwd);
  fs.rmSync(temporary, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}
process.stdout.write(
  `${JSON.stringify({
    passed: report.passed,
    sdkVersion: report.sdkVersion,
    cases: report.cases.map((c) => ({ name: (c as Fixture).name, passed: (c as { passed: boolean }).passed })),
    failure: report.failure,
  })}\n`,
);
process.exitCode = report.passed ? 0 : 1;
