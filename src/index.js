export class DeflateStringError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DeflateStringError';
  }
}

const VERSION = 1;
const FRAMING_UTF8 = 0;
const FRAMING_UTF16 = 1;

// One header byte carries the format version and which framing was used, so a payload produced by a
// later version is refused rather than decoded into nonsense.
const header = (framing) => (VERSION << 1) | framing;

function requireStreams() {
  if (typeof CompressionStream === 'undefined' || typeof DecompressionStream === 'undefined') {
    throw new DeflateStringError(
      'CompressionStream is not available in this runtime; it needs Node 18 or newer, or a browser from 2023 onwards',
    );
  }
}

// Every JavaScript string is a sequence of UTF-16 code units, and an unpaired surrogate is a perfectly
// legal one. TextEncoder replaces those with U+FFFD, which loses the original — so a string that is
// not well formed is framed as raw code units instead, at the cost of one byte per ASCII character.
// Well-formed strings, which is nearly all of them, take the smaller UTF-8 path.
function isWellFormed(text) {
  if (typeof text.isWellFormed === 'function') return text.isWellFormed();
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function encodeUtf16(text) {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out[i * 2] = code & 0xff;
    out[i * 2 + 1] = code >>> 8;
  }
  return out;
}

function decodeUtf16(bytes) {
  let out = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) out += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
  return out;
}

// A failing transform rejects on both ends of the stream. The writer's rejection is deliberately
// swallowed: left alone it escapes as an unhandled rejection carrying zlib's Z_BUF_ERROR, which
// crashes the caller instead of producing the error this module promises.
async function run(stream, bytes, message) {
  const writer = stream.writable.getWriter();
  writer.write(bytes).catch(() => {});
  writer.close().catch(() => {});
  try {
    return new Uint8Array(await new Response(stream.readable).arrayBuffer());
  } catch {
    throw new DeflateStringError(message);
  }
}

const deflate = (bytes) => run(new CompressionStream('deflate-raw'), bytes, 'the text could not be compressed');
const inflate = (bytes) => run(new DecompressionStream('deflate-raw'), bytes, 'the input is not a valid compressed payload');

function checkString(text, what) {
  if (typeof text !== 'string') throw new DeflateStringError(`${what} must be a string`);
}

export async function compressToBytes(text) {
  checkString(text, 'text');
  requireStreams();
  const framing = isWellFormed(text) ? FRAMING_UTF8 : FRAMING_UTF16;
  const body = framing === FRAMING_UTF8 ? new TextEncoder().encode(text) : encodeUtf16(text);
  const payload = await deflate(body);
  const out = new Uint8Array(payload.length + 1);
  out[0] = header(framing);
  out.set(payload, 1);
  return out;
}

export async function decompressFromBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new DeflateStringError('bytes must be a Uint8Array');
  requireStreams();
  if (bytes.length < 1) throw new DeflateStringError('the input is empty');
  const first = bytes[0];
  const version = first >>> 1;
  if (version !== VERSION) throw new DeflateStringError(`unsupported format version ${version}`);
  const framing = first & 1;
  const body = await inflate(bytes.subarray(1));
  return framing === FRAMING_UTF8 ? new TextDecoder().decode(body) : decodeUtf16(body);
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const BASE64URL_INDEX = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < BASE64URL.length; i++) table[BASE64URL.charCodeAt(i)] = i;
  return table;
})();

// Written out rather than routed through btoa or Buffer so that the same code runs in Node, browsers
// and workers, and so the padless URL-safe alphabet is the only thing produced.
function toBase64Url(bytes) {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += BASE64URL[(n >>> 18) & 63] + BASE64URL[(n >>> 12) & 63] + BASE64URL[(n >>> 6) & 63] + BASE64URL[n & 63];
  }
  const left = bytes.length - i;
  if (left === 1) {
    const n = bytes[i] << 16;
    out += BASE64URL[(n >>> 18) & 63] + BASE64URL[(n >>> 12) & 63];
  } else if (left === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += BASE64URL[(n >>> 18) & 63] + BASE64URL[(n >>> 12) & 63] + BASE64URL[(n >>> 6) & 63];
  }
  return out;
}

function fromBase64Url(text) {
  const clean = text;
  const full = Math.floor(clean.length / 4);
  const left = clean.length - full * 4;
  if (left === 1) throw new DeflateStringError('the input is not valid base64url');
  const size = full * 3 + (left === 2 ? 1 : left === 3 ? 2 : 0);
  const out = new Uint8Array(size);
  let p = 0;
  const value = (index) => {
    const code = clean.charCodeAt(index);
    const v = code < 128 ? BASE64URL_INDEX[code] : -1;
    if (v < 0) throw new DeflateStringError('the input is not valid base64url');
    return v;
  };
  let i = 0;
  for (; i + 3 < clean.length; i += 4) {
    const n = (value(i) << 18) | (value(i + 1) << 12) | (value(i + 2) << 6) | value(i + 3);
    out[p++] = (n >>> 16) & 255;
    out[p++] = (n >>> 8) & 255;
    out[p++] = n & 255;
  }
  if (left === 2) {
    out[p++] = ((value(i) << 18) | (value(i + 1) << 12)) >>> 16 & 255;
  } else if (left === 3) {
    const n = (value(i) << 18) | (value(i + 1) << 12) | (value(i + 2) << 6);
    out[p++] = (n >>> 16) & 255;
    out[p++] = (n >>> 8) & 255;
  }
  return out;
}

export async function compressToUrl(text) {
  return toBase64Url(await compressToBytes(text));
}

export async function decompressFromUrl(text) {
  checkString(text, 'text');
  return decompressFromBytes(fromBase64Url(text));
}

// Fifteen bits per code unit, offset past the control characters. The largest value produced is
// 0x7fff + 32, well below the surrogate block, so the result is always a well-formed string that
// localStorage will hand back unchanged. Base64 would waste a third of every character instead.
const UTF16_OFFSET = 32;

function toUtf16(bytes) {
  const totalBits = bytes.length * 8;
  const padding = (15 - (totalBits % 15)) % 15;
  let out = String.fromCharCode(UTF16_OFFSET + padding);
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < bytes.length; i++) {
    acc = (acc << 8) | bytes[i];
    bits += 8;
    while (bits >= 15) {
      out += String.fromCharCode(UTF16_OFFSET + ((acc >>> (bits - 15)) & 0x7fff));
      bits -= 15;
      acc &= (1 << bits) - 1;
    }
  }
  if (bits > 0) out += String.fromCharCode(UTF16_OFFSET + ((acc << (15 - bits)) & 0x7fff));
  return out;
}

function fromUtf16(text) {
  if (text.length === 0) throw new DeflateStringError('the input is empty');
  const padding = text.charCodeAt(0) - UTF16_OFFSET;
  if (padding < 0 || padding > 14) throw new DeflateStringError('the input is not a utf16 payload');
  const totalBits = (text.length - 1) * 15 - padding;
  if (totalBits < 0 || totalBits % 8 !== 0) throw new DeflateStringError('the input is not a utf16 payload');
  const out = new Uint8Array(totalBits / 8);
  let acc = 0;
  let bits = 0;
  let p = 0;
  for (let i = 1; i < text.length; i++) {
    const value = text.charCodeAt(i) - UTF16_OFFSET;
    if (value < 0 || value > 0x7fff) throw new DeflateStringError('the input is not a utf16 payload');
    acc = acc * 32768 + value;
    bits += 15;
    while (bits >= 8 && p < out.length) {
      bits -= 8;
      const divisor = Math.pow(2, bits);
      out[p++] = Math.floor(acc / divisor) & 255;
      acc = acc % divisor;
    }
  }
  return out;
}

export async function compressToUtf16(text) {
  return toUtf16(await compressToBytes(text));
}

export async function decompressFromUtf16(text) {
  checkString(text, 'text');
  return decompressFromBytes(fromUtf16(text));
}
