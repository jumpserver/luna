<script setup lang="ts">
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";
import {
  formatSftpFileSize,
  formatSftpModifiedTime,
  resolveSftpFileType
} from "#koko/composables/sftp/file-manager/filePresentation";

const props = withDefaults(
  defineProps<{
    entries: SftpFileEntry[];
    selectedNames: string[];
    highlightedNames?: string[];
    selectAllState: boolean | "indeterminate";
    draggable?: boolean;
    variant?: "remote" | "local";
    showStatusBar?: boolean;
  }>(),
  {
    highlightedNames: () => [],
    draggable: false,
    variant: "remote",
    showStatusBar: false
  }
);

const emit = defineEmits<{
  select: [entry: SftpFileEntry, event: MouseEvent];
  toggle: [entry: SftpFileEntry, selected: boolean];
  toggleAll: [selected: boolean];
  open: [entry: SftpFileEntry];
  context: [entry: SftpFileEntry, event: MouseEvent];
  dragStart: [event: DragEvent, entry: SftpFileEntry];
}>();

const { t } = useI18n();
const selectedSet = computed(() => new Set(props.selectedNames));
const highlightedSet = computed(() => new Set(props.highlightedNames));
const isLocal = computed(() => props.variant === "local");

function fileType(entry: SftpFileEntry): string {
  return resolveSftpFileType(entry, {
    folder: t("koko.fileManagement.folder"),
    file: t("koko.fileManagement.file")
  });
}
</script>

<template>
  <div class="sftp-file-table flex h-full min-h-0 flex-col">
    <div class="sftp-file-table__scroll min-h-0 flex-1 overflow-auto select-none">
      <table
        class="sftp-file-management__table w-full table-fixed border-separate border-spacing-0"
        data-sftp-tour="file-table"
      >
        <thead class="sftp-file-table__head">
          <tr>
            <th
              class="w-10 border-b text-center"
              :class="
                isLocal
                  ? 'h-8 border-default bg-elevated/50 px-2'
                  : 'h-8.75 border-(--app-border) bg-(--app-panel-bg) px-3 py-2'
              "
            >
              <UCheckbox
                :model-value="selectAllState"
                icon="i-lucide-check"
                indeterminate-icon="i-lucide-minus"
                :aria-label="t('koko.fileManagement.selectAllVisibleFiles')"
                :disabled="entries.every((entry) => entry.name === '..')"
                @update:model-value="emit('toggleAll', $event === true)"
              />
            </th>
            <th
              class="min-w-0 border-b text-left text-[10px] font-semibold uppercase text-muted"
              :class="
                isLocal
                  ? 'h-8 border-default bg-elevated/50 px-2 tracking-wide'
                  : 'h-8.75 border-(--app-border) bg-(--app-panel-bg) px-3.5 py-2 tracking-[0.05em]'
              "
            >
              {{ t("koko.fileManagement.name") }}
            </th>
            <th
              class="hidden border-b text-right text-[10px] font-semibold uppercase text-muted md:table-cell"
              :class="
                isLocal
                  ? 'h-8 w-36 border-default bg-elevated/50 px-2 tracking-wide'
                  : 'h-8.75 w-42 border-(--app-border) bg-(--app-panel-bg) px-3.5 py-2 tracking-[0.05em]'
              "
            >
              {{ t("koko.fileManagement.modifiedTime") }}
            </th>
            <th
              class="border-b text-right text-[10px] font-semibold uppercase text-muted"
              :class="
                isLocal
                  ? 'h-8 w-24 border-default bg-elevated/50 px-2 tracking-wide'
                  : 'h-8.75 w-27.5 border-(--app-border) bg-(--app-panel-bg) px-3.5 py-2 tracking-[0.05em]'
              "
            >
              {{ t("koko.fileManagement.size") }}
            </th>
            <th
              class="border-b text-left text-[10px] font-semibold uppercase text-muted"
              :class="
                isLocal
                  ? 'h-8 w-20 border-default bg-elevated/50 px-2 tracking-wide'
                  : 'h-8.75 w-24 border-(--app-border) bg-(--app-panel-bg) px-3.5 py-2 tracking-[0.05em]'
              "
            >
              {{ t("koko.fileManagement.type") }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in entries"
            :key="entry.name"
            class="group transition-colors hover:bg-(--app-hover-soft)"
            :class="[
              isLocal ? 'h-9' : 'h-9.5',
              selectedSet.has(entry.name) ? 'bg-(--app-selected-soft)' : '',
              highlightedSet.has(entry.name) ? 'sftp-file-row--highlight' : ''
            ]"
            :aria-selected="selectedSet.has(entry.name)"
            @click="emit('select', entry, $event)"
            @contextmenu="emit('context', entry, $event)"
          >
            <td
              class="w-10 border-b text-center"
              :class="isLocal ? 'h-9 border-default/60 px-2' : 'h-9.5 border-(--app-border)/60 px-3 py-1.5'"
              @click.stop
            >
              <UCheckbox
                v-if="entry.name !== '..'"
                :model-value="selectedSet.has(entry.name)"
                icon="i-lucide-check"
                :aria-label="t('koko.fileManagement.selectFile', { name: entry.name })"
                @update:model-value="emit('toggle', entry, $event === true)"
              />
            </td>
            <td
              class="min-w-0 border-b text-[12.5px]"
              :class="
                isLocal ? 'h-9 border-default/60 px-2' : 'h-9.5 border-(--app-border)/60 px-3.5 py-1.5 text-(--app-fg)'
              "
            >
              <button
                type="button"
                class="flex min-w-0 w-full items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--app-focus-ring)"
                :class="draggable && !entry.is_dir && entry.name !== '..' ? 'cursor-grab active:cursor-grabbing' : ''"
                :draggable="draggable && !entry.is_dir && entry.name !== '..'"
                @dblclick.stop="entry.is_dir && emit('open', entry)"
                @dragstart="emit('dragStart', $event, entry)"
              >
                <UIcon
                  :name="entry.is_dir ? 'i-lucide-folder' : 'i-lucide-file'"
                  class="sftp-file-icon shrink-0 text-muted"
                  :class="entry.is_dir ? 'text-primary' : ''"
                />
                <UTooltip :text="entry.name" :delay-duration="150">
                  <span class="sftp-file-name min-w-0 flex-1 truncate" :class="entry.is_dir ? 'font-medium' : ''">
                    {{ entry.name }}
                  </span>
                </UTooltip>
              </button>
            </td>
            <td
              class="hidden border-b text-right font-ui-mono text-muted md:table-cell"
              :class="
                isLocal
                  ? 'h-9 w-36 border-default/60 px-2 text-[11px]'
                  : 'h-9.5 w-42 border-(--app-border)/60 px-3.5 py-1.5'
              "
            >
              <span class="sftp-file-meta block truncate">{{ formatSftpModifiedTime(entry.mod_time) }}</span>
            </td>
            <td
              class="border-b text-right font-ui-mono text-muted"
              :class="
                isLocal
                  ? 'h-9 w-24 border-default/60 px-2 text-[11px]'
                  : 'h-9.5 w-27.5 border-(--app-border)/60 px-3.5 py-1.5'
              "
            >
              <span class="sftp-file-meta block truncate">
                {{ entry.is_dir ? "—" : formatSftpFileSize(entry.size) }}
              </span>
            </td>
            <td
              class="border-b text-left font-ui-mono text-muted"
              :class="
                isLocal
                  ? 'h-9 w-20 border-default/60 px-2 text-[11px]'
                  : 'h-9.5 w-24 border-(--app-border)/60 px-3.5 py-1.5'
              "
            >
              <span class="sftp-file-meta block truncate">{{ fileType(entry) }}</span>
            </td>
          </tr>
          <tr v-if="!entries.length">
            <td colspan="5" class="h-24 text-center text-sm text-muted">{{ t("Common.NoData") }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div
      v-if="showStatusBar"
      class="sftp-file-table__status flex h-7 shrink-0 items-center border-t border-(--app-border) bg-(--app-panel-bg) px-3.5 font-ui-mono text-[10.5px] text-(--app-muted)"
    >
      {{ t("koko.fileManagement.items", { count: entries.length }) }}
    </div>
  </div>
</template>
