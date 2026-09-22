<script setup lang="ts">
import type { AssetItem } from "~/types";

import ConnectFormSkeleton from "~/components/ConnectForm/connectFormSkeleton.vue";
import ConnectFormFields from "~/components/ConnectForm/fields.vue";

const { t } = useI18n();
const { addErrorToast } = useErrorToast();
const { activeRequest, settle } = useConnectionFormModal();
const { confirmConnection } = useAssetConnection();
const {
  buildConnectionInfo,
  draft,
  initDraft,
  loadAssetDetails,
  personalCredentials,
  personalCredentialsLoaded,
  personalCredentialsLoading,
  personalCredentialsLoadFailed,
  preferredConnectMethod
} = useConnectionFormState();

const currentAsset = ref<AssetItem | null>(null);
const loading = ref(false);
const downloadingRdp = shallowRef(false);
const headerActionTarget = shallowRef<HTMLElement | null>(null);
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
const downloadRdp = async (connectMethod: string) => {
  if (!currentAsset.value || downloadingRdp.value) return;
  downloadingRdp.value = true;
  try {
    await confirmConnection(currentAsset.value, {
      ...buildConnectionInfo(currentAsset.value),
      connectMethod,
      downloadRdp: true,
      onSessionReady: () => {
        downloadingRdp.value = false;
      },
      onSessionError: () => {
        downloadingRdp.value = false;
      }
    });
  } catch (error) {
    downloadingRdp.value = false;
    addErrorToast({ title: t("ConnectError.DownloadRdpFailed"), description: String(error) });
  }
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
      content: 'connection-form-modal w-[calc(100vw-3rem)] max-w-2xl',
      header: 'min-h-12 p-3 sm:px-4',
      title: 'connection-form-modal-title text-sm leading-5',
      close: 'connection-form-modal-close top-2 end-2 size-7 p-1',
      body: 'connection-form-modal-body pt-1 sm:pt-1'
    }"
    @update:open="updateOpen"
  >
    <template #actions>
      <div ref="headerActionTarget" class="connection-form-modal-action-target" />
    </template>
    <template #body>
      <ConnectFormSkeleton v-if="loading" />
      <div v-else-if="currentAsset" class="connection-form-modal-fields">
        <ConnectFormFields
          v-model:draft="draft"
          :asset="currentAsset"
          :preferred-connect-method="preferredConnectMethod"
          :personal-credentials="personalCredentials"
          :personal-credentials-loading="personalCredentialsLoading"
          :personal-credentials-loaded="personalCredentialsLoaded"
          :personal-credentials-load-failed="personalCredentialsLoadFailed"
          :submit-label="t('Common.Connect')"
          :submitting="downloadingRdp"
          :downloading-rdp="downloadingRdp"
          :header-action-target="headerActionTarget"
          asset-type="assets"
          @submit="confirm"
          @download-rdp="downloadRdp"
        />
      </div>
    </template>
  </UModal>
</template>

<style>
.connection-form-modal-action-target {
  display: none;
}

body.mobile .connection-form-modal-action-target {
  display: flex;
  flex-shrink: 0;
  order: -1;
  margin-inline-end: 4px;
}

body.mobile .connection-form-modal {
  width: calc(100vw - 1rem);
  height: calc(100dvh - 1rem);
  max-height: calc(100dvh - 1rem);
}

body.mobile .connection-form-modal-body,
body.mobile .connection-form-modal-fields {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

body.mobile .connection-form-modal-body {
  padding: 4px 12px 8px;
}

body.mobile .connection-form-modal-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

body.mobile .connection-form-modal-close {
  position: static;
  flex-shrink: 0;
  margin-inline-start: 4px;
}
</style>
