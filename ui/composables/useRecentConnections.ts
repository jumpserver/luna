import type { AssetItem } from "~/types";
import { useUserInfoStore } from "~/store/modules/userInfo";

const STORAGE_KEY = "workspace-recent-connections";
const MAX_RECENT = 10;
const storedRecentConnections = ref<AssetItem[]>([]);
let activeStorageKey = "";

export function normalizeRecentConnections(value: unknown): AssetItem[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value
    .filter((item): item is AssetItem => {
      if (!item || typeof item !== "object" || typeof item.id !== "string" || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, MAX_RECENT);
}

const getScopedStorageKey = (site: string, userId: string) =>
  site && userId ? `${STORAGE_KEY}:${encodeURIComponent(site)}:${encodeURIComponent(userId)}` : "";

function loadRecentConnections(storageKey: string, organizationIds: string[]) {
  activeStorageKey = storageKey;
  if (!import.meta.client || !storageKey) {
    storedRecentConnections.value = [];
    return;
  }

  try {
    const scopedValue = localStorage.getItem(storageKey);
    if (scopedValue !== null) {
      storedRecentConnections.value = normalizeRecentConnections(JSON.parse(scopedValue));
      return;
    }

    const organizationIdSet = new Set(organizationIds);
    const legacyValue = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const migrated = Array.isArray(legacyValue)
      ? legacyValue.filter(
          (item) => item && typeof item === "object" && organizationIdSet.has(String(item.org_id || ""))
        )
      : [];
    storedRecentConnections.value = normalizeRecentConnections(migrated);
    localStorage.setItem(storageKey, JSON.stringify(storedRecentConnections.value));
  } catch {
    storedRecentConnections.value = [];
  }
}

export function useRecentConnections() {
  const { currentAccountId, currentSite, currentUser, loggedIn, orgId } = storeToRefs(useUserInfoStore());
  const storageKey = computed(() =>
    loggedIn.value ? getScopedStorageKey(currentSite.value, currentUser.value?.userId || currentAccountId.value) : ""
  );
  const organizationIds = computed(() => (currentUser.value?.availableOrgs || []).map((org) => org.id));
  const load = () => loadRecentConnections(storageKey.value, organizationIds.value);
  const recentConnections = computed(() =>
    activeStorageKey === storageKey.value ? storedRecentConnections.value : []
  );

  watch([storageKey, organizationIds], load, { immediate: true });

  const clearRecentConnections = () => {
    storedRecentConnections.value = [];
    if (import.meta.client && storageKey.value) localStorage.setItem(storageKey.value, "[]");
  };

  const recordRecentConnection = (asset: AssetItem) => {
    if (!storageKey.value) return;
    if (activeStorageKey !== storageKey.value) load();

    const snapshot = {
      ...JSON.parse(JSON.stringify(asset)),
      org_id: asset.org_id || orgId.value || undefined
    } as AssetItem;
    storedRecentConnections.value = normalizeRecentConnections([snapshot, ...storedRecentConnections.value]);
    if (import.meta.client) {
      const persisted = storedRecentConnections.value.map(({ savedConnection: _savedConnection, ...item }) => item);
      localStorage.setItem(storageKey.value, JSON.stringify(persisted));
    }
  };

  return { clearRecentConnections, recentConnections, recordRecentConnection, load };
}
