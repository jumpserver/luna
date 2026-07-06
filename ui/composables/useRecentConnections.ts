import type { AssetItem } from "~/types";

const STORAGE_KEY = "workspace-recent-connections";
const MAX_RECENT = 10;
const recentConnections = ref<AssetItem[]>([]);
let hydrated = false;

function hydrate() {
  if (hydrated || !import.meta.client) return;
  hydrated = true;
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(value)) recentConnections.value = value.slice(0, MAX_RECENT);
  } catch {}
}

export function useRecentConnections() {
  hydrate();

  const recordRecentConnection = (asset: AssetItem) => {
    const snapshot = JSON.parse(JSON.stringify(asset)) as AssetItem;
    recentConnections.value = [snapshot, ...recentConnections.value.filter((item) => item.id !== asset.id)].slice(0, MAX_RECENT);
    if (import.meta.client) {
      const persisted = recentConnections.value.map(({ savedConnection: _savedConnection, ...item }) => item);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    }
  };

  return { recentConnections, recordRecentConnection };
}
