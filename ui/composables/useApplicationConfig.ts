import type { AppConfigType, PluginListItem } from "~/types";

export const useApplicationConfig = () => {
  const { t } = useI18n();
  const toast = useToast();
  const { addErrorToast } = useErrorToast();
  const { setAppConfig, appConfig, hydrationPromise } = useSettingManager();
  const pluginList = useState<PluginListItem[]>("plugin-list", () => []);

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

  const getPlugins = async () => {
    if (!isTauriRuntime()) return;

    const plugins = await useTauriCoreInvoke("list_plugins");
    if (Array.isArray(plugins)) {
      pluginList.value = plugins as PluginListItem[];
    }
  };

  const refreshAll = async () => {
    await Promise.all([getConfig(), getPlugins()]);
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

      if (!pluginList.value.length) {
        await getPlugins();
      }

      return;
    }

    await refreshAll();
  });

  const selectClient = async (
    category: keyof AppConfigType,
    protocol: string,
    name: string,
    enabled = true,
    pluginId?: string,
    path?: string
  ) => {
    try {
      const updated = await useTauriCoreInvoke("update_config_selection", {
        category,
        protocol,
        name,
        pluginId,
        path,
        enabled
      });

      if (updated) {
        setAppConfig(updated as AppConfigType);
      }
      await getPlugins();
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
      await refreshAll();
    }
  };

  const installPlugin = async (path: string) => {
    try {
      await useTauriCoreInvoke("install_plugin", { path });
      await refreshAll();
      toast.add({
        title: t("Setting.PluginInstallSuccess"),
        color: "primary",
        icon: "line-md:check-all",
        progress: false,
        duration: 1500
      });
    } catch (error) {
      addErrorToast({
        title: t("Setting.PluginInstallFailed"),
        description: String(error ?? "") || t("Common.OperationFailed"),
        icon: "line-md:close-circle",
        progress: true,
        duration: 4000
      });
      throw error;
    }
  };

  const uninstallPlugin = async (pluginId: string) => {
    try {
      await useTauriCoreInvoke("uninstall_plugin", { pluginId });
      await refreshAll();
      toast.add({
        title: t("Setting.PluginUninstallSuccess"),
        color: "primary",
        icon: "line-md:check-all",
        progress: false,
        duration: 1500
      });
    } catch (error) {
      addErrorToast({
        title: t("Setting.PluginUninstallFailed"),
        description: String(error ?? "") || t("Common.OperationFailed"),
        icon: "line-md:close-circle",
        progress: true,
        duration: 4000
      });
      throw error;
    }
  };

  const createCustomTerminal = async (name: string, path: string, template: string) => {
    try {
      await useTauriCoreInvoke("create_custom_terminal", { name, path, template });
      await refreshAll();
      toast.add({
        title: t("Setting.CustomTerminalCreateSuccess"),
        color: "primary",
        icon: "line-md:check-all",
        progress: false,
        duration: 1500
      });
    } catch (error) {
      addErrorToast({
        title: t("Setting.CustomTerminalCreateFailed"),
        description: String(error ?? "") || t("Common.OperationFailed"),
        icon: "line-md:close-circle",
        progress: true,
        duration: 4000
      });
      throw error;
    }
  };

  return {
    appConfig,
    pluginList,
    getConfig,
    getPlugins,
    refreshAll,
    selectClient,
    installPlugin,
    uninstallPlugin,
    createCustomTerminal
  };
};
