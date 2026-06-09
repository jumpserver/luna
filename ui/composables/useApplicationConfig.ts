import type { AppConfigType } from "~/types";

export const useApplicationConfig = () => {
  const { t } = useI18n();
  const toast = useToast();
  const { setAppConfig, appConfig, hydrationPromise } = useSettingManager();

  const isValidAppConfig = (cfg: any): cfg is AppConfigType => {
    return (
      !!cfg
      && Array.isArray(cfg.terminal)
      && Array.isArray(cfg.remotedesktop)
      && Array.isArray(cfg.filetransfer)
      && Array.isArray(cfg.databases)
    );
  };

  const getConfig = async () => {
    const config = await useTauriCoreInvoke("get_config");

    if (config) {
      setAppConfig(config as AppConfigType);
    }
  };

  onMounted(async () => {
    // 仅在主窗口拉取配置；其他窗口直接读取结果
    const cur = await useTauriWebviewWindowGetCurrentWebviewWindow();

    if (cur && cur.label !== "main") {
      if (hydrationPromise.value) {
        try {
          await hydrationPromise.value;
        } catch {}
      }

      if (!isValidAppConfig(appConfig.value)) {
        await getConfig();
      }

      return;
    }

    await getConfig();
  });

  const selectClient = async (category: keyof AppConfigType, protocol: string, name: string) => {
    try {
      const updated = await useTauriCoreInvoke("update_config_selection", {
        category,
        protocol,
        name
      });

      if (updated) {
        setAppConfig(updated as AppConfigType);
      }
    } catch (error) {
      const message = String(error ?? "");
      const description = message.toLowerCase().includes("executable not found")
        ? t("Setting.ExecutableNotFound")
        : message || t("Common.OperationFailed");

      toast.add({
        title: t("Setting.EnableFailed"),
        description,
        color: "error",
        icon: "line-md:close-circle",
        progress: true,
        duration: 4000
      });
    }
  };

  return {
    appConfig,
    selectClient
  };
};
