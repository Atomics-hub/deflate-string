# Changelog

## 0.1.0

First release.

- `compressToUrl` / `decompressFromUrl` — base64url, safe in URLs, cookies and JSON.
- `compressToUtf16` / `decompressFromUtf16` — fifteen bits per code unit, the smallest form.
- `compressToBytes` / `decompressFromBytes` — the raw payload.
- Every JavaScript string round trips exactly, including unpaired surrogates.
- Corrupt, truncated and future-version payloads throw `DeflateStringError`.
- Zero dependencies. Needs `CompressionStream`: Node 18+, Chrome 80, Firefox 113, Safari 16.4.
