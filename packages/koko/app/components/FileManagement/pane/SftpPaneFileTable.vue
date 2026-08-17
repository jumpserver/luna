<script setup lang="ts">
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";
import {
  formatSftpFileSize,
  formatSftpModifiedTime,
  resolveSftpFileType
} from "#koko/composables/sftp/file-manager/filePresentation";
import { resolveSftpFileIcon } from "#koko/composables/sftp/useSftpFileIcon";

const props = withDefaults(
  defineProps<{
    entries: SftpFileEntry[];
    selectedNames: string[];
    highlightedNames?: string[];
    selectAllState: boolean | "indeterminate";
    draggable?: boolean;
    variant?: "remote" | "local";
    showStatusBar?: boolean;
    compact?: boolean;
    listKey?: string;
    refreshing?: boolean;
  }>(),
  {
    highlightedNames: () => [],
    draggable: false,
    variant: "remote",
    showStatusBar: false,
    compact: false,
    listKey: "",
    refreshing: false
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
const emptyColspan = computed(() => (props.compact ? 3 : 5));
const prefersReducedMotion = ref(false);
/** Fast path-change: skip leave of the old directory list (enter of the new list still runs). */
const skipLeaveAnim = ref(false);
let skipLeaveTimer: ReturnType<typeof setTimeout> | undefined;

const sizeColClass = computed(() => (props.compact ? "w-22 px-2.5" : "w-27.5 px-3.5"));
/** Keep row enter/leave for transfer highlight & delete; same-key refresh does not re-enter rows. */
const rowTransitionName = computed(() => (prefersReducedMotion.value ? "" : "sftp-file-row"));

function fileType(entry: SftpFileEntry): string {
  return resolveSftpFileType(entry, {
    folder: t("koko.fileManagement.folder"),
    file: t("koko.fileManagement.file")
  });
}

function fileIcon(entry: SftpFileEntry): string {
  return resolveSftpFileIcon(entry);
}

function rowStyle(index: number) {
  return { "--sftp-row-index": String(Math.min(index, 16)) } as Record<string, string>;
}

function clearRowInlineStyles(el: Element) {
  const row = el as HTMLElement;
  row.style.width = "";
  row.style.display = "";
  row.style.tableLayout = "";
  row.style.transition = "";
  row.style.opacity = "";
  row.style.transform = "";
  row.style.background = "";
}

function onBeforeLeave(el: Element) {
  if (!rowTransitionName.value || skipLeaveAnim.value) {
    const row = el as HTMLElement;
    row.style.transition = "none";
    row.style.opacity = "0";
    return;
  }
  const row = el as HTMLElement;
  const table = row.closest("table");
  if (!table) return;
  // Keep table-row geometry during leave without absolute positioning (breaks delete animation in tables).
  row.style.width = `${table.getBoundingClientRect().width}px`;
}

function onAfterLeave(el: Element) {
  clearRowInlineStyles(el);
}

function onAfterEnter(el: Element) {
  // Prevent interrupted <tr> transitions from leaving opacity/transform stuck after refresh.
  clearRowInlineStyles(el);
}

watch(
  () => props.listKey,
  (next, prev) => {
    if (!prev || next === prev) return;
    skipLeaveAnim.value = true;
    if (skipLeaveTimer) clearTimeout(skipLeaveTimer);
    skipLeaveTimer = setTimeout(() => {
      skipLeaveAnim.value = false;
    }, 80);
  },
  { flush: "sync" }
);

onMounted(() => {
  if (typeof window === "undefined" || !window.matchMedia) return;
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  prefersReducedMotion.value = media.matches;
  const onChange = () => {
    prefersReducedMotion.value = media.matches;
  };
  media.addEventListener?.("change", onChange);
  onUnmounted(() => media.removeEventListener?.("change", onChange));
});

onUnmounted(() => {
  if (skipLeaveTimer) clearTimeout(skipLeaveTimer);
});
</script>

<template>
  <div class="sftp-file-table flex h-full min-h-0 flex-col" :class="{ 'sftp-file-table--skip-leave': skipLeaveAnim }">
    <!-- Header stays outside the scrollport so the scrollbar only covers rows. -->
    <div class="sftp-file-table__head-wrap shrink-0">
      <table class="sftp-file-management__table w-full table-fixed border-separate border-spacing-0">
        <colgroup>
          <col class="w-10" />
          <col />
          <col v-if="!compact" class="w-42" />
          <col :class="compact ? 'w-22' : 'w-27.5'" />
          <col v-if="!compact" class="w-24" />
        </colgroup>
        <thead class="sftp-file-table__head">
          <tr>
            <th class="h-8.75 border-b border-(--app-border) bg-(--app-panel-bg) px-3 py-2 text-center">
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
              class="h-8.75 min-w-0 border-b border-(--app-border) bg-(--app-panel-bg) px-3.5 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.05em] text-muted"
            >
              {{ t("koko.fileManagement.name") }}
            </th>
            <th
              v-if="!compact"
              class="hidden h-8.75 border-b border-(--app-border) bg-(--app-panel-bg) px-3.5 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.05em] text-muted md:table-cell"
            >
              {{ t("koko.fileManagement.modifiedTime") }}
            </th>
            <th
              class="h-8.75 border-b border-(--app-border) bg-(--app-panel-bg) py-2 text-right text-[10px] font-semibold uppercase tracking-[0.05em] text-muted"
              :class="sizeColClass"
            >
              {{ t("koko.fileManagement.size") }}
            </th>
            <th
              v-if="!compact"
              class="h-8.75 border-b border-(--app-border) bg-(--app-panel-bg) px-3.5 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.05em] text-muted"
            >
              {{ t("koko.fileManagement.type") }}
            </th>
          </tr>
        </thead>
      </table>
    </div>

    <UScrollArea
      orientation="vertical"
      class="sftp-file-table__scroll min-h-0 flex-1 select-none"
      :ui="{ root: 'min-h-0', viewport: 'min-h-0 w-full' }"
    >
      <table
        class="sftp-file-management__table w-full table-fixed border-separate border-spacing-0"
        data-sftp-tour="file-table"
      >
        <colgroup>
          <col class="w-10" />
          <col />
          <col v-if="!compact" class="w-42" />
          <col :class="compact ? 'w-22' : 'w-27.5'" />
          <col v-if="!compact" class="w-24" />
        </colgroup>
        <TransitionGroup
          :name="rowTransitionName"
          tag="tbody"
          appear
          @before-leave="onBeforeLeave"
          @after-leave="onAfterLeave"
          @after-enter="onAfterEnter"
        >
          <tr
            v-for="(entry, index) in entries"
            :key="entry.name"
            class="sftp-file-row group h-9.5 transition-colors hover:bg-(--app-hover-soft)"
            :class="[
              selectedSet.has(entry.name) ? 'bg-(--app-selected-soft)' : '',
              highlightedSet.has(entry.name) ? 'sftp-file-row--highlight' : ''
            ]"
            :style="rowStyle(index)"
            :aria-selected="selectedSet.has(entry.name)"
            @click="emit('select', entry, $event)"
            @contextmenu="emit('context', entry, $event)"
          >
            <td class="h-9.5 border-b border-(--app-border)/60 px-3 py-1.5 text-center" @click.stop>
              <UCheckbox
                v-if="entry.name !== '..'"
                :model-value="selectedSet.has(entry.name)"
                icon="i-lucide-check"
                :aria-label="t('koko.fileManagement.selectFile', { name: entry.name })"
                @update:model-value="emit('toggle', entry, $event === true)"
              />
            </td>
            <td class="h-9.5 min-w-0 border-b border-(--app-border)/60 px-3.5 py-1.5 text-[12.5px] text-(--app-fg)">
              <button
                type="button"
                class="flex min-w-0 w-full items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--app-focus-ring)"
                :class="draggable && !entry.is_dir && entry.name !== '..' ? 'cursor-grab active:cursor-grabbing' : ''"
                :draggable="draggable && !entry.is_dir && entry.name !== '..'"
                @dblclick.stop="entry.is_dir && emit('open', entry)"
                @dragstart="emit('dragStart', $event, entry)"
              >
                <UIcon :name="fileIcon(entry)" class="sftp-file-icon shrink-0 text-muted" />
                <UTooltip :text="entry.name" :delay-duration="150">
                  <span class="sftp-file-name min-w-0 flex-1 truncate" :class="entry.is_dir ? 'font-medium' : ''">
                    {{ entry.name }}
                  </span>
                </UTooltip>
              </button>
            </td>
            <td
              v-if="!compact"
              class="hidden h-9.5 border-b border-(--app-border)/60 px-3.5 py-1.5 text-right font-ui-mono text-muted md:table-cell"
            >
              <span class="sftp-file-meta block truncate">{{ formatSftpModifiedTime(entry.mod_time) }}</span>
            </td>
            <td
              class="h-9.5 border-b border-(--app-border)/60 py-1.5 text-right font-ui-mono text-muted"
              :class="sizeColClass"
            >
              <span class="sftp-file-meta block truncate">
                {{ entry.is_dir ? "—" : formatSftpFileSize(entry.size) }}
              </span>
            </td>
            <td
              v-if="!compact"
              class="h-9.5 border-b border-(--app-border)/60 px-3.5 py-1.5 text-left font-ui-mono text-muted"
            >
              <span class="sftp-file-meta block truncate">{{ fileType(entry) }}</span>
            </td>
          </tr>
          <tr v-if="!entries.length" key="__empty__" class="sftp-file-row sftp-file-row--empty">
            <td :colspan="emptyColspan" class="h-24 text-center text-sm text-muted">{{ t("Common.NoData") }}</td>
          </tr>
        </TransitionGroup>
      </table>
    </UScrollArea>

    <div
      v-if="showStatusBar"
      class="sftp-file-table__status flex h-8.75 shrink-0 items-center border-t border-(--app-border) bg-(--app-panel-bg) px-3.5 font-ui-mono text-[10.5px] text-(--app-muted)"
    >
      {{ t("koko.fileManagement.items", { count: entries.length }) }}
    </div>
  </div>
</template>
