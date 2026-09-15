// The correctness gate.
//
// The contract is that any JavaScript string comes back exactly as it went in. A JavaScript string is
// a sequence of UTF-16 code units, and an unpaired surrogate is a legal one, so the generator here
// produces them deliberately — that is the case where the obvious implementation, TextEncoder into
// deflate, silently substitutes U+FFFD and loses the original.
import assert from 'node:assert/strict';
import test from 'node:test';
import {compressToUrl, decompressFromUrl, compressToUtf16, decompressFromUtf16, compressToBytes, decompressFromBytes} from '../src/index.js';
import LZString from 'lz-string';

let state = 20260924;
const rnd = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
const pick = (list) => list[Math.floor(rnd() * list.length)];

const ALPHABETS = [
  () => String.fromCharCode(32 + Math.floor(rnd() * 95)),
  () => String.fromCharCode(0x4e00 + Math.floor(rnd() * 200)),
  () => String.fromCharCode(0xc0 + Math.floor(rnd() * 100)),
  () => String.fromCodePoint(0x1f300 + Math.floor(rnd() * 200)),
  () => String.fromCharCode(Math.floor(rnd() * 32)),
  () => String.fromCharCode(0xd800 + Math.floor(rnd() * 0x400)),
  () => String.fromCharCode(0xdc00 + Math.floor(rnd() * 0x400)),
];

function randomString(maxLength) {
  const length = Math.floor(rnd() * maxLength);
  const alphabet = pick(ALPHABETS);
  let out = '';
  for (let i = 0; i < length; i++) out += rnd() < 0.15 ? pick(ALPHABETS)() : alphabet();
  return out;
}

test('300 generated strings survive every encoding exactly', async () => {
  for (let n = 0; n < 300; n++) {
    const text = randomString(400);
    const viaUrl = await decompressFromUrl(await compressToUrl(text));
    const viaUtf16 = await decompressFromUtf16(await compressToUtf16(text));
    const viaBytes = await decompressFromBytes(await compressToBytes(text));
    assert.equal(viaUrl, text, `url encoding changed string ${n}`);
    assert.equal(viaUtf16, text, `utf16 encoding changed string ${n}`);
    assert.equal(viaBytes, text, `byte encoding changed string ${n}`);
  }
});

test('strings that are not well formed survive, which the obvious implementation does not', async () => {
  const broken = [];
  for (let n = 0; n < 60; n++) {
    let text = '';
    for (let i = 0; i < 20; i++) text += rnd() < 0.3 ? String.fromCharCode(0xd800 + Math.floor(rnd() * 0x800)) : 'abc';
    if (typeof text.isWellFormed === 'function' && text.isWellFormed()) continue;
    broken.push(text);
  }
  assert.ok(broken.length > 10, `the generator produced only ${broken.length} malformed strings`);
  for (const text of broken) {
    assert.equal(await decompressFromUtf16(await compressToUtf16(text)), text);
    assert.equal(await decompressFromUrl(await compressToUrl(text)), text);
    // The same input through TextEncoder loses the lone surrogate, which is why the framing exists.
    assert.notEqual(new TextDecoder().decode(new TextEncoder().encode(text)), text);
  }
});

test('every length from 0 to 300 round trips, so no boundary is skipped', async () => {
  const body = 'abcdefghij';
  for (let length = 0; length <= 300; length++) {
    const text = body.repeat(Math.ceil(length / body.length)).slice(0, length);
    assert.equal(await decompressFromUtf16(await compressToUtf16(text)), text, `utf16 failed at length ${length}`);
    assert.equal(await decompressFromUrl(await compressToUrl(text)), text, `url failed at length ${length}`);
  }
});

test('output is smaller than lz-string across sizes and shapes', async () => {
  const shapes = {
    'repetitive state': (n) => JSON.stringify({filters: Array.from({length: n}, (_, i) => ({field: 'field_' + i, op: 'eq', value: 'value_' + i}))}),
    'varied json': (n) => JSON.stringify(Array.from({length: n}, (_, i) => ({id: i, k: Math.floor(rnd() * 1e9).toString(36), v: rnd()}))),
    'prose': (n) => 'The quick brown fox jumps over the lazy dog. '.repeat(n),
  };
  const losses = [];
  for (const [name, make] of Object.entries(shapes)) {
    for (const n of [3, 10, 50, 200]) {
      const text = make(n);
      const mine = await compressToUtf16(text);
      const theirs = LZString.compressToUTF16(text);
      if (mine.length > theirs.length) losses.push(`${name} at n=${n}: ${mine.length} vs ${theirs.length}`);
    }
  }
  assert.deepEqual(losses, [], 'lz-string produced a smaller payload in these cases');
});

test('large input is handled without blowing up', async () => {
  const text = JSON.stringify({rows: Array.from({length: 20000}, (_, i) => ({id: i, name: 'row ' + i, note: 'some text'}))});
  const started = Date.now();
  const encoded = await compressToUrl(text);
  const back = await decompressFromUrl(encoded);
  assert.equal(back, text);
  assert.ok(encoded.length < text.length / 5, `expected real compression, got ${encoded.length} from ${text.length}`);
  assert.ok(Date.now() - started < 10000, 'took too long');
});
