<script setup lang="ts">
import type { ComponentPublicInstance } from "vue";
import type { useSftpTransferCoordinator } from "#koko/composables/sftp/file-manager/useSftpTransferCoordinator";
import type { useSftpWorkspacePanes } from "#koko/composables/sftp/file-manager/useSftpWorkspacePanes";
import type { SftpLocalPaneHandle, SftpRemotePane, SftpTransferCenterHandle, SftpWorkspaceSide  } from "#koko/composables/sftp/file-manager/workspaceTypes";
import KokoLocalFileManagementPane from "#koko/components/FileManagement/localPane.vue";
import KokoFileManagementPane from "#koko/components/FileManagement/pane.vue";
import KokoSftpTransferCenter from "#koko/components/FileManagement/SftpTransferCenter.vue";
import KokoWebUploadPane from "#koko/components/FileManagement/webUploadPane.vue";
import SftpRemoteMachineTabs from "#koko/components/FileManagement/workspace/SftpRemoteMachineTabs.vue";
import { KeyboardKey } from "#koko/constants/keyboard";

type WorkspaceController = ReturnType<typeof useSftpWorkspacePanes>;
type TransferController = ReturnType<typeof useSftpTransferCoordinator>;
type TemplateRefValue = Element | ComponentPublicInstance | null;

const props = defineProps<{
  workspace: WorkspaceController;
  transfer: TransferController;
  setLocalPaneRef: (value: SftpLocalPaneHandle | null) => void;
  setTransferCenterRef: (value: SftpTransferCenterHandle | null) => void;
}>();

const { t } = useI18n();
const focusedSide = ref<"left" | "right">("left");
const {
  activePaneForSide,
  closeOtherRemotePanes,
  closeRightRemotePanes,
  globalActiveIds,
  isTauriRuntime,
  openRemoteConnect,
  panesForSide,
  preconnecting,
  preconnectingName,
  recentConnections,
  reconnectRecent,
  reconnectRemotePane,
  removeRemotePane,
  setRemotePaneRef,
  setRemotePanesOrder,
  togglePinRemotePane
} = props.workspace;
const {
  activeTransferCount,
  connectTransferEndpoint,
  handleCrossPaneDrop,
  highlightedNames,
  localSelection,
  localSelections,
  mountTransferEndpoint,
  openSendModal,
  remotePaneConnected,
  transferGlobal,
  transferring,
  unmountTransferEndpoint,
  uploadWebFiles
} = props.transfer;

function setLocalPaneRef(value: TemplateRefValue): void {
  props.setLocalPaneRef(value as SftpLocalPaneHandle | null);
}

function setTransferCenterRef(value: TemplateRefValue): void {
  props.setTransferCenterRef(value as SftpTransferCenterHandle | null);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== KeyboardKey.Tab || event.altKey || event.metaKey || event.ctrlKey) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, textarea, [contenteditable='true']")) return;
  event.preventDefault();
  focusedSide.value = focusedSide.value === "left" ? "right" : "left";
}

function selectGlobalRemote(side: SftpWorkspaceSide, id: string) {
  globalActiveIds[side] = id;
}

function onSidePanesUpdate(side: SftpWorkspaceSide, next: SftpRemotePane[]) {
  setRemotePanesOrder(side, next);
}

const sideRemotePanes = computed(() => ({
  left: panesForSide("left"),
  right: panesForSide("right")
}));
</script>

<template>
  <div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)]" @keydown="onKeydown">
    <div
      v-for="side in ['left', 'right'] as const"
      :key="side"
      class="flex min-h-0 min-w-0 flex-col"
      :class="side === 'right' ? 'col-start-3' : 'col-start-1 row-start-1'"
    >
      <div class="flex h-9 shrink-0 items-center gap-1 border-b border-default bg-elevated/50 px-2">
        <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <button
            v-if="side === 'left' && isTauriRuntime"
            type="button"
            class="flex h-7 min-w-0 items-center gap-1 rounded-md px-2 text-xs"
            :class="globalActiveIds.left === 'local' ? 'bg-accented text-highlighted' : 'text-muted'"
            @click="globalActiveIds.left = 'local'"
          >
            <UIcon name="i-lucide-laptop" class="size-3.5 shrink-0" />
            <span>{{ t("koko.fileManagement.localFiles") }}</span>
          </button>
          <button
            v-if="side === 'left' && !isTauriRuntime"
            type="button"
            class="flex h-7 min-w-0 items-center gap-1 rounded-md px-2 text-xs"
            :class="globalActiveIds.left === 'web-upload' ? 'bg-accented text-highlighted' : 'text-muted'"
            @click="globalActiveIds.left = 'web-upload'"
          >
            <UIcon name="i-lucide-upload" class="size-3.5 shrink-0" />
            <span>{{ t("koko.fileManagement.localUpload") }}</span>
          </button>
          <SftpRemoteMachineTabs
            v-if="sideRemotePanes[side].length"
            :panes="sideRemotePanes[side]"
            :active-id="globalActiveIds[side]"
            :transfer-count="activeTransferCount"
            :is-connected="remotePaneConnected"
            class="min-w-0 flex-1"
            @update:panes="onSidePanesUpdate(side, $event)"
            @select="selectGlobalRemote(side, $event)"
            @close="removeRemotePane"
            @reconnect="reconnectRemotePane"
            @close-others="closeOtherRemotePanes"
            @close-right="closeRightRemotePanes"
            @pin="togglePinRemotePane"
          />
        </div>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-plus"
          :title="t('koko.fileManagement.addRemoteSftp')"
          @click="openRemoteConnect(side)"
        />
        <KokoSftpTransferCenter v-if="side === 'left'" :ref="setTransferCenterRef" prominent />
      </div>

      <KokoLocalFileManagementPane
        v-if="side === 'left' && isTauriRuntime"
        v-show="globalActiveIds.left === 'local'"
        :ref="setLocalPaneRef"
        class="min-h-0 flex-1"
        :focused="focusedSide === 'left'"
        :highlighted-names="highlightedNames.left"
        @select="localSelection = $event"
        @selection-change="localSelections = $event"
        @focus="focusedSide = 'left'"
        @transfer-drop="handleCrossPaneDrop($event, { id: 'local:fs', label: t('koko.fileManagement.localFiles') })"
      />
      <KokoWebUploadPane
        v-if="side === 'left' && !isTauriRuntime"
        v-show="globalActiveIds.left === 'web-upload'"
        class="min-h-0 flex-1"
        @upload="uploadWebFiles"
      />
      <template v-if="panesForSide(side).length">
        <KokoFileManagementPane
          v-for="pane in panesForSide(side)"
          v-show="globalActiveIds[side] === pane.id"
          :key="pane.id"
          :ref="(value) => setRemotePaneRef(pane.id, value)"
          class="min-h-0 flex-1"
          :context="pane.context"
          :transfer-endpoint="pane.transferEndpoint"
          :focused="focusedSide === side && globalActiveIds[side] === pane.id"
          :highlighted-names="highlightedNames[side]"
          @select="pane.selection = $event"
          @focus="focusedSide = side"
          @send="openSendModal"
          @transfer-drop="handleCrossPaneDrop($event, pane.transferEndpoint)"
          @transfer-endpoint-mounted="mountTransferEndpoint"
          @transfer-endpoint-connected="connectTransferEndpoint"
          @transfer-endpoint-unmounted="unmountTransferEndpoint"
        />
      </template>
      <div
        v-else-if="
          !(
            side === 'left' &&
            (isTauriRuntime ? globalActiveIds.left === 'local' : globalActiveIds.left === 'web-upload')
          )
        "
        class="grid min-h-0 flex-1 place-items-center p-6 text-center text-sm text-muted"
      >
        <div class="space-y-3">
          <UIcon
            :name="preconnecting && side === 'right' ? 'i-lucide-loader-circle' : 'i-lucide-server'"
            class="mx-auto size-7 opacity-60"
            :class="preconnecting && side === 'right' ? 'animate-spin' : ''"
          />
          <p>
            {{
              preconnecting && side === "right"
                ? t("koko.fileManagement.preconnectingAsset", { name: preconnectingName })
                : side === "left" && isTauriRuntime
                  ? t("koko.fileManagement.preparingLocalFolder")
                  : t("koko.fileManagement.connectSftpServer")
            }}
          </p>
          <UButton
            v-if="!(preconnecting && side === 'right')"
            size="sm"
            color="primary"
            variant="soft"
            icon="i-lucide-plus"
            @click="openRemoteConnect(side)"
          >
            {{ t("koko.fileManagement.connectRemoteSftp") }}
          </UButton>
          <div
            v-if="side === 'right' && !preconnecting && recentConnections.length"
            class="mx-auto flex max-w-xs flex-wrap justify-center gap-1.5 pt-1"
          >
            <UButton
              v-for="item in recentConnections.slice(0, 5)"
              :key="item.assetId"
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-lucide-history"
              :label="item.assetName"
              class="max-w-full"
              @click="reconnectRecent(item)"
            />
          </div>
        </div>
      </div>
    </div>

    <div
      class="col-start-2 row-start-1 flex min-h-0 flex-col items-center justify-center gap-2 border-x border-default"
    >
      <UTooltip :text="t('koko.fileManagement.transferToRemote')">
        <UButton
          size="xs"
          color="primary"
          variant="soft"
          icon="i-lucide-arrow-right"
          :disabled="
            !(globalActiveIds.left === 'local'
              ? localSelections.length || localSelection
              : activePaneForSide('left')?.selection) ||
            !activePaneForSide('right') ||
            transferring
          "
          :loading="transferring"
          @click="transferGlobal('left-to-right')"
        />
      </UTooltip>
      <UTooltip :text="t('koko.fileManagement.transferToLocal')">
        <UButton
          size="xs"
          color="primary"
          variant="soft"
          icon="i-lucide-arrow-left"
          :disabled="
            !activePaneForSide('right')?.selection ||
            !(globalActiveIds.left === 'local' || activePaneForSide('left')) ||
            transferring
          "
          :loading="transferring"
          @click="transferGlobal('right-to-left')"
        />
      </UTooltip>
    </div>
  </div>
</template>
