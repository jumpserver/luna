<script setup lang="ts">
import type { ConnectionFormDraft } from "~/composables/useConnectionFormState";
import type { ConnectMethod } from "~/composables/useConnectMethods";
import type { AssetItem, AssetPageType, PersonalAssetCredential } from "~/types";

import ConnectForm from "~/components/ConnectForm/connectForm.vue";
import { getLunaPreferences, getPublicSettings, getSessionOnlineNum } from "~/composables/useApiRequest";
import {
  canDownloadRdpFile,
  parseLocalApplicationConnectMethod,
  useConnectMethods
} from "~/composables/useConnectMethods";
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
    downloadingRdp?: boolean;
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
const emit = defineEmits<{ submit: []; downloadRdp: [connectMethod: string] }>();
const draft = defineModel<ConnectionFormDraft>("draft", { required: true });

const { t } = useI18n();
const { modernIsland } = useSettingManager();
const { formFieldUi, controlBaseUi, overlayMenuUi } = useConnectFormAppearance();
const { getMethodsForProtocol } = useConnectMethods();
const protocolMethods = shallowRef<ConnectMethod[]>([]);
const viewAssetOnlineSessionInfo = ref(false);
const hasXPack = shallowRef(false);
const appletClientEnabled = shallowRef<boolean>();
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
  protocolMethods.value.some(
    (method) =>
      method.value === parseLocalApplicationConnectMethod(draft.value.connectMethod).connectMethod && method.disabled
  )
);
const credentialsDisabled = computed(
  () =>
    props.disabled ||
    props.submitting ||
    !draft.value.protocol ||
    !props.asset.permedAccounts?.length ||
    !manualCredentialReady.value
);
const selectedMethod = computed(() => {
  const selected = parseLocalApplicationConnectMethod(draft.value.connectMethod).connectMethod;
  return protocolMethods.value.find((method) => method.value === selected);
});
const isAppletMethod = computed(() => selectedMethod.value?.type === "applet");
const appletOptionsLoading = computed(
  () =>
    isAppletMethod.value &&
    (appletClientEnabled.value === undefined ||
      !["web", "client"].includes(draft.value.connectOptions.appletConnectMethod))
);
const submitDisabled = computed(
  () => credentialsDisabled.value || !draft.value.connectMethod || methodDisabled.value || appletOptionsLoading.value
);
const appletConnectMethodItems = computed(() => [
  { label: t("Menu.Web"), value: "web" },
  ...(appletClientEnabled.value ? [{ label: t("ConnectionSetup.Client"), value: "client" }] : [])
]);
const appletConnectMethod = computed<string>({
  get: () => draft.value.connectOptions.appletConnectMethod || "web",
  set: (value) => {
    draft.value = { ...draft.value, connectOptions: { ...draft.value.connectOptions, appletConnectMethod: value } };
  }
});
const rdpDownloadMethod = computed(() => {
  if (!hasXPack.value) return;
  const current = selectedMethod.value;
  if (current?.type === "applet" && !appletClientEnabled.value) return;
  if (canDownloadRdpFile(current, draft.value.connectOptions)) return current;
});

let appletPreference: ReturnType<typeof getLunaPreferences> | undefined;
watch(
  () => [isAppletMethod.value, appletClientEnabled.value, draft.value.connectOptions.appletConnectMethod] as const,
  async ([isApplet, clientEnabled, selected], _previous, onCleanup) => {
    if (!isApplet || clientEnabled === undefined) return;
    if (!clientEnabled) {
      if (selected !== "web") appletConnectMethod.value = "web";
      return;
    }
    if (selected === "web" || selected === "client") return;
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });
    appletPreference ??= getLunaPreferences().catch(() => ({}));
    const preferences = await appletPreference;
    if (!cancelled)
      appletConnectMethod.value = preferences.graphics?.applet_connection_method === "client" ? "client" : "web";
  },
  { immediate: true }
);
const downloadDisabled = computed(() => {
  const account = props.asset.permedAccounts?.find((item) =>
    [item.name, item.username, item.alias].includes(draft.value.account)
  );
  return credentialsDisabled.value || (!!account && !account.alias.startsWith("@") && !account.has_secret);
});
const submit = () => {
  if (!submitDisabled.value) emit("submit");
};
const downloadRdp = () => {
  if (!downloadDisabled.value && rdpDownloadMethod.value) emit("downloadRdp", rdpDownloadMethod.value.value);
};

watch(
  () => draft.value.protocol,
  async (protocol) => {
    protocolMethods.value = [];
    if (!protocol) {
      return;
    }
    try {
      const methods = await getMethodsForProtocol(protocol);
      if (protocol === draft.value.protocol) protocolMethods.value = methods;
    } catch {
      if (protocol === draft.value.protocol) protocolMethods.value = [];
    }
  },
  { immediate: true }
);

onMounted(async () => {
  try {
    const settings = await getPublicSettings();
    viewAssetOnlineSessionInfo.value = settings.VIEW_ASSET_ONLINE_SESSION_INFO === true;
    hasXPack.value = settings.XPACK_LICENSE_IS_VALID === true;
    appletClientEnabled.value = hasXPack.value && settings.TERMINAL_RAZOR_ENABLED === true;
  } catch {
    viewAssetOnlineSessionInfo.value = false;
    appletClientEnabled.value = false;
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
  <div @keydown.enter.prevent="submit">
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
    <UFormField
      v-if="isAppletMethod"
      :label="t('EditModal.AppletConnectMethod')"
      :ui="formFieldUi"
      size="sm"
      class="mt-4"
    >
      <USelect
        v-model="appletConnectMethod"
        :items="appletConnectMethodItems"
        :disabled="props.disabled || props.submitting || appletOptionsLoading"
        :loading="appletOptionsLoading"
        :ui="{ base: controlBaseUi, ...overlayMenuUi }"
        trailing-icon="i-lucide-chevrons-up-down"
        class="w-full"
        size="md"
      />
    </UFormField>
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
    <div class="mt-6 mb-2 flex flex-wrap gap-2">
      <UButton
        :label="submitLabel"
        :loading="props.submitting && !props.downloadingRdp"
        :disabled="submitDisabled"
        :size="modernIsland ? 'md' : 'lg'"
        class="flex-1 justify-center"
        :class="modernIsland ? '' : 'uppercase tracking-[0.08em]'"
        @click="submit"
      />
      <UButton
        v-if="rdpDownloadMethod"
        type="button"
        icon="i-lucide-download"
        color="neutral"
        variant="outline"
        :label="t('EditModal.DownloadRdpFile')"
        :loading="props.downloadingRdp"
        :disabled="downloadDisabled"
        :size="modernIsland ? 'md' : 'lg'"
        class="flex-1 justify-center"
        @keydown.enter.stop
        @click="downloadRdp"
      />
    </div>
  </div>
</template>
