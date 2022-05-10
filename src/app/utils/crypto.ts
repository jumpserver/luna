import * as CryptoJS from 'crypto-js';
import {JSEncrypt} from 'jsencrypt';
import {getCsrfTokenFromCookie} from '@app/utils/common';
import {getCookie} from '@app/utils/common';
import {Buffer} from 'buffer';


export function fillKey(key: string): Buffer {
  let keySize = 128;
  // 如果超过 key 16 位, 最大取 32 位，需要更改填充
  if (key.length > 16) {
    key = key.slice(0, 32);
    keySize = keySize * 2;
  }
  const filledKeyLength = keySize / 8;
  if (key.length >= filledKeyLength) {
    return key.slice(0, filledKeyLength);
  }
  const filledKey = Buffer.alloc(keySize / 8);
  const keys = Buffer.from(key);
  for (let i = 0; i < keys.length; i++) {
    filledKey[i] = keys[i];
  }
  return filledKey;
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

export function rsaEncrypt(text, pubKey) {
  const jsEncrypt = new JSEncrypt();
  jsEncrypt.setPublicKey(pubKey);
  return jsEncrypt.encrypt(text);
}

export function encryptPassword(password) {
  if (!password) {
    return '';
  }
  const aesKey = (Math.random() + 1).toString(36).substring(2);
  // public key 是 base64 存储的
  const rsaPublicKeyText = getCookie('jms_public_key')
    .replace('"', '')
    .replace('"', '');
  const rsaPublicKey = atob(rsaPublicKeyText);
  const keyCipher = rsaEncrypt(aesKey, rsaPublicKey);
  const passwordCipher = aesEncrypt(password, aesKey);
  return `${keyCipher}:${passwordCipher}`;
}
