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
import { isItemNameTooLong, ITEM_NAME_MAX_LENGTH } from "~/utils/itemName";

export interface FavoriteFolder {
  id: string;
  name: string;
  parent: string | null;
  children: FavoriteFolder[];
  assets: AssetItem[];
  assetCount?: number;
  open: boolean;
}

export const FAVORITE_FOLDER_NAME_MAX_LENGTH = ITEM_NAME_MAX_LENGTH;

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

export const sortFavoriteFoldersByName = (folders: FavoriteFolder[]): FavoriteFolder[] => {
  for (const folder of folders) sortFavoriteFoldersByName(folder.children);
  return folders.sort((left, right) => left.name.localeCompare(right.name));
};

export const restoreFavoriteFolderOpenState = (
  folders: FavoriteFolder[],
  openFolderIds: ReadonlySet<string>
): FavoriteFolder[] => {
  for (const folder of folders) {
    if (openFolderIds.has(folder.id)) folder.open = true;
    restoreFavoriteFolderOpenState(folder.children, openFolderIds);
  }
  return folders;
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
        assetCount: 0,
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
  return sortFavoriteFoldersByName(roots);
};

const flattenFolders = (folders: FavoriteFolder[]): FavoriteFolder[] =>
  folders.flatMap((folder) => [folder, ...flattenFolders(folder.children)]);

export const flattenFavoriteFolderTree = (
  folders: FavoriteFolder[],
  depth = 1
): Array<{ folder: FavoriteFolder; depth: number }> =>
  folders.flatMap((folder) => [{ folder, depth }, ...flattenFavoriteFolderTree(folder.children, depth + 1)]);

export const flattenVisibleFavoriteFolderTree = (
  folders: FavoriteFolder[],
  expandedFolderIds: ReadonlySet<string>,
  depth = 1
): Array<{ folder: FavoriteFolder; depth: number }> =>
  folders.flatMap((folder) => [
    { folder, depth },
    ...(expandedFolderIds.has(folder.id)
      ? flattenVisibleFavoriteFolderTree(folder.children, expandedFolderIds, depth + 1)
      : [])
  ]);

export const findFavoriteAssetFolderId = (
  assetId: string,
  folders: FavoriteFolder[],
  rootAssets: AssetItem[]
): string | null | undefined => {
  if (rootAssets.some((asset) => asset.id === assetId)) return null;

  for (const folder of folders) {
    if (folder.assets.some((asset) => asset.id === assetId)) return folder.id;
    const childFolderId = findFavoriteAssetFolderId(assetId, folder.children, []);
    if (childFolderId !== undefined) return childFolderId;
  }

  return undefined;
};

export const isFavoriteFolderNameTooLong = isItemNameTooLong;

export const updateFavoriteFolderAssetCount = (folder: FavoriteFolder): number => {
  folder.assetCount =
    folder.assets.length + folder.children.reduce((total, child) => total + updateFavoriteFolderAssetCount(child), 0);
  return folder.assetCount;
};

export const getFavoriteRootAssetCount = (folders: FavoriteFolder[], rootAssets: AssetItem[]): number =>
  rootAssets.length + folders.reduce((total, folder) => total + (folder.assetCount || 0), 0);

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
      const openFolderIds = new Set(
        flattenFolders(folders.value)
          .filter((folder) => folder.open)
          .map((folder) => folder.id)
      );
      const normalizedFolders = restoreFavoriteFolderOpenState(normalizeFolders(folderData), openFolderIds);
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

      for (const folder of normalizedFolders) updateFavoriteFolderAssetCount(folder);

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
    if (isFavoriteFolderNameTooLong(name)) throw new Error("Favorite folder name is too long");
    const created = await createFavoriteFolder({ name, parent });
    await load();
    const createdId = String((created as { id?: unknown } | null)?.id || "");
    const createdFolder = createdId ? flattenFolders(folders.value).find((folder) => folder.id === createdId) : null;
    if (!createdFolder) return null;

    const siblings = parent
      ? flattenFolders(folders.value).find((folder) => folder.id === parent)?.children
      : folders.value;
    const createdIndex = siblings?.findIndex((folder) => folder.id === createdId) ?? -1;
    if (siblings && createdIndex > 0) {
      siblings.splice(createdIndex, 1);
      siblings.unshift(createdFolder);
    }
    return createdFolder;
  };

  const renameFolder = async (id: string, name: string) => {
    if (isFavoriteFolderNameTooLong(name)) throw new Error("Favorite folder name is too long");
    await updateFavoriteFolder(id, { name });
    await load();
  };

  const removeFolder = async (id: string) => {
    await deleteFavoriteFolder(id);
    await load();
  };

  const favoriteToFolder = async (assetId: string, folderId: string | null) => {
    await favoriteAssetToFolder(assetId, folderId);
    await load();
    useEventBus().emit("favoriteChanged", { assetId, favorite: true });
  };

  const renameFavoriteAsset = (assetId: string, name: string) => {
    const visit = (folder: FavoriteFolder) => {
      for (const asset of folder.assets) {
        if (asset.id === assetId) asset.name = name;
      }
      for (const child of folder.children) visit(child);
    };
    for (const folder of folders.value) visit(folder);
    for (const asset of rootAssets.value) {
      if (asset.id === assetId) asset.name = name;
    }
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
  return {
    folders,
    rootAssets,
    loading,
    load,
    createFolder,
    renameFolder,
    removeFolder,
    favoriteToFolder,
    renameFavoriteAsset
  };
};
