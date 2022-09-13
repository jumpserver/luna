import * as CryptoJS from 'crypto-js';
import {getCsrfTokenFromCookie, getCookie} from '@app/utils/common';
import {Buffer} from 'buffer';
import {JSEncrypt} from 'jsencrypt';


export function fillKey(key: string): Buffer|string {
  const KeyLength = 16;
  if (key.length > KeyLength) {
    key = key.slice(0, KeyLength);
  }
  const filledKey = Buffer.alloc(KeyLength);
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
  let rsaPublicKeyText = getCookie('jms_public_key');
  if (!rsaPublicKeyText) {
    return password;
  }
  rsaPublicKeyText = rsaPublicKeyText
    .replace('"', '')
    .replace('"', '');
  const rsaPublicKey = atob(rsaPublicKeyText);
  const keyCipher = rsaEncrypt(aesKey, rsaPublicKey);
  const passwordCipher = aesEncrypt(password, aesKey);
  return `${keyCipher}:${passwordCipher}`;
}
