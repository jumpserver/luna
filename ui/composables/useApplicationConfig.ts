import type { AppConfigType } from "~/types";

export const useApplicationConfig = () => {
  const { t } = useI18n();
  const { addErrorToast } = useErrorToast();
  const { setAppConfig, appConfig, hydrationPromise } = useSettingManager();

  const withErrorDetail = (base: string, raw: string) => {
    const detail = raw.trim();
    if (!detail || detail === base) return base;
    return `${base}\n${detail}`;
  };

  const isValidAppConfig = (cfg: any): cfg is AppConfigType => {
    return (
      !!cfg &&
      Array.isArray(cfg.terminal) &&
      Array.isArray(cfg.remotedesktop) &&
      Array.isArray(cfg.filetransfer) &&
      Array.isArray(cfg.databases)
    );
  };

  const getConfig = async () => {
    if (!isTauriRuntime()) return;

    const config = await useTauriCoreInvoke("get_config");

    if (config) {
      setAppConfig(config as AppConfigType);
    }
  };

  onMounted(async () => {
    if (!isTauriRuntime()) return;

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

  const selectClient = async (category: keyof AppConfigType, protocol: string, name: string, enabled = true) => {
    try {
      const updated = await useTauriCoreInvoke("update_config_selection", {
        category,
        protocol,
        name,
        enabled
      });

      if (updated) {
        setAppConfig(updated as AppConfigType);
      }
    } catch (error) {
      const message = String(error ?? "");
      const description = message.toLowerCase().includes("executable not found")
        ? withErrorDetail(t("Setting.ExecutableNotFound"), message)
        : message || t("Common.OperationFailed");

      addErrorToast({
        title: t("Setting.EnableFailed"),
        description,
        icon: "line-md:close-circle",
        progress: true,
        duration: 4000
      });

      // Refresh so path_exists reflects the current filesystem state.
      await getConfig();
    }
  };

  return {
    appConfig,
    selectClient
  };
};
