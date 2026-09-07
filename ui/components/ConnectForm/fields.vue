<script setup lang="ts">
import type { ConnectionFormDraft } from "~/composables/useConnectionFormState";
import type { AssetItem, AssetPageType, PersonalAssetCredential } from "~/types";

import ConnectForm from "~/components/ConnectForm/connectForm.vue";

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
const manualCredentialReady = computed(() => {
  const isManual = draft.value.account === "@INPUT" || draft.value.account === t("Account.ManualInput");
  if (!isManual) return true;
  if (draft.value.personalCredentialId && !draft.value.savePersonalCredential) return true;
  if (draft.value.personalCredentialId && draft.value.personalCredentialVersion === undefined) return false;
  return !!draft.value.manualUsername.trim() && !!draft.value.manualPassword;
});
const submitDisabled = computed(() => props.disabled || !manualCredentialReady.value);
const submit = () => {
  if (!submitDisabled.value) emit("submit");
};
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
    <UButton
      :label="props.submitLabel"
      :loading="props.submitting"
      :disabled="submitDisabled"
      :size="modernIsland ? 'md' : 'lg'"
      class="mt-6 mb-2 w-full justify-center"
      :class="modernIsland ? '' : 'uppercase tracking-[0.08em]'"
      @click="submit"
    />
  </div>
</template>
