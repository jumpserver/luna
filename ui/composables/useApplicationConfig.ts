import type { AppConfigType } from "~/types";

export const useApplicationConfig = () => {
  const { setAppConfig, appConfig } = useSettingManager();

  const getConfig = async () => {
    const config = await useTauriCoreInvoke("get_config");

    if (config) {
      setAppConfig(config as AppConfigType);
    }
  };

  onMounted(async () => {
    // 仅在主窗口拉取配置；其他窗口直接读取结果
    const cur = await useTauriWebviewWindowGetCurrentWebviewWindow();

    if (cur && cur.label !== "main") return;

    await getConfig();
  });

  const selectClient = async (category: keyof AppConfigType, protocol: string, name: string) => {
    const updated = await useTauriCoreInvoke("update_config_selection", {
      category,
      protocol,
      name
    });

    if (updated) {
      setAppConfig(updated as AppConfigType);
    }
  };

  return {
    appConfig,
    selectClient
  };
};
