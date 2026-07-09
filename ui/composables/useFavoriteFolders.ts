import type { AssetItem } from "~/types";
import { useUserInfoStore } from "~/store/modules/userInfo";

export interface FavoriteFolder {
  id: string
  name: string
  parent: string | null
  children: FavoriteFolder[]
  assets: AssetItem[]
  open: boolean
}

const rawList = (value: any): any[] => Array.isArray(value)
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
  const folders = rawFolders.map((raw: any) => {
    const assetValues = raw.assets || raw.favorite_assets || raw.items || [];
    return {
      id: String(raw.id || raw.key || ""),
      name: String(raw.name || raw.title || ""),
      parent: raw.parent == null ? null : String(raw.parent?.id || raw.parent),
      children: normalizeFolders(raw.children || raw.folders || []),
      assets: rawList(assetValues).map(assetFromRaw).filter(Boolean) as AssetItem[],
      open: Boolean(raw.open)
    } satisfies FavoriteFolder;
  }).filter((folder) => folder.id);

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

export const useFavoriteFolders = () => {
  const userInfoStore = useUserInfoStore();
  const { loggedIn, orgId } = storeToRefs(userInfoStore);
  const folders = useState<FavoriteFolder[]>("favorite-folders", () => []);
  const loading = useState<boolean>("favorite-folders-loading", () => false);

  const request = async (method: "GET" | "POST", body?: Record<string, unknown>) => {
    if (isTauriRuntime()) {
      if (method === "GET") return useTauriCoreInvoke("get_favorite_folders");
      if ("assetId" in (body || {})) return useTauriCoreInvoke("favorite_to_folder", body);
      return useTauriCoreInvoke("create_favorite_folder", body);
    }

    const response = await fetch(withWebSitePrefix("/api/v1/assets/favorite-folders/"), {
      method,
      credentials: "include",
      headers: { ...getWebApiHeaders(), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  };

  const load = async () => {
    if (!loggedIn.value || loading.value) return;
    loading.value = true;
    try {
      folders.value = normalizeFolders(await request("GET"));
    } finally {
      loading.value = false;
    }
  };

  const createFolder = async (name: string, parent: string | null = null) => {
    if (isTauriRuntime()) await request("POST", { name, parent });
    else await request("POST", { name, parent });
    await load();
  };

  const favoriteToFolder = async (assetId: string, folderId: string) => {
    if (isTauriRuntime()) {
      await request("POST", { assetId, folderId });
    } else {
      const response = await fetch(withWebSitePrefix("/api/v1/assets/favorite-assets/"), {
        method: "POST",
        credentials: "include",
        headers: { ...getWebApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ asset: assetId, folder: folderId })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    }
    await load();
    useEventBus().emit("favoriteChanged", { assetId, favorite: true });
  };

  watch([loggedIn, orgId], () => {
    folders.value = [];
  });
  return { folders, loading, load, createFolder, favoriteToFolder };
};
