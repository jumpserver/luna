import { useUserStore } from '@renderer/store/module/userStore';
import { useSettingStore } from '@renderer/store/module/settingStore';
import { cleanRDPParams, getConnectOption } from '@renderer/utils/common';

import request from '../index';

export const getFavoriteAssets = (params: object) => {
  return request.get('/api/v1/perms/users/self/nodes/favorite/assets/', params);
};

export const getAssets = (params: object) => {
  return request.get('/api/v1/perms/users/self/assets/', params);
};

export const getAssetDetail = (id: string) => {
  const url = `/api/v1/perms/users/self/assets/${id}/`;
  return request.get(url);
};

const userStore = useUserStore();
const settingStore = useSettingStore();

export const createConnectToken = (connectData: any, method: string, createTicket = false) => {
  const params = createTicket ? '?create_ticket=1' : '';
  const url = `/api/v1/authentication/connection-token/${params}`;
  // const _secret = encryptPassword(connectData.input_secret);
  const data = {
    asset: connectData.asset,
    account: connectData.account,
    protocol: connectData.protocol,
    input_username: connectData.input_username,
    input_secret: connectData.input_secret,
    connect_method: method,
    connect_options: getConnectOption(settingStore),
  };
  return request.post(url, data);
};

export const getLocalClientUrl = (token) => {
  const url = new URL(
    `/api/v1/authentication/connection-token/${token.id}/client-url/`,
    userStore.currentSite ?? 'https://jumpserver.local',
  );
  const params = cleanRDPParams(settingStore);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.append(k, v);
    }
  }
  return request.get(url.href);
};
