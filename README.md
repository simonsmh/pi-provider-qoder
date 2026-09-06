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
