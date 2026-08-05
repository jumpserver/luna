import type { ConnectionFormInfo } from "~/composables/useAssetConnection";
import type { AssetItem } from "~/types";

interface ConnectionFormModalOptions {
  protocol?: string;
  position?: number;
  total?: number;
}

interface ConnectionFormModalRequest {
  id: string;
  asset: AssetItem;
  options: ConnectionFormModalOptions;
  resolve: (info: ConnectionFormInfo | null) => void;
}

const requests = ref<ConnectionFormModalRequest[]>([]);

export function useConnectionFormModal() {
  const activeRequest = computed(() => requests.value[0] || null);

  const open = (asset: AssetItem, options: ConnectionFormModalOptions = {}) =>
    new Promise<ConnectionFormInfo | null>((resolve) => {
      requests.value.push({
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        asset,
        options,
        resolve
      });
    });

  const settle = (info: ConnectionFormInfo | null) => {
    const request = requests.value.shift();
    request?.resolve(info);
  };

  return {
    activeRequest,
    open,
    settle
  };
}
