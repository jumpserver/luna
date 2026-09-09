<script setup lang="ts">
import type { ConnectionFormDraft } from "~/composables/useConnectionFormState";
import type { ConnectMethod } from "~/composables/useConnectMethods";
import type { AssetItem, AssetPageType, PersonalAssetCredential } from "~/types";

import ConnectForm from "~/components/ConnectForm/connectForm.vue";
import { getPublicSettings, getSessionOnlineNum } from "~/composables/useApiRequest";
import { useConnectMethods } from "~/composables/useConnectMethods";
import { resolveOnlineSessionAccount } from "./onlineSession";

const props = withDefaults(
  defineProps<{
    asset: AssetItem;
    assetType?: AssetPageType;
    disabled?: boolean;
    preferredConnectMethod?: string;
    personalCredentials?: PersonalAssetCredential[];
    personalCredentialsLoading?: boolean;
    personalCredentialsLoaded?: boolean;
    personalCredentialsLoadFailed?: boolean;
    submitLabel: string;
    submitting?: boolean;
  }>(),
  {
    assetType: "assets",
    disabled: false,
    preferredConnectMethod: "",
    personalCredentials: () => [],
    personalCredentialsLoading: false,
    personalCredentialsLoaded: false,
    personalCredentialsLoadFailed: false,
    submitting: false
  }
);
const emit = defineEmits<{ submit: [] }>();
const draft = defineModel<ConnectionFormDraft>("draft", { required: true });

const { t } = useI18n();
const { modernIsland } = useSettingManager();
const { getMethodsForProtocol } = useConnectMethods();
const protocolMethods = shallowRef<ConnectMethod[]>([]);
const viewAssetOnlineSessionInfo = ref(false);
const onlineNum = ref<number | null>(null);
let onlineFetchGeneration = 0;
const showOnlineNum = computed(
  () => viewAssetOnlineSessionInfo.value && draft.value.protocol.trim().toLowerCase() === "rdp"
);
const submitLabel = computed(() => {
  if (!showOnlineNum.value) return props.submitLabel;
  return `${props.submitLabel} (${t("EditModal.CurrentOnline", { count: onlineNum.value ?? "-" })})`;
});
const manualCredentialReady = computed(() => {
  const isManual = draft.value.account === "@INPUT" || draft.value.account === t("Account.ManualInput");
  if (!isManual) return true;
  if (draft.value.personalCredentialId && !draft.value.savePersonalCredential) return true;
  if (draft.value.personalCredentialId && draft.value.personalCredentialVersion === undefined) return false;
  return !!draft.value.manualUsername.trim() && !!draft.value.manualPassword;
});
const methodDisabled = computed(() =>
  protocolMethods.value.some((method) => method.value === draft.value.connectMethod && method.disabled)
);
const submitDisabled = computed(
  () => props.disabled || !props.asset.permedAccounts?.length || !manualCredentialReady.value || methodDisabled.value
);
const submit = () => {
  if (!submitDisabled.value) emit("submit");
};

watch(
  () => draft.value.protocol,
  async (protocol) => {
    if (!protocol) {
      protocolMethods.value = [];
      return;
    }
    try {
      protocolMethods.value = await getMethodsForProtocol(protocol);
    } catch {
      protocolMethods.value = [];
    }
  },
  { immediate: true }
);

onMounted(async () => {
  try {
    const settings = await getPublicSettings();
    viewAssetOnlineSessionInfo.value = settings.VIEW_ASSET_ONLINE_SESSION_INFO === true;
  } catch {
    viewAssetOnlineSessionInfo.value = false;
  }
});

watchDebounced(
  () => ({
    enabled: viewAssetOnlineSessionInfo.value,
    protocol: draft.value.protocol,
    account: draft.value.account,
    manualUsername: draft.value.manualUsername,
    personalCredentialUsername: props.personalCredentials.find(
      (credential) => credential.id === draft.value.personalCredentialId
    )?.username,
    assetId: props.asset.id
  }),
  async (query) => {
    const account = resolveOnlineSessionAccount({
      enabled: query.enabled,
      protocol: query.protocol,
      accounts: props.asset.permedAccounts || [],
      selectedAccount: query.account,
      manualUsername: query.manualUsername,
      personalCredentialUsername: query.personalCredentialUsername,
      manualInputLabel: t("Account.ManualInput")
    });
    const generation = ++onlineFetchGeneration;
    onlineNum.value = null;
    if (!import.meta.client || !account || !query.assetId) return;
    try {
      const data = await getSessionOnlineNum(query.assetId, account);
      if (generation !== onlineFetchGeneration) return;
      onlineNum.value = typeof data.count === "number" ? data.count : null;
    } catch {
      if (generation !== onlineFetchGeneration) return;
      onlineNum.value = null;
    }
  },
  { debounce: 500, immediate: true }
);
</script>

<template>
  <div @keydown.enter="submit">
    <ConnectForm
      v-model:protocol="draft.protocol"
      v-model:account="draft.account"
      v-model:manual-username="draft.manualUsername"
      v-model:manual-password="draft.manualPassword"
      v-model:personal-credential-id="draft.personalCredentialId"
      v-model:personal-credential-version="draft.personalCredentialVersion"
      v-model:personal-credential-secret-type="draft.personalCredentialSecretType"
      v-model:save-personal-credential="draft.savePersonalCredential"
      v-model:dynamic-password="draft.dynamicPassword"
      v-model:remember-secret="draft.rememberSecret"
      v-model:connect-method="draft.connectMethod"
      v-model:connect-options="draft.connectOptions"
      :preferred-connect-method="props.preferredConnectMethod"
      :personal-credentials="props.personalCredentials"
      :personal-credentials-loading="props.personalCredentialsLoading"
      :personal-credentials-loaded="props.personalCredentialsLoaded"
      :personal-credentials-load-failed="props.personalCredentialsLoadFailed"
      :accounts="props.asset.permedAccounts || []"
      :protocols="props.asset.permedProtocols || []"
      :asset-type="props.assetType"
    />
    <div class="mt-4">
      <UCheckbox
        v-model="draft.rememberSelection"
        icon="i-lucide-check"
        :label="t('EditModal.RememberSelection')"
        :description="t('EditModal.RememberSelectionDescription')"
        :ui="{ description: 'text-xs leading-5' }"
      />
    </div>
    <p v-if="methodDisabled" class="mt-4 text-xs text-[var(--app-muted)]">
      {{ t("ConnectError.MethodDisabled") }}
    </p>
    <UButton
      :label="submitLabel"
      :loading="props.submitting"
      :disabled="submitDisabled"
      :size="modernIsland ? 'md' : 'lg'"
      class="mt-6 mb-2 w-full justify-center"
      :class="modernIsland ? '' : 'uppercase tracking-[0.08em]'"
      @click="submit"
    />
  </div>
</template>
