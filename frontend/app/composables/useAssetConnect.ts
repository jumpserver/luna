import type { UnlistenFn } from '@tauri-apps/api/event';

import { useUserInfoStore } from '~/store/modules/userInfo';

export const useAssetConnect = () => {
  const connectToken = ref<string | null>(null);
  const listenSuccessEvent = ref<UnlistenFn | null>(null);

  const userInfoStore = useUserInfoStore();
  const { currentSite, currentUser } = storeToRefs(userInfoStore);

  /**
   * @description 获取连接令牌
   */
  const getConnectToken = () => {
    useTauriCoreInvoke('get_connect_token', {
      site: currentSite.value,
      cookieHeader: currentUser.value!.headerJson,
      body: {
        asset: '',
        account: '',
        protocol: '',
        input_username: '',
        input_secret: '',
      },
    });
  };

  const listenTauriEvent = async () => {
    listenSuccessEvent.value = await useTauriEventListen(
      'get_connect_token_success',
      (event) => {
        const payload = event.payload as any;
        console.log(payload);
      }
    );
  };

  onMounted(() => {
    listenTauriEvent();
  });

  onBeforeUnmount(() => {
    listenSuccessEvent.value?.();
  });

  return {
    getConnectToken,
  };
};
