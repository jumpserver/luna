<script setup lang="ts">
import type { ConnectionFormInfo } from "~/composables/useAssetConnection";
import type { AssetItem, ConnectionInfo, ConnectionPreferenceInfo, PermedAccount, PermedProtocol } from "~/types";

import ConnectForm from "~/components/ConnectForm/connectForm.vue";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { sortPermedProtocols, sortProtocolNames } from "~/utils";

const { t, locale } = useI18n();
const { addErrorToast } = useErrorToast();
const userInfoStore = useUserInfoStore();
const { activeRequest, settle } = useConnectionFormModal();

const currentAsset = ref<AssetItem | null>(null);
const loading = ref(false);
const draftProtocol = ref("");
const draftAccount = ref("");
const draftManualUsername = ref("");
const draftManualPassword = ref("");
const draftDynamicPassword = ref("");
const draftRememberSecret = ref(false);
const draftRememberSelection = ref(false);
const draftConnectMethod = ref("");
const draftConnectOptions = ref<Record<string, any>>({});
let loadSequence = 0;

const modalTitle = computed(() => {
  const request = activeRequest.value;
  const progress = request?.options.total ? ` (${request.options.position || 1}/${request.options.total})` : "";
  return `${t("EditModal.ModifyConnectionInfo")}${progress} - ${request?.asset.name || ""}`;
});
const preferredConnectMethod = computed(
  () => userInfoStore.getConnectionPreferenceForProtocol(draftProtocol.value)?.connectMethod || ""
);

const getVisibleProtocols = (protocols: PermedProtocol[]) =>
  isTauriRuntime() ? protocols : protocols.filter((protocol) => protocol?.public !== false);
const getManualInputLabel = () => (locale.value === "zh" ? "手动输入" : "Manual input");
const getAnonymousLabel = () => (locale.value === "zh" ? "匿名账号" : "Anonymous");
const getDynamicAccountLabel = (account?: PermedAccount) => {
  if (!account) return "";
  const base = t("Account.DynamicUser");
  return account.username ? `${base}(${account.username})` : base;
};

const resolvePreferredProtocol = (
  source: ConnectionPreferenceInfo | ConnectionInfo | undefined,
  protocols: PermedProtocol[],
  explicit = ""
) => {
  const available = sortPermedProtocols(protocols).map((item) => item.name);
  const match = (candidate: string) =>
    available.find((protocol) => protocol.toLowerCase() === candidate.trim().toLowerCase());
  return match(explicit) || match(source?.protocol || "") || available[0] || "";
};

const resolvePreferredAccount = (
  source: ConnectionPreferenceInfo | ConnectionInfo | undefined,
  accounts: PermedAccount[]
) => {
  const mode = source?.accountMode || "hosted";
  const username = (source?.username || "").trim();
  if (mode === "manual" && accounts.some((account) => account.alias === "@INPUT")) return getManualInputLabel();
  if (mode === "dynamic") {
    const dynamic = accounts.find((account) => account.alias === "@USER");
    if (dynamic) return getDynamicAccountLabel(dynamic);
  }
  if (mode === "anonymous" && accounts.some((account) => account.alias === "@ANON")) return "@ANON";
  if (mode === "hosted" && username) {
    const hosted = accounts.find(
      (account) =>
        (source?.accountId && account.id === source.accountId) ||
        account.name === username ||
        account.username === username ||
        account.alias === username
    );
    if (hosted) return hosted.name;
  }
  const hosted = accounts.find((account) => account.alias && !account.alias.startsWith("@"));
  if (hosted) return hosted.name;
  const dynamic = accounts.find((account) => account.alias === "@USER");
  if (dynamic) return getDynamicAccountLabel(dynamic);
  if (accounts.some((account) => account.alias === "@INPUT")) return getManualInputLabel();
  if (accounts.some((account) => account.alias === "@ANON")) return "@ANON";
  return "";
};

const initDraft = (asset: AssetItem, protocol = "") => {
  const saved = asset.savedConnection;
  const preferred = userInfoStore.getConnectionPreferenceForAsset(asset.id) || undefined;
  const source = { ...(saved || {}), ...(preferred || {}) } as ConnectionPreferenceInfo | ConnectionInfo;
  const protocols = getVisibleProtocols(asset.permedProtocols || []);
  const accounts = asset.permedAccounts || [];
  draftProtocol.value = resolvePreferredProtocol(source, protocols, protocol);
  draftAccount.value = resolvePreferredAccount(source, accounts);
  draftManualUsername.value = source.manualUsername || "";
  draftManualPassword.value = saved?.manualPassword || "";
  draftDynamicPassword.value = saved?.dynamicPassword || "";
  draftRememberSecret.value = !!saved?.rememberSecret;
  draftRememberSelection.value = !!saved;
  const methodMatches = source.protocol?.toLowerCase() === draftProtocol.value.toLowerCase();
  draftConnectMethod.value = methodMatches ? source.connectMethod || "" : "";
  draftConnectOptions.value = methodMatches ? { ...(source.connectOptions || {}) } : {};
};

const loadAsset = async () => {
  const request = activeRequest.value;
  if (!request) {
    currentAsset.value = null;
    return;
  }
  const sequence = ++loadSequence;
  loading.value = true;
  try {
    const hasDetails = request.asset.permedAccounts?.length && request.asset.permedProtocols?.length;
    const detail = hasDetails
      ? null
      : await getAssetDetailRequest(request.asset.id, userInfoStore.currentUser?.org?.id || "");
    if (sequence !== loadSequence || activeRequest.value?.id !== request.id) return;
    currentAsset.value = {
      ...request.asset,
      permedAccounts: detail?.permed_accounts ?? request.asset.permedAccounts ?? [],
      permedProtocols: (detail?.permed_protocols ?? request.asset.permedProtocols ?? []).filter(
        (protocol: PermedProtocol) => protocol?.name !== "winrm"
      )
    };
    initDraft(currentAsset.value, request.options.protocol);
  } catch (error) {
    if (sequence !== loadSequence || activeRequest.value?.id !== request.id) return;
    addErrorToast({
      title: t("Asset.GetAssetFailed"),
      description: String(error),
      icon: "i-lucide-circle-alert"
    });
    settle(null);
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
};

const buildConnectionInfo = (): ConnectionFormInfo | null => {
  if (!currentAsset.value) return null;
  let accountMode: ConnectionFormInfo["accountMode"] = "hosted";
  let account = draftAccount.value || "";
  let accountId: string | undefined;
  if (account === getManualInputLabel()) accountMode = "manual";
  if (account.includes("@ANON") || account === getAnonymousLabel()) {
    accountMode = "anonymous";
    account = "@ANON";
  }
  if (account.startsWith(t("Account.DynamicUser"))) {
    accountMode = "dynamic";
    const dynamic = currentAsset.value.permedAccounts?.find((item) => item.alias === "@USER");
    account = dynamic?.name || account.replace(/\(.+\)/, "");
  }
  if (accountMode === "hosted") {
    accountId = currentAsset.value.permedAccounts?.find(
      (item) => item.name === account || item.username === account || item.alias === account
    )?.id;
  }
  const availableProtocols = sortProtocolNames(
    getVisibleProtocols(currentAsset.value.permedProtocols || []).map((protocol) => protocol.name)
  );
  return {
    protocol: draftProtocol.value,
    account,
    accountId,
    accountMode,
    manualUsername: draftManualUsername.value,
    manualPassword: draftManualPassword.value,
    dynamicPassword: draftDynamicPassword.value,
    rememberSecret: draftRememberSecret.value,
    rememberSelection: draftRememberSelection.value,
    connectMethod: draftConnectMethod.value,
    connectOptions: { ...draftConnectOptions.value },
    availableProtocols
  };
};

const confirm = () => {
  const info = buildConnectionInfo();
  if (info) settle(info);
};
const cancel = () => settle(null);

watch(
  () => activeRequest.value?.id,
  () => void loadAsset(),
  { immediate: true }
);
</script>

<template>
  <UModal
    :open="!!activeRequest"
    :dismissible="false"
    :close="false"
    :title="modalTitle"
    :ui="{ content: 'w-[calc(100vw-3rem)] max-w-2xl' }"
  >
    <template #body>
      <div v-if="loading" class="grid min-h-72 place-items-center text-sm text-[var(--app-muted)]">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
      </div>
      <div v-else-if="currentAsset" @keydown.enter="confirm">
        <ConnectForm
          v-model:protocol="draftProtocol"
          v-model:account="draftAccount"
          v-model:manual-username="draftManualUsername"
          v-model:manual-password="draftManualPassword"
          v-model:dynamic-password="draftDynamicPassword"
          v-model:remember-secret="draftRememberSecret"
          v-model:connect-method="draftConnectMethod"
          v-model:connect-options="draftConnectOptions"
          :preferred-connect-method="preferredConnectMethod"
          :accounts="currentAsset.permedAccounts || []"
          :protocols="currentAsset.permedProtocols || []"
          asset-type="assets"
        />
        <div class="mt-4 flex items-center gap-1.5">
          <UCheckbox v-model="draftRememberSelection" :label="t('EditModal.RememberSelection')" />
          <UTooltip :text="t('EditModal.Description')">
            <UIcon name="i-lucide-circle-help" class="size-4 text-[var(--app-muted)]" />
          </UTooltip>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton :label="t('Common.Cancel')" color="neutral" variant="outline" @click="cancel" />
        <UButton :label="t('Common.Connect')" :disabled="loading || !currentAsset" @click="confirm" />
      </div>
    </template>
  </UModal>
</template>
