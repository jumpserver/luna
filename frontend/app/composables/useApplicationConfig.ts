import type { AppConfigType } from '~/types';
import { useUserSettingStore } from '~/store/modules/userSetting';

export const useApplicationConfig = () => {
  const userSettingStore = useUserSettingStore();

  const { setAppConfig } = userSettingStore;
  const { appConfig } = storeToRefs(userSettingStore);

  const getConfig = async () => {
    const config = await useTauriCoreInvoke('get_config');

    if (config) {
      setAppConfig(config as AppConfigType);
    }
  };

  onMounted(() => {
    getConfig();
  });

  const selectClient = async (
    category: keyof AppConfigType,
    protocol: string,
    name: string
  ) => {
    const updated = await useTauriCoreInvoke('update_config_selection', {
      category,
      protocol,
      name,
    });

    if (updated) {
      setAppConfig(updated as AppConfigType);
    }
  };

  return {
    appConfig,
    selectClient,
  };
};
