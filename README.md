# pi-provider-qoder

A [pi](https://shittycodingagent.ai/) extension that connects pi to Qoder.

```bash
pi install npm:pi-provider-qoder
# or: omp install npm:pi-provider-qoder
```

```bash
pi --provider qoder --model Lite
pi --provider qoder-cn --model Qwen3.7-Plus
```

Inside pi:

```text
/login qoder
/model Qwen3.8-Max
```

## Providers

Both providers register together.

### `qoder` (global)

- `https://api3.qoder.sh/`
- Login: `/login qoder` (browser OAuth or PAT)
- PAT page: https://qoder.com/account/integrations
- Env (first match): `QODER_API_KEY`, `QODER_PERSONAL_ACCESS_TOKEN`, `QODER_PAT`

### `qoder-cn` (China)

- `https://gateway.qoder.com.cn/`
- Login: `/login qoder-cn` (PAT only)
- PAT page: https://qoder.com.cn/account/integrations
- Env (first match): `QODERCN_API_KEY`, `QODERCN_PERSONAL_ACCESS_TOKEN`, `QODERCN_PAT`

A PAT (`pt-...`) is exchanged for a job token. Setting any of those env vars logs the provider in at startup.

## Models

Model IDs are the catalog `display_name` with whitespace stripped. After login, `/model` lists what that region offers.

Examples: `Lite`, `Qwen3.8-Max`, `Qwen3.7-Plus`, `Qwen3.8-Flash`.

Context uses the largest live catalog option (often 1M). Output is 128K.

## Endpoints

| | Global (`qoder`) | China (`qoder-cn`) |
| --- | --- | --- |
| PAT exchange | `https://openapi.qoder.sh/api/v1/jobToken/exchange` | `https://openapi.qoder.com.cn/api/v1/jobToken/exchange` |
| User info | `https://openapi.qoder.sh/api/v1/userinfo` | `https://openapi.qoder.com.cn/api/v1/userinfo` |
| Usage | `https://openapi.qoder.sh/api/v2/quota/usage` | `https://openapi.qoder.com.cn/api/v2/quota/usage` |
| Chat gateway | `https://api3.qoder.sh/` | `https://gateway.qoder.com.cn/` |

## Request and account Credits

The footer shows **actual session deductions in Credits**, accumulated from Qoder's
request-level `usage.credits` and `usage.billable` response fields. Tokens are shown
separately and are not used to estimate Credits. A non-billable request contributes zero
to actual deductions even when its reported nominal Credits are positive. Missing
billing metadata is counted as `unknown`, so an incomplete session total is visible.
Global and CN session totals are separate and are rebuilt from stored session entries,
including attributed compaction, summary and tool usage entries.

Account quota is an **account-wide period balance**, including other Qoder clients.
Personal, add-on and organization quota are displayed separately. Account balances may
be rounded or updated later; they do not determine per-request cost.

Assistant `usage` preserves Qoder's `credits`, `original_credits`, and `billable`, and
adds `qoder_provider`, `charged_credits`, and `usd_equivalent`. `charged_credits` is zero
for non-billable calls, or the returned discounted Credits for billable calls; it remains
absent when actual deductions cannot be determined. `usd_equivalent` is a reference
conversion at **$20 / 1,500 Credits**, not a dollar charge. Credits never enter pi's
dollar-denominated `usage.cost` fields. See the [Qoder usage field definitions](https://docs.qoder.com/cli/sdk/cost-usage).

For example, a CN response with `credits: 0.000613272` and `billable: true` contributes
`0.000613272` Credits, while a Global response with `credits: 0.005221428571428571` and
`billable: false` contributes zero. The UI keeps up to eight decimal places; serialized
usage preserves the full returned precision.

A compact session-Credits and account-quota status is shown for the selected Qoder provider.
`/qoder-usage` also shows the session deductions and account quota. For the full
credit footer, opt in for the current pi session:

```text
/qoder-usage footer on
/qoder-usage
/qoder-usage footer off
```

Or start pi with `--qoder-credit-footer`. The custom footer replaces the misleading
`$0.000 (sub)` with labelled session Credits and account-quota rows. Input/output,
cache totals/hit rate, context, model/thinking level, directory, branch, session name,
and other extension statuses remain visible. Existing nonzero dollar charges in mixed
sessions are retained as `session $…` and are not relabelled as Qoder credits.
Narrow terminals wrap quota and put the model on its own line.

pi exposes one custom-footer slot. Enabling this option replaces another custom footer;
leave it off when using a separate footer extension. If another extension takes the slot
later, Qoder stops trying to reclaim it. Disabling restores pi's built-in footer only
while Qoder still owns the slot. The public API does not expose the current auto-compaction
setting, so the custom footer does not add the built-in `(auto)` hint. Alternate hosts without
pi's TUI footer API keep the status/command where supported.

Quota refreshes asynchronously at session start, model selection, before a new agent run,
and after an agent run. The in-memory cache lasts 30 seconds and coalesces simultaneous
requests; agent completion and `/qoder-usage` force a refresh. A local timer marks expired snapshots `[stale]`
without polling. Missing data shows `?`/unavailable, not zero; failed refreshes retain only
the last snapshot for the same account. Personal, add-on and organization quota are separate,
with the API's own units. The command also shows the allowance and expiry when provided.
Credential lookup and quota requests are each bounded to 10 seconds.

There is no dedicated host login/logout event. After changing authentication for an
already-selected model, run `/qoder-usage`; otherwise the next supported lifecycle event
rechecks identity. No account quota is written to disk. Per-request Credits are stored
with the assistant usage in the host's session log.

### `omp usage`

OMP's built-in usage view reads a provider-level `usage` slot, so a logged-in Qoder
account appears there with the same account quota: one row per Credit bucket (user,
add-on, organization), the numeric used/limit/remaining amounts, the plan expiry when
one exists, and the account kind. The read reuses the quota endpoint behind
`/qoder-usage` and is account-wide; a failed quota read shows as missing data and never
marks the credential unhealthy. pi has no such slot, so there `/qoder-usage` remains the
quota view.

### Offline visual preview

```bash
npm ci
npm run demo:credits
```

The demo runs the same footer renderer inside pi-tui with **sample data only**. It makes
no account or model requests. Press `f` (fresh), `s` (stale), `u` (unavailable), `0` (zero
quota), or `q` (quit). It shows both standard and 54-column layouts. Global and CN
quota queries and request-level billing fields have been verified with live calls.

Sanitized billing samples in `src/__fixtures__/billing/usage.json` cover free Global
calls, paid Global/CN calls, and two Kimi-K3 calls totaling 1.03185159 Credits.
Session accounting regression tests use these samples without making live requests.

## License

MIT
