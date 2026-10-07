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

## License

MIT

## Account credits (local prototype)

Qoder quota is an **account-wide period balance**, including usage in other Qoder clients.
It is not a per-response price or this pi session's credit spend. Credit values never
enter pi's dollar-denominated `usage.cost` fields.

A compact account-quota status is shown for the selected Qoder provider. For the full
credit footer, opt in for the current pi session:

```text
/qoder-usage footer on
/qoder-usage
/qoder-usage footer off
```

Or start pi with `--qoder-credit-footer`. The custom footer replaces the misleading
`$0.000 (sub)` with an explicitly labelled account-period credit row. Input/output,
cache totals/hit rate, context, model/thinking level, directory, branch, session name,
and other extension statuses remain visible. Existing nonzero dollar charges in mixed
sessions are retained as `session $…` and are not relabelled as Qoder credits.
Narrow terminals wrap quota and put the model on its own line.

pi exposes one custom-footer slot. Enabling this option replaces another custom footer;
leave it off when using a separate footer extension. If another extension takes the slot
later, Qoder stops trying to reclaim it. Disabling restores pi's built-in footer only
while Qoder still owns the slot. The public API does not expose the current auto-compaction
setting, so this prototype does not add the built-in `(auto)` hint. Alternate hosts without
pi's TUI footer API keep the status/command where supported.

Quota refreshes asynchronously at session start, model selection, before a new agent run,
and after an agent run. The in-memory cache lasts 30 seconds and coalesces simultaneous
requests; `/qoder-usage` forces a refresh. A local timer marks expired snapshots `[stale]`
without polling. Missing data shows `?`/unavailable, not zero; failed refreshes retain only
the last snapshot for the same account. Personal and organization quota are separate,
with the API's own units. The command also shows the allowance and expiry when provided.
Credential lookup and quota requests are each bounded to 10 seconds.

There is no dedicated host login/logout event. After changing authentication for an
already-selected model, run `/qoder-usage`; otherwise the next supported lifecycle event
rechecks identity. No account quota is written to disk.

### Offline visual preview

```bash
npm ci
npm run demo:credits
```

The demo runs the same footer renderer inside pi-tui with **sample data only**. It makes
no account or model requests. Press `f` (fresh), `s` (stale), `u` (unavailable), `0` (zero
quota), or `q` (quit). It shows both standard and 54-column layouts. This prototype has
not been verified against a live account, and no package version or release is changed.
