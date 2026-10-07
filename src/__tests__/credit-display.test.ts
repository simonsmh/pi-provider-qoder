import type { OAuthCredentials } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerQoderCreditDisplay } from "../credit-display.js";
import { QODER_STATUS_KEY } from "../credit-footer.js";
import { QoderQuotaService, type QuotaState } from "../quota.js";
import type { QoderMode } from "../region.js";

type FooterFactory = NonNullable<Parameters<ExtensionContext["ui"]["setFooter"]>[0]>;
type Footer = ReturnType<FooterFactory>;
type EventHandler = (event: unknown, ctx: ExtensionContext) => unknown;
type Command = { handler: (args: string, ctx: ExtensionContext) => Promise<void> };

function fresh(used = 12, remaining = 88): QuotaState {
  return {
    status: "fresh",
    updatedAt: 100,
    snapshot: { userQuota: { used, remaining, total: used + remaining, unit: "credits" } },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

// Lifecycle listeners deliberately launch background work; drain its microtasks
// without sleeps, a live network, or dependence on a particular promise depth.
async function settle() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function fakeService() {
  const states = new Map<QoderMode, QuotaState>([
    ["global", fresh()],
    ["cn", fresh(34, 66)],
  ]);
  const service = {
    read: vi.fn((mode: QoderMode, _credentials: OAuthCredentials, _force = false) =>
      Promise.resolve(states.get(mode) ?? { status: "unavailable" as const }),
    ),
    peek: vi.fn((mode: QoderMode) => states.get(mode)),
    staleAfterMs: vi.fn((_mode: QoderMode): number | undefined => undefined),
    clear: vi.fn((mode?: QoderMode) => {
      if (mode) states.delete(mode);
      else states.clear();
    }),
  };
  return { ...service, service: service as unknown as QoderQuotaService, states };
}

function host(service = fakeService().service, footerOptIn = false) {
  const handlers = new Map<string, EventHandler[]>();
  const commands = new Map<string, Command>();
  const statuses = new Map<string, string>([["other-extension", "Other extension ready"]]);
  const branchListeners = new Set<() => void>();
  const unsubscribes: ReturnType<typeof vi.fn>[] = [];
  const requestRender = vi.fn();
  let activeFooter: Footer | undefined;
  const footerData = {
    getGitBranch: () => "test-branch",
    getAvailableProviderCount: () => 2,
    getExtensionStatuses: () => statuses,
    onBranchChange: vi.fn((listener: () => void) => {
      branchListeners.add(listener);
      const unsubscribe = vi.fn(() => branchListeners.delete(listener));
      unsubscribes.push(unsubscribe);
      return unsubscribe;
    }),
  } as unknown as ReadonlyFooterDataProvider;
  const theme = { fg: (_color: string, text: string) => text } as Theme;
  const setFooter = vi.fn((factory: FooterFactory | undefined) => {
    // Match the host's single footer slot: replacement disposes the old component.
    activeFooter?.dispose?.();
    activeFooter = factory?.({ requestRender } as unknown as TUI, theme, footerData);
  });
  const ui = {
    setFooter,
    setStatus: vi.fn((key: string, value: string | undefined) => {
      if (value === undefined) statuses.delete(key);
      else statuses.set(key, value);
    }),
    notify: vi.fn(),
  };
  const getApiKeyForProvider = vi
    .fn<(_provider: string) => Promise<string | undefined>>()
    .mockResolvedValue("test-access");
  const makeContext = (provider = "qoder", sessionName = "First session", extra: Partial<ExtensionContext> = {}) =>
    ({
      ui,
      hasUI: true,
      mode: "tui",
      cwd: "/test/project",
      model: { id: "test-model", provider, contextWindow: 128_000, reasoning: false },
      modelRegistry: { getApiKeyForProvider },
      sessionManager: { getEntries: () => [], getSessionName: () => sessionName },
      getContextUsage: () => ({ percent: 10, contextWindow: 128_000 }),
      ...extra,
    }) as unknown as ExtensionContext;
  const pi = {
    on: vi.fn((event: string, handler: EventHandler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    }),
    registerCommand: vi.fn((name: string, command: Command) => commands.set(name, command)),
    registerFlag: vi.fn(),
    getFlag: vi.fn(() => footerOptIn),
  };
  registerQoderCreditDisplay(pi as unknown as ExtensionAPI, service);
  const context = makeContext();
  return {
    pi,
    ui,
    context,
    statuses,
    branchListeners,
    unsubscribes,
    requestRender,
    getApiKeyForProvider,
    makeContext,
    get footer() {
      return activeFooter;
    },
    render: () => activeFooter?.render(160).join("\n") ?? "",
    async emit(event: string, ctx = context) {
      for (const handler of handlers.get(event) ?? []) handler({}, ctx);
      await settle();
    },
    command: (args = "", ctx = context) => commands.get("qoder-usage")?.handler(args, ctx),
  };
}

describe("Qoder credit display registration and safe modes", () => {
  it("is optional on older hosts without registerCommand", () => {
    const pi = { on: vi.fn(), registerFlag: vi.fn() };
    expect(() => registerQoderCreditDisplay(pi as unknown as ExtensionAPI)).not.toThrow();
    expect(pi.on).not.toHaveBeenCalled();
    expect(pi.registerFlag).not.toHaveBeenCalled();
  });

  it("registers a default-off flag, command, and the intended lifecycle boundaries", () => {
    const app = host();
    expect(app.pi.registerFlag).toHaveBeenCalledWith(
      "qoder-credit-footer",
      expect.objectContaining({ type: "boolean", default: false }),
    );
    expect(app.pi.registerCommand).toHaveBeenCalledWith(
      "qoder-usage",
      expect.objectContaining({ handler: expect.any(Function) }),
    );
    expect(app.pi.on.mock.calls.map(([name]) => name)).toEqual([
      "session_start",
      "model_select",
      "before_agent_start",
      "agent_end",
      "session_shutdown",
    ]);
  });

  it("tolerates command-capable hosts without optional flag methods", () => {
    const handlers = new Map<string, EventHandler>();
    const pi = {
      on: (event: string, handler: EventHandler) => handlers.set(event, handler),
      registerCommand: vi.fn(),
    };
    expect(() => registerQoderCreditDisplay(pi as unknown as ExtensionAPI, fakeService().service)).not.toThrow();
    expect(pi.registerCommand).toHaveBeenCalledOnce();
    const ctx = host().makeContext("unrelated-provider");
    expect(() => handlers.get("session_start")?.({}, ctx)).not.toThrow();
  });

  it("does not resolve credentials, read quota, or use UI automatically in non-UI print mode", async () => {
    const mock = fakeService();
    const app = host(mock.service, true);
    const ctx = app.makeContext("qoder", "Print", { hasUI: false, mode: "print" });
    for (const event of ["session_start", "model_select", "before_agent_start", "agent_end"]) {
      await app.emit(event, ctx);
    }
    expect(app.getApiKeyForProvider).not.toHaveBeenCalled();
    expect(mock.read).not.toHaveBeenCalled();
    expect(app.ui.setFooter).not.toHaveBeenCalled();
    expect(app.ui.setStatus).not.toHaveBeenCalled();
    expect(app.ui.notify).not.toHaveBeenCalled();
  });

  it("keeps RPC status and manual usage available but rejects the terminal footer", async () => {
    const app = host(fakeService().service, true);
    const ctx = app.makeContext("qoder", "RPC", { mode: "rpc" });
    await app.emit("session_start", ctx);
    expect(app.statuses.get(QODER_STATUS_KEY)).toContain("12 used");
    expect(app.ui.setFooter).not.toHaveBeenCalled();
    await app.command("footer on", ctx);
    expect(app.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("interactive pi terminal"), "warning");
    await app.command("", ctx);
    expect(app.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("12 used"), "info");
    expect(app.ui.setFooter).not.toHaveBeenCalled();
  });
});

describe("Qoder credit display quota lifecycle", () => {
  it("shows persisted request deductions in both the default status and the usage command", async () => {
    const app = host();
    const ctx = app.makeContext("qoder-cn");
    ctx.sessionManager = {
      ...ctx.sessionManager,
      getEntries: () =>
        [
          {
            type: "message",
            message: {
              role: "assistant",
              provider: "qoder-cn",
              usage: {
                input: 17,
                output: 1,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 18,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                credits: 0.000613272,
                billable: true,
              },
            },
          },
        ] as unknown as ReturnType<ExtensionContext["sessionManager"]["getEntries"]>,
    };
    await app.emit("session_start", ctx);
    expect(app.statuses.get(QODER_STATUS_KEY)).toContain("Qoder CN session: 0.00061327 Credits");
    await app.command("", ctx);
    expect(app.ui.notify).toHaveBeenLastCalledWith(
      expect.stringContaining("Qoder CN session: 0.00061327 Credits"),
      "info",
    );
  });
  it("reuses quota at lifecycle boundaries and forces a new snapshot after an agent run", async () => {
    const mock = fakeService();
    const app = host(mock.service);
    for (const event of ["session_start", "model_select", "before_agent_start", "agent_end"]) await app.emit(event);
    expect(mock.read).toHaveBeenCalledTimes(4);
    for (const [index, call] of mock.read.mock.calls.entries()) {
      expect(call).toEqual([
        "global",
        { access: "test-access", refresh: "", expires: Number.POSITIVE_INFINITY },
        index === 3,
      ]);
    }
    expect(app.getApiKeyForProvider).toHaveBeenCalledWith("qoder");
    expect(app.ui.setFooter).not.toHaveBeenCalled();
    expect(app.statuses.get(QODER_STATUS_KEY)).toContain("12 used · 88 left (credits)");
    expect(app.statuses.get("other-extension")).toBe("Other extension ready");
  });

  it("integrates with the real service TTL and manual refresh bypass", async () => {
    let now = 100;
    const fetchUsage = vi
      .fn()
      .mockResolvedValueOnce({ raw: fresh().snapshot })
      .mockResolvedValue({ raw: fresh(25, 75).snapshot });
    const service = new QoderQuotaService({ fetchUsage, now: () => now, ttlMs: 30_000 });
    const app = host(service);
    await app.emit("session_start");
    await app.emit("model_select");
    await app.emit("before_agent_start");
    expect(fetchUsage).toHaveBeenCalledOnce();
    await app.emit("agent_end");
    expect(fetchUsage).toHaveBeenCalledTimes(2);
    expect(app.statuses.get(QODER_STATUS_KEY)).toContain("25 used · 75 left");
    await app.command();
    expect(fetchUsage).toHaveBeenCalledTimes(3);
    now += 29_999;
    await app.emit("before_agent_start");
    expect(fetchUsage).toHaveBeenCalledTimes(3);
    now += 1;
    await app.emit("before_agent_start");
    expect(fetchUsage).toHaveBeenCalledTimes(4);
    await app.emit("session_shutdown");
    expect(service.peek("global")).toBeUndefined();
  });

  it("checks account identity before a new turn and hides the old account while resolving it", async () => {
    const mock = fakeService();
    const app = host(mock.service);
    await app.emit("session_start");
    expect(app.statuses.get(QODER_STATUS_KEY)).toContain("12 used");
    const auth = deferred<string | undefined>();
    app.getApiKeyForProvider.mockReturnValueOnce(auth.promise);
    await app.emit("before_agent_start");
    expect(app.statuses.get(QODER_STATUS_KEY)).toContain("loading");
    expect(app.statuses.get(QODER_STATUS_KEY)).not.toContain("12 used");
    mock.states.set("global", fresh(25, 75));
    auth.resolve("replacement-account-access");
    await settle();
    expect(mock.read).toHaveBeenLastCalledWith(
      "global",
      expect.objectContaining({ access: "replacement-account-access" }),
      false,
    );
    expect(app.statuses.get(QODER_STATUS_KEY)).toContain("25 used");
  });

  it("uses the CN provider key and a separate region cache", async () => {
    const mock = fakeService();
    const app = host(mock.service);
    await app.emit("session_start");
    await app.emit("model_select", app.makeContext("qoder-cn"));
    expect(app.getApiKeyForProvider).toHaveBeenLastCalledWith("qoder-cn");
    expect(mock.read).toHaveBeenLastCalledWith("cn", expect.objectContaining({ access: "test-access" }), false);
    expect(app.statuses.get(QODER_STATUS_KEY)).toContain("Qoder CN account period: 34 used");
  });

  it("forces /qoder-usage and explains that it is account-wide period usage", async () => {
    const mock = fakeService();
    const app = host(mock.service);
    await app.command("  ");
    expect(mock.read).toHaveBeenLastCalledWith("global", expect.any(Object), true);
    expect(app.ui.notify).toHaveBeenLastCalledWith(
      expect.stringContaining("Account-wide period totals, including other Qoder clients; not this session's spend."),
      "info",
    );
    const [message] = app.ui.notify.mock.calls.at(-1) ?? [];
    expect(message).toContain("Personal period allowance: 100");
    expect(message).not.toContain("$");
  });

  it("does not fetch on unrelated models or invalid command arguments", async () => {
    const mock = fakeService();
    const app = host(mock.service);
    const other = app.makeContext("openai");
    await app.emit("session_start", other);
    await app.command("", other);
    expect(app.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("Select a qoder or qoder-cn model"), "info");
    await app.command("invalid", app.context);
    expect(app.ui.notify).toHaveBeenLastCalledWith("Usage: /qoder-usage [footer on|footer off]", "info");
    expect(mock.read).not.toHaveBeenCalled();
    expect(app.getApiKeyForProvider).not.toHaveBeenCalled();
  });

  it("hides previous quota immediately while resolving authentication, then clears it when signed out", async () => {
    const mock = fakeService();
    const app = host(mock.service, true);
    await app.emit("session_start");
    expect(app.render()).toContain("12 used");
    const auth = deferred<string | undefined>();
    app.getApiKeyForProvider.mockReturnValueOnce(auth.promise);
    await app.emit("agent_end");
    expect(app.render()).toContain("loading");
    expect(app.render()).not.toContain("12 used");
    auth.resolve(undefined);
    await settle();
    expect(mock.clear).toHaveBeenCalledWith("global");
    expect(mock.read).toHaveBeenCalledOnce();
    expect(app.render()).toContain("quota unavailable");
    expect(app.render()).not.toContain("12 used");
  });

  it("renders safe unavailability rather than leaking authentication errors", async () => {
    const mock = fakeService();
    const app = host(mock.service);
    await app.emit("session_start");
    app.getApiKeyForProvider.mockRejectedValueOnce(new Error("private credential material"));
    await app.command();
    expect(mock.clear).toHaveBeenCalledWith("global");
    expect(app.statuses.get(QODER_STATUS_KEY)).toBe("Qoder account period: quota unavailable");
    expect(app.ui.notify).toHaveBeenLastCalledWith(expect.not.stringContaining("private credential"), "warning");
  });
});

describe("Qoder credit display local timeout and expiry timers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([false, true])("bounds a hung credential lookup to 10 seconds (custom footer: %s)", async (footerOptIn) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const mock = fakeService();
    const app = host(mock.service, footerOptIn);
    const auth = deferred<string | undefined>();
    app.getApiKeyForProvider.mockReturnValueOnce(auth.promise);
    const text = () => (footerOptIn ? app.render() : app.statuses.get(QODER_STATUS_KEY));
    await app.emit("session_start");
    expect(text()).toContain("loading");
    await vi.advanceTimersByTimeAsync(9_999);
    expect(text()).toContain("loading");
    await vi.advanceTimersByTimeAsync(1);
    expect(text()).toContain("quota unavailable");
    expect(mock.clear).toHaveBeenCalledWith("global");
    expect(mock.read).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    auth.resolve("late-access");
    await settle();
    expect(mock.read).not.toHaveBeenCalled();
    expect(text()).toContain("quota unavailable");
  });

  it("settles a manual command with a warning after a hung credential lookup times out", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const mock = fakeService();
    const app = host(mock.service);
    app.getApiKeyForProvider.mockReturnValueOnce(deferred<string | undefined>().promise);
    const command = app.command();
    await settle();
    await vi.advanceTimersByTimeAsync(10_000);
    await command;
    expect(app.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("quota unavailable"), "warning");
    expect(mock.read).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "marks cached quota stale locally without a fetch (custom footer: %s)",
    async (footerOptIn) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      let now = 0;
      const fetchUsage = vi.fn().mockResolvedValue({ raw: fresh().snapshot });
      const service = new QoderQuotaService({ fetchUsage, now: () => now, ttlMs: 100 });
      const app = host(service, footerOptIn);
      const text = () => (footerOptIn ? app.render() : app.statuses.get(QODER_STATUS_KEY));
      await app.emit("session_start");
      expect(text()).toContain("12 used");
      expect(text()).not.toContain("[stale]");
      expect(vi.getTimerCount()).toBe(1);
      now = 99;
      await vi.advanceTimersByTimeAsync(99);
      expect(text()).not.toContain("[stale]");
      // The display adds one millisecond so fractional monotonic timestamps
      // cannot cause a timer to repaint just before the cache becomes stale.
      now = 101;
      await vi.advanceTimersByTimeAsync(2);
      expect(text()).toContain("12 used · 88 left (credits) [stale]");
      expect(fetchUsage).toHaveBeenCalledOnce();
      expect(app.getApiKeyForProvider).toHaveBeenCalledOnce();
      expect(app.ui.notify).not.toHaveBeenCalled();
      expect(app.statuses.get("other-extension")).toBe("Other extension ready");
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("retains the original expiry deadline when a lifecycle event reuses fresh cached quota", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let now = 0;
    const fetchUsage = vi.fn().mockResolvedValue({ raw: fresh().snapshot });
    const service = new QoderQuotaService({ fetchUsage, now: () => now, ttlMs: 100 });
    const app = host(service);
    await app.emit("session_start");
    now = 70;
    await vi.advanceTimersByTimeAsync(70);
    await app.emit("before_agent_start");
    expect(fetchUsage).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);
    now = 101;
    await vi.advanceTimersByTimeAsync(31);
    expect(app.statuses.get(QODER_STATUS_KEY)).toContain("[stale]");
    expect(fetchUsage).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["model_select", "session_shutdown"])("cancels the local expiry timer on %s", async (event) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let now = 0;
    const fetchUsage = vi.fn().mockResolvedValue({ raw: fresh().snapshot });
    const service = new QoderQuotaService({ fetchUsage, now: () => now, ttlMs: 100 });
    const app = host(service, true);
    await app.emit("session_start");
    expect(vi.getTimerCount()).toBe(1);
    await app.emit(event, event === "model_select" ? app.makeContext("openai") : app.context);
    expect(vi.getTimerCount()).toBe(0);
    const publications = app.ui.setStatus.mock.calls.length;
    const renders = app.requestRender.mock.calls.length;
    now = 100;
    await vi.advanceTimersByTimeAsync(100);
    expect(app.ui.setStatus).toHaveBeenCalledTimes(publications);
    expect(app.requestRender).toHaveBeenCalledTimes(renders);
    expect(app.footer).toBeUndefined();
    expect(fetchUsage).toHaveBeenCalledOnce();
  });
});

describe("Qoder credit footer ownership", () => {
  it("opts in via the startup flag and preserves other extension statuses in its render", async () => {
    const app = host(fakeService().service, true);
    await app.emit("session_start");
    expect(app.ui.setFooter).toHaveBeenCalledOnce();
    expect(app.footer).toBeDefined();
    expect(app.render()).toContain("12 used · 88 left (credits)");
    expect(app.render()).toContain("Other extension ready");
    expect(app.statuses.has(QODER_STATUS_KEY)).toBe(false);
    expect(app.ui.setStatus.mock.calls.every(([key]) => key === QODER_STATUS_KEY)).toBe(true);
    app.requestRender.mockClear();
    for (const listener of app.branchListeners) listener();
    expect(app.requestRender).toHaveBeenCalledOnce();
    await app.emit("agent_end");
    expect(app.ui.setFooter).toHaveBeenCalledOnce();
  });

  it("supports explicit on/off, disposes listeners, and restores the default only once", async () => {
    const app = host();
    await app.emit("session_start");
    await app.command(" Footer ON ");
    expect(app.ui.setFooter).toHaveBeenCalledOnce();
    expect(app.branchListeners.size).toBe(1);
    expect(app.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("replaces any other custom footer"), "info");
    await app.command("footer off");
    expect(app.ui.setFooter).toHaveBeenLastCalledWith(undefined);
    expect(app.ui.setFooter).toHaveBeenCalledTimes(2);
    expect(app.unsubscribes[0]).toHaveBeenCalledOnce();
    expect(app.branchListeners.size).toBe(0);
    expect(app.footer).toBeUndefined();
    expect(app.statuses.get(QODER_STATUS_KEY)).toContain("12 used");
    await app.command("footer off");
    await app.emit("agent_end");
    await app.emit("session_shutdown");
    expect(app.ui.setFooter).toHaveBeenCalledTimes(2);
  });

  it("never clears a footer slot it did not own", async () => {
    const app = host();
    const otherFooter = { render: () => ["Another footer"], invalidate() {}, dispose: vi.fn() };
    app.ui.setFooter(() => otherFooter);
    await app.emit("session_start");
    await app.command("footer off");
    await app.emit("model_select", app.makeContext("openai"));
    await app.emit("session_shutdown");
    expect(app.footer).toBe(otherFooter);
    expect(app.ui.setFooter).toHaveBeenCalledOnce();
    expect(otherFooter.dispose).not.toHaveBeenCalled();
  });

  it("restores its owned default on a non-Qoder model and reacquires only when Qoder returns", async () => {
    const app = host(fakeService().service, true);
    await app.emit("session_start");
    await app.emit("model_select", app.makeContext("openai"));
    expect(app.ui.setFooter).toHaveBeenLastCalledWith(undefined);
    expect(app.footer).toBeUndefined();
    expect(app.branchListeners.size).toBe(0);
    expect(app.statuses.has(QODER_STATUS_KEY)).toBe(false);
    expect(app.statuses.get("other-extension")).toBe("Other extension ready");
    await app.emit("agent_end", app.makeContext("openai"));
    expect(app.ui.setFooter).toHaveBeenCalledTimes(2);
    await app.emit("model_select", app.makeContext("qoder-cn", "Second session"));
    expect(app.ui.setFooter).toHaveBeenCalledTimes(3);
    expect(app.render()).toContain("Qoder CN account period: 34 used");
    expect(app.render()).toContain("Second session");
  });

  it("does not retake or reset the slot after another extension replaces its footer", async () => {
    const mock = fakeService();
    const app = host(mock.service, true);
    await app.emit("session_start");
    const otherFooter = { render: () => ["Another footer"], invalidate() {}, dispose: vi.fn() };
    app.ui.setFooter(() => otherFooter);
    expect(app.unsubscribes[0]).toHaveBeenCalledOnce();
    expect(app.branchListeners.size).toBe(0);
    app.requestRender.mockClear();
    await app.emit("agent_end");
    expect(app.statuses.get(QODER_STATUS_KEY)).toContain("12 used");
    expect(app.requestRender).not.toHaveBeenCalled();
    await app.emit("model_select", app.makeContext("openai"));
    await app.emit("model_select", app.context);
    await app.emit("session_start", app.makeContext("qoder", "New session"));
    await app.command("footer off");
    await app.emit("session_shutdown");
    expect(app.pi.getFlag).toHaveBeenCalledOnce();
    expect(app.ui.setFooter).toHaveBeenCalledTimes(2);
    expect(app.footer).toBe(otherFooter);
    expect(otherFooter.dispose).not.toHaveBeenCalled();
    expect(mock.clear).toHaveBeenLastCalledWith();
  });

  it("allows explicit user re-enabling after another extension takes the slot", async () => {
    const app = host(fakeService().service, true);
    await app.emit("session_start");
    const otherFooter = { render: () => ["Another footer"], invalidate() {}, dispose: vi.fn() };
    app.ui.setFooter(() => otherFooter);
    await app.command("footer on");
    expect(otherFooter.dispose).toHaveBeenCalledOnce();
    expect(app.ui.setFooter).toHaveBeenCalledTimes(3);
    expect(app.render()).toContain("12 used");
  });
});

describe("Qoder credit display asynchronous transitions", () => {
  it("cannot publish an old region's quota after a newer provider is selected", async () => {
    const mock = fakeService();
    const pending = deferred<QuotaState>();
    mock.read.mockReturnValueOnce(pending.promise);
    const app = host(mock.service, true);
    await app.emit("session_start");
    await app.emit("model_select", app.makeContext("qoder-cn"));
    const currentRender = app.render();
    pending.resolve(fresh(900, 100));
    await settle();
    expect(app.render()).toBe(currentRender);
    expect(app.render()).toContain("Qoder CN account period: 34 used");
    expect(app.render()).not.toContain("900 used");
  });

  it("does not issue a quota request after an older authentication lookup loses its model race", async () => {
    const mock = fakeService();
    const auth = deferred<string | undefined>();
    const app = host(mock.service);
    app.getApiKeyForProvider.mockReturnValueOnce(auth.promise);
    await app.emit("session_start");
    await app.emit("model_select", app.makeContext("qoder-cn"));
    auth.resolve("old-global-access");
    await settle();
    expect(mock.read).toHaveBeenCalledOnce();
    expect(mock.read).toHaveBeenLastCalledWith("cn", expect.objectContaining({ access: "test-access" }), false);
    expect(app.statuses.get(QODER_STATUS_KEY)).toContain("Qoder CN account period: 34 used");
  });

  it("does not restore status or a footer after switching to a non-Qoder provider", async () => {
    const mock = fakeService();
    const pending = deferred<QuotaState>();
    mock.read.mockReturnValueOnce(pending.promise);
    const app = host(mock.service, true);
    await app.emit("session_start");
    await app.emit("model_select", app.makeContext("openai"));
    const calls = app.ui.setStatus.mock.calls.length;
    pending.resolve(fresh(900, 100));
    await settle();
    expect(app.statuses.has(QODER_STATUS_KEY)).toBe(false);
    expect(app.ui.setStatus).toHaveBeenCalledTimes(calls);
    expect(app.footer).toBeUndefined();
    expect(app.ui.setFooter).toHaveBeenCalledTimes(2);
  });

  it("cannot overwrite a newer session with the older session's response", async () => {
    const mock = fakeService();
    const pending = deferred<QuotaState>();
    mock.read.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(fresh(45, 55));
    const app = host(mock.service, true);
    await app.emit("session_start");
    await app.emit("session_start", app.makeContext("qoder", "Replacement session"));
    expect(app.render()).toContain("Replacement session");
    expect(app.render()).toContain("45 used");
    pending.resolve(fresh(900, 100));
    await settle();
    expect(app.render()).toContain("45 used");
    expect(app.render()).not.toContain("900 used");
    expect(app.ui.setFooter).toHaveBeenCalledOnce();
  });

  it("ignores an in-flight response after shutdown and disposes the owned footer", async () => {
    const mock = fakeService();
    const pending = deferred<QuotaState>();
    mock.read.mockReturnValueOnce(pending.promise);
    const app = host(mock.service, true);
    await app.emit("session_start");
    await app.emit("session_shutdown");
    const statusCalls = app.ui.setStatus.mock.calls.length;
    pending.resolve(fresh(900, 100));
    await settle();
    expect(app.ui.setStatus).toHaveBeenCalledTimes(statusCalls);
    expect(app.footer).toBeUndefined();
    expect(app.unsubscribes[0]).toHaveBeenCalledOnce();
    expect(mock.clear).toHaveBeenCalledWith();
  });

  it("does not mislabel a new provider's quota in an obsolete manual refresh notification", async () => {
    const mock = fakeService();
    const pending = deferred<QuotaState>();
    mock.read.mockReturnValueOnce(pending.promise);
    const app = host(mock.service);
    const command = app.command();
    await settle();
    await app.emit("model_select", app.makeContext("qoder-cn"));
    pending.resolve(fresh(900, 100));
    await command;
    expect(app.ui.notify).not.toHaveBeenCalled();
    expect(app.statuses.get(QODER_STATUS_KEY)).toContain("Qoder CN account period: 34 used");
  });
});
