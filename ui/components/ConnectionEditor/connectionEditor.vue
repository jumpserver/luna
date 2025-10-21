<script setup lang="ts">
import type { AssetItem, PermedAccount, PermedProtocol } from "~/types/index";
import { useUserInfoStore } from "~/store/modules/userInfo";
import EditForm from "~/components/EditForm/editForm.vue";

const { t } = useI18n();
const userInfoStore = useUserInfoStore();
const { getAssetDetail, displayUser, displayProtocol } = useAssetAction();

const open = ref(false);
const currentAsset = ref<AssetItem | null>(null);

const draftProtocol = ref<string>("");
const draftAccount = ref<string>("");
const draftManualUsername = ref<string>("");
const draftManualPassword = ref<string>("");
const draftDynamicPassword = ref<string>("");
const draftRememberSecret = ref<boolean>(false);

let pendingResolve: ((info: any) => void) | null = null;
let pendingReject: ((reason?: any) => void) | null = null;

const modalTitle = computed(() => {
  const name = currentAsset.value?.name || "";
  return `${t("EditModal.ModifyConnectionInfo")} - ${name}`;
});

/**
 * @description 初始化 Form
 * @param asset
 */
const initDraft = (asset: AssetItem) => {
  const saved = userInfoStore.getConnectionInfoForAsset(asset.id);

  draftProtocol.value = displayProtocol(
    asset.id,
    asset.permedProtocols || ([] as PermedProtocol[])
  );
  draftAccount.value = displayUser(asset.id, asset.permedAccounts || ([] as PermedAccount[]));

  draftManualUsername.value = saved?.manualUsername || "";
  draftManualPassword.value = saved?.manualPassword || "";
  draftDynamicPassword.value = saved?.dynamicPassword || "";
  draftRememberSecret.value = saved?.rememberSecret || false;

  console.log("draftAccount", draftAccount.value);
};

const buildConnectionInfo = () => {
  let accountMode: "hosted" | "dynamic" | "manual" = "hosted";
  let normalizedAccount = draftAccount.value || "";
  let accountId: string | undefined = undefined;

  const v = draftAccount.value || "";

  if (v === "手动输入" || v === "Manual input") accountMode = "manual";
  if (v.includes("同名账号") || v.includes("Dynamic user")) {
    accountMode = "dynamic";

    const accs = currentAsset.value?.permedAccounts || [];
    const dynamicAcc = accs.find((a) => a.alias === "@USER");

    if (dynamicAcc) normalizedAccount = dynamicAcc.name;
    else normalizedAccount = v.replace(/\(.+\)/, "");
  }

  if (accountMode === "hosted") {
    const accs = currentAsset.value?.permedAccounts || [];
    const matched = accs.find(
      (a) =>
        a.name === normalizedAccount ||
        a.username === normalizedAccount ||
        a.alias === normalizedAccount
    );
    accountId = matched?.id;
  }

  return {
    protocol: draftProtocol.value || "",
    account: normalizedAccount,
    accountId,
    accountMode,
    manualUsername: draftManualUsername.value || "",
    manualPassword: draftManualPassword.value || "",
    dynamicPassword: draftDynamicPassword.value || "",
    rememberSecret: !!draftRememberSecret.value
  };
};

/**
 * @description 关闭 modal
 */
const close = () => {
  open.value = false;
  currentAsset.value = null;
};

/**
 * @description 点击确认
 */
const onConfirm = () => {
  const info = buildConnectionInfo();

  pendingResolve?.(info);
  pendingResolve = null;
  pendingReject = null;
  close();
};

/**
 * @description 点击取消
 */
const onCancel = () => {
  pendingReject?.("cancelled");
  pendingResolve = null;
  pendingReject = null;
  close();
};

async function ensureDetails(asset: AssetItem) {
  const noAccounts = !asset.permedAccounts || asset.permedAccounts.length === 0;
  const noProtocols = !asset.permedProtocols || asset.permedProtocols.length === 0;

  if (!noAccounts && !noProtocols) return asset;

  const detailsReady = new Promise<AssetItem>((resolve) => {
    const unsubscribe = useEventBus().once(
      "assetDetailUpdated",
      (payload: {
        assetId: string;
        permedAccounts: PermedAccount[];
        permedProtocols: PermedProtocol[];
      }) => {
        if (payload.assetId !== asset.id) return;

        currentAsset.value = {
          ...(currentAsset.value || asset),
          permedAccounts: payload.permedAccounts || [],
          permedProtocols: payload.permedProtocols || []
        } as AssetItem;

        resolve(currentAsset.value!);
      }
    );

    void unsubscribe;
  });

  await getAssetDetail(asset.id);
  const updated = await detailsReady;
  return updated;
}

/**
 * @description 打开 Modal
 * @param asset
 */
async function openModal(asset: AssetItem): Promise<any> {
  currentAsset.value = asset;
  await ensureDetails(asset);
  initDraft(currentAsset.value!);
  open.value = true;

  return new Promise((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
  });
}

defineExpose({ open: openModal, close });
</script>

<template>
  <Modal
    :open="open"
    :title="modalTitle"
    :description="t('EditModal.Description')"
    @confirm="onConfirm"
    @update:open="(v) => (v ? (open = true) : onCancel())"
  >
    <EditForm
      v-if="currentAsset"
      v-model:protocol="draftProtocol"
      v-model:account="draftAccount"
      v-model:manual-username="draftManualUsername"
      v-model:manual-password="draftManualPassword"
      v-model:dynamic-password="draftDynamicPassword"
      v-model:remember-secret="draftRememberSecret"
      :accounts="currentAsset.permedAccounts || []"
      :protocols="currentAsset.permedProtocols || []"
    />
  </Modal>
</template>
