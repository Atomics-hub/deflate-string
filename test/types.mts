import {compressToUrl, decompressFromUrl, compressToUtf16, decompressFromUtf16, compressToBytes, decompressFromBytes, DeflateStringError} from 'deflate-string';

const url: string = await compressToUrl('hello');
const back: string = await decompressFromUrl(url);
const packed: string = await compressToUtf16('hello');
const unpacked: string = await decompressFromUtf16(packed);
const bytes: Uint8Array = await compressToBytes('hello');
const fromBytes: string = await decompressFromBytes(bytes);
const error: DeflateStringError = new DeflateStringError('x');
const name: 'DeflateStringError' = error.name;

void [url, back, packed, unpacked, bytes, fromBytes, name];
