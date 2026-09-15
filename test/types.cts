import {compressToUrl, decompressFromUrl, DeflateStringError} from 'deflate-string';

async function main(): Promise<void> {
  const url: string = await compressToUrl('hello');
  const back: string = await decompressFromUrl(url);
  const error: DeflateStringError = new DeflateStringError('x');
  void [url, back, error];
}
void main();
