<script setup lang="ts">
import type {
  FileWorkspaceSourceAsset,
  SftpLocalPaneHandle,
  SftpRemotePaneHandle,
  SftpTransferCenterHandle
} from "#koko/composables/sftp/file-manager/workspaceTypes";
import prettyBytes from "pretty-bytes";
import KokoLocalFileManagementPane from "#koko/components/FileManagement/localPane.vue";
import KokoFileManagementPane from "#koko/components/FileManagement/pane.vue";
import KokoSftpTransferCenter from "#koko/components/FileManagement/SftpTransferCenter.vue";
import KokoWebUploadPane from "#koko/components/FileManagement/webUploadPane.vue";
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
const localePath = useLocalePath();
const sftpTour = useSftpTour();
const { addErrorToast: showErrorToast } = useErrorToast();
const translate = (key: string, params?: Record<string, unknown>) => String(params ? t(key, params) : t(key));

function addErrorToast(title: string, error: unknown) {
  showErrorToast({ title, error });
}

const primaryPaneRef = ref<SftpRemotePaneHandle | null>(null);
const transferCenterRef = ref<SftpTransferCenterHandle | null>(null);
const localPaneRef = ref<SftpLocalPaneHandle | null>(null);
const focusedSide = ref<"left" | "right">("left");
let tourTimer: ReturnType<typeof setTimeout> | undefined;

const workspace = useSftpWorkspacePanes({
  sftpToken: () => props.sftpToken,
  global: () => props.global,
  translate,
  showError: addErrorToast
});
const {
  activePaneForSide,
  activeRemoteId,
  assetTree,
  connectModalOpen,
  connectRemoteAsset,
  currentOrgLabel,
  disconnectAllRemotes,
  dualMode,
  focusRemotePane,
  globalActiveIds,
  initializeGlobalWorkspace,
  isTauriRuntime,
  openRemoteConnect,
  organizationSelector,
  panesForSide,
  pendingPreconnect,
  preconnecting,
  preconnectingName,
  primaryContext,
  primaryTransferEndpoint,
  recentConnections,
  reconnectRecent,
  remoteAssetSearch,
  remoteConnecting,
  remotePaneRefs,
  remotePanes,
  removeRemotePane,
  setRemotePaneRef,
  toggleDualMode
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
const {
  activeTransferCount,
  filteredSendTargetOptions,
  handleCrossPaneDrop,
  highlightedNames,
  localSelection,
  localSelections,
  mountTransferEndpoint,
  openSendModal,
  queueSftpTransfer,
  reconnectTarget,
  remotePaneConnected,
  selectAllOnlineTargets,
  selectedSendTargetIds,
  selectedSendTargets,
  selectedSendTotalBytes,
  sendConflictPolicy,
  sendFileCount,
  sendFilesOpen,
  sendModalOpen,
  sendSource,
  sendTargetPaths,
  sendTargetSearch,
  sendTotalBytes,
  startDistribution,
  targetPath,
  toggleSendTarget,
  transferGlobal,
  transferring,
  connectTransferEndpoint,
  unmountTransferEndpoint,
  uploadWebFiles
} = transfer;

async function openProfessionalWorkbench() {
  const assetId = props.sourceAsset?.id;
  const assetName = props.sourceAsset?.name || assetId || "";
  const tokenId = props.sftpToken || primaryContext.value?.tokenId;

  if (assetId) {
    pendingPreconnect.value = {
      assetId,
      assetName,
      tokenId: tokenId || undefined
    };
  }

  await navigateTo(localePath({ path: "/files" }));
}

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

function onWorkbenchKeydown(event: KeyboardEvent) {
  if (!props.global) return;
  if (event.key !== "Tab" || event.altKey || event.metaKey || event.ctrlKey) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, textarea, [contenteditable='true']")) return;
  event.preventDefault();
  focusedSide.value = focusedSide.value === "left" ? "right" : "left";
}
</script>

<template>
  <div v-if="showEmpty" class="grid h-full place-items-center p-6 text-sm text-muted">
    <div class="flex flex-col items-center gap-3">
      <UIcon name="i-lucide-circle-alert" class="size-7" />
      <p>{{ t("koko.fileManagement.expired") }}</p>
      <UButton size="sm" @click="emit('reconnect')">
        {{ t("koko.fileManagement.reconnect") }}
      </UButton>
    </div>
  </div>
  <div
    v-else
    class="sftp-file-management flex h-full min-h-0 flex-col"
    :class="{ 'sftp-file-management--compact': compact }"
    data-sftp-tour="workspace"
    @keydown="onWorkbenchKeydown"
  >
    <div v-if="compact" class="flex shrink-0 items-center justify-between gap-2 border-b border-default px-2 py-1">
      <span class="min-w-0 truncate text-[11px] text-muted">
        {{ t("koko.fileManagement.lightweightHint") }}
      </span>
      <UButton
        size="xs"
        color="neutral"
        variant="soft"
        icon="i-lucide-arrow-left-right"
        :label="t('koko.fileManagement.openProfessional')"
        :title="t('koko.fileManagement.openProfessional')"
        @click="openProfessionalWorkbench"
      />
    </div>

    <div
      v-if="!global && !compact"
      class="sftp-file-management__topbar flex shrink-0 items-center justify-between gap-2 border-b border-default"
    >
      <div class="ml-auto flex items-center justify-end gap-1">
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left-right"
          :label="t('koko.fileManagement.openProfessional')"
          :title="t('koko.fileManagement.openProfessional')"
          @click="openProfessionalWorkbench"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-circle-help"
          :title="t('koko.fileManagement.featureTour')"
          :aria-label="t('koko.fileManagement.featureTour')"
          @click="sftpTour.start"
        />
        <KokoSftpTransferCenter ref="transferCenterRef" />
        <UButton
          v-if="!dualMode && !remotePanes.length"
          data-sftp-tour="remote-connect"
          size="xs"
          color="primary"
          variant="soft"
          icon="i-lucide-plus"
          :label="t('koko.fileManagement.addRemoteSftp')"
          @click="() => openRemoteConnect()"
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

    <div v-if="global" class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)]">
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
            <button
              v-for="pane in panesForSide(side)"
              :key="pane.id"
              type="button"
              class="flex h-7 min-w-0 max-w-48 items-center gap-1 rounded-md px-2 text-xs"
              :class="globalActiveIds[side] === pane.id ? 'bg-accented text-highlighted' : 'text-muted'"
              @click="globalActiveIds[side] = pane.id"
            >
              <UIcon name="i-lucide-server" class="size-3.5 shrink-0" />
              <span class="truncate">{{ pane.assetName }}</span>
              <UIcon name="i-lucide-x" class="size-3 shrink-0" @click.stop="removeRemotePane(pane.id)" />
            </button>
          </div>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-plus"
            :title="t('koko.fileManagement.addRemoteSftp')"
            @click="openRemoteConnect(side)"
          />
          <KokoSftpTransferCenter v-if="side === 'left'" ref="transferCenterRef" prominent />
        </div>

        <KokoLocalFileManagementPane
          v-if="side === 'left' && isTauriRuntime"
          v-show="globalActiveIds.left === 'local'"
          ref="localPaneRef"
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
            :ref="(el) => setRemotePaneRef(pane.id, el)"
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

    <div v-else class="flex min-h-0 flex-1" :class="!compact && dualMode ? 'gap-1' : ''">
      <KokoFileManagementPane
        :key="primaryTransferEndpoint?.id || 'primary-sftp'"
        ref="primaryPaneRef"
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
            <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              <button
                v-for="pane in remotePanes"
                :key="pane.id"
                type="button"
                class="sftp-file-management__machine-tab flex max-w-45 shrink-0 items-center gap-1.5 rounded-md border px-2"
                :class="
                  activeRemoteId === pane.id
                    ? 'border-primary/50 bg-accented text-highlighted'
                    : 'border-default bg-default text-muted hover:text-highlighted'
                "
                @click="focusRemotePane(pane.id)"
              >
                <span
                  class="size-1.5 shrink-0 rounded-full"
                  :class="remotePaneConnected(pane.id) ? 'bg-success' : 'bg-warning'"
                />
                <span class="min-w-0 flex-1 truncate">{{ pane.assetName }}</span>
                <UBadge v-if="activeTransferCount(pane.transferEndpoint.id)" color="primary" variant="subtle" size="xs">
                  {{ activeTransferCount(pane.transferEndpoint.id) }}
                </UBadge>
                <UIcon name="i-lucide-x" class="size-3 shrink-0" @click.stop="removeRemotePane(pane.id)" />
              </button>
            </div>
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
              :ref="(el) => setRemotePaneRef(pane.id, el)"
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
            <UButton size="xs" color="primary" variant="soft" @click="() => openRemoteConnect()">
              {{ t("koko.fileManagement.connectRemoteSftp") }}
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <UModal
      v-model:open="connectModalOpen"
      :title="t('koko.fileManagement.connectRemoteSftp')"
      :ui="{ content: 'max-w-md' }"
    >
      <template #body>
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-3 px-2.5 py-1 text-[11px] text-muted">
            <span>{{ t("koko.fileManagement.currentOrganization") }}</span>
            <div class="min-w-0 max-w-55 flex-1">
              <component :is="organizationSelector" class="justify-end" />
            </div>
          </div>
          <UInput
            v-model="remoteAssetSearch"
            icon="i-lucide-search"
            :placeholder="t('koko.fileManagement.searchAssets')"
          />
          <div v-if="recentConnections.length" class="space-y-1.5">
            <p class="px-0.5 text-[11px] text-muted">{{ t("koko.fileManagement.recentConnections") }}</p>
            <div class="flex flex-wrap gap-1.5">
              <UButton
                v-for="item in recentConnections"
                :key="`recent-${item.assetId}`"
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-lucide-history"
                :label="item.assetName"
                :loading="remoteConnecting"
                @click="reconnectRecent(item)"
              />
            </div>
          </div>
          <div class="max-h-72 overflow-y-auto rounded-lg border border-default">
            <component :is="assetTree" :search="remoteAssetSearch" open @select="connectRemoteAsset" />
          </div>
        </div>
      </template>
      <template #footer>
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('koko.actions.cancel')"
          @click="
            () => {
              connectModalOpen = false;
            }
          "
        />
      </template>
    </UModal>

    <UModal
      v-model:open="sendModalOpen"
      :title="t('koko.fileManagement.sendToMultipleTargets')"
      :description="t('koko.fileManagement.sendToMultipleTargetsDescription')"
      :ui="{ content: 'max-w-2xl' }"
    >
      <template #body>
        <div class="space-y-4">
          <UCollapsible
            v-model:open="sendFilesOpen"
            class="sftp-send-summary rounded-lg border border-default bg-elevated/50"
          >
            <UButton
              color="neutral"
              variant="ghost"
              block
              class="min-h-14 justify-between rounded-lg px-3 text-left"
              :title="sendFilesOpen ? t('koko.fileManagement.collapseFileList') : t('koko.fileManagement.viewFileList')"
            >
              <span class="flex min-w-0 items-center gap-3">
                <span class="grid size-8 shrink-0 place-items-center rounded-md bg-accented text-primary">
                  <UIcon name="i-lucide-files" class="size-4" />
                </span>
                <span class="min-w-0">
                  <span class="block text-[13px] font-semibold text-highlighted">
                    {{ t("koko.fileManagement.selectedFiles", sendFileCount) }}
                    <span class="ml-1 font-ui-mono text-[11.5px] font-normal text-muted">
                      {{ prettyBytes(sendTotalBytes) }}
                    </span>
                  </span>
                  <span class="mt-0.5 block truncate font-ui-mono text-[11px] text-muted">
                    {{ sendSource?.sourceEndpoint.label }} · {{ sendSource?.sourcePath }}
                  </span>
                </span>
              </span>
              <span class="flex shrink-0 items-center gap-1.5 text-[11.5px] text-muted">
                {{ sendFilesOpen ? t("koko.fileManagement.collapse") : t("koko.fileManagement.viewFiles") }}
                <UIcon
                  name="i-lucide-chevron-down"
                  class="size-3.5 transition-transform"
                  :class="sendFilesOpen ? 'rotate-180' : ''"
                />
              </span>
            </UButton>
            <template #content>
              <div class="max-h-36 overflow-y-auto border-t border-default px-3 py-2">
                <div
                  v-for="entry in sendSource?.entries"
                  :key="entry.name"
                  class="flex min-h-7 items-center gap-2 rounded px-1.5 text-[12px] text-toned hover:bg-elevated"
                >
                  <UIcon name="i-lucide-file" class="size-3.5 shrink-0 text-muted" />
                  <span class="min-w-0 flex-1 truncate">{{ entry.name }}</span>
                  <span class="font-ui-mono text-[11px] text-muted">{{ prettyBytes(Number(entry.size) || 0) }}</span>
                </div>
              </div>
            </template>
          </UCollapsible>

          <div>
            <div class="mb-2 flex items-center gap-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-muted">
                {{ t("koko.fileManagement.targetMachines") }}
              </p>
              <span class="font-ui-mono text-[11px] text-muted">{{ selectedSendTargets.length }}</span>
              <div class="flex-1" />
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                :label="t('koko.fileManagement.selectOnline')"
                @click="selectAllOnlineTargets"
              />
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                :label="t('koko.fileManagement.clearSelection')"
                @click="selectedSendTargetIds = []"
              />
            </div>
            <UInput
              v-model="sendTargetSearch"
              icon="i-lucide-search"
              size="sm"
              :placeholder="t('koko.fileManagement.searchTargets')"
              class="mb-2"
            />
            <div class="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-default p-1.5">
              <label
                v-for="target in filteredSendTargetOptions"
                :key="target.id"
                class="flex items-start gap-3 rounded-md border px-2.5 py-2 transition-colors"
                :class="[
                  selectedSendTargetIds.includes(target.id)
                    ? 'border-primary/50 bg-accented'
                    : 'border-transparent hover:bg-elevated',
                  !target.connected ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                ]"
              >
                <UCheckbox
                  :model-value="selectedSendTargetIds.includes(target.id)"
                  :disabled="!target.connected"
                  class="mt-0.5"
                  @update:model-value="toggleSendTarget(target.id, $event === true)"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span :class="target.connected ? 'bg-success' : 'bg-muted'" class="size-1.5 rounded-full" />
                    <span class="truncate text-xs font-medium">{{ target.assetName }}</span>
                    <UBadge color="neutral" variant="soft" size="xs">{{ target.organizationName }}</UBadge>
                    <span class="ml-auto text-[10px] text-muted">
                      {{
                        target.connected ? t("koko.fileManagement.connected") : t("koko.fileManagement.disconnected")
                      }}
                    </span>
                    <UButton
                      v-if="!target.connected"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-refresh-cw"
                      :title="t('koko.fileManagement.reconnect')"
                      @click.prevent.stop="reconnectTarget(target)"
                    />
                  </div>
                  <UInput
                    :model-value="targetPath(target)"
                    icon="i-lucide-folder"
                    size="xs"
                    class="mt-1.5"
                    :disabled="!target.connected || !selectedSendTargetIds.includes(target.id)"
                    @update:model-value="sendTargetPaths[target.id] = String($event)"
                    @click.stop
                  />
                </div>
              </label>
              <div v-if="!filteredSendTargetOptions.length" class="grid h-20 place-items-center text-xs text-muted">
                {{ t("koko.fileManagement.noMatchingTargets") }}
              </div>
            </div>
          </div>

          <div class="rounded-lg border border-default bg-elevated/50 p-3">
            <p class="mb-2 text-xs font-medium">{{ t("koko.fileManagement.nameConflictPolicy") }}</p>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="policy in ['ask', 'overwrite', 'skip'] as const"
                :key="policy"
                size="xs"
                :color="sendConflictPolicy === policy ? 'primary' : 'neutral'"
                :variant="sendConflictPolicy === policy ? 'soft' : 'ghost'"
                :label="
                  policy === 'ask'
                    ? t('koko.fileManagement.askWhenNeeded')
                    : policy === 'overwrite'
                      ? t('FileTransfer.Overwrite')
                      : t('FileTransfer.Skip')
                "
                @click="sendConflictPolicy = policy"
              />
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="mr-auto min-w-0 text-xs text-muted">
          <p class="font-ui-mono">
            {{ sendFileCount }} × {{ selectedSendTargets.length }} =
            <span class="font-semibold text-highlighted">{{ sendFileCount * selectedSendTargets.length }}</span>
            {{ t("koko.fileManagement.transferTaskUnit") }}
            <span v-if="selectedSendTotalBytes" class="ml-1">· {{ prettyBytes(selectedSendTotalBytes) }}</span>
          </p>
          <p class="mt-1">
            {{ t("koko.fileManagement.distributionQueueHint") }}
          </p>
        </div>
        <UButton color="neutral" variant="ghost" :label="t('koko.actions.cancel')" @click="sendModalOpen = false" />
        <UButton
          color="primary"
          icon="i-lucide-send"
          :disabled="!selectedSendTargets.length"
          :label="t('koko.fileManagement.distributeToTargets', selectedSendTargets.length)"
          @click="startDistribution"
        />
      </template>
    </UModal>
  </div>
</template>
