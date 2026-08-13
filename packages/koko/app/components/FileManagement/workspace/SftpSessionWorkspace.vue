<script setup lang="ts">
import type { ComponentPublicInstance } from "vue";
import type { useSftpTransferCoordinator } from "#koko/composables/sftp/file-manager/useSftpTransferCoordinator";
import type { useSftpWorkspacePanes } from "#koko/composables/sftp/file-manager/useSftpWorkspacePanes";
import type {
  SftpRemotePane,
  SftpRemotePaneHandle,
  SftpTransferCenterHandle
} from "#koko/composables/sftp/file-manager/workspaceTypes";
import KokoFileManagementPane from "#koko/components/FileManagement/pane.vue";
import KokoSftpTransferCenter from "#koko/components/FileManagement/SftpTransferCenter.vue";
import SftpRemoteMachineTabs from "#koko/components/FileManagement/workspace/SftpRemoteMachineTabs.vue";

type WorkspaceController = ReturnType<typeof useSftpWorkspacePanes>;
type TransferController = ReturnType<typeof useSftpTransferCoordinator>;
type TemplateRefValue = Element | ComponentPublicInstance | null;

const props = defineProps<{
  compact?: boolean;
  workspace: WorkspaceController;
  transfer: TransferController;
  startTour: () => void;
  setPrimaryPaneRef: (value: SftpRemotePaneHandle | null) => void;
  setTransferCenterRef: (value: SftpTransferCenterHandle | null) => void;
}>();

const { t } = useI18n();
const {
  activeRemoteId,
  closeOtherRemotePanes,
  closeRightRemotePanes,
  disconnectAllRemotes,
  dualMode,
  focusRemotePane,
  openRemoteConnect,
  primaryContext,
  primaryTransferEndpoint,
  reconnectRemotePane,
  remotePanes,
  removeRemotePane,
  setRemotePaneRef,
  setRemotePanesOrder,
  toggleDualMode,
  togglePinRemotePane
} = props.workspace;
const {
  activeTransferCount,
  connectTransferEndpoint,
  mountTransferEndpoint,
  openSendModal,
  queueSftpTransfer,
  remotePaneConnected,
  unmountTransferEndpoint
} = props.transfer;

function setPrimaryPaneRef(value: TemplateRefValue): void {
  props.setPrimaryPaneRef(value as SftpRemotePaneHandle | null);
}

function setTransferCenterRef(value: TemplateRefValue): void {
  props.setTransferCenterRef(value as SftpTransferCenterHandle | null);
}

function onSessionPanesUpdate(value: SftpRemotePane[]) {
  setRemotePanesOrder("right", value);
}
</script>

<template>
  <div
    v-if="!compact"
    class="sftp-file-management__topbar flex shrink-0 items-center justify-between gap-2 border-b border-default"
  >
    <div class="ml-auto flex items-center justify-end gap-1">
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-circle-help"
        :title="t('koko.fileManagement.featureTour')"
        :aria-label="t('koko.fileManagement.featureTour')"
        @click="startTour"
      />
      <KokoSftpTransferCenter :ref="setTransferCenterRef" />
      <UButton
        v-if="!dualMode && !remotePanes.length"
        data-sftp-tour="remote-connect"
        size="xs"
        color="primary"
        variant="soft"
        icon="i-lucide-plus"
        :label="t('koko.fileManagement.addRemoteSftp')"
        @click="openRemoteConnect()"
      />
      <UButton
        v-if="dualMode && remotePanes.length"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-unplug"
        :label="t('koko.fileManagement.disconnectAllRemote')"
        @click="disconnectAllRemotes"
      />
      <UButton
        v-if="dualMode || remotePanes.length"
        size="xs"
        color="neutral"
        variant="ghost"
        :icon="dualMode ? 'i-lucide-panel-right-close' : 'i-lucide-panel-right-open'"
        :title="t(dualMode ? 'Tree.Collapse' : 'Tree.Expand')"
        :aria-label="t(dualMode ? 'Tree.Collapse' : 'Tree.Expand')"
        @click="toggleDualMode"
      />
    </div>
  </div>

  <div class="flex min-h-0 flex-1" :class="!compact && dualMode ? 'gap-1' : ''">
    <KokoFileManagementPane
      :key="primaryTransferEndpoint?.id || 'primary-sftp'"
      :ref="setPrimaryPaneRef"
      class="min-h-0 min-w-0 flex-1"
      :context="primaryContext"
      :compact="compact"
      :transfer-endpoint="compact ? undefined : primaryTransferEndpoint"
      :title="!compact && dualMode ? t('koko.fileManagement.localSftp') : undefined"
      @send="openSendModal"
      @transfer-drop="queueSftpTransfer($event, primaryTransferEndpoint)"
      @transfer-endpoint-mounted="mountTransferEndpoint"
      @transfer-endpoint-connected="connectTransferEndpoint"
      @transfer-endpoint-unmounted="unmountTransferEndpoint"
    />

    <div v-show="!compact && dualMode" class="w-px shrink-0 bg-(--app-border)" />

    <div v-show="!compact && dualMode" class="flex min-h-0 min-w-0 flex-1 flex-col">
      <div v-if="remotePanes.length" class="flex min-h-0 flex-1 flex-col">
        <div
          class="sftp-file-management__machine-tabs flex shrink-0 items-center gap-1.5 border-b border-default bg-elevated/50"
        >
          <SftpRemoteMachineTabs
            :panes="remotePanes"
            :active-id="activeRemoteId"
            :transfer-count="activeTransferCount"
            :is-connected="remotePaneConnected"
            @update:panes="onSessionPanesUpdate"
            @select="focusRemotePane"
            @close="removeRemotePane"
            @reconnect="reconnectRemotePane"
            @close-others="closeOtherRemotePanes"
            @close-right="closeRightRemotePanes"
            @pin="togglePinRemotePane"
          />
          <UButton
            class="sftp-file-management__connect-button"
            data-sftp-tour="remote-connect"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-plus"
            :label="t('koko.fileManagement.connect')"
            :title="t('koko.fileManagement.addRemoteSftp')"
            @click="openRemoteConnect()"
          />
        </div>
        <div v-for="pane in remotePanes" v-show="activeRemoteId === pane.id" :key="pane.id" class="min-h-0 flex-1">
          <KokoFileManagementPane
            :ref="(value) => setRemotePaneRef(pane.id, value)"
            class="h-full min-h-0"
            :context="pane.context"
            :transfer-endpoint="pane.transferEndpoint"
            @select="
              pane.selection = $event;
              focusRemotePane(pane.id);
            "
            @send="openSendModal"
            @transfer-drop="queueSftpTransfer($event, pane.transferEndpoint)"
            @transfer-endpoint-mounted="mountTransferEndpoint"
            @transfer-endpoint-connected="connectTransferEndpoint"
            @transfer-endpoint-unmounted="unmountTransferEndpoint"
          />
        </div>
      </div>
      <div v-else class="grid h-full place-items-center p-4 text-center text-xs text-muted">
        <div class="space-y-2">
          <UIcon name="i-lucide-server" class="mx-auto size-6 opacity-60" />
          <p>{{ t("koko.fileManagement.remoteSftpHint") }}</p>
          <UButton size="xs" color="primary" variant="soft" @click="openRemoteConnect()">
            {{ t("koko.fileManagement.connectRemoteSftp") }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
