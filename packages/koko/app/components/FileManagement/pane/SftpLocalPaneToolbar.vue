<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";
import { KeyboardKey } from "#koko/constants/keyboard";

const props = defineProps<{
  currentPath: string;
  rootPath: string;
  quickPaths: Array<{ key: string; label: string; path: string; icon: string }>;
}>();

const emit = defineEmits<{
  parent: [entry: SftpFileEntry];
  refresh: [];
  reveal: [];
  setup: [];
  upload: [event: Event];
  goToPath: [path: string];
  create: [kind: "folder" | "file"];
}>();

const search = defineModel<string>("search", { required: true });
const showHiddenFiles = defineModel<boolean>("showHiddenFiles", { default: false });

const { t } = useI18n();
const uploadInput = ref<HTMLInputElement | null>(null);
const pathInputRef = ref<HTMLInputElement | null>(null);
const toolbarRef = ref<HTMLElement | null>(null);

const pathEditing = ref(false);
const pathDraft = ref("");
const pathEditCancelled = ref(false);
const searchOpen = ref(false);
const toolbarWidth = ref(0);

let resizeObserver: ResizeObserver | undefined;

const isNarrow = computed(() => toolbarWidth.value > 0 && toolbarWidth.value < 420);
const isCompact = computed(() => toolbarWidth.value > 0 && toolbarWidth.value < 560);
const showUploadLabel = computed(() => !isNarrow.value);

const quickPathItems = computed(() =>
  props.quickPaths.map((item) => ({
    label: item.label,
    value: item.path,
    icon: item.icon
  }))
);

const selectedQuickPath = computed({
  get: () => {
    const match = props.quickPaths.find(
      (item) => props.currentPath === item.path || props.currentPath.startsWith(`${item.path}/`)
    );
    return match?.path || props.quickPaths[0]?.path || "";
  },
  set: (path: string) => {
    if (path) emit("goToPath", path);
  }
});

const moreMenuItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: t("koko.fileManagement.refresh"),
      icon: "i-lucide-refresh-cw",
      onSelect: () => emit("refresh")
    },
    {
      label: t("koko.localFile.revealInFinder"),
      icon: "i-lucide-app-window",
      onSelect: () => emit("reveal")
    },
    {
      label: t("koko.localFile.title"),
      icon: "i-lucide-folder-cog",
      onSelect: () => emit("setup")
    },
    {
      label: showHiddenFiles.value
        ? t("koko.fileManagement.hideHiddenFiles")
        : t("koko.fileManagement.showHiddenFiles"),
      icon: showHiddenFiles.value ? "i-lucide-eye" : "i-lucide-eye-off",
      onSelect: () => {
        showHiddenFiles.value = !showHiddenFiles.value;
      }
    }
  ]
]);

const createMenuItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: t("koko.fileManagement.newFolder"),
      icon: "i-lucide-folder-plus",
      onSelect: () => emit("create", "folder")
    },
    {
      label: t("koko.fileManagement.newFile"),
      icon: "i-lucide-file-plus-2",
      onSelect: () => emit("create", "file")
    }
  ]
]);

function beginPathEdit() {
  pathEditCancelled.value = false;
  pathDraft.value = props.currentPath || "";
  pathEditing.value = true;
  nextTick(() => {
    pathInputRef.value?.focus();
    pathInputRef.value?.select();
  });
}

function cancelPathEdit() {
  pathEditCancelled.value = true;
  pathEditing.value = false;
  pathDraft.value = props.currentPath || "";
}

function commitPathEdit() {
  if (pathEditCancelled.value) {
    pathEditCancelled.value = false;
    return;
  }
  const next = pathDraft.value.trim();
  pathEditing.value = false;
  if (next && next !== props.currentPath) emit("goToPath", next);
}

function openSearch() {
  searchOpen.value = true;
}

function closeSearchIfEmpty() {
  if (!search.value) searchOpen.value = false;
}

function onSearchKeydown(event: KeyboardEvent) {
  if (event.key === KeyboardKey.Escape) {
    event.preventDefault();
    event.stopPropagation();
    if (search.value) search.value = "";
    else searchOpen.value = false;
  }
}

function onPathKeydown(event: KeyboardEvent) {
  if (event.key === KeyboardKey.Enter) {
    event.preventDefault();
    commitPathEdit();
  } else if (event.key === KeyboardKey.Escape) {
    event.preventDefault();
    cancelPathEdit();
  }
}

watch(
  () => search.value,
  (value) => {
    if (value) searchOpen.value = true;
  }
);

watch(
  () => props.currentPath,
  (value) => {
    if (!pathEditing.value) pathDraft.value = value || "";
  }
);

onMounted(() => {
  if (!toolbarRef.value || typeof ResizeObserver === "undefined") return;
  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    toolbarWidth.value = entry.contentRect.width;
  });
  resizeObserver.observe(toolbarRef.value);
  toolbarWidth.value = toolbarRef.value.clientWidth;
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});
</script>

<template>
  <div
    ref="toolbarRef"
    data-sftp-tour="navigation"
    class="sftp-file-management__toolbar sftp-file-management__toolbar--unified flex shrink-0 items-center gap-1 border-b border-(--app-border) bg-(--app-panel-bg) px-2"
    :class="{ 'is-narrow': isNarrow, 'is-compact': isCompact }"
  >
    <div class="flex shrink-0 items-center gap-0.5">
      <UTooltip :text="t('koko.drawer.up')">
        <UButton
          icon="i-lucide-arrow-up"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="currentPath === rootPath"
          :aria-label="t('koko.drawer.up')"
          @click="emit('parent', { name: '..', is_dir: true } as SftpFileEntry)"
        />
      </UTooltip>
      <USelectMenu
        v-if="quickPathItems.length && !isNarrow"
        v-model="selectedQuickPath"
        value-key="value"
        :items="quickPathItems"
        size="xs"
        class="w-28 shrink-0"
        :search-input="false"
      >
        <template #leading="{ modelValue, ui }">
          <UIcon
            v-if="quickPathItems.find((item) => item.value === modelValue)?.icon"
            :name="quickPathItems.find((item) => item.value === modelValue)!.icon"
            :class="ui.leadingIcon()"
          />
        </template>
      </USelectMenu>
    </div>

    <div
      class="sftp-file-management__path-field relative flex h-8 min-w-0 flex-1 items-center overflow-hidden rounded-[3px] border border-(--app-border) bg-(--app-input-bg)"
      :class="pathEditing ? 'ring-2 ring-(--app-focus-ring)' : ''"
    >
      <input
        v-if="pathEditing"
        ref="pathInputRef"
        v-model="pathDraft"
        type="text"
        class="h-full w-full min-w-0 bg-transparent px-2 font-ui-mono text-[12px] text-(--app-fg) outline-none"
        :aria-label="t('koko.fileManagement.editPath')"
        spellcheck="false"
        @keydown="onPathKeydown"
        @blur="commitPathEdit"
      />
      <button
        v-else
        type="button"
        class="flex h-full min-w-0 flex-1 cursor-text items-center truncate px-2 text-left font-ui-mono text-[12px] text-(--app-fg) hover:bg-accented/40"
        :title="currentPath || t('koko.localFile.folder')"
        @click="beginPathEdit"
      >
        <span class="min-w-0 truncate">{{ currentPath || t("koko.localFile.folder") }}</span>
      </button>
    </div>

    <div class="flex shrink-0 items-center gap-0.5">
      <template v-if="!isNarrow">
        <UTooltip :text="t('koko.fileManagement.refresh')">
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="t('koko.fileManagement.refresh')"
            @click="emit('refresh')"
          />
        </UTooltip>
        <UTooltip :text="t('koko.localFile.revealInFinder')">
          <UButton
            icon="i-lucide-app-window"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="t('koko.localFile.revealInFinder')"
            @click="emit('reveal')"
          />
        </UTooltip>
        <UTooltip :text="t('koko.localFile.title')">
          <UButton
            icon="i-lucide-folder-cog"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="t('koko.localFile.title')"
            @click="emit('setup')"
          />
        </UTooltip>
        <UTooltip
          :text="showHiddenFiles ? t('koko.fileManagement.hideHiddenFiles') : t('koko.fileManagement.showHiddenFiles')"
        >
          <UButton
            :icon="showHiddenFiles ? 'i-lucide-eye' : 'i-lucide-eye-off'"
            color="neutral"
            :variant="showHiddenFiles ? 'soft' : 'ghost'"
            size="sm"
            :aria-label="
              showHiddenFiles ? t('koko.fileManagement.hideHiddenFiles') : t('koko.fileManagement.showHiddenFiles')
            "
            @click="showHiddenFiles = !showHiddenFiles"
          />
        </UTooltip>
      </template>
      <UDropdownMenu v-else :items="moreMenuItems" size="sm" :content="{ align: 'end', side: 'bottom' }">
        <UButton
          icon="i-lucide-ellipsis"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="t('Common.More')"
          :title="t('Common.More')"
        />
      </UDropdownMenu>

      <div class="sftp-file-management__search flex items-center" :class="searchOpen || search ? 'is-open' : ''">
        <UTooltip v-if="!searchOpen && !search" :text="t('koko.fileManagement.filterCurrentDirectory')">
          <UButton
            icon="i-lucide-search"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="t('koko.fileManagement.filterCurrentDirectory')"
            @click="openSearch"
          />
        </UTooltip>
        <UInput
          v-else
          v-model="search"
          icon="i-lucide-search"
          size="sm"
          autofocus
          :placeholder="t('koko.fileManagement.filterCurrentDirectory')"
          class="sftp-file-management__search-input"
          :ui="{ base: 'h-8 text-[12px]' }"
          @keydown="onSearchKeydown"
          @blur="closeSearchIfEmpty"
        />
      </div>
    </div>

    <div data-sftp-tour="file-actions" class="flex shrink-0 items-center gap-0.5">
      <template v-if="!isNarrow">
        <UTooltip :text="t('koko.fileManagement.newFolder')">
          <UButton
            icon="i-lucide-folder-plus"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="t('koko.fileManagement.newFolder')"
            @click="emit('create', 'folder')"
          />
        </UTooltip>
        <UTooltip :text="t('koko.fileManagement.newFile')">
          <UButton
            icon="i-lucide-file-plus-2"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="t('koko.fileManagement.newFile')"
            @click="emit('create', 'file')"
          />
        </UTooltip>
      </template>
      <UDropdownMenu v-else :items="createMenuItems" size="sm" :content="{ align: 'end', side: 'bottom' }">
        <UButton
          icon="i-lucide-plus"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="t('koko.fileManagement.newEntry')"
          :title="t('koko.fileManagement.newEntry')"
        />
      </UDropdownMenu>

      <UTooltip :text="t('koko.actions.upload')">
        <UButton
          icon="i-lucide-upload"
          color="primary"
          variant="solid"
          size="xs"
          :label="showUploadLabel ? t('koko.actions.upload') : undefined"
          :aria-label="t('koko.actions.upload')"
          @click="uploadInput?.click()"
        />
      </UTooltip>
      <input ref="uploadInput" type="file" multiple class="hidden" @change="emit('upload', $event)" />
    </div>
  </div>
</template>
