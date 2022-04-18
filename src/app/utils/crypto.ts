import * as CryptoJS from 'crypto-js';
import {getCsrfTokenFromCookie} from '@app/utils/common';
import {Buffer} from 'buffer';

export function fillKey(key: string): Buffer {
  let keySize = 128;
  // 如果超过 key 16 位, 最大取 32 位，需要更改填充
  if (key.length > 16) {
    key = key.slice(0, 32);
    keySize = keySize * 2;
  }
  key = key.slice(0, keySize);
  const filledKey = Buffer.alloc(keySize / 8);
  const keys = Buffer.from(key);
  if (keys.length < filledKey.length) {
    filledKey.map((b, i) => filledKey[i] = keys[i]);
    return filledKey;
  } else {
    return keys;
  }
}


export function aesEncrypt(text: string, originKey: string): string {
  const key = CryptoJS.enc.Utf8.parse(fillKey(originKey));
  return CryptoJS.AES.encrypt(text, key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.ZeroPadding
  }).toString();
}


export function aesDecrypt(cipherText: string, originKey: string): string {
  const key = CryptoJS.enc.Utf8.parse(fillKey(originKey));
  const bytes = CryptoJS.AES.decrypt(cipherText, key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.ZeroPadding
  });
  return CryptoJS.enc.Utf8.stringify(bytes);
}

export function aesEncryptByCsrf(text: string): string {
  const key = getCsrfTokenFromCookie();
  if (!key) { console.log('Not found csrf token'); }
  return aesEncrypt(text, key);
}

export function aesDecryptByCsrf(cipherText: string): string {
  const key = getCsrfTokenFromCookie();
  if (!key) { console.log('Not found csrf token'); }
  return aesDecrypt(cipherText, key);
}
