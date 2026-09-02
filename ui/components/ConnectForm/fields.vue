<script setup lang="ts">
import type { ConnectionFormDraft } from "~/composables/useConnectionFormState";
import type { AssetItem, AssetPageType } from "~/types";

import ConnectForm from "~/components/ConnectForm/connectForm.vue";

const props = withDefaults(
  defineProps<{
    asset: AssetItem;
    assetType?: AssetPageType;
    disabled?: boolean;
    preferredConnectMethod?: string;
    submitLabel: string;
    submitting?: boolean;
  }>(),
  {
    assetType: "assets",
    disabled: false,
    preferredConnectMethod: "",
    submitting: false
  }
);
const emit = defineEmits<{ submit: [] }>();
const draft = defineModel<ConnectionFormDraft>("draft", { required: true });

const { t } = useI18n();
const { modernIsland } = useSettingManager();
</script>

<template>
  <div @keydown.enter="emit('submit')">
    <ConnectForm
      v-model:protocol="draft.protocol"
      v-model:account="draft.account"
      v-model:manual-username="draft.manualUsername"
      v-model:manual-password="draft.manualPassword"
      v-model:dynamic-password="draft.dynamicPassword"
      v-model:remember-secret="draft.rememberSecret"
      v-model:connect-method="draft.connectMethod"
      v-model:connect-options="draft.connectOptions"
      :preferred-connect-method="props.preferredConnectMethod"
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
      :disabled="props.disabled"
      :size="modernIsland ? 'md' : 'lg'"
      class="mt-6 mb-2 w-full justify-center"
      :class="modernIsland ? '' : 'uppercase tracking-[0.08em]'"
      @click="emit('submit')"
    />
  </div>
</template>
