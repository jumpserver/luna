<script setup lang="ts">
import type { ComponentPublicInstance } from "vue";
import type { useSftpTransferCoordinator } from "#koko/composables/sftp/file-manager/useSftpTransferCoordinator";
import type { useSftpWorkspacePanes } from "#koko/composables/sftp/file-manager/useSftpWorkspacePanes";
import type {
  SftpLocalPaneHandle,
  SftpRemotePane,
  SftpTransferCenterHandle,
  SftpWorkspaceSide
} from "#koko/composables/sftp/file-manager/workspaceTypes";
import KokoLocalFileManagementPane from "#koko/components/FileManagement/localPane.vue";
import KokoFileManagementPane from "#koko/components/FileManagement/pane.vue";
import KokoSftpTransferCenter from "#koko/components/FileManagement/SftpTransferCenter.vue";
import KokoWebUploadPane from "#koko/components/FileManagement/webUploadPane.vue";
import SftpRemoteMachineTabs from "#koko/components/FileManagement/workspace/SftpRemoteMachineTabs.vue";
import SftpTransferRail from "#koko/components/FileManagement/workspace/SftpTransferRail.vue";
import {
  disposeKokoFileAiOwner,
  KOKO_GLOBAL_FILE_AI_OWNER_ID,
  setActiveKokoFileAiTarget,
  unregisterKokoFileAiSession
} from "#koko/composables/sftp/useFileAiSessions";
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
  isDesktopRuntime,
  markRemotePaneConnected,
  moveRemotePaneToSide,
  openRemoteConnect,
  panesForSide,
  preconnecting,
  preconnectingName,
  recentConnections,
  reconnectRecent,
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
  handleCrossPaneDrop,
  highlightedNames,
  isSimplePeerMode,
  localSelection,
  localSelections,
  mountTransferEndpoint,
  remotePaneConnected,
  sendFromSelection,
  transferGlobal,
  transferring,
  unmountTransferEndpoint,
  uploadWebFiles
} = props.transfer;

const simplePeerMode = computed(() => isSimplePeerMode());

const canTransferRight = computed(() => {
  // Web left pane is upload-only (no selectable file list) — use the drop zone, not arrows.
  if (globalActiveIds.left === "web-upload") return false;
  const hasLeftSelection =
    globalActiveIds.left === "local"
      ? Boolean(localSelections.value.length || localSelection.value)
      : Boolean(activePaneForSide("left")?.selection);
  const right = activePaneForSide("right");
  return Boolean(hasLeftSelection && right && remotePaneConnected(right.id) && !transferring.value);
});

const canTransferLeft = computed(() => {
  const right = activePaneForSide("right");
  const hasRightSelection = Boolean(right?.selection);
  // web-upload cannot receive files; only desktop local FS or a left-side remote pane can.
  const hasLeftDestination =
    (globalActiveIds.left === "local" && Boolean(isDesktopRuntime)) || Boolean(activePaneForSide("left"));
  return Boolean(
    hasRightSelection && hasLeftDestination && right && remotePaneConnected(right.id) && !transferring.value
  );
});

const showTransferRail = computed(() => {
  const right = activePaneForSide("right");
  // Keep the rail whenever a remote is connected (session criterion). Web still shows it for
  // remote→… when left can receive; web-upload uses the center drop zone for outbound files.
  return Boolean(right && remotePaneConnected(right.id));
});

function setLocalPaneRef(value: TemplateRefValue): void {
  props.setLocalPaneRef(value as SftpLocalPaneHandle | null);
}

function setTransferCenterRef(value: TemplateRefValue): void {
  props.setTransferCenterRef(value as SftpTransferCenterHandle | null);
}

function handleRemotePaneConnected(): void {
  connectTransferEndpoint();
  markRemotePaneConnected();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== KeyboardKey.Tab || event.altKey || event.metaKey || event.ctrlKey) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, textarea, [contenteditable='true']")) return;
  event.preventDefault();
  focusedSide.value = focusedSide.value === "left" ? "right" : "left";
}

function selectGlobalRemote(side: SftpWorkspaceSide, id: string) {
  focusedSide.value = side;
  globalActiveIds[side] = id;
}

function selectGlobalLeftUtility(id: "local" | "web-upload") {
  focusedSide.value = "left";
  globalActiveIds.left = id;
}

function syncActiveFileAiTarget(): void {
  const pane = activePaneForSide(focusedSide.value);
  setActiveKokoFileAiTarget(pane?.context.tabId || null, KOKO_GLOBAL_FILE_AI_OWNER_ID);
}

function focusLocalPane(): void {
  focusedSide.value = "left";
  syncActiveFileAiTarget();
}

watch([focusedSide, () => globalActiveIds.left, () => globalActiveIds.right], syncActiveFileAiTarget, {
  immediate: true
});
watch(
  () => remotePanes.value.map((pane) => pane.context.tabId).filter((targetId): targetId is string => Boolean(targetId)),
  (targetIds, previousTargetIds = []) => {
    const activeTargets = new Set(targetIds);
    for (const targetId of previousTargetIds) {
      if (!activeTargets.has(targetId)) unregisterKokoFileAiSession(targetId);
    }
  }
);
onUnmounted(() => disposeKokoFileAiOwner(KOKO_GLOBAL_FILE_AI_OWNER_ID));

function onSidePanesUpdate(side: SftpWorkspaceSide, next: SftpRemotePane[]) {
  setRemotePanesOrder(side, next);
}

const sideRemotePanes = computed(() => ({
  left: panesForSide("left"),
  right: panesForSide("right")
}));

function showSideAddButton(side: SftpWorkspaceSide) {
  // Left always allows adding remote machines next to local files.
  // Right only shows + after the first connection (empty state has the primary CTA).
  if (side === "left") return true;
  return sideRemotePanes.value[side].length > 0;
}

const draggedRemotePaneId = ref("");
const remotePaneDropSide = ref<SftpWorkspaceSide | null>(null);

function beginRemotePaneDrag(id: string) {
  draggedRemotePaneId.value = id;
}

function endRemotePaneDrag() {
  draggedRemotePaneId.value = "";
  remotePaneDropSide.value = null;
}

function dragRemotePaneOverSide(side: SftpWorkspaceSide, event: DragEvent) {
  const pane = remotePanes.value.find((item) => item.id === draggedRemotePaneId.value);
  if (!pane || pane.side === side) {
    remotePaneDropSide.value = null;
    return;
  }
  event.preventDefault();
  remotePaneDropSide.value = side;
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function leaveRemotePaneSide(side: SftpWorkspaceSide, event: DragEvent) {
  const container = event.currentTarget as HTMLElement;
  const relatedTarget = event.relatedTarget as Node | null;
  if (relatedTarget && container.contains(relatedTarget)) return;
  if (remotePaneDropSide.value === side) remotePaneDropSide.value = null;
}

function dropRemotePaneOnSide(side: SftpWorkspaceSide, event: DragEvent) {
  const id = draggedRemotePaneId.value;
  const pane = remotePanes.value.find((item) => item.id === id);
  if (!pane || pane.side === side) return;
  event.preventDefault();
  moveRemotePaneToSide(id, side);
  focusedSide.value = side;
  endRemotePaneDrag();
}
</script>

<template>
  <div class="relative flex min-h-0 flex-1" @keydown="onKeydown">
    <KokoSftpTransferCenter :ref="setTransferCenterRef" floating />
    <template v-for="side in ['left', 'right'] as const" :key="side">
      <SftpTransferRail
        v-if="side === 'right' && showTransferRail"
        mode="global"
        :can-transfer-right="canTransferRight"
        :can-transfer-left="canTransferLeft"
        :transferring="transferring"
        @transfer="transferGlobal"
      />
      <div
        class="relative flex min-h-0 min-w-0 flex-1 flex-col"
        :class="side === 'right' && !showTransferRail ? 'border-l border-default' : ''"
        @dragover.capture="dragRemotePaneOverSide(side, $event)"
        @dragleave="leaveRemotePaneSide(side, $event)"
        @drop.capture="dropRemotePaneOnSide(side, $event)"
      >
        <div
          v-if="side === 'left' || sideRemotePanes[side].length || remotePaneDropSide === side"
          class="flex h-9 shrink-0 items-center gap-1 bg-[var(--workspace-surface-main)] px-2"
        >
          <div class="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overflow-y-visible py-0.5">
            <button
              v-if="side === 'left' && isDesktopRuntime"
              type="button"
              class="flex h-7 min-w-20 max-w-40 basis-40 grow shrink items-center gap-1 rounded-md px-1.5 text-[11px] leading-none transition-colors"
              :class="
                globalActiveIds.left === 'local'
                  ? 'bg-accented text-highlighted'
                  : 'text-muted hover:bg-accented hover:text-highlighted'
              "
              @click="selectGlobalLeftUtility('local')"
            >
              <UIcon name="i-lucide-laptop" class="size-3.5 shrink-0" />
              <span>{{ t("koko.fileManagement.localFiles") }}</span>
            </button>
            <button
              v-if="side === 'left' && !isDesktopRuntime"
              type="button"
              class="flex h-7 min-w-20 max-w-40 basis-40 grow shrink items-center gap-1 rounded-md px-1.5 text-[11px] leading-none transition-colors"
              :class="
                globalActiveIds.left === 'web-upload'
                  ? 'bg-accented text-highlighted'
                  : 'text-muted hover:bg-accented hover:text-highlighted'
              "
              @click="selectGlobalLeftUtility('web-upload')"
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
              @update:panes="onSidePanesUpdate(side, $event)"
              @select="selectGlobalRemote(side, $event)"
              @close="removeRemotePane"
              @reconnect="reconnectRemotePane"
              @close-others="closeOtherRemotePanes"
              @close-right="closeRightRemotePanes"
              @pin="togglePinRemotePane"
              @pane-drag-start="beginRemotePaneDrag"
              @pane-drag-end="endRemotePaneDrag"
            />
            <UTooltip v-if="showSideAddButton(side)" :text="t('koko.fileManagement.addRemoteSftp')">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-plus"
                class="shrink-0"
                :aria-label="t('koko.fileManagement.addRemoteSftp')"
                @click="openRemoteConnect(side)"
              />
            </UTooltip>
          </div>
        </div>

        <KokoLocalFileManagementPane
          v-if="side === 'left' && isDesktopRuntime"
          v-show="globalActiveIds.left === 'local'"
          :ref="setLocalPaneRef"
          class="min-h-0 flex-1"
          :focused="focusedSide === 'left'"
          :highlighted-names="highlightedNames.left"
          :send-peer-direction="simplePeerMode && canSendToOpposite('local:fs') ? 'right' : undefined"
          @select="localSelection = $event"
          @selection-change="localSelections = $event"
          @focus="focusLocalPane"
          @send="sendFromSelection"
          @transfer-drop="handleCrossPaneDrop($event, { id: 'local:fs', label: t('koko.fileManagement.localFiles') })"
          @transfer-endpoint-mounted="mountTransferEndpoint"
          @transfer-endpoint-connected="connectTransferEndpoint"
          @transfer-endpoint-unmounted="unmountTransferEndpoint"
        />
        <KokoWebUploadPane
          v-if="side === 'left' && !isDesktopRuntime"
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
            :ai-target="{
              targetId: pane.context.tabId,
              ownerId: KOKO_GLOBAL_FILE_AI_OWNER_ID,
              assetId: pane.assetId || '',
              assetName: pane.assetName
            }"
            :transfer-endpoint="pane.transferEndpoint"
            :focused="focusedSide === side && globalActiveIds[side] === pane.id"
            :highlighted-names="highlightedNames[side]"
            :send-peer-direction="
              simplePeerMode && canSendToOpposite(pane.transferEndpoint.id)
                ? side === 'left'
                  ? 'right'
                  : 'left'
                : undefined
            "
            @select="pane.selection = $event"
            @focus="selectGlobalRemote(side, pane.id)"
            @send="sendFromSelection"
            @transfer-drop="handleCrossPaneDrop($event, pane.transferEndpoint)"
            @transfer-endpoint-mounted="mountTransferEndpoint"
            @transfer-endpoint-connected="handleRemotePaneConnected"
            @transfer-endpoint-unmounted="unmountTransferEndpoint"
          />
        </template>
        <div
          v-else-if="
            !(
              side === 'left' &&
              (isDesktopRuntime ? globalActiveIds.left === 'local' : globalActiveIds.left === 'web-upload')
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
                  : side === "left" && isDesktopRuntime
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
                @click="reconnectRecent(item, side)"
              />
            </div>
          </div>
        </div>
        <div
          v-if="remotePaneDropSide === side"
          class="pointer-events-none absolute inset-1 z-50 grid place-items-center rounded-lg border-2 border-dashed border-primary bg-primary/10 text-primary backdrop-blur-[1px]"
        >
          <div class="flex items-center gap-2 rounded-md bg-default px-3 py-2 text-xs shadow-sm">
            <UIcon name="i-lucide-panels-top-left" class="size-4" />
            <span>
              {{
                t(side === "left" ? "koko.fileManagement.dropTabToLeftPane" : "koko.fileManagement.dropTabToRightPane")
              }}
            </span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
