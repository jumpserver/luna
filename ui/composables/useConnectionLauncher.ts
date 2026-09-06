import type { ConnectionFormInfo } from "~/composables/useAssetConnection";
import type { AssetItem } from "~/types";

interface ConnectionLaunchOptions {
  protocol?: string;
  paneId?: string;
  aclBatchId?: string;
  position?: number;
  total?: number;
  onPaneOpened?: (paneId: string) => void;
  assertCurrent?: () => void;
}

const isExternalPayload = (payload: Record<string, any>) =>
  ["native", "client", "local", "desktop"].includes(String(payload.connectMethod?.type || "").toLowerCase());

export function useConnectionLauncher() {
  const { confirmConnection } = useAssetConnection();
  const { openSession } = useWorkspaceTabs();
  const { open: openConnectionForm } = useConnectionFormModal();

  const launchWithInfo = (
    asset: AssetItem,
    info: ConnectionFormInfo,
    options: Pick<ConnectionLaunchOptions, "paneId" | "aclBatchId" | "onPaneOpened" | "assertCurrent"> = {}
  ) =>
    new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      void confirmConnection(asset, {
        ...info,
        tabId: options.paneId,
        aclBatchId: options.aclBatchId,
        onSessionReady: (payload) => {
          try {
            options.assertCurrent?.();
          } catch {
            finish(false);
            return;
          }
          if (!isExternalPayload(payload)) {
            const pane = openSession(asset, {
              protocol: info.protocol,
              account: info.account,
              payload,
              paneId: options.paneId,
              newTab: Boolean(options.assertCurrent && !options.paneId)
            });
            options.onPaneOpened?.(pane.id);
          }
          finish(true);
        },
        onSessionError: () => finish(false)
      }).catch(() => finish(false));
    });

  const configure = (asset: AssetItem, options: ConnectionLaunchOptions = {}) =>
    openConnectionForm(asset, {
      protocol: options.protocol,
      position: options.position,
      total: options.total
    });

  const configureAndLaunch = async (asset: AssetItem, options: ConnectionLaunchOptions = {}) => {
    const info = await configure(asset, options);
    if (!info) return false;
    return launchWithInfo(asset, info, options);
  };

  return {
    configure,
    configureAndLaunch,
    launchWithInfo
  };
}
