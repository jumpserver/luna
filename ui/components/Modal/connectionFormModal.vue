<script setup lang="ts">
import type { AssetItem } from "~/types";

import ConnectFormFields from "~/components/ConnectForm/fields.vue";

const { t } = useI18n();
const { addErrorToast } = useErrorToast();
const { activeRequest, settle } = useConnectionFormModal();
const { buildConnectionInfo, draft, initDraft, loadAssetDetails, preferredConnectMethod } = useConnectionFormState();

const currentAsset = ref<AssetItem | null>(null);
const loading = ref(false);
let loadSequence = 0;

const modalTitle = computed(() => {
  const request = activeRequest.value;
  const progress = request?.options.total ? ` (${request.options.position || 1}/${request.options.total})` : "";
  return `${t("EditModal.ModifyConnectionInfo")}${progress} - ${request?.asset.name || ""}`;
});
const loadAsset = async () => {
  const request = activeRequest.value;
  if (!request) {
    currentAsset.value = null;
    return;
  }
  const sequence = ++loadSequence;
  loading.value = true;
  try {
    const asset = await loadAssetDetails(request.asset);
    if (sequence !== loadSequence || activeRequest.value?.id !== request.id) return;
    currentAsset.value = asset;
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

const confirm = () => {
  if (currentAsset.value) settle(buildConnectionInfo(currentAsset.value));
};
const cancel = () => settle(null);
const updateOpen = (open: boolean) => {
  if (!open) cancel();
};

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
    :title="modalTitle"
    :ui="{
      content: 'w-[calc(100vw-3rem)] max-w-2xl',
      header: 'min-h-12 p-3 sm:px-4',
      title: 'text-sm leading-5',
      close: 'top-2 end-2 size-7 p-1',
      body: 'pt-2 sm:pt-2'
    }"
    @update:open="updateOpen"
  >
    <template #body>
      <div v-if="loading" class="grid min-h-72 place-items-center text-sm text-[var(--app-muted)]">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
      </div>
      <div v-else-if="currentAsset">
        <ConnectFormFields
          v-model:draft="draft"
          :asset="currentAsset"
          :preferred-connect-method="preferredConnectMethod"
          :submit-label="t('Common.Connect')"
          asset-type="assets"
          @submit="confirm"
        />
      </div>
    </template>
  </UModal>
</template>
