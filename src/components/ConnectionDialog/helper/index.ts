import CryptoJS from 'crypto-js';

import { storeToRefs } from 'pinia';
import { Account, Asset, AuthInfo, ConnectData, connectMethodItem, Protocol } from '../types/index';
import { useUserStore } from '@/stores/modules/user.ts';
import { useGlobalStore } from '@/stores/modules/global.ts';
import { createDiscreteApi } from 'naive-ui';

const { message } = createDiscreteApi(['message']);

/**
 * @description 解密字符串，返回解密后的内容
 */
const decrypt = (secret: string) => {
  const userStore = useUserStore();
  const { id, username } = storeToRefs(userStore);

  const secretKey = `${id}_${username}`;

  try {
    const bytes = CryptoJS.AES.decrypt(secret, secretKey);

    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    return '';
  }
};

/**
 * @description 加密字符窜
 * @param secret
 */
const encrypt = (secret: string): string => {
  const userStore = useUserStore();
  const { id, username } = storeToRefs(userStore);

  try {
    return CryptoJS.AES.encrypt(secret, `${id}_${username}`).toString();
  } catch (e) {
    return '';
  }
};

/**
 * @description 从本地存储获取账户的本地认证信息
 * @param id
 * @param shouldDecrypt
 */
export const getAccountLocalAuth = (id: string, shouldDecrypt = true) => {
  const localKey = `JMS_MA_${id}`;
  const auths = JSON.parse(localStorage.getItem(localKey) as string);

  if (!auths || !Array.isArray(auths)) {
    return [];
  }

  if (!shouldDecrypt) {
    return auths;
  }

  return auths.map((auth: AuthInfo) => {
    const newAuths: AuthInfo = { ...auth };

    if (shouldDecrypt && newAuths.secret) {
      newAuths.secret = decrypt(newAuths.secret);
    }

    return newAuths;
  });
};

/**
 * @description 设置账户认证信息
 * @param id 资产 id
 * @param account
 * @param auth
 */
export const setAccountLocalAuth = (id: string, account: Account, auth: AuthInfo) => {
  const newAuth = Object.assign({ alias: account.alias, username: account.username }, auth);

  if (!auth.secret || !auth.rememberAuth) {
    newAuth.secret = '';
  } else {
    newAuth.secret = encrypt(auth.secret);
  }

  let auths = getAccountLocalAuth(id, false);
  const localKey = `JMS_MA_${id}`;

  auths = auths.filter(item => item.username !== newAuth.username);
  auths.splice(0, 0, newAuth);

  localStorage.setItem(localKey, JSON.stringify(auths));
};

/**
 * @description 从本地存储获取连接数据
 * @param {string} id  资产 id
 */
export const getPreConnectData = (id: string): ConnectData | null => {
  const key = `JMS_PRE_${id}`;
  const connectData: ConnectData = JSON.parse(localStorage.getItem(key) as string);

  if (!connectData) {
    return null;
  }

  if (connectData.account?.has_secret) {
    return connectData;
  }

  if (connectData.account) {
    const auths: AuthInfo[] = getAccountLocalAuth(id)!;
    const matched = auths.find(item => item.alias === connectData.account?.alias);

    if (matched) {
      connectData.manualAuthInfo = matched;
    }
  }

  return connectData;
};

/**
 * @description 获取当前连接方式
 * @param protocol
 */
export const getProtocolConnectMethods = (protocol: string) => {
  const globalStore = useGlobalStore();

  return globalStore.connectMethods[protocol] || [];
};

/**
 * @description 验证预连接数据的有效性。检查连接数据、账号信息和连接方式是否有效
 * @param accounts
 * @param preData
 * @param asset
 */
export const checkPreConnectDataForAuto = (
  accounts: Account[],
  preData: ConnectData,
  asset?: Asset
): boolean => {
  if (asset) {
    console.log('asset', asset);
  }

  if (!preData || !preData.account || preData.asset) {
    message.error('No account or node');
    return false;
  }

  if (!preData.autoLogin) {
    message.error('Not auto login');
    return false;
  }

  // 验证账号是否有效
  const preAccount: Account = preData.account;

  const account = accounts.find(item => {
    return item.alias === preAccount.alias;
  });

  if (!account) {
    message.error('Account may be not valid');
    return false;
  }

  // 验证登录信息
  const preAuth: AuthInfo = preData.manualAuthInfo;

  if (!account.has_secret && (!preAuth || !preAuth.secret)) {
    message.error('Account no manual auth');
    return false;
  }

  // 验证连接方式
  const connectMethods: connectMethodItem[] = getProtocolConnectMethods(
    preData.protocol?.name as string
  );

  if (!connectMethods) {
    message.error('No matched connect types');
    return false;
  }

  const connectMethod = connectMethods.find((item: connectMethodItem) => {
    return item.value === preData.connectMethod?.value;
  }) as connectMethodItem;

  if (!connectMethod) {
    message.error(`No matched connect type, may be changed: ${preData.connectMethod?.value}`);
    return false;
  }

  preData.connectMethod = connectMethod;

  return true;
};

/**
 * @description 设置连接数据
 */
export const setPreConnectData = (id: string, connectData: ConnectData) => {
  const {
    account,
    protocol,
    connectMethod,
    manualAuthInfo,
    connectOption
  }: {
    account: Account;
    protocol: Protocol;
    connectMethod: connectMethodItem;
    manualAuthInfo: AuthInfo;
    connectOption: any;
  } = connectData;

  const key = `JMS_PRE_${id}`;

  const saveData = {
    account: { alias: account.alias, username: account.username, has_secret: account.has_secret },
    connectMethod: { value: connectMethod.value },
    protocol: { name: protocol.name },
    downloadRDP: connectData.downloadRDP,
    autoLogin: connectData.autoLogin,
    connectOption
  };

  setAccountLocalAuth(id, account, manualAuthInfo);
  localStorage.setItem(key, JSON.stringify(saveData));
  return saveData;
};
