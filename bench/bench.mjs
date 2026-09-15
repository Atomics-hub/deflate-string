// Compares this package with lz-string on the payloads people actually store: saved UI state, a list
// of records, a block of prose, and text that cannot be compressed at all. One pass, warmed, best of
// five, so the numbers are of the code rather than of the machine's mood.
//
//   npm run bench
import LZString from 'lz-string';
import {compressToUrl, compressToUtf16} from '../src/index.js';

let state = 7;
const rnd = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };

const PAYLOADS = {
  'saved filters': JSON.stringify({filters: Array.from({length: 40}, (_, i) => ({field: 'field_' + i, op: 'eq', value: 'value_' + i})), page: 1, sort: 'name'}),
  'record list': JSON.stringify(Array.from({length: 400}, (_, i) => ({id: i, name: 'user ' + i, email: `u${i}@example.com`, active: i % 3 === 0}))),
  'prose': 'The quick brown fox jumps over the lazy dog. '.repeat(400),
  'source code': ('export function handler(request, response) {\n  const id = request.params.id;\n  return response.json({id});\n}\n').repeat(60),
  'incompressible': Array.from({length: 4000}, () => String.fromCharCode(33 + Math.floor(rnd() * 90))).join(''),
  'tiny': JSON.stringify({page: 2, sort: 'name'}),
};

const best = async (fn, runs = 5) => {
  await fn();
  let ms = Infinity;
  for (let i = 0; i < runs; i++) {
    const started = process.hrtime.bigint();
    await fn();
    ms = Math.min(ms, Number(process.hrtime.bigint() - started) / 1e6);
  }
  return ms;
};

console.log('size, as characters stored\n');
console.log('payload'.padEnd(17) + 'raw'.padStart(8) + 'lz url'.padStart(9) + 'this url'.padStart(10) + 'lz utf16'.padStart(10) + 'this utf16'.padStart(12) + '   smaller by');
for (const [name, text] of Object.entries(PAYLOADS)) {
  const lzUrl = LZString.compressToEncodedURIComponent(text).length;
  const myUrl = (await compressToUrl(text)).length;
  const lz16 = LZString.compressToUTF16(text).length;
  const my16 = (await compressToUtf16(text)).length;
  console.log(name.padEnd(17) + String(text.length).padStart(8) + String(lzUrl).padStart(9) + String(myUrl).padStart(10)
    + String(lz16).padStart(10) + String(my16).padStart(12) + '   ' + (lz16 / my16).toFixed(2) + 'x');
}

console.log('\ntime to compress, milliseconds, best of five\n');
console.log('payload'.padEnd(17) + 'lz-string'.padStart(11) + 'this'.padStart(9));
for (const [name, text] of Object.entries(PAYLOADS)) {
  const theirs = await best(async () => LZString.compressToUTF16(text));
  const mine = await best(async () => compressToUtf16(text));
  console.log(name.padEnd(17) + theirs.toFixed(2).padStart(11) + mine.toFixed(2).padStart(9));
}
