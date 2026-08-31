# pi-provider-qoder

A [pi](https://shittycodingagent.ai/) extension that connects pi to Qoder.

```bash
pi install npm:pi-provider-qoder
```

The published package ships `dist/index.js` via `pi.extensions`.

Log in, then pick a provider and a model:

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

Both providers are always registered together. Each is bound to one region at
registration. There is no `QODER_REGION`, `QODER_BACKEND`, or `QODER_MODE`, and
those cannot reroute `qoder` to China. Use `--provider qoder-cn` instead.

### `qoder` (global)

- Always `https://api3.qoder.sh/`
- Login: `/login qoder` (browser OAuth or PAT)
- PAT page: https://qoder.com/account/integrations
- Env (first match): `QODER_API_KEY`, `QODER_PERSONAL_ACCESS_TOKEN`, `QODER_PAT`

### `qoder-cn` (China)

- Always `https://gateway.qoder.com.cn/`
- Login: `/login qoder-cn` (PAT only; no browser login)
- PAT page: https://qoder.com.cn/account/integrations
- Env (first match): `QODERCN_API_KEY`, `QODERCN_PERSONAL_ACCESS_TOKEN`, `QODERCN_PAT`

A PAT (`pt-...`) is exchanged for a short-lived job token (same as qodercli) and
re-exchanged when it expires. Setting any of the env vars above logs that
provider in automatically at startup.

## Models

Public model IDs are friendly names only: the catalog `display_name` with
whitespace stripped. After login, the live `/algo/api/v2/model/list` catalog
replaces the static fallback. Run `/model` to see what the region actually
offers.

Do not treat the static seeds as the live list; they go stale. Live CN currently
includes models such as Qwen3.8-Flash and Qwen3.7-Flash that the static catalog
may omit, and still lists some models that are gone live.

Examples (not exhaustive):

- Global `qoder`: `Lite`, `Qwen3.8-Max`, `Qwen3.7-Plus`
- China `qoder-cn`: `Qwen3.8-Flash`, `Qwen3.7-Plus`

Requests still send the internal upstream key (`lite`, `qfmodel`, …), but those
keys are not public IDs. `--model qfmodel` fails with `Unknown Qoder model id`.
`--model lite` as a raw key also fails; it can still work only because pi
case-insensitively matches the friendly id `Lite`.

Context window uses the largest option the live catalog advertises (often 1M).
Output is capped at 128K tokens.

## 0.4 breaking changes

- Model IDs are friendly names only. Raw upstream keys are not public IDs.
- Providers are region-bound: `qoder` is always global, `qoder-cn` is always CN.
  `QODER_REGION` is gone.
- The published extension entry is `dist/index.js` (fixes npm packages that pointed at src).

## Endpoints

| | Global (`qoder`) | China (`qoder-cn`) |
| --- | --- | --- |
| PAT exchange | `https://openapi.qoder.sh/api/v1/jobToken/exchange` | `https://openapi.qoder.com.cn/api/v1/jobToken/exchange` |
| User info | `https://openapi.qoder.sh/api/v1/userinfo` | `https://openapi.qoder.com.cn/api/v1/userinfo` |
| Usage | `https://openapi.qoder.sh/api/v2/quota/usage` | `https://openapi.qoder.com.cn/api/v2/quota/usage` |
| Chat gateway | `https://api3.qoder.sh/` | `https://gateway.qoder.com.cn/` |

## Architecture

```text
src/
├── index.ts              # Register both providers
├── region.ts             # Fixed global/CN URLs and env names
├── catalog.ts            # Friendly IDs, live catalog cache, static seeds
├── cosy.ts               # Internal request signing
├── auth/
│   ├── pat.ts            # PAT → job-token exchange
│   ├── login.ts          # Browser/PAT login
│   ├── oauth.ts          # Credentials, refresh, env auto-login
│   └── usage.ts          # Quota reporting
└── protocol/
    ├── stream.ts         # Streaming request/response
    ├── transform.ts      # Message conversion
    ├── encoding.ts       # Internal body encoding
    └── thinking.ts       # Thinking-tag parser
```

COSY signing and WAF body encoding are internal request plumbing, not
user-facing features.

## License

MIT
