import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  QODER_STATUS_KEY,
  qoderMode,
  quotaDetails,
  quotaSummary,
  renderCreditFooter,
  sessionCreditSummary,
} from "./credit-footer.js";
import { QoderQuotaService, type QuotaState } from "./quota.js";
import { SessionUsageCache } from "./session-usage.js";

/** Account quota GETs at UI lifecycle boundaries; request Credits live in assistant usage. */
export function registerQoderCreditDisplay(pi: ExtensionAPI, service = new QoderQuotaService()): void {
  // Older/alternate hosts can still register the provider without this optional UI.
  if (typeof pi.registerCommand !== "function") return;
  pi.registerFlag?.("qoder-credit-footer", {
    type: "boolean",
    default: false,
    description: "Opt in to the Qoder account-credit footer (replaces other custom footers)",
  });
  const sessionUsage = new SessionUsageCache();
  let enabled = false;
  let initialized = false;
  let owned = false;
  let latestContext: ExtensionContext | undefined;
  let quota: QuotaState | undefined;
  let refreshId = 0;
  let requestRender: (() => void) | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;

  async function resolveAccess(ctx: ExtensionContext): Promise<string | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        ctx.modelRegistry.getApiKeyForProvider(ctx.model?.provider ?? "qoder"),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Quota authentication unavailable")), 10_000);
          timer.unref?.();
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  function release(ctx: ExtensionContext) {
    if (!owned) return;
    owned = false;
    ctx.ui.setFooter(undefined);
    requestRender = undefined;
  }

  function syncFooter(ctx: ExtensionContext) {
    latestContext = ctx;
    if (!enabled || !ctx.hasUI || !qoderMode(ctx.model?.provider)) {
      release(ctx);
      return;
    }
    if (owned || ctx.mode !== "tui" || typeof ctx.ui.setFooter !== "function") return;
    ctx.ui.setFooter((tui, theme, footerData) => {
      owned = true;
      requestRender = () => tui.requestRender();
      const unsubscribe = footerData.onBranchChange(requestRender);
      return {
        invalidate() {},
        render: (width) => {
          const current = latestContext ?? ctx;
          return renderCreditFooter(
            current,
            footerData,
            theme,
            quota,
            width,
            sessionUsage.read(current.sessionManager),
          );
        },
        dispose() {
          unsubscribe();
          requestRender = undefined;
          // Another extension took the slot. Do not fight it on the next refresh.
          if (owned) enabled = false;
          owned = false;
        },
      };
    });
  }

  function publish(ctx: ExtensionContext) {
    if (ctx.hasUI) {
      const status =
        qoderMode(ctx.model?.provider) && !owned
          ? [
              ...sessionCreditSummary(ctx, sessionUsage.read(ctx.sessionManager)),
              ...quotaSummary(quota, ctx.model?.provider),
            ].join(" · ")
          : undefined;
      ctx.ui.setStatus(QODER_STATUS_KEY, status);
    }
    requestRender?.();
  }

  async function refresh(ctx: ExtensionContext, force = false) {
    const id = ++refreshId;
    clearTimeout(expiryTimer);
    const mode = qoderMode(ctx.model?.provider);
    latestContext = ctx;
    if (!mode || !ctx.hasUI) {
      quota = undefined;
      syncFooter(ctx);
      publish(ctx);
      return;
    }
    // Never show the previous region/account while resolving the current identity.
    quota = { status: "loading" };
    syncFooter(ctx);
    publish(ctx);
    try {
      const access = await resolveAccess(ctx);
      if (id !== refreshId) return;
      if (!access) {
        service.clear(mode);
        quota = { status: "unavailable" };
      } else {
        const pending = service.read(mode, { access, refresh: "", expires: Number.POSITIVE_INFINITY }, force);
        quota = service.peek(mode);
        publish(ctx);
        const result = await pending;
        if (id !== refreshId) return;
        quota = result;
      }
    } catch {
      if (id !== refreshId) return;
      service.clear(mode);
      quota = { status: "unavailable" };
    }
    publish(ctx);
    const delay = service.staleAfterMs?.(mode);
    if (delay !== undefined) {
      // One local repaint at cache expiry; this timer never makes a network request.
      expiryTimer = setTimeout(() => {
        if (id !== refreshId) return;
        quota = service.peek(mode);
        publish(ctx);
      }, Math.ceil(delay) + 1);
      expiryTimer.unref?.();
    }
  }

  pi.on("session_start", (_event, ctx) => {
    if (!initialized) {
      enabled = pi.getFlag?.("qoder-credit-footer") === true;
      initialized = true;
    }
    void refresh(ctx);
  });
  pi.on("model_select", (_event, ctx) => {
    void refresh(ctx);
  });
  pi.on("before_agent_start", (_event, ctx) => {
    void refresh(ctx);
  });
  pi.on("agent_end", (_event, ctx) => {
    void refresh(ctx, true);
  });
  pi.on("session_shutdown", (_event, ctx) => {
    ++refreshId;
    clearTimeout(expiryTimer);
    release(ctx);
    service.clear();
  });
  pi.registerCommand("qoder-usage", {
    description: "Refresh account-period quota; footer on/off opts into/out of credit footer",
    handler: async (args, ctx) => {
      const argument = args.trim().toLowerCase();
      if (argument === "footer on" || argument === "footer off") {
        enabled = argument === "footer on";
        if (enabled && (ctx.mode !== "tui" || typeof ctx.ui.setFooter !== "function")) {
          enabled = false;
          ctx.ui.notify(
            "The credit footer requires an interactive pi terminal. /qoder-usage still shows account quota.",
            "warning",
          );
          return;
        }
        syncFooter(ctx);
        publish(ctx);
        ctx.ui.notify(
          enabled
            ? "Qoder credit footer enabled for this session. This replaces any other custom footer."
            : "Qoder credit footer disabled.",
          "info",
        );
        if (enabled) await refresh(ctx);
        return;
      }
      if (argument) {
        ctx.ui.notify("Usage: /qoder-usage [footer on|footer off]", "info");
        return;
      }
      if (!qoderMode(ctx.model?.provider)) {
        ctx.ui.notify("Select a qoder or qoder-cn model to inspect its account quota.", "info");
        return;
      }
      const nextRefresh = refreshId + 1;
      await refresh(ctx, true);
      if (refreshId !== nextRefresh) return;
      ctx.ui.notify(
        [
          ...sessionCreditSummary(ctx, sessionUsage.read(ctx.sessionManager)),
          quotaDetails(quota, ctx.model?.provider ?? "qoder"),
        ].join("\n"),
        quota?.status === "fresh" ? "info" : "warning",
      );
    },
  });
}
