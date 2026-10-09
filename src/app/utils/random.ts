export function randomString(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const limit = 256 - (256 % characters.length);
  const bytes = new Uint8Array(64);
  let result = '';
  while (result.length < length) {
    globalThis.crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < limit) {
        result += characters[byte % characters.length];
        if (result.length === length) break;
      }
    }
  }
  return result;
}
