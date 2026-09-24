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
    headerActionTarget?: HTMLElement | null;
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
const { modernIsland, rdpResolution } = useSettingManager();
const { getMethodsForProtocol } = useConnectMethods();
const protocolMethods = shallowRef<ConnectMethod[]>([]);
const viewAssetOnlineSessionInfo = ref(false);
const hasXPack = shallowRef(false);
const appletClientEnabled = shallowRef<boolean>();
const connectionTokenReusable = shallowRef(false);
const onlineNum = ref<number | null>(null);
let onlineFetchGeneration = 0;
const showOnlineNum = computed(
  () => viewAssetOnlineSessionInfo.value && draft.value.protocol.trim().toLowerCase() === "rdp"
);
const submitLabel = computed(() => {
  if (!showOnlineNum.value) return props.submitLabel;
  return `${props.submitLabel} (${t("EditModal.CurrentOnline", { count: onlineNum.value ?? "-" })})`;
});
const credentialReady = computed(() => {
  const isManual = draft.value.account === "@INPUT" || draft.value.account === t("Account.ManualInput");
  if (isManual) {
    if (draft.value.personalCredentialId && !draft.value.savePersonalCredential) return true;
    if (draft.value.personalCredentialId && draft.value.personalCredentialVersion === undefined) return false;
    return !!draft.value.manualUsername.trim() && !!draft.value.manualPassword.trim();
  }
  if (draft.value.protocol.toLowerCase() === "sftp") return true;
  const accounts = props.asset.permedAccounts || [];
  const hosted =
    accounts.find((item) => draft.value.accountId && item.id === draft.value.accountId) ||
    accounts.find((item) => item.name === draft.value.account && !item.alias.startsWith("@"));
  return hosted?.has_secret === false ? !!draft.value.hostedSecret.trim() : true;
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
    !credentialReady.value
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
const patchConnectOptions = (options: Record<string, string | boolean>) => {
  draft.value = { ...draft.value, connectOptions: { ...draft.value.connectOptions, ...options } };
};
const rdpDownloadMethod = computed(() => {
  if (!hasXPack.value) return;
  const current = selectedMethod.value;
  if (current?.type === "applet" && !appletClientEnabled.value) return;
  if (canDownloadRdpFile(current, draft.value.connectOptions)) return current;
});

let connectionPreference: ReturnType<typeof getLunaPreferences> | undefined;
watch(
  [
    () => draft.value.protocol,
    () => hasXPack.value,
    () => draft.value.connectOptions.resolution,
    () => draft.value.connectOptions.remote_microphone
  ],
  async ([protocol, hasLicense, resolution, microphone], _previous, onCleanup) => {
    const needsResolution = !resolution;
    const needsMicrophone = hasLicense && microphone === undefined;
    if (protocol.trim().toLowerCase() !== "rdp" || (!needsResolution && !needsMicrophone)) return;
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });
    connectionPreference ??= getLunaPreferences().catch(() => ({}));
    const preferences = await connectionPreference;
    if (cancelled) return;
    patchConnectOptions({
      ...(needsResolution ? { resolution: preferences.graphics?.rdp_resolution || rdpResolution.value || "auto" } : {}),
      ...(needsMicrophone && preferences.graphics
        ? { remote_microphone: preferences.graphics.rdp_client_option?.includes("remote_microphone") ?? false }
        : {})
    });
  },
  { immediate: true }
);
watch(
  () =>
    [
      selectedMethod.value?.component,
      appletClientEnabled.value,
      draft.value.connectOptions.appletConnectMethod,
      draft.value.connectOptions.virtualappConnectMethod
    ] as const,
  async ([component, clientEnabled, appletSelected, virtualSelected], _previous, onCleanup) => {
    if (clientEnabled === undefined) return;
    if (component === "tinker") {
      if (!clientEnabled) {
        if (appletSelected !== "web") patchConnectOptions({ appletConnectMethod: "web" });
        return;
      }
      if (appletSelected === "web" || appletSelected === "client") return;
    } else if (component === "panda") {
      if (virtualSelected !== "web" && virtualSelected !== "client")
        patchConnectOptions({ virtualappConnectMethod: "web" });
      return;
    } else {
      return;
    }
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });
    connectionPreference ??= getLunaPreferences().catch(() => ({}));
    const preferences = await connectionPreference;
    if (cancelled) return;
    const fallback = preferences.graphics?.applet_connection_method === "client" ? "client" : "web";
    patchConnectOptions({ appletConnectMethod: fallback });
  },
  { immediate: true }
);
const downloadDisabled = computed(() => credentialsDisabled.value);
const submit = () => {
  if (!submitDisabled.value) emit("submit");
};
const downloadRdp = () => {
  if (!downloadDisabled.value && rdpDownloadMethod.value) emit("downloadRdp", rdpDownloadMethod.value.value);
};

watch(
  [() => draft.value.protocol, () => props.asset.id],
  async ([protocol, assetId]) => {
    protocolMethods.value = [];
    if (!protocol) {
      return;
    }
    try {
      const methods = await getMethodsForProtocol(protocol, assetId);
      if (protocol === draft.value.protocol && assetId === props.asset.id) protocolMethods.value = methods;
    } catch {
      if (protocol === draft.value.protocol && assetId === props.asset.id) protocolMethods.value = [];
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
    connectionTokenReusable.value = settings.CONNECTION_TOKEN_REUSABLE === true;
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
  <div class="connection-form-fields" @keydown.enter.prevent="submit">
    <Teleport v-if="headerActionTarget" :to="headerActionTarget">
      <UButton
        :label="props.submitLabel"
        :loading="props.submitting && !props.downloadingRdp"
        :disabled="submitDisabled"
        color="primary"
        variant="outline"
        size="xs"
        class="connection-form-mobile-submit h-7 shrink-0 justify-center px-2.5"
        @click="submit"
      />
    </Teleport>
    <ConnectForm
      v-model:protocol="draft.protocol"
      v-model:account="draft.account"
      v-model:account-id="draft.accountId"
      v-model:hosted-secret="draft.hostedSecret"
      v-model:input-secret-type="draft.inputSecretType"
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
      :asset-id="props.asset.id"
      :preferred-connect-method="props.preferredConnectMethod"
      :personal-credentials="props.personalCredentials"
      :personal-credentials-loading="props.personalCredentialsLoading"
      :personal-credentials-loaded="props.personalCredentialsLoaded"
      :personal-credentials-load-failed="props.personalCredentialsLoadFailed"
      :accounts="props.asset.permedAccounts || []"
      :protocols="props.asset.permedProtocols || []"
      :asset-type="props.assetType"
      :has-x-pack="hasXPack"
      :applet-client-enabled="appletClientEnabled === true"
      :connection-token-reusable="connectionTokenReusable"
    >
      <div class="connection-form-remember mt-4">
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
      <div class="connection-form-actions mt-6 mb-2 flex flex-wrap gap-2">
        <UButton
          :label="submitLabel"
          :loading="props.submitting && !props.downloadingRdp"
          :disabled="submitDisabled"
          :size="modernIsland ? 'md' : 'lg'"
          class="connection-form-submit flex-1 justify-center"
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
    </ConnectForm>
  </div>
</template>

<style scoped>
.connection-form-mobile-submit {
  display: none;
}

body.mobile .connection-form-fields {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

body.mobile .connection-form-mobile-submit {
  display: inline-flex;
}

body.mobile .connection-form-remember,
body.mobile .connection-form-actions {
  margin-top: 0.75rem;
}
</style>
