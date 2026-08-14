import type { AssetItem } from "~/types";

const STORAGE_KEY = "workspace-recent-connections";
const MAX_RECENT = 10;
const recentConnections = ref<AssetItem[]>([]);
let hydrated = false;

function loadRecentConnections() {
  if (!import.meta.client) return;
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(value)) recentConnections.value = value.slice(0, MAX_RECENT);
  } catch {}
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  loadRecentConnections();
}

export function useRecentConnections() {
  hydrate();

  const clearRecentConnections = () => {
    recentConnections.value = [];
    if (import.meta.client) localStorage.removeItem(STORAGE_KEY);
  };

  const recordRecentConnection = (asset: AssetItem) => {
    const snapshot = JSON.parse(JSON.stringify(asset)) as AssetItem;
    recentConnections.value = [snapshot, ...recentConnections.value.filter((item) => item.id !== asset.id)].slice(
      0,
      MAX_RECENT
    );
    if (import.meta.client) {
      const persisted = recentConnections.value.map(({ savedConnection: _savedConnection, ...item }) => item);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    }
  };

  return { clearRecentConnections, recentConnections, recordRecentConnection, load: loadRecentConnections };
}
