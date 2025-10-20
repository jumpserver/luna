import type { AssetItem } from "~/types/index";
import { useUserInfoStore } from "~/store/modules/userInfo";

export function useEditModal() {
  const { t } = useI18n();
  const { getAssetDetail, displayUser, displayProtocol } = useAssetAction();
  const userInfoStore = useUserInfoStore();

  // 模态框状态
  const editModalOpen = ref(false);
  const suppressNextEditModal = ref(false);
  const currentSelectedCardInfo = ref<AssetItem | null>(null);

  // 表单数据
  const draftRememberSecret = ref<boolean>(false);
  const draftAccount = ref<string>("");
  const draftProtocol = ref<string>("");
  const draftManualUsername = ref<string>("");
  const draftManualPassword = ref<string>("");
  const draftDynamicPassword = ref<string>("");

  const modalTitle = computed(() => {
    return `${t("EditModal.ModifyConnectionInfo")} - ${currentSelectedCardInfo.value?.name}`;
  });

  /**
   * 初始化表单数据
   */
  const initDraft = (asset: AssetItem) => {
    const saved = userInfoStore.getConnectionInfoForAsset(asset.id);

    draftProtocol.value = displayProtocol(asset.id, asset.permedProtocols!);
    draftAccount.value = displayUser(asset.id, asset.permedAccounts!);

    draftManualUsername.value = saved?.manualUsername || "";
    draftManualPassword.value = saved?.manualPassword || "";
    draftDynamicPassword.value = saved?.dynamicPassword || "";
    draftRememberSecret.value = saved?.rememberSecret || false;
  };

  /**
   * 打开编辑模态框
   */
  const openEditModal = (asset: AssetItem) => {
    currentSelectedCardInfo.value = asset;

    const noAccounts = !asset.permedAccounts || asset.permedAccounts.length === 0;
    const noProtocols = !asset.permedProtocols || asset.permedProtocols.length === 0;

    if (noAccounts || noProtocols) {
      getAssetDetail(asset.id);
      return;
    }

    initDraft(asset);
    editModalOpen.value = true;
  };

  /**
   * 关闭模态框
   */
  const closeModal = () => {
    editModalOpen.value = false;
    currentSelectedCardInfo.value = null;
  };

  /**
   * 处理表单确认
   */
  const handleConfirm = (onConfirm: (connectionInfo: any) => void) => {
    const asset = currentSelectedCardInfo.value;
    if (!asset) return;

    let accountMode: "hosted" | "dynamic" | "manual" = "hosted";
    let normalizedAccount = draftAccount.value || "";

    const v = draftAccount.value || "";

    if (v === "手动输入" || v === "Manual input") accountMode = "manual";
    if (v.includes("同名账号") || v.includes("Dynamic user")) {
      accountMode = "dynamic";

      const accs = currentSelectedCardInfo.value?.permedAccounts || [];
      const dynamicAcc = accs.find((a) => a.alias === "@USER");

      if (dynamicAcc) normalizedAccount = dynamicAcc.name;
      else normalizedAccount = v.replace(/\(.+\)/, "");
    }

    const connectionInfo = {
      protocol: draftProtocol.value || "",
      account: normalizedAccount,
      accountMode,
      manualUsername: draftManualUsername.value || "",
      manualPassword: draftManualPassword.value || "",
      dynamicPassword: draftDynamicPassword.value || "",
      rememberSecret: !!draftRememberSecret.value
    };

    onConfirm(connectionInfo);
    closeModal();
  };

  /**
   * 设置抑制下次弹窗
   */
  const setSuppressNextModal = (value: boolean) => {
    suppressNextEditModal.value = value;
  };

  /**
   * 检查是否应该抑制弹窗
   */
  const shouldSuppressModal = () => {
    return suppressNextEditModal.value;
  };

  /**
   * 重置抑制状态
   */
  const resetSuppressModal = () => {
    suppressNextEditModal.value = false;
  };

  return {
    // 状态
    editModalOpen,
    currentSelectedCardInfo,
    modalTitle,
    
    // 表单数据
    draftRememberSecret,
    draftAccount,
    draftProtocol,
    draftManualUsername,
    draftManualPassword,
    draftDynamicPassword,
    
    // 方法
    openEditModal,
    closeModal,
    handleConfirm,
    initDraft,
    setSuppressNextModal,
    shouldSuppressModal,
    resetSuppressModal
  };
}
