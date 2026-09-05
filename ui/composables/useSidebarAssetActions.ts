import type { DropdownMenuItem } from "@nuxt/ui";
import type { AssetItem } from "~/types";
import { favoriteAsset, getAssetDetailRequest } from "~/composables/useApiRequest";
import { useConnectMethods, WEB_PROXY_NATIVE_VALUE } from "~/composables/useConnectMethods";
import { useUserInfoStore } from "~/store/modules/userInfo";

export function useSidebarAssetActions() {
  const { t } = useI18n();
  const toast = useToast();
  const isNarrowScreen = useMediaQuery("(max-width: 767px)");
  const { addErrorToast } = useErrorToast();
  const { setCollapse } = useSettingManager();
  const { closeHoverPreview } = useSidebarLayout();
  const { confirmConnection } = useAssetConnection();
  const { getMethodsForProtocol } = useConnectMethods();
  const { configure, launchWithInfo } = useConnectionLauncher();
  const { activeTab, canSplitWorkspace, openSession, openSetupSession, splitWorkspace } = useWorkspaceTabs();
  const { openAssetInWindow } = useAssetWindowLauncher();
  const { handleAssetFavorite, handleAssetRename, handleAssetUnfavorite } = useAssetAction();
  const { folders: favoriteFolders, load: loadFavoriteFolders, favoriteToFolder } = useFavoriteFolders();
  const userInfoStore = useUserInfoStore();
  const { currentUser, loggedIn } = storeToRefs(userInfoStore);

  const contextMenuVisible = ref(false);
  const contextMenuPosition = ref({ x: 0, y: 0 });
  const contextMenuAsset = ref<AssetItem | null>(null);
  const renameModalOpen = ref(false);
  const renameAsset = ref<AssetItem | null>(null);
  const renameValue = ref("");
  const renameDisabled = computed(() => {
    const name = renameValue.value.trim();
    return !name || name === renameAsset.value?.name;
  });

  const hasSshProtocol = (asset: AssetItem) => {
    return (asset.permedProtocols || []).some((protocol) => protocol.name === "ssh");
  };

  const hasReusableSavedConnection = (asset: AssetItem) => {
    const saved = asset.savedConnection;
    if (!saved?.protocol || !saved.username) return false;

    const mode = saved.accountMode || "hosted";
    if (mode === "manual") {
      return !!(saved.manualUsername && saved.personalCredentialId);
    }
    if (mode === "dynamic") {
      return !!(saved.rememberSecret && saved.dynamicPassword);
    }

    return true;
  };

  const hasQuickConnect = (asset: AssetItem) => {
    return hasReusableSavedConnection(asset);
  };

  const loadAssetConnectionDetails = async (asset: AssetItem) => {
    const detail = await getAssetDetailRequest(asset.id, asset.org_id || currentUser.value?.org?.id || "");

    return {
      ...asset,
      permedAccounts: detail.permed_accounts ?? asset.permedAccounts ?? [],
      permedProtocols: (detail.permed_protocols ?? asset.permedProtocols ?? []).filter(
        (protocol: { name?: string }) => protocol?.name !== "winrm"
      )
    };
  };

  const savedConnectionIsAvailable = (asset: AssetItem) => {
    const saved = asset.savedConnection;
    if (!saved || !(asset.permedProtocols || []).some((protocol) => protocol.name === saved.protocol)) {
      return false;
    }

    const accounts = asset.permedAccounts || [];
    const mode = saved.accountMode || "hosted";

    if (mode === "manual") return accounts.some((account) => account.alias === "@INPUT");
    if (mode === "dynamic") return accounts.some((account) => account.alias === "@USER");
    if (mode === "anonymous") return accounts.some((account) => account.alias === "@ANON");

    return accounts.some(
      (account) =>
        !(account.alias || "").startsWith("@") &&
        ((saved.accountId && account.id === saved.accountId) ||
          account.name === saved.username ||
          account.username === saved.username ||
          account.alias === saved.username)
    );
  };

  const connectWithSavedConnection = async (asset: AssetItem) => {
    const remembered = userInfoStore.getConnectionInfoForAsset(asset.id) || asset.savedConnection;
    const rememberedAsset = { ...asset, savedConnection: remembered || undefined };

    if (!remembered || !hasReusableSavedConnection(rememberedAsset)) {
      openSetupSession(rememberedAsset);
      return;
    }

    let connectAsset: AssetItem;
    try {
      connectAsset = await loadAssetConnectionDetails(rememberedAsset);
    } catch (error) {
      addErrorToast({
        title: t("ConnectError.ConnectFailed"),
        description: String(error),
        icon: "line-md:close-circle",
        progress: true,
        duration: 4000
      });
      return;
    }

    if (!savedConnectionIsAvailable(connectAsset)) {
      openSetupSession(connectAsset);
      return;
    }

    const saved = connectAsset.savedConnection!;
    const session = openSession(connectAsset, {
      protocol: saved.protocol,
      account: saved.username,
      connectMethod: saved.connectMethod
    });

    await confirmConnection(connectAsset, {
      protocol: saved.protocol,
      account: saved.username,
      accountId: saved.accountId,
      accountMode: (saved.accountMode as any) || "hosted",
      manualUsername: saved.manualUsername || "",
      manualPassword: "",
      personalCredentialId: saved.personalCredentialId,
      personalCredentialVersion: saved.personalCredentialVersion,
      personalCredentialSecretType: saved.personalCredentialSecretType || "password",
      savePersonalCredential: false,
      dynamicPassword: saved.dynamicPassword || "",
      rememberSecret: !!saved.rememberSecret,
      rememberSelection: true,
      connectMethod: saved.connectMethod || "",
      connectOptions: saved.connectOptions || {},
      availableProtocols: saved.availableProtocols || [],
      tabId: session.id
    });
  };

  const isWebsiteAsset = (asset: AssetItem) => {
    const classification = [asset.category, asset.type].map((value) => String(value || "").toLowerCase());
    return (
      classification.some((value) => ["web", "website"].includes(value)) ||
      (asset.permedProtocols || []).some((protocol) => ["http", "https"].includes(protocol.name?.toLowerCase()))
    );
  };

  const resolveDirectWebsiteAccount = (asset: AssetItem) => {
    const accounts = asset.permedAccounts || [];
    const preferred = userInfoStore.getConnectionPreferenceForAsset(asset.id);
    const hostedAccounts = accounts.filter((account) => !account.alias?.startsWith("@"));

    if (preferred?.accountMode === "hosted") {
      const matched = hostedAccounts.find(
        (account) =>
          (preferred.accountId && account.id === preferred.accountId) ||
          account.name === preferred.username ||
          account.username === preferred.username ||
          account.alias === preferred.username
      );
      if (matched) return { account: matched.name, accountId: matched.id, accountMode: "hosted" as const };
    }
    if (hostedAccounts.length === 1) {
      const account = hostedAccounts[0]!;
      return { account: account.name, accountId: account.id, accountMode: "hosted" as const };
    }
    if (hostedAccounts.length === 0 && accounts.some((account) => account.alias === "@ANON")) {
      return { account: "@ANON", accountId: undefined, accountMode: "anonymous" as const };
    }
    return null;
  };

  const connectWebsiteDirectly = async (asset: AssetItem) => {
    if (!isDesktopRuntime() || !isWebsiteAsset(asset)) return false;

    try {
      const connectAsset = await loadAssetConnectionDetails(asset);
      const protocols: string[] = [];
      for (const item of connectAsset.permedProtocols || []) {
        const protocol = String(item.name || "")
          .trim()
          .toLowerCase();
        if (["http", "https"].includes(protocol) && !protocols.includes(protocol)) protocols.push(protocol);
      }
      if (protocols.length !== 1) return false;

      const protocol = protocols[0]!;
      const methods = await getMethodsForProtocol(protocol);
      if (!methods.some((method) => method.value === WEB_PROXY_NATIVE_VALUE)) return false;

      const selectedAccount = resolveDirectWebsiteAccount(connectAsset);
      if (!selectedAccount) return false;

      const session = openSession(connectAsset, {
        protocol,
        account: selectedAccount.account,
        connectMethod: WEB_PROXY_NATIVE_VALUE
      });
      await confirmConnection(connectAsset, {
        protocol,
        account: selectedAccount.account,
        accountId: selectedAccount.accountId,
        accountMode: selectedAccount.accountMode,
        manualUsername: "",
        manualPassword: "",
        dynamicPassword: "",
        rememberSecret: false,
        rememberSelection: false,
        connectMethod: WEB_PROXY_NATIVE_VALUE,
        connectOptions: {},
        availableProtocols: protocols,
        tabId: session.id
      });
      return true;
    } catch (error) {
      addErrorToast({
        title: t("ConnectError.ConnectFailed"),
        description: String(error),
        icon: "i-lucide-circle-alert",
        duration: 4000
      });
      return true;
    }
  };

  const handleOpenMultipleAssets = async (assets: AssetItem[]) => {
    const selected = assets.map((asset) => ({
      ...asset,
      savedConnection: userInfoStore.getConnectionInfoForAsset(asset.id) || asset.savedConnection
    }));
    const details = await Promise.allSettled(selected.map((asset) => loadAssetConnectionDetails(asset)));
    const sshAssets = details.flatMap((result) => {
      if (result.status !== "fulfilled") return [];

      const asset = result.value;
      return hasSshProtocol(asset) ? [asset] : [];
    });

    if (sshAssets.length === 0) {
      const failed = details.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") {
        addErrorToast({
          title: t("ConnectError.ConnectFailed"),
          description: String(failed.reason),
          icon: "i-lucide-circle-alert",
          duration: 4000
        });
        return;
      }

      toast.add({
        title: t("Tree.MultiOpenNoConnectable"),
        color: "warning",
        icon: "i-lucide-circle-alert",
        duration: 3000
      });
      return;
    }

    const configured = [];
    for (const [index, asset] of sshAssets.entries()) {
      const info = await configure(asset, {
        protocol: "ssh",
        position: index + 1,
        total: sshAssets.length
      });
      if (!info) return;
      configured.push({ asset, info });
    }

    const aclBatchId =
      configured.length > 1 ? globalThis.crypto?.randomUUID?.() || `batch-${Date.now()}-${Math.random()}` : undefined;
    void Promise.all(configured.map(({ asset, info }) => launchWithInfo(asset, info, { aclBatchId })));

    const skipped = assets.length - sshAssets.length;
    if (skipped > 0) {
      toast.add({
        title: t("Tree.MultiOpenSkipped", { count: skipped }),
        color: "warning",
        icon: "i-lucide-circle-alert",
        duration: 3500
      });
    }
  };

  const handleFavoriteMultipleAssets = async (assets: AssetItem[]) => {
    const results = await Promise.allSettled(assets.map((asset) => favoriteAsset(asset.id)));
    const successCount = results.filter((result) => result.status === "fulfilled").length;
    const failedCount = results.length - successCount;

    if (successCount > 0) {
      const firstSuccessIndex = results.findIndex((result) => result.status === "fulfilled");
      useEventBus().emit("favoriteChanged", { assetId: assets[firstSuccessIndex]!.id, favorite: true });
    }

    if (failedCount === 0) {
      toast.add({
        title: t("Tree.MultiFavoriteSuccess", { count: successCount }),
        color: "success",
        icon: "i-lucide-star",
        duration: 2500
      });
      return;
    }

    if (successCount > 0) {
      toast.add({
        title: t("Tree.MultiFavoritePartial", { success: successCount, failed: failedCount }),
        color: "warning",
        icon: "i-lucide-circle-alert",
        duration: 4000
      });
      return;
    }

    const firstFailure = results.find((result) => result.status === "rejected");
    addErrorToast({
      title: t("Tree.MultiFavoriteFailed"),
      description: firstFailure?.status === "rejected" ? String(firstFailure.reason) : undefined,
      icon: "i-lucide-circle-alert",
      duration: 4000
    });
  };

  const handleAssetConnect = async (asset: AssetItem) => {
    closeHoverPreview();
    if (isNarrowScreen.value) setCollapse(true);
    if (!hasReusableSavedConnection(asset) && (await connectWebsiteDirectly(asset))) return;
    await connectWithSavedConnection(asset);
  };

  const openAssetInCurrentWorkspace = (asset: AssetItem) => {
    contextMenuVisible.value = false;

    const currentTab = activeTab.value;
    if (!currentTab) {
      openSetupSession(asset);
      return;
    }

    const direction = canSplitWorkspace(currentTab.id, "vertical")
      ? "vertical"
      : canSplitWorkspace(currentTab.id, "horizontal")
        ? "horizontal"
        : null;

    if (!direction) {
      toast.add({
        title: t("WorkspacePane.SplitLimitTitle"),
        description: t("WorkspacePane.SplitLimitDescription"),
        color: "warning",
        icon: "i-lucide-circle-alert"
      });
      return;
    }

    const [pane] = splitWorkspace(currentTab.id, direction);
    if (!pane) return;

    openSetupSession(asset, { paneId: pane.id });
  };

  const handleAssetQuickConnect = (asset: AssetItem) => {
    closeHoverPreview();
    connectWithSavedConnection(asset);
  };

  const handleAssetConnectWithSelection = (asset: AssetItem) => {
    closeHoverPreview();
    openSetupSession(asset);
  };

  useEventBus().on("workspaceConnectAsset", handleAssetConnectWithSelection);
  useEventBus().on("workspaceQuickConnectAsset", handleAssetConnect);

  const handleAssetOpenInNewWindow = async (asset: AssetItem) => {
    contextMenuVisible.value = false;
    await openAssetInWindow(asset);
  };

  const openRenameModal = (asset: AssetItem) => {
    contextMenuVisible.value = false;
    renameAsset.value = asset;
    renameValue.value = asset.name || "";
    renameModalOpen.value = true;
  };

  const submitAssetRename = () => {
    const asset = renameAsset.value;
    const name = renameValue.value.trim();
    if (!asset || !name || name === asset.name) return;

    handleAssetRename(asset.id, name);
    renameModalOpen.value = false;
    renameAsset.value = null;
  };

  const updateRenameModal = (open: boolean) => {
    renameModalOpen.value = open;
    if (!open) renameAsset.value = null;
  };

  const toggleAssetFavorite = (asset: AssetItem, favorite: boolean) => {
    if (favorite) {
      handleAssetFavorite(asset.id);
    } else {
      handleAssetUnfavorite(asset.id);
    }

    useEventBus().emit("favoriteChanged", { assetId: asset.id, favorite });
  };

  const flattenFavoriteFolders = (folders = favoriteFolders.value): Array<{ id: string; name: string }> =>
    folders.flatMap((folder) => [{ id: folder.id, name: folder.name }, ...flattenFavoriteFolders(folder.children)]);

  const addAssetToFavoriteFolder = async (asset: AssetItem, folderId: string) => {
    contextMenuVisible.value = false;
    try {
      await favoriteToFolder(asset.id, folderId);
      toast.add({ title: t("Favorite.AddSuccess"), color: "success", icon: "i-lucide-star" });
    } catch (error) {
      addErrorToast({
        title: t("Favorite.AddFailed"),
        error,
        icon: "i-lucide-circle-alert"
      });
    }
  };

  const handleAssetContextMenu = (asset: AssetItem, event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    contextMenuAsset.value = asset;
    contextMenuPosition.value = { x: event.clientX, y: event.clientY };
    contextMenuVisible.value = true;
  };

  const assetContextMenuItems = computed<DropdownMenuItem[]>(() => {
    const asset = contextMenuAsset.value;
    if (!asset) return [];

    const isFavorited = !!asset.isFavorite;
    const folderItems: DropdownMenuItem[] = flattenFavoriteFolders().map((folder) => ({
      label: folder.name,
      icon: "i-lucide-folder",
      onSelect: () => addAssetToFavoriteFolder(asset, folder.id)
    }));

    return [
      ...(hasQuickConnect(asset)
        ? [
            {
              label: t("ContextMenu.QuickConnect"),
              icon: "i-lucide-zap",
              onSelect: () => {
                contextMenuVisible.value = false;
                handleAssetQuickConnect(asset);
              }
            } satisfies DropdownMenuItem
          ]
        : []),
      {
        label: t("ContextMenu.Connect"),
        icon: "i-lucide-plug",
        onSelect: () => {
          contextMenuVisible.value = false;
          handleAssetConnectWithSelection(asset);
        }
      },
      {
        label: t("ContextMenu.OpenInCurrentTab"),
        icon: "i-lucide-panels-top-left",
        onSelect: () => {
          openAssetInCurrentWorkspace(asset);
        }
      },
      {
        label: t("ContextMenu.OpenInNewWindow"),
        icon: "i-lucide-square-arrow-out-up-right",
        onSelect: () => handleAssetOpenInNewWindow(asset)
      },
      {
        label: t("ContextMenu.Rename"),
        icon: "i-lucide-pencil",
        onSelect: () => openRenameModal(asset)
      },
      {
        label: t("Favorite.AddToFolder"),
        icon: "lucide:star",
        children: folderItems.length > 0 ? folderItems : [{ label: t("Favorite.CreateFolderFirst"), disabled: true }]
      },
      ...(isFavorited
        ? [
            {
              label: t("ContextMenu.Unfavorite"),
              icon: "lucide:star-off",
              onSelect: () => {
                contextMenuVisible.value = false;
                toggleAssetFavorite(asset, false);
              }
            } satisfies DropdownMenuItem
          ]
        : [])
    ];
  });

  watch(
    loggedIn,
    (value) => {
      if (value) loadFavoriteFolders();
    },
    { immediate: true }
  );

  return {
    handleAssetConnect,
    handleOpenMultipleAssets,
    handleFavoriteMultipleAssets,
    handleAssetContextMenu,
    assetContextMenuItems,
    contextMenuVisible,
    contextMenuPosition,
    renameModalOpen,
    renameAsset,
    renameValue,
    renameDisabled,
    submitAssetRename,
    updateRenameModal
  };
}
