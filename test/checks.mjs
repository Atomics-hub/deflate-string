// Behavioural checks shared by the unit tests and by the test that installs the packed artifact into
// a fresh consumer, so the published build is held to the same behaviour as the source.
import assert from 'node:assert/strict';

const LONE_HIGH = 'a' + String.fromCharCode(0xd800) + 'b';
const LONE_LOW = 'a' + String.fromCharCode(0xdc00) + 'b';
const CONTROLS = 'a' + String.fromCharCode(0) + 'b' + String.fromCharCode(31) + 'c';

export const SAMPLES = [
  ['empty', ''],
  ['one character', 'x'],
  ['ascii', 'hello world'],
  ['json', JSON.stringify({page: 2, filters: ['a', 'b'], q: 'search terms'})],
  ['repetitive', 'the quick brown fox. '.repeat(50)],
  ['emoji', 'party \u{1F389} time \u{1F680} done'],
  ['cjk', '日本語のテキストです'],
  ['accents', 'café naïve über'],
  ['lone high surrogate', LONE_HIGH],
  ['lone low surrogate', LONE_LOW],
  ['null and control characters', CONTROLS],
  ['newlines and tabs', 'a\nb\tc\r\nd'],
  ['long', 'x'.repeat(20000)],
];

export async function runChecks(api) {
  const {compressToUrl, decompressFromUrl, compressToUtf16, decompressFromUtf16,
    compressToBytes, decompressFromBytes, DeflateStringError} = api;
  let checked = 0;
  const check = async (name, fn) => { await fn(); checked++; };

  await check('every sample round trips through all three encodings', async () => {
    for (const [label, text] of SAMPLES) {
      assert.equal(await decompressFromUrl(await compressToUrl(text)), text, `url encoding lost ${label}`);
      assert.equal(await decompressFromUtf16(await compressToUtf16(text)), text, `utf16 encoding lost ${label}`);
      assert.equal(await decompressFromBytes(await compressToBytes(text)), text, `bytes lost ${label}`);
    }
  });

  await check('a url payload is safe in a url without escaping', async () => {
    for (const [, text] of SAMPLES) {
      const encoded = await compressToUrl(text);
      assert.match(encoded, /^[A-Za-z0-9_-]*$/, 'only the base64url alphabet');
      assert.equal(encodeURIComponent(encoded), encoded, 'survives encodeURIComponent unchanged');
    }
  });

  await check('a utf16 payload is a well-formed string', async () => {
    for (const [label, text] of SAMPLES) {
      const encoded = await compressToUtf16(text);
      for (let i = 0; i < encoded.length; i++) {
        const code = encoded.charCodeAt(i);
        assert.ok(code >= 32 && code <= 0x7fff + 32, `${label} produced code unit ${code}`);
        assert.ok(code < 0xd800 || code > 0xdfff, `${label} produced a surrogate`);
      }
      if (typeof encoded.isWellFormed === 'function') assert.ok(encoded.isWellFormed(), `${label} is well formed`);
    }
  });

  await check('compression actually makes repetitive text smaller', async () => {
    const text = 'the quick brown fox jumps over the lazy dog. '.repeat(100);
    const url = await compressToUrl(text);
    const utf16 = await compressToUtf16(text);
    assert.ok(url.length < text.length / 10, `url form was ${url.length} for ${text.length} characters`);
    assert.ok(utf16.length < url.length, 'the utf16 packing is denser than base64url');
  });

  await check('non-strings are rejected', async () => {
    for (const bad of [null, undefined, 42, {}, []]) {
      await assert.rejects(() => compressToUrl(bad), DeflateStringError);
      await assert.rejects(() => decompressFromUrl(bad), DeflateStringError);
      await assert.rejects(() => decompressFromUtf16(bad), DeflateStringError);
    }
    await assert.rejects(() => decompressFromBytes('not bytes'), DeflateStringError);
  });

  await check('corrupt input is refused rather than misread', async () => {
    await assert.rejects(() => decompressFromUrl('!!!not base64!!!'), DeflateStringError);
    await assert.rejects(() => decompressFromUrl('AAAAAAAAAAAA'), DeflateStringError);
    await assert.rejects(() => decompressFromBytes(new Uint8Array(0)), DeflateStringError);
    await assert.rejects(() => decompressFromUtf16(''), DeflateStringError);
    const bytes = await compressToBytes('hello');
    bytes[0] = 0xfe;
    await assert.rejects(() => decompressFromBytes(bytes), DeflateStringError);
  });

  await check('a truncated payload does not silently return partial text', async () => {
    const encoded = await compressToUrl('some text that will be cut in half after compressing');
    await assert.rejects(() => decompressFromUrl(encoded.slice(0, Math.max(4, encoded.length - 6))), DeflateStringError);
  });

  await check('the same input always produces the same output', async () => {
    const text = JSON.stringify({a: 1, b: [1, 2, 3], c: 'repeatable'});
    assert.equal(await compressToUrl(text), await compressToUrl(text));
    assert.equal(await compressToUtf16(text), await compressToUtf16(text));
  });

  return checked;
}
