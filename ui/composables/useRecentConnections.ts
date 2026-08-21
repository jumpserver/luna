import type { AssetItem } from "~/types";
import { useUserInfoStore } from "~/store/modules/userInfo";

const STORAGE_KEY = "workspace-recent-connections";
const MAX_RECENT = 10;
const storedRecentConnections = ref<AssetItem[]>([]);
let hydrated = false;

function loadRecentConnections() {
  if (!import.meta.client) return;
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(value)) storedRecentConnections.value = value.slice(0, MAX_RECENT);
  } catch {}
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  loadRecentConnections();
}

export function useRecentConnections() {
  hydrate();
  const { orgId } = storeToRefs(useUserInfoStore());
  const recentConnections = computed(() =>
    storedRecentConnections.value.filter((item) => Boolean(orgId.value) && item.org_id === orgId.value)
  );

  const clearRecentConnections = () => {
    storedRecentConnections.value = storedRecentConnections.value.filter((item) => item.org_id !== orgId.value);
    if (import.meta.client) {
      if (storedRecentConnections.value.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(storedRecentConnections.value));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  };

  const recordRecentConnection = (asset: AssetItem) => {
    if (!orgId.value) return;

    const snapshot = { ...JSON.parse(JSON.stringify(asset)), org_id: orgId.value } as AssetItem;
    storedRecentConnections.value = [
      snapshot,
      ...storedRecentConnections.value.filter((item) => !(item.id === asset.id && item.org_id === orgId.value))
    ].slice(0, MAX_RECENT);
    if (import.meta.client) {
      const persisted = storedRecentConnections.value.map(({ savedConnection: _savedConnection, ...item }) => item);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    }
  };

  return { clearRecentConnections, recentConnections, recordRecentConnection, load: loadRecentConnections };
}
