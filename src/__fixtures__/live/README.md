# Qoder protocol replay fixtures

These JSON files preserve the four protocol interactions used by this provider:

1. PAT to job-token exchange
2. userinfo/identity lookup
3. model catalog
4. streaming chat (including Qoder's outer SSE envelope and JSON-string `body`)

`sample-global.json` and `sample-cn.json` are deliberately hand-authored examples,
identified by `"source": "sample"` and `"recordedAt": null`. They are not claimed
to be captures of live traffic. Offline unit tests replay these files so the same
format produced by the live recorder is always exercised.

## Re-recording

Use Node 24 or newer and provide both regional PATs:

```sh
QODER_PAT=... QODERCN_PAT=... npm run test:live
```

Long-form aliases are also accepted:

- Global: `QODER_PAT`, `QODER_PERSONAL_ACCESS_TOKEN`, or `QODER_API_KEY`
- China: `QODERCN_PAT`, `QODERCN_PERSONAL_ACCESS_TOKEN`, or `QODERCN_API_KEY`

To record one region while diagnosing credentials, pass `--region`:

```sh
npm run test:live -- --region global
npm run test:live -- --region cn
```

By default the command requires and records both regions. It exits non-zero
before making any request when a required PAT is missing. A successful run
writes `recorded-global.json` and/or `recorded-cn.json` in this directory.

Review every generated file before committing it. The recorder removes
authorization, cookies, COSY keys/signatures, PATs, job/refresh tokens, emails,
user IDs, machine IDs, names, and request/session/chat IDs. It retains
non-sensitive protocol headers, response schema, model metadata, and SSE
framing. A final leak check rejects the output if it still resembles a token,
email address, Authorization header, cookie, or COSY signature material.

The recorder uses a temporary `HOME`, never writes credentials to the repository,
and does not modify the normal `~/.pi` cache.
