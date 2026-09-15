export declare class DeflateStringError extends Error {
  readonly name: 'DeflateStringError';
}

/** Compress to a URL-safe string: the base64url alphabet, no padding, safe in a query, a hash, a cookie or JSON. */
export declare function compressToUrl(text: string): Promise<string>;
export declare function decompressFromUrl(text: string): Promise<string>;

/** Compress to a string packed at fifteen bits per code unit — the smallest form, for localStorage. */
export declare function compressToUtf16(text: string): Promise<string>;
export declare function decompressFromUtf16(text: string): Promise<string>;

/** Compress to the raw bytes, for when you are storing or sending binary anyway. */
export declare function compressToBytes(text: string): Promise<Uint8Array>;
export declare function decompressFromBytes(bytes: Uint8Array): Promise<string>;
