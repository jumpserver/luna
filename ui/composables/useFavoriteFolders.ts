import type { AssetItem } from "~/types";
import {
  createFavoriteFolder,
  deleteFavoriteFolder,
  favoriteAssetToFolder,
  getFavoriteAssets,
  getFavoriteFolders,
  updateFavoriteFolder
} from "~/composables/useApiRequest";
import { useUserInfoStore } from "~/store/modules/userInfo";

export interface FavoriteFolder {
  id: string;
  name: string;
  parent: string | null;
  children: FavoriteFolder[];
  assets: AssetItem[];
  open: boolean;
}

const rawList = (value: any): any[] =>
  Array.isArray(value)
    ? value
    : Array.isArray(value?.results)
      ? value.results
      : Array.isArray(value?.children)
        ? value.children
        : [];

const assetFromRaw = (raw: any): AssetItem | null => {
  const source = raw?.asset_info || raw?.asset || raw;
  const data = source?.meta?.data || source;
  const id = data?.id || source?.id || (typeof raw?.asset === "string" ? raw.asset : "");
  if (!id) return null;

  return {
    id: String(id),
    name: String(data?.name || source?.name || id),
    address: String(data?.address || ""),
    platform: String(data?.platform?.name || data?.platform || data?.platform_type || ""),
    zone: String(data?.zone?.name || data?.zone || ""),
    category: String(data?.category?.value || data?.category || ""),
    type: String(data?.type?.value || data?.type || data?.platform_type || ""),
    isActive: data?.is_active !== false && source?.chkDisabled !== true,
    comment: String(data?.comment || source?.title || ""),
    permedProtocols: data?.permedProtocols || data?.permed_protocols || [],
    permedAccounts: data?.permedAccounts || data?.permed_accounts || [],
    isFavorite: true
  };
};

const normalizeFolders = (value: unknown): FavoriteFolder[] => {
  const rawFolders = rawList(value);
  const folders = rawFolders
    .map((raw: any) => {
      return {
        id: String(raw.id || raw.key || ""),
        name: String(raw.name || raw.title || ""),
        parent: raw.parent == null ? null : String(raw.parent?.id || raw.parent),
        children: normalizeFolders(raw.children || raw.folders || []),
        assets: [],
        open: Boolean(raw.open)
      } satisfies FavoriteFolder;
    })
    .filter((folder) => folder.id);

  // The endpoint may return either nested folders or a flat parent-linked list.
  const nestedIds = new Set(folders.flatMap((folder) => folder.children.map((child) => child.id)));
  const topLevel = folders.filter((folder) => !nestedIds.has(folder.id));
  const byId = new Map(topLevel.map((folder) => [folder.id, folder]));
  const roots: FavoriteFolder[] = [];
  for (const folder of topLevel) {
    const parent = folder.parent ? byId.get(folder.parent) : undefined;
    if (parent && parent !== folder) parent.children.push(folder);
    else roots.push(folder);
  }
  return roots;
};

const flattenFolders = (folders: FavoriteFolder[]): FavoriteFolder[] =>
  folders.flatMap((folder) => [folder, ...flattenFolders(folder.children)]);

const folderIdFromRaw = (raw: any): string | null => {
  const value = raw?.folder;
  if (!value) return null;
  return String(value?.id || value);
};

export const useFavoriteFolders = () => {
  const userInfoStore = useUserInfoStore();
  const { loggedIn, currentAccountId } = storeToRefs(userInfoStore);
  const folders = useState<FavoriteFolder[]>("favorite-folders", () => []);
  const rootAssets = useState<AssetItem[]>("favorite-root-assets", () => []);
  const loading = useState<boolean>("favorite-folders-loading", () => false);
  const stateVersion = useState<number>("favorite-folders-state-version", () => 0);
  const activeRequestId = useState<number>("favorite-folders-active-request-id", () => 0);
  const nextRequestId = useState<number>("favorite-folders-next-request-id", () => 0);
  const pendingReload = useState<boolean>("favorite-folders-pending-reload", () => false);

  const load = async () => {
    if (!loggedIn.value || loading.value) return;
    loading.value = true;
    const requestId = nextRequestId.value + 1;
    const requestVersion = stateVersion.value;
    const requestAccountId = currentAccountId.value;
    nextRequestId.value = requestId;
    activeRequestId.value = requestId;
    try {
      const [folderData, assetData] = await Promise.all([getFavoriteFolders(), getFavoriteAssets().catch(() => [])]);
      if (requestVersion !== stateVersion.value || requestAccountId !== currentAccountId.value || !loggedIn.value)
        return;
      const normalizedFolders = normalizeFolders(folderData);
      const folderMap = new Map(flattenFolders(normalizedFolders).map((folder) => [folder.id, folder]));
      const nextRootAssets: AssetItem[] = [];

      for (const raw of rawList(assetData)) {
        const asset = assetFromRaw(raw);
        if (!asset) continue;

        const folderId = folderIdFromRaw(raw);
        const folder = folderId ? folderMap.get(folderId) : undefined;
        if (folder) folder.assets.push(asset);
        else nextRootAssets.push(asset);
      }

      folders.value = normalizedFolders;
      rootAssets.value = nextRootAssets;
    } finally {
      if (activeRequestId.value === requestId) {
        activeRequestId.value = 0;
        loading.value = false;
      }
      if (pendingReload.value && !loading.value) {
        pendingReload.value = false;
        void load();
      }
    }
  };

  const createFolder = async (name: string, parent: string | null = null) => {
    await createFavoriteFolder(parent ? { name, parent } : { name });
    await load();
  };

  const renameFolder = async (id: string, name: string) => {
    await updateFavoriteFolder(id, { name });
    await load();
  };

  const removeFolder = async (id: string) => {
    await deleteFavoriteFolder(id);
    await load();
  };

  const favoriteToFolder = async (assetId: string, folderId: string) => {
    await favoriteAssetToFolder(assetId, folderId);
    await load();
    useEventBus().emit("favoriteChanged", { assetId, favorite: true });
  };

  watch([loggedIn, currentAccountId], ([isLoggedIn]) => {
    stateVersion.value += 1;
    folders.value = [];
    rootAssets.value = [];
    if (!isLoggedIn) {
      pendingReload.value = false;
      return;
    }
    if (loading.value) {
      pendingReload.value = true;
      return;
    }
    void load();
  });
  return { folders, rootAssets, loading, load, createFolder, renameFolder, removeFolder, favoriteToFolder };
};
