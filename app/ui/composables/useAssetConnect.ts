import type { UnlistenFn } from '@tauri-apps/api/event';
import type { ConnectionBody, PermedAccount, TokenResponse } from '~/types';

import { useUserInfoStore } from '~/store/modules/userInfo';

export const useAssetConnect = () => {
  const connectToken = ref<string | null>(null);
  const listenSuccessEvent = ref<UnlistenFn | null>(null);

  const userInfoStore = useUserInfoStore();
  const {
    currentSite,
    currentUser,
    currentConnectionInfoMap,
    currentRdpClientOption,
  } = storeToRefs(userInfoStore);

  const getUserId = (
    accounts: PermedAccount[],
    assetId: string,
    user: string
  ) => {
    const _accounts = accounts || [];
    const saved = currentConnectionInfoMap.value[assetId];
    const username = saved?.username ?? user;

    // 同名账号 account 使用 @USER
    // 手动输入 account 使用 @INPUT
    const isManual =
      saved?.accountMode === 'manual' ||
      username === '手动输入' ||
      username === 'Manual input';

    const isDynamic =
      saved?.accountMode === 'dynamic' ||
      username.includes('同名账号') ||
      username.includes('Dynamic user');

    if (isManual) return '@INPUT';
    if (isDynamic) return '@USER';

    if (username) {
      const matched = _accounts.find(
        (a) =>
          a.username === username || a.alias === username || a.name === username
      );
      if (matched) return matched.id;
    }

    return _accounts[0]?.id || '';
  };

  const listenTauriEvent = async () => {
    listenSuccessEvent.value = await useTauriEventListen(
      'get-token-success',
      (event) => {
        interface eventPayload {
          status: number;
          data: TokenResponse;
        }

        const payload = event.payload as eventPayload;

        if (payload.status === 201) {
          connectToken.value = payload.data.id;
        }
        // connectToken.value = payload.data;
      }
    );
  };

  /**
   * @description 获取连接令牌
   */
  const getConnectToken = (body: ConnectionBody) => {
    useTauriCoreInvoke('get_connect_token', {
      site: currentSite.value,
      cookieHeader: currentUser.value!.headerJson,
      body: {
        asset: body.asset,
        account: body.account,
        protocol: body.protocol,
        input_username: body.input_username,
        input_secret: body.input_secret,
        connect_method: body.connect_method,
        connect_options: body.connect_options,
      },
    });
  };

  /**
   * @description 根据协议分发连接方法
   * @param protocol
   * @returns
   */
  const dispatchConnectMethod = (protocol: string) => {
    let method = '';

    switch (protocol) {
      case 'ssh':
      case 'telnet':
        method = 'ssh_client';
        break;
      case 'rdp':
        method = 'mstsc';
        break;
      case 'sftp':
        method = 'sftp_client';
        break;
      case 'vnc':
        method = 'vnc_client';
        break;
      default:
        method = 'db_client';
    }

    return method;
  };

  const checkPlateformAdapter = (protocol: string) => {
    // check 逻辑

    // check 成功直接 invoke
    useTauriCoreInvoke('pull_up');
  };

  /**
   * @description 生成连接选项
   * @returns
   */
  const generateConnectOptions = () => {
    return {
      charset: 'default',
      is_backspace_as_ctrl_h: false,
      rdp_resolution: 'auto',
      keyboard_layout:
        currentRdpClientOption.value.keyboard_layout || 'en-us-qwerty',
      rdp_client_option: currentRdpClientOption.value.rdp_client_option || [],
      rdp_color_quality: currentRdpClientOption.value.rdp_color_quality || '32',
      rdp_smart_size: currentRdpClientOption.value.rdp_smart_size || '0',
    };
  };

  onMounted(() => {
    listenTauriEvent();
  });

  onBeforeUnmount(() => {
    listenSuccessEvent.value?.();
  });

  return {
    getUserId,
    getConnectToken,
    dispatchConnectMethod,
    checkPlateformAdapter,
    generateConnectOptions,
  };
};
