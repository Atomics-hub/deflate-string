# deflate-string

Compress a string to a string, using the compressor your runtime already ships. Smaller than
`lz-string` on every payload measured. Zero dependencies.

**Outgrown `lz-string` for localStorage or a URL?** That is what this is for. It uses the platform's
own compression, and is 2x to 12.8x smaller on every payload measured.

```js
import {compressToUrl, decompressFromUrl} from 'deflate-string';

const link = `https://example.com/#${await compressToUrl(JSON.stringify(state))}`;
const state = JSON.parse(await decompressFromUrl(new URL(link).hash.slice(1)));
```

## The problem

When you need to put something in a URL, a cookie or `localStorage`, you need a **string** — so the
usual compressors, which produce bytes, are the wrong shape. The package that fills that gap is
`lz-string`: 47M downloads a week, and last published in 2022.

Since then every runtime gained `CompressionStream`, so the platform now has a real deflate
implementation built in. It produces smaller output than `lz-string`, and it is maintained by whoever
maintains your runtime. What is still missing is the part around it: framing that survives every
JavaScript string, and an encoding that packs bytes into characters without wasting a third of them.
That is this package.

## Measured

`npm run bench` reproduces this. Sizes are characters stored, using each library's densest encoding:

| payload | raw | `lz-string` | this | smaller by |
| --- | --- | --- | --- | --- |
| saved UI filters | 2,016 | 282 | **139** | 2.03x |
| list of 400 records | 27,937 | 2,269 | **1,781** | 1.27x |
| prose | 18,000 | 809 | **63** | 12.84x |
| source code | 6,540 | 673 | **69** | 9.75x |
| incompressible text | 4,000 | 2,533 | **1,762** | 1.44x |
| tiny object | 24 | 17 | **16** | 1.06x |

Nothing measured came out larger — across shapes from 24 bytes to 52 KB, including text that cannot
be compressed at all, this is the smaller of the two every time.

Compression time, best of five:

| payload | `lz-string` | this |
| --- | --- | --- |
| list of 400 records | 10.55 ms | **1.14 ms** |
| prose | 4.18 ms | **0.59 ms** |
| incompressible | 1.42 ms | **0.50 ms** |
| source code | 1.42 ms | 1.57 ms |
| tiny object | **0.01 ms** | 0.23 ms |

## Read this before switching

**The output format is different, so old payloads will not decode.** This is not a drop-in
replacement for `lz-string`; anything you already stored has to be re-encoded, or read with
`lz-string` and written back with this. For URLs and other throwaway payloads that costs nothing. For
`localStorage` you need a migration, and the simplest one is to try `lz-string` first when this
package rejects the value.

**The API is asynchronous.** `CompressionStream` is a stream, so every function returns a promise
where `lz-string` returns a string. If you compress inside a synchronous function you will have to
change its shape.

**On very small inputs `lz-string` is faster.** Setting up a stream costs about 0.2 ms, which is
nothing next to a network request but is twenty times the cost of compressing a 24-byte object with
`lz-string`. If you are compressing thousands of tiny strings in a loop, measure before switching.

**It needs `CompressionStream`:** Node 18 or newer, Chrome 80, Firefox 113, Safari 16.4. Older
runtimes throw a `DeflateStringError` saying so rather than failing obscurely.

## Install

```bash
npm install deflate-string
```

## Usage

### For URLs, cookies and anywhere text is passed around

```js
const encoded = await compressToUrl(text);   // base64url, no padding
const text = await decompressFromUrl(encoded);
```

Output uses only `A–Z a–z 0–9 - _`, so it survives a URL, a query parameter, a hash, a cookie and
`JSON.stringify` without escaping — `encodeURIComponent` returns it unchanged.

### For localStorage, where you want the smallest string

```js
localStorage.setItem('draft', await compressToUtf16(text));
const text = await decompressFromUtf16(localStorage.getItem('draft'));
```

Fifteen bits per code unit instead of base64's six per character, which is about 20% smaller than the
URL form. The result contains no surrogates and no control characters, so storage hands it back
unchanged.

### When you are storing bytes anyway

```js
const bytes = await compressToBytes(text);   // Uint8Array
const text = await decompressFromBytes(bytes);
```

## What it guarantees

**Every JavaScript string comes back exactly as it went in.** That includes unpaired surrogates,
which are legal in JavaScript strings and are *not* valid Unicode. The obvious implementation —
`TextEncoder` straight into `CompressionStream` — silently replaces them with U+FFFD and loses the
original. This checks, and frames those strings as raw UTF-16 code units instead, recording the choice
in a header byte. The test suite generates 300 strings including deliberate lone surrogates and holds
every one to an exact round trip, at every length from 0 to 300.

**Corrupt input is refused, not misread.** A payload from a future format version, a truncated
payload, a bad padding header or text outside the alphabet all throw `DeflateStringError` rather than
returning partial or wrong text.

**The same input always produces the same output**, so payloads can be compared and cached.

## Alternatives

- [`lz-string`](https://www.npmjs.com/package/lz-string) — the incumbent, 47M downloads a week. Its
  API is synchronous, which this cannot match, and it runs anywhere regardless of runtime age. It was
  last published in 2022, and its compression is larger than the platform's on everything measured
  here.
- [`fflate`](https://www.npmjs.com/package/fflate) and [`pako`](https://www.npmjs.com/package/pako) —
  excellent, fast, synchronous, and they give you **bytes**. If you can store bytes, use one of them
  directly; this package exists for the cases where the destination only accepts a string.
- `CompressionStream` on its own — if you only ever handle well-formed text and are happy writing the
  base64 yourself, you do not need a dependency at all. The framing and the bit packing are what this
  adds.

## Licence

MIT

---

Part of a set of measured defects in widely used npm packages — the full list is at
[tomryan.dev/silent-defects](https://tomryan.dev/silent-defects/), and `npx silent-defects` checks
your own dependencies against it.
