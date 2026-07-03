<script setup lang="ts">
import type { AssetItem, AssetPageType, ConnectionInfo, ConnectionPreferenceInfo, PermedAccount, PermedProtocol } from "~/types/index";
import ConnectionSettingsForm from "~/components/ConnectionEditor/connectionSettingsForm.vue";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { sortPermedProtocols, sortProtocolNames } from "~/utils";

const props = defineProps<{
  assetType?: AssetPageType
}>();

const { t, locale } = useI18n();
const { getAssetDetail } = useAssetAction();
const userInfoStore = useUserInfoStore();

const open = ref(false);
const currentAsset = ref<AssetItem | null>(null);

const draftProtocol = ref<string>("");
const draftAccount = ref<string>("");
const draftManualUsername = ref<string>("");
const draftManualPassword = ref<string>("");
const draftDynamicPassword = ref<string>("");
const draftRememberSecret = ref<boolean>(false);
const draftRememberSelection = ref<boolean>(false);
const draftConnectMethod = ref<string>("");
const draftConnectOptions = ref<Record<string, any>>({});

let pendingResolve: ((info: any) => void) | null = null;
let pendingReject: ((reason?: any) => void) | null = null;

const modalTitle = computed(() => {
  const name = currentAsset.value?.name || "";
  return `${t("EditModal.ModifyConnectionInfo")} - ${name}`;
});

const getVisibleProtocols = (protocols: PermedProtocol[]) => {
  if (isTauriRuntime()) return protocols;
  return protocols.filter((protocol) => protocol?.public !== false);
};

const getManualInputLabel = () => (locale.value === "zh" ? "手动输入" : "Manual input");
const getAnonymousLabel = () => (locale.value === "zh" ? "匿名账号" : "Anonymous");
const getDynamicAccountLabel = (account?: PermedAccount) => {
  if (!account) return "";

  const base = t("Account.DynamicUser");
  const username = account.username || "";
  return username ? `${base}(${username})` : base;
};

const resolvePreferredProtocol = (source: ConnectionPreferenceInfo | ConnectionInfo | undefined, protocols: PermedProtocol[]) => {
  const available = sortPermedProtocols(protocols).map((item) => item.name);
  const preferred = (source?.protocol || "").trim();

  if (preferred && available.includes(preferred)) return preferred;
  return available[0] || "";
};

const resolvePreferredAccount = (
  source: ConnectionPreferenceInfo | ConnectionInfo | undefined,
  accounts: PermedAccount[]
) => {
  const mode = source?.accountMode || "hosted";
  const username = (source?.username || "").trim();

  if (mode === "manual") {
    const manual = accounts.find((account) => account.alias === "@INPUT");
    if (manual) return getManualInputLabel();
  }

  if (mode === "dynamic") {
    const dynamic = accounts.find((account) => account.alias === "@USER");
    if (dynamic) return getDynamicAccountLabel(dynamic);
  }

  if (mode === "anonymous") {
    const anonymous = accounts.find((account) => account.alias === "@ANON");
    if (anonymous) return "@ANON";
  }

  if (mode === "hosted" && username) {
    const hosted = accounts.find((account) => {
      if (source?.accountId && account.id === source.accountId) return true;
      return account.name === username || account.username === username || account.alias === username;
    });

    if (hosted) return hosted.name;
  }

  const firstHosted = accounts.find((account) => account?.alias && !account.alias.startsWith("@"));
  if (firstHosted) return firstHosted.name;

  const dynamic = accounts.find((account) => account.alias === "@USER");
  if (dynamic) return getDynamicAccountLabel(dynamic);

  const manual = accounts.find((account) => account.alias === "@INPUT");
  if (manual) return getManualInputLabel();

  const anonymous = accounts.find((account) => account.alias === "@ANON");
  if (anonymous) return "@ANON";

  return "";
};

/**
 * @description 初始化 Form
 * @param asset
 */
const initDraft = (asset: AssetItem) => {
  const saved: ConnectionInfo | undefined = asset.savedConnection;
  const preferred = userInfoStore.getConnectionPreferenceForAsset(asset.id) || undefined;
  const source = {
    ...(preferred || {}),
    ...(saved || {})
  } as ConnectionPreferenceInfo | ConnectionInfo;

  const protocols = sortPermedProtocols(getVisibleProtocols(asset.permedProtocols || ([] as PermedProtocol[])));
  const accounts = asset.permedAccounts || ([] as PermedAccount[]);

  draftProtocol.value = resolvePreferredProtocol(source, protocols);
  draftAccount.value = resolvePreferredAccount(source, accounts);

  draftManualUsername.value = source?.manualUsername || "";
  draftManualPassword.value = saved?.manualPassword || "";
  draftDynamicPassword.value = saved?.dynamicPassword || "";
  draftRememberSecret.value = saved?.rememberSecret || false;
  draftRememberSelection.value = false;
  draftConnectMethod.value = source?.connectMethod || "";
  draftConnectOptions.value = { ...(source?.connectOptions || {}) };
};

/**
 * @description 拼凑连接信息
 */
const normalizeProtocols = () => {
  const protocols = getVisibleProtocols(currentAsset.value?.permedProtocols || [])
    .map((p) => (p?.name ? p.name.trim() : ""))
    .filter((name) => name.length > 0);

  return sortProtocolNames(protocols);
};

const buildConnectionInfo = () => {
  let accountMode: "hosted" | "dynamic" | "manual" | "anonymous" = "hosted";
  let normalizedAccount = draftAccount.value || "";
  let accountId: string | undefined;

  const v = draftAccount.value || "";

  if (v === getManualInputLabel()) accountMode = "manual";
  if (v.includes("@ANON") || v === getAnonymousLabel()) {
    accountMode = "anonymous";
    normalizedAccount = "@ANON";
  }
  if (v.startsWith(t("Account.DynamicUser"))) {
    accountMode = "dynamic";

    const accs = currentAsset.value?.permedAccounts || [];
    const dynamicAcc = accs.find((a) => a.alias === "@USER");

    if (dynamicAcc) normalizedAccount = dynamicAcc.name;
    else normalizedAccount = v.replace(/\(.+\)/, "");
  }

  if (accountMode === "hosted") {
    const accs = currentAsset.value?.permedAccounts || [];
    const matched = accs.find(
      (a) => a.name === normalizedAccount || a.username === normalizedAccount || a.alias === normalizedAccount
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
    rememberSecret: !!draftRememberSecret.value,
    rememberSelection: !!draftRememberSelection.value,
    connectMethod: draftConnectMethod.value || "",
    connectOptions: { ...draftConnectOptions.value },
    availableProtocols: normalizeProtocols()
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

  let unsubscribe = () => {};
  const detailsReady = new Promise<AssetItem>((resolve) => {
    unsubscribe = useEventBus().on(
      "assetDetailUpdated",
      (payload: { assetId: string, permedAccounts: PermedAccount[], permedProtocols: PermedProtocol[] }) => {
        if (payload.assetId !== asset.id) return;

        currentAsset.value = {
          ...(currentAsset.value || asset),
          permedAccounts: payload.permedAccounts || [],
          permedProtocols: payload.permedProtocols || []
        } as AssetItem;

        resolve(currentAsset.value!);
      },
      false
    );
  });
  const fallback = new Promise<AssetItem>((resolve) => {
    setTimeout(resolve, 2500, currentAsset.value || asset);
  });

  await getAssetDetail(asset.id);
  const updated = await Promise.race([detailsReady, fallback]);
  unsubscribe();
  return updated;
}

/**
 * @description 打开 Modal
 * @param asset
 */
async function openModal(asset: AssetItem): Promise<any> {
  currentAsset.value = asset;
  await ensureDetails(asset);
  if (currentAsset.value) {
    asset.permedAccounts = currentAsset.value.permedAccounts || [];
    asset.permedProtocols = currentAsset.value.permedProtocols || [];
  }
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
    overlay
    hide-cancel
    hide-footer
    compact
    @confirm="onConfirm"
    @update:open="(v) => (v ? (open = true) : onCancel())"
  >
    <ConnectionSettingsForm
      v-if="currentAsset"
      v-model:protocol="draftProtocol"
      v-model:account="draftAccount"
      v-model:manual-username="draftManualUsername"
      v-model:manual-password="draftManualPassword"
      v-model:dynamic-password="draftDynamicPassword"
      v-model:remember-secret="draftRememberSecret"
      v-model:connect-method="draftConnectMethod"
      v-model:connect-options="draftConnectOptions"
      :accounts="currentAsset.permedAccounts || []"
      :protocols="currentAsset.permedProtocols || []"
      :asset-type="props.assetType"
    />

    <div class="mt-4">
      <UCheckbox v-model="draftRememberSelection" icon="i-lucide-check" :label="t('EditModal.RememberSelection')" />
    </div>

    <UButton
      :label="t('Common.Connect')"
      color="primary"
      class="mt-4 w-full justify-center"
      @click="onConfirm"
    />
  </Modal>
</template>
