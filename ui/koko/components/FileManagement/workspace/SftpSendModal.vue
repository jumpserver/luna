<script setup lang="ts">
import type { useSftpTransferCoordinator } from "#koko/composables/sftp/file-manager/useSftpTransferCoordinator";
import prettyBytes from "pretty-bytes";

type TransferController = ReturnType<typeof useSftpTransferCoordinator>;

const props = defineProps<{ transfer: TransferController }>();
const { t } = useI18n();
const {
  filteredSendTargetOptions,
  reconnectTarget,
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
  toggleSendTarget
} = props.transfer;
</script>

<template>
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
              @click="void (selectedSendTargetIds = [])"
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
                    {{ target.connected ? t("koko.fileManagement.connected") : t("koko.fileManagement.disconnected") }}
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
              @click="void (sendConflictPolicy = policy)"
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
        <p class="mt-1">{{ t("koko.fileManagement.distributionQueueHint") }}</p>
      </div>
      <UButton
        color="neutral"
        variant="ghost"
        :label="t('koko.actions.cancel')"
        @click="void (sendModalOpen = false)"
      />
      <UButton
        color="primary"
        icon="i-lucide-send"
        :disabled="!selectedSendTargets.length"
        :label="t('koko.fileManagement.distributeToTargets', selectedSendTargets.length)"
        @click="startDistribution"
      />
    </template>
  </UModal>
</template>
