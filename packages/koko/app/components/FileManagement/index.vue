<script setup lang="ts">
import type {
  FileWorkspaceSourceAsset,
  SftpLocalPaneHandle,
  SftpRemotePaneHandle,
  SftpTransferCenterHandle
} from "#koko/composables/sftp/file-manager/workspaceTypes";
import SftpConnectModal from "#koko/components/FileManagement/workspace/SftpConnectModal.vue";
import SftpGlobalWorkspace from "#koko/components/FileManagement/workspace/SftpGlobalWorkspace.vue";
import SftpSendModal from "#koko/components/FileManagement/workspace/SftpSendModal.vue";
import SftpSessionWorkspace from "#koko/components/FileManagement/workspace/SftpSessionWorkspace.vue";
import { useSftpTransferCoordinator } from "#koko/composables/sftp/file-manager/useSftpTransferCoordinator";
import { useSftpWorkspacePanes } from "#koko/composables/sftp/file-manager/useSftpWorkspacePanes";
import { useSftpTour } from "#koko/composables/sftp/useSftpTour";

const props = defineProps<{
  sftpToken?: string;
  showEmpty?: boolean;
  global?: boolean;
  /** Single-pane lightweight mode for the SSH right-panel SFTP surface. */
  compact?: boolean;
  /** Asset that owns the primary SFTP session (for upgrade into the workbench). */
  sourceAsset?: FileWorkspaceSourceAsset | null;
}>();

const emit = defineEmits<{ reconnect: [] }>();

const { t } = useI18n();
const sftpTour = useSftpTour();
const { addErrorToast: showErrorToast } = useErrorToast();
const translate = (key: string, params?: Record<string, unknown>) => String(params ? t(key, params) : t(key));

function addErrorToast(title: string, error: unknown): void {
  showErrorToast({ title, error });
}

const primaryPaneRef = ref<SftpRemotePaneHandle | null>(null);
const transferCenterRef = ref<SftpTransferCenterHandle | null>(null);
const localPaneRef = ref<SftpLocalPaneHandle | null>(null);
let tourTimer: ReturnType<typeof setTimeout> | undefined;

const workspace = useSftpWorkspacePanes({
  sftpToken: () => props.sftpToken,
  global: () => props.global,
  sourceAsset: () => props.sourceAsset,
  translate,
  showError: addErrorToast
});
const {
  activePaneForSide,
  activeRemoteId,
  currentOrgLabel,
  globalActiveIds,
  initializeGlobalWorkspace,
  primaryTransferEndpoint,
  remotePaneRefs,
  remotePanes
} = workspace;

const transfer = useSftpTransferCoordinator({
  activePaneForSide,
  activeRemoteId,
  currentOrgLabel,
  globalActiveIds,
  primaryPaneRef,
  primaryTransferEndpoint,
  remotePaneRefs,
  remotePanes,
  localPaneRef,
  transferCenterRef,
  translate,
  showError: addErrorToast
});

onMounted(() => {
  initializeGlobalWorkspace();
  // Compact right-panel SFTP is intentionally single-pane and tour-free.
  if (!props.global && !props.compact && !props.showEmpty) {
    tourTimer = setTimeout(() => void sftpTour.startOnce(), 650);
  }
});

onBeforeUnmount(() => {
  if (tourTimer) clearTimeout(tourTimer);
  sftpTour.destroy();
});

function setPrimaryPaneRef(value: SftpRemotePaneHandle | null): void {
  primaryPaneRef.value = value;
}

function setTransferCenterRef(value: SftpTransferCenterHandle | null): void {
  transferCenterRef.value = value;
}

function setLocalPaneRef(value: SftpLocalPaneHandle | null): void {
  localPaneRef.value = value;
}
</script>

<template>
  <div v-if="showEmpty" class="grid h-full place-items-center p-6 text-sm text-muted">
    <div class="flex flex-col items-center gap-3">
      <UIcon name="i-lucide-circle-alert" class="size-7" />
      <p>{{ t("koko.fileManagement.expired") }}</p>
      <UButton size="sm" @click="void emit('reconnect')">
        {{ t("koko.fileManagement.reconnect") }}
      </UButton>
    </div>
  </div>
  <div
    v-else
    class="sftp-file-management flex h-full min-h-0 flex-col"
    :class="{ 'sftp-file-management--compact': compact }"
    data-sftp-tour="workspace"
  >
    <SftpGlobalWorkspace
      v-if="global"
      :workspace="workspace"
      :transfer="transfer"
      :set-local-pane-ref="setLocalPaneRef"
      :set-transfer-center-ref="setTransferCenterRef"
    />
    <SftpSessionWorkspace
      v-else
      :compact="compact"
      :workspace="workspace"
      :transfer="transfer"
      :start-tour="sftpTour.start"
      :set-primary-pane-ref="setPrimaryPaneRef"
      :set-transfer-center-ref="setTransferCenterRef"
    />
    <SftpConnectModal :workspace="workspace" />
    <SftpSendModal :transfer="transfer" />
  </div>
</template>
