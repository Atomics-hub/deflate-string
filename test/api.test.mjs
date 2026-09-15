import assert from 'node:assert/strict';
import test from 'node:test';
import * as api from '../src/index.js';
import {runChecks, SAMPLES} from './checks.mjs';

const {compressToUrl, decompressFromUrl, compressToUtf16, decompressFromUtf16,
  compressToBytes, decompressFromBytes, DeflateStringError} = api;

test('shared behavioural checks', async () => {
  assert.ok(await runChecks(api) >= 8);
});

test('the three encodings carry the same payload', async () => {
  const text = JSON.stringify({hello: 'world', list: [1, 2, 3]});
  const bytes = await compressToBytes(text);
  const url = await compressToUrl(text);
  const utf16 = await compressToUtf16(text);
  assert.equal(await decompressFromUrl(url), text);
  assert.equal(await decompressFromUtf16(utf16), text);
  assert.equal(await decompressFromBytes(bytes), text);
  assert.ok(utf16.length <= url.length, 'utf16 is never longer than base64url');
});

test('the header records the framing that was chosen', async () => {
  const wellFormed = await compressToBytes('plain ascii');
  const malformed = await compressToBytes('a' + String.fromCharCode(0xd800) + 'b');
  assert.equal(wellFormed[0] & 1, 0, 'well-formed text uses the utf8 framing');
  assert.equal(malformed[0] & 1, 1, 'malformed text uses the utf16 framing');
  assert.equal(wellFormed[0] >>> 1, 1, 'version 1');
});

test('an empty string is a valid payload in every encoding', async () => {
  assert.equal(await decompressFromUrl(await compressToUrl('')), '');
  assert.equal(await decompressFromUtf16(await compressToUtf16('')), '');
  assert.equal(await decompressFromBytes(await compressToBytes('')), '');
  assert.ok((await compressToUrl('')).length > 0, 'still produces something to store');
});

test('base64url output never needs escaping anywhere it is used', async () => {
  for (const [, text] of SAMPLES) {
    const encoded = await compressToUrl(text);
    assert.ok(!encoded.includes('+') && !encoded.includes('/') && !encoded.includes('='),
      'no characters that would need escaping in a url or a cookie');
    const url = new URL('https://example.com/#' + encoded);
    assert.equal(url.hash.slice(1), encoded, 'survives a round trip through URL');
  }
});

test('a payload from a future version is refused', async () => {
  const bytes = await compressToBytes('hello');
  bytes[0] = (9 << 1) | 0;
  await assert.rejects(() => decompressFromBytes(bytes), (error) => {
    assert.ok(error instanceof DeflateStringError);
    assert.match(error.message, /unsupported format version 9/);
    return true;
  });
});

test('utf16 payloads with a bad padding header are refused', async () => {
  const good = await compressToUtf16('some text');
  const badPadding = String.fromCharCode(32 + 15) + good.slice(1);
  await assert.rejects(() => decompressFromUtf16(badPadding), DeflateStringError);
  const outOfRange = String.fromCharCode(5) + good.slice(1);
  await assert.rejects(() => decompressFromUtf16(outOfRange), DeflateStringError);
});

test('decompressFromBytes accepts a view into a larger buffer', async () => {
  const text = 'a string stored inside a bigger buffer';
  const payload = await compressToBytes(text);
  const holder = new Uint8Array(payload.length + 8);
  holder.set(payload, 5);
  assert.equal(await decompressFromBytes(holder.subarray(5, 5 + payload.length)), text);
});

test('compression time grows with the input rather than exploding', async () => {
  const make = (n) => JSON.stringify(Array.from({length: n}, (_, i) => ({id: i, name: 'item ' + i})));
  const time = async (text) => {
    await compressToUrl(text);
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const started = process.hrtime.bigint();
      await compressToUrl(text);
      best = Math.min(best, Number(process.hrtime.bigint() - started) / 1e6);
    }
    return best;
  };
  const small = Math.max(await time(make(500)), 0.5);
  const large = await time(make(4000));
  assert.ok(large < small * 24 + 50, `eightfold input multiplied the time by ${(large / small).toFixed(1)}`);
});
