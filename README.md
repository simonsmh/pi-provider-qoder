# pi-provider-qoder

A [pi](https://shittycodingagent.ai/) provider extension that connects pi to the **Qoder API**, exposing Qoder Global and Qoder China models through provider surfaces.

## Features

- **Two provider entries**:
  - `qoder` — Global / international Qoder.
  - `qoder-cn` — Qoder China, always bound to CN endpoints.
- **Interactive Login**: Global Qoder supports browser device-code flow or Personal Access Token (PAT) login.
- **Qoder CN PAT Login**: China edition uses a separate PAT login entry (`/login qoder-cn`) and CN token exchange endpoints.
- **WAF Bypass**: Built-in WAF obfuscation and body encoding (`Encode=1`).
- **COSY Signing**: Full COSY signature header generation (RSA/AES-CBC/MD5).
- **Dynamic Model Catalog**: Dynamically fetches model limits, effort configurations, and options from the `/algo/api/v2/model/list` endpoint.
- **Reasoning/Thinking Support**: Real-time extraction of thinking process from API reasoning or HTML-like `<think>` tags.

## Quick start

Install the provider:

```bash
pi install npm:pi-provider-qoder
```

Or install it globally with npm:

```bash
npm install -g pi-provider-qoder
```

Then log in from pi.

Global / international edition:

```text
/login qoder
```

China edition:

```text
/login qoder-cn
```

### Personal Access Token (PAT)

A Qoder PAT (`pt-...`) cannot authenticate API calls directly — the provider
exchanges it for a short-lived job token (mirroring the official `qodercli` /
`qoderclicn` flow) and resolves your account identity automatically.

Global Qoder:

- Run `/login qoder` and choose **Use API Key (PAT)**, then paste the token.
- Or set `QODER_PERSONAL_ACCESS_TOKEN` (or `QODER_PAT`) before starting pi.
- `QODER_API_KEY` is also accepted; when set, pi automatically exchanges it
  and logs the provider in during startup.

Qoder China:

- Run `/login qoder-cn`, then paste the CN PAT.
- Or set `QODERCN_PERSONAL_ACCESS_TOKEN` (or `QODERCN_PAT`) before starting pi.
- `QODERCN_API_KEY` is also accepted and triggers the same automatic startup login.

> The exchanged job token is short-lived; the provider transparently re-exchanges
> the stored PAT when it expires.

## Endpoints

Global:

- PAT exchange: `https://openapi.qoder.sh/api/v1/jobToken/exchange`
- User info: `https://openapi.qoder.sh/api/v1/userinfo`
- Usage: `https://openapi.qoder.sh/api/v2/quota/usage`
- Model / chat gateway: `https://api3.qoder.sh/algo/api/v2/...`

China:

- PAT exchange: `https://openapi.qoder.com.cn/api/v1/jobToken/exchange`
- User info: `https://openapi.qoder.com.cn/api/v1/userinfo`
- Usage: `https://openapi.qoder.com.cn/api/v2/quota/usage`
- Model / chat gateway: `https://gateway.qoder.com.cn/algo/api/v2/...`

## Models

### Global `qoder`

Exposes friendly IDs derived from the catalog `display_name` (whitespace is
removed), including:

- **Tier Models**: `Auto`, `Ultimate`, `Performance`, `Efficient`, `Lite`
- **Frontier Models**:
  - `Qwen3.7Plus`
  - `Cantus`
  - `Qwen3.8-Max`
  - `Qwen3.7-Max`
  - `DeepSeek-V4-Pro`
  - `DeepSeek-V4-Flash`
  - `GLM-5.2`
  - `Kimi-K2.7-Code`
  - `Kimi-K3`
  - `MiniMax-M3`

Only these friendly IDs are public. Service keys such as `lite`, `qfmodel`, and
`qmodel` cannot be selected with `--model`; the provider maps the chosen
friendly ID to its internal service key only when sending a request.

Global models default to a 1M context window, matching the Qoder API (verified
against `lite` with prompts up to 1,000K tokens). `kmodel` stays at the 256K its
catalog entry advertises. Once you log in, the live `/model/list` catalog
overrides these fallbacks with the largest context option each model exposes.

### China `qoder-cn`

The China provider exposes friendly model IDs and maps them back to Qoder CN's
internal keys at request time:

| Friendly ID | Qoder CN key | Context | Images | Reasoning |
| --- | --- | ---: | :---: | :---: |
| `Auto` | `auto` | 200K | ✅ | ✅ |
| `Qwen3.7-Max` | `qmodel_latest` | 1M | ✅ | ✅ |
| `Qwen3.7-Plus` | `qmodel` | 1M | ❌ | ✅ |
| `Qwen3.6-Flash` | `q36fmodel` | 1M | ❌ | ✅ |
| `DeepSeek-V4-Pro` | `dmodel` | 1M | ❌ | ✅ |
| `DeepSeek-V4-Flash` | `dfmodel` | 1M | ❌ | ❌ |
| `GLM-5.2` | `gm51model` | 200K | ✅ | ✅ |
| `Kimi-K2.7-Code` | `kmodel` | 256K | ✅ | ✅ |
| `MiniMax-M2.7` | `mmodel` | 200K | ❌ | ❌ |

## Usage

Once logged in, select any Qoder model in pi:

```text
/model Qwen3.7-Plus
```

Or start directly:

```bash
pi --provider qoder-cn --model Qwen3.7-Plus
```

Global example:

```bash
pi --provider qoder --model Lite
```

## Architecture

```text
src/
├── index.ts              # Register the two providers
├── region.ts             # Fixed global/CN configuration and URL helpers
├── cosy.ts               # COSY signing, machine ID, and gateway headers
├── catalog.ts            # Friendly model IDs, live catalog cache, static seeds
├── auth/
│   ├── pat.ts            # PAT → job-token exchange and identity
│   ├── login.ts          # Browser/PAT login sequence
│   ├── oauth.ts          # OAuth callback and credential orchestration
│   └── usage.ts          # Quota reporting
└── protocol/
    ├── stream.ts         # Shared streaming request/response handler
    ├── transform.ts      # Message and tool conversion
    ├── encoding.ts       # WAF bypass body encoder
    └── thinking.ts       # Fallback <think> tag parser
```

## License

MIT
