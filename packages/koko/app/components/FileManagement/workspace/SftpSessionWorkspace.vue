<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
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
import SftpTransferRail from "#koko/components/FileManagement/workspace/SftpTransferRail.vue";

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
  markRemotePaneConnected,
  openRemoteConnect,
  primaryAssetName,
  primaryContext,
  primaryTransferEndpoint,
  reconnectRemotePane,
  remotePanes,
  removeRemotePane,
  setRemotePaneRef,
  setRemotePanesOrder,
  togglePinRemotePane
} = props.workspace;
const {
  activeTransferCount,
  canSendToOpposite,
  connectTransferEndpoint,
  isSimplePeerMode,
  mountTransferEndpoint,
  queueSftpTransferToSelected,
  remotePaneConnected,
  sendFromSelection,
  transferGlobal,
  transferring,
  unmountTransferEndpoint
} = props.transfer;

const simplePeerMode = computed(() => Boolean(dualMode.value && isSimplePeerMode()));

const primarySendPeerDirection = computed<"left" | "right" | undefined>(() =>
  simplePeerMode.value && canSendToOpposite(primaryTransferEndpoint.value?.id) ? "right" : undefined
);

function remoteSendPeerDirection(endpointId: string): "left" | "right" | undefined {
  return simplePeerMode.value && canSendToOpposite(endpointId) ? "left" : undefined;
}

const canUseTransferRail = computed(() =>
  Boolean(!props.compact && dualMode.value && activeRemoteId.value && remotePaneConnected(activeRemoteId.value))
);

function setPrimaryPaneRef(value: TemplateRefValue): void {
  props.setPrimaryPaneRef(value as SftpRemotePaneHandle | null);
}

function setTransferCenterRef(value: TemplateRefValue): void {
  props.setTransferCenterRef(value as SftpTransferCenterHandle | null);
}

function onSessionPanesUpdate(value: SftpRemotePane[]) {
  setRemotePanesOrder("right", value);
}

function handleRemotePaneConnected(): void {
  connectTransferEndpoint();
  markRemotePaneConnected();
}

const remoteOverflowItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: t("koko.fileManagement.disconnectAllRemote"),
      icon: "i-lucide-unplug",
      color: "error" as const,
      onSelect: () => disconnectAllRemotes()
    }
  ]
]);
</script>

<template>
  <div class="relative flex min-h-0 flex-1">
    <KokoSftpTransferCenter v-if="!compact" :ref="setTransferCenterRef" floating />

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <!-- Dual-pane: match right machine-tab strip height with a fixed primary identity row. -->
      <div
        v-if="!compact && dualMode"
        class="sftp-file-management__machine-tabs flex h-9 shrink-0 items-center gap-1 bg-[var(--workspace-surface-main)] px-2"
      >
        <div
          class="flex h-7 min-w-20 max-w-40 items-center gap-1 rounded-md bg-accented px-1.5 text-[11px] leading-none text-highlighted"
          :title="primaryAssetName"
        >
          <UIcon name="i-lucide-server" class="size-3.5 shrink-0 text-success" />
          <span class="min-w-0 truncate">{{ primaryAssetName }}</span>
        </div>
      </div>
      <KokoFileManagementPane
        :key="primaryTransferEndpoint?.id || 'primary-sftp'"
        :ref="setPrimaryPaneRef"
        class="min-h-0 min-w-0 flex-1"
        :context="primaryContext"
        :context-label="!compact && !dualMode ? primaryAssetName : undefined"
        :show-workbench-actions="!compact && !dualMode"
        :compact="compact"
        :transfer-endpoint="compact ? undefined : primaryTransferEndpoint"
        :send-peer-direction="primarySendPeerDirection"
        @send="sendFromSelection"
        @transfer-drop="queueSftpTransferToSelected($event, primaryTransferEndpoint)"
        @transfer-endpoint-mounted="mountTransferEndpoint"
        @transfer-endpoint-connected="connectTransferEndpoint"
        @transfer-endpoint-unmounted="unmountTransferEndpoint"
        @add-remote="openRemoteConnect()"
        @start-tour="startTour"
      />
    </div>

    <SftpTransferRail
      v-if="canUseTransferRail"
      mode="session"
      :can-transfer-right="canUseTransferRail"
      :can-transfer-left="canUseTransferRail"
      :transferring="transferring"
      @transfer="transferGlobal"
    />

    <div
      v-show="!compact && dualMode"
      class="flex min-h-0 min-w-0 flex-1 flex-col"
      :class="canUseTransferRail ? '' : 'border-l border-default'"
    >
      <div
        class="sftp-file-management__machine-tabs flex h-9 shrink-0 items-center gap-1 bg-[var(--workspace-surface-main)] px-2"
      >
        <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
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
        </div>
        <!-- Dual-pane: + / help / … always trail the right tab strip (1 or N remotes). -->
        <div class="flex shrink-0 items-center gap-0.5">
          <UTooltip :text="t('koko.fileManagement.addRemoteSftp')">
            <UButton
              data-sftp-tour="remote-connect"
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-plus"
              class="shrink-0"
              :aria-label="t('koko.fileManagement.addRemoteSftp')"
              @click="openRemoteConnect()"
            />
          </UTooltip>
          <UTooltip :text="t('koko.fileManagement.featureTour')">
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-circle-help"
              :aria-label="t('koko.fileManagement.featureTour')"
              @click="startTour"
            />
          </UTooltip>
          <UDropdownMenu :items="remoteOverflowItems" size="sm" :content="{ align: 'end', side: 'bottom' }">
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-ellipsis"
              class="shrink-0"
              :aria-label="t('Common.More')"
              :title="t('Common.More')"
            />
          </UDropdownMenu>
        </div>
      </div>
      <div v-for="pane in remotePanes" v-show="activeRemoteId === pane.id" :key="pane.id" class="min-h-0 flex-1">
        <KokoFileManagementPane
          :ref="(value) => setRemotePaneRef(pane.id, value)"
          class="h-full min-h-0"
          :context="pane.context"
          :transfer-endpoint="pane.transferEndpoint"
          :send-peer-direction="remoteSendPeerDirection(pane.transferEndpoint.id)"
          @select="
            pane.selection = $event;
            focusRemotePane(pane.id);
          "
          @send="sendFromSelection"
          @transfer-drop="queueSftpTransferToSelected($event, pane.transferEndpoint)"
          @transfer-endpoint-mounted="mountTransferEndpoint"
          @transfer-endpoint-connected="handleRemotePaneConnected"
          @transfer-endpoint-unmounted="unmountTransferEndpoint"
        />
      </div>
    </div>
  </div>
</template>
