const qoderCustomAlphabet = "_doRTgHZBKcGVjlvpC,@aFSx#DPuNJme&i*MzLOEn)sUrthbf%Y^w.(kIQyXqWA!";

const qoderStdAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const encodeTable = new Uint8Array(256);

for (let i = 0; i < encodeTable.length; i++) {
  encodeTable[i] = i;
}

for (let i = 0; i < qoderStdAlphabet.length; i++) {
  encodeTable[qoderStdAlphabet.charCodeAt(i)] = qoderCustomAlphabet.charCodeAt(i);
}

// Qoder uses "$" instead of standard Base64 "=" padding.
encodeTable["=".charCodeAt(0)] = "$".charCodeAt(0);

export function qoderEncodeBody(plaintext: string | Buffer): string {
  const std = Buffer.isBuffer(plaintext) ? plaintext.toString("base64") : Buffer.from(plaintext).toString("base64");

  const src = Buffer.from(std, "ascii");
  const n = src.length;
  const a = Math.floor(n / 3);

  const out = Buffer.allocUnsafe(n);
  let dst = 0;

  // Equivalent to:
  // std.slice(n - a) + std.slice(a, n - a) + std.slice(0, a)
  //
  // Translate directly into the output buffer to avoid building a large
  // rearranged string and repeatedly concatenating one-character strings.
  for (let i = n - a; i < n; i++) {
    out[dst++] = encodeTable[src[i]];
  }

  for (let i = a; i < n - a; i++) {
    out[dst++] = encodeTable[src[i]];
  }

  for (let i = 0; i < a; i++) {
    out[dst++] = encodeTable[src[i]];
  }

  return out.toString("ascii");
}
