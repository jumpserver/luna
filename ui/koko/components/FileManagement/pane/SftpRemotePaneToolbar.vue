<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { SftpFileEntry, useSftpFileManager } from "#koko/composables/sftp/useSftpFileManager";
import { KeyboardKey } from "#koko/constants/keyboard";

const props = defineProps<{
  manager: ReturnType<typeof useSftpFileManager>;
  title?: string;
  /** Subtle host/asset label shown before the path (not a second tab strip). */
  contextLabel?: string;
  pathSegments: string[];
  /** Prefer denser chrome in dual-pane / compact surfaces. */
  dense?: boolean;
  /** Session single-pane: expose add-remote + tour next to upload. */
  showWorkbenchActions?: boolean;
}>();

const emit = defineEmits<{
  navigate: [segmentIndex: number];
  goToPath: [path: string];
  createFolder: [];
  createFile: [];
  upload: [event: Event];
  addRemote: [];
  startTour: [];
}>();

const search = defineModel<string>("search", { required: true });
const showHiddenFiles = defineModel<boolean>("showHiddenFiles", { default: false });

const { t } = useI18n();
const uploadInput = shallowRef<HTMLInputElement | null>(null);
const pathInputRef = shallowRef<HTMLInputElement | null>(null);
const searchInputRef = shallowRef<HTMLInputElement | null>(null);
const toolbarRef = shallowRef<HTMLElement | null>(null);

const pathEditing = ref(false);
const pathDraft = ref("");
const pathEditCancelled = ref(false);
const searchOpen = ref(false);
const toolbarWidth = ref(0);

let resizeObserver: ResizeObserver | undefined;

const currentPath = computed(() => props.manager.currentPath.value || "/");

/** Breakpoints relative to pane width (dual-pane halves often ~360–520px). */
const isNarrow = computed(() => toolbarWidth.value > 0 && toolbarWidth.value < 720);
const isCompact = computed(() => toolbarWidth.value > 0 && toolbarWidth.value < 720);
const showContextLabel = computed(() => Boolean(props.contextLabel?.trim()) && !isCompact.value);

const pathSegmentsList = computed(() => props.pathSegments ?? []);

const visibleBreadcrumbs = computed(() => {
  const segments = pathSegmentsList.value;
  if (segments.length <= 1 || !isCompact.value) {
    return segments.map((name, index) => ({ name, index, ellipsis: false as const }));
  }
  const lastIndex = segments.length - 1;
  return [
    { name: "…", index: -2, ellipsis: true as const },
    { name: segments[lastIndex]!, index: lastIndex, ellipsis: false as const }
  ];
});

const overflowMenuItems = computed<DropdownMenuItem[][]>(() => {
  const viewItems: DropdownMenuItem[] = [
    {
      label: t("koko.fileManagement.refresh"),
      icon: "i-lucide-refresh-cw",
      onSelect: () => {
        void props.manager.loadCurrentDirectory();
      }
    },
    {
      label: t("koko.fileManagement.filterCurrentDirectory"),
      icon: "i-lucide-search",
      onSelect: () => openSearch()
    }
  ];
  const fileItems: DropdownMenuItem[] = [
    {
      label: showHiddenFiles.value
        ? t("koko.fileManagement.hideHiddenFiles")
        : t("koko.fileManagement.showHiddenFiles"),
      icon: showHiddenFiles.value ? "i-lucide-eye" : "i-lucide-eye-off",
      onSelect: () => {
        showHiddenFiles.value = !showHiddenFiles.value;
      }
    },
    {
      label: t("koko.fileManagement.newFolder"),
      icon: "i-lucide-folder-plus",
      onSelect: () => emit("createFolder")
    },
    {
      label: t("koko.fileManagement.newFile"),
      icon: "i-lucide-file-plus-2",
      onSelect: () => emit("createFile")
    },
    {
      label: t("koko.actions.upload"),
      icon: "i-lucide-cloud-upload",
      onSelect: () => uploadInput.value?.click()
    }
  ];
  const workbenchItems: DropdownMenuItem[] = props.showWorkbenchActions
    ? [
        {
          label: t("koko.fileManagement.addRemoteSftp"),
          icon: "i-lucide-server",
          onSelect: () => emit("addRemote")
        },
        {
          label: t("koko.fileManagement.featureTour"),
          icon: "i-lucide-circle-help",
          onSelect: () => emit("startTour")
        }
      ]
    : [];
  return [viewItems, fileItems, workbenchItems].filter((group) => group.length > 0);
});

function normalizePathInput(raw: string): string {
  const trimmed = raw.trim() || "/";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function beginPathEdit() {
  pathEditCancelled.value = false;
  pathDraft.value = currentPath.value;
  pathEditing.value = true;
  nextTick(() => {
    pathInputRef.value?.focus();
    pathInputRef.value?.select();
  });
}

function cancelPathEdit() {
  pathEditCancelled.value = true;
  pathEditing.value = false;
  pathDraft.value = currentPath.value;
}

function commitPathEdit() {
  if (pathEditCancelled.value) {
    pathEditCancelled.value = false;
    return;
  }
  const next = normalizePathInput(pathDraft.value);
  pathEditing.value = false;
  if (next !== currentPath.value) emit("goToPath", next);
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

function onBreadcrumbClick(index: number, ellipsis: boolean) {
  if (ellipsis) {
    beginPathEdit();
    return;
  }
  emit("navigate", index);
}

function focusPathEdit() {
  beginPathEdit();
}

function focusSearch() {
  openSearch();
}

watch(
  () => search.value,
  (value) => {
    if (value) searchOpen.value = true;
  }
);

watch(currentPath, (value) => {
  if (!pathEditing.value) pathDraft.value = value;
});

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

defineExpose({
  focusPathEdit,
  focusSearch
});
</script>

<template>
  <div
    ref="toolbarRef"
    data-sftp-tour="navigation"
    class="sftp-file-management__toolbar sftp-file-management__toolbar--unified flex min-w-0 shrink-0 items-center gap-1 overflow-hidden border-b border-(--app-border) bg-(--app-panel-bg) px-2"
    :class="{ 'is-narrow': isNarrow, 'is-compact': isCompact }"
  >
    <!-- Navigation: back / forward / up / home -->
    <div class="flex shrink-0 items-center gap-0.5">
      <UTooltip :text="t('koko.fileManagement.back')">
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :disabled="!manager.canGoBack.value"
          :aria-label="t('koko.fileManagement.back')"
          @click="void manager.goBack()"
        />
      </UTooltip>
      <UTooltip :text="t('koko.fileManagement.forward')">
        <UButton
          icon="i-lucide-chevron-right"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :disabled="!manager.canGoForward.value"
          :aria-label="t('koko.fileManagement.forward')"
          @click="void manager.goForward()"
        />
      </UTooltip>
      <UTooltip :text="t('koko.drawer.up')">
        <UButton
          icon="i-lucide-arrow-up"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :disabled="manager.currentPath.value === '/'"
          :aria-label="t('koko.drawer.up')"
          @click="manager.changeDirectory({ name: '..', is_dir: true } as SftpFileEntry)"
        />
      </UTooltip>
      <UTooltip :text="t('koko.fileManagement.home')">
        <UButton
          icon="i-lucide-house"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :disabled="!manager.canGoHome.value"
          :aria-label="t('koko.fileManagement.home')"
          @click="void manager.goHome()"
        />
      </UTooltip>
    </div>

    <!-- Host context: caption chip, not a second tab strip. -->
    <div
      v-if="showContextLabel"
      class="sftp-file-management__context-label flex h-8 max-w-32 shrink-0 items-center gap-1 rounded-[7px] border border-(--app-border)/70 bg-(--app-input-bg)/60 px-1.5 text-[11px] leading-none"
      :title="contextLabel"
    >
      <UIcon name="i-lucide-server" class="size-3.5 shrink-0 text-(--color-text-accent)" />
      <span class="min-w-0 truncate font-medium text-highlighted">{{ contextLabel }}</span>
    </div>

    <div
      class="sftp-file-management__path-field relative flex h-8 min-w-0 flex-1 items-center overflow-hidden rounded-[7px] border border-(--app-border) bg-(--app-input-bg)"
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
      <div
        v-else
        class="flex h-full min-w-0 flex-1 cursor-text items-center overflow-hidden px-1 font-ui-mono text-[12px] text-(--app-fg)"
        role="navigation"
        :aria-label="currentPath"
        @click.self="beginPathEdit"
        @dblclick="beginPathEdit"
      >
        <button
          type="button"
          class="sftp-path-crumb shrink-0 rounded-md px-1.5 font-semibold hover:bg-accented focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--app-focus-ring)"
          aria-label="/"
          :aria-current="pathSegmentsList.length === 0 ? 'page' : undefined"
          @click.stop="emit('navigate', -1)"
        >
          /
        </button>
        <template v-for="crumb in visibleBreadcrumbs" :key="`${crumb.index}:${crumb.name}`">
          <UIcon name="i-lucide-chevron-right" class="size-3 shrink-0 text-(--app-muted)" />
          <button
            type="button"
            class="sftp-path-crumb max-w-28 shrink-0 truncate rounded-md px-1.5 hover:bg-accented focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--app-focus-ring)"
            :class="[
              crumb.ellipsis ? 'text-(--app-muted)' : '',
              !crumb.ellipsis && crumb.index === pathSegmentsList.length - 1 ? 'font-semibold' : 'text-(--app-muted)'
            ]"
            :title="crumb.ellipsis ? currentPath : `/${pathSegmentsList.slice(0, crumb.index + 1).join('/')}`"
            :aria-label="
              crumb.ellipsis
                ? t('koko.fileManagement.editPath')
                : `/${pathSegmentsList.slice(0, crumb.index + 1).join('/')}`
            "
            :aria-current="!crumb.ellipsis && crumb.index === pathSegmentsList.length - 1 ? 'page' : undefined"
            @click.stop="onBreadcrumbClick(crumb.index, crumb.ellipsis)"
          >
            {{ crumb.name }}
          </button>
        </template>
      </div>
    </div>

    <template v-if="isNarrow">
      <UInput
        v-if="searchOpen || search"
        ref="searchInputRef"
        v-model="search"
        icon="i-lucide-search"
        size="sm"
        autofocus
        :placeholder="t('koko.fileManagement.filterCurrentDirectory')"
        class="sftp-file-management__search-input max-w-36 shrink"
        :ui="{ base: 'h-8 text-[12px]' }"
        @keydown="onSearchKeydown"
        @blur="closeSearchIfEmpty"
      />
      <UDropdownMenu :items="overflowMenuItems" size="sm" :content="{ align: 'end', side: 'bottom' }">
        <UButton
          data-sftp-tour="file-actions"
          icon="i-lucide-ellipsis"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :title="t('Common.More')"
          :aria-label="t('Common.More')"
        />
      </UDropdownMenu>
    </template>

    <template v-else>
      <!-- View helpers: refresh + filter (not file mutations). -->
      <div class="flex shrink-0 items-center gap-0.5">
        <UTooltip :text="t('koko.fileManagement.refresh')">
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            :aria-label="t('koko.fileManagement.refresh')"
            @click="void manager.loadCurrentDirectory()"
          />
        </UTooltip>
        <div class="sftp-file-management__search flex items-center" :class="searchOpen || search ? 'is-open' : ''">
          <UTooltip v-if="!searchOpen && !search" :text="t('koko.fileManagement.filterCurrentDirectory')">
            <UButton
              icon="i-lucide-search"
              color="neutral"
              variant="ghost"
              size="sm"
              square
              :aria-label="t('koko.fileManagement.filterCurrentDirectory')"
              @click="openSearch"
            />
          </UTooltip>
          <UInput
            v-else
            ref="searchInputRef"
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

      <div class="mx-0.5 h-4 w-px shrink-0 bg-(--app-border)" aria-hidden="true" />

      <!-- File operations: hidden / create / upload -->
      <div data-sftp-tour="file-actions" class="flex shrink-0 items-center gap-0.5">
        <UTooltip
          :text="showHiddenFiles ? t('koko.fileManagement.hideHiddenFiles') : t('koko.fileManagement.showHiddenFiles')"
        >
          <UButton
            :icon="showHiddenFiles ? 'i-lucide-eye' : 'i-lucide-eye-off'"
            color="neutral"
            :variant="showHiddenFiles ? 'soft' : 'ghost'"
            size="sm"
            square
            :aria-label="
              showHiddenFiles ? t('koko.fileManagement.hideHiddenFiles') : t('koko.fileManagement.showHiddenFiles')
            "
            @click="void (showHiddenFiles = !showHiddenFiles)"
          />
        </UTooltip>
        <UTooltip :text="t('koko.fileManagement.newFolder')">
          <UButton
            icon="i-lucide-folder-plus"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            :aria-label="t('koko.fileManagement.newFolder')"
            @click="void emit('createFolder')"
          />
        </UTooltip>
        <UTooltip :text="t('koko.fileManagement.newFile')">
          <UButton
            icon="i-lucide-file-plus-2"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            :aria-label="t('koko.fileManagement.newFile')"
            @click="void emit('createFile')"
          />
        </UTooltip>
        <UTooltip :text="t('koko.actions.upload')">
          <UButton
            icon="i-lucide-cloud-upload"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            :aria-label="t('koko.actions.upload')"
            @click="uploadInput?.click()"
          />
        </UTooltip>
      </div>

      <template v-if="showWorkbenchActions">
        <div class="mx-0.5 h-4 w-px shrink-0 bg-(--app-border)" aria-hidden="true" />
        <div class="flex shrink-0 items-center gap-0.5">
          <UButton
            data-sftp-tour="remote-connect"
            icon="i-lucide-server"
            color="primary"
            variant="soft"
            size="sm"
            :label="t('koko.fileManagement.addRemoteSftp')"
            :aria-label="t('koko.fileManagement.addRemoteSftp')"
            @click="void emit('addRemote')"
          />
          <UTooltip :text="t('koko.fileManagement.featureTour')">
            <UButton
              icon="i-lucide-circle-help"
              color="neutral"
              variant="ghost"
              size="sm"
              square
              :aria-label="t('koko.fileManagement.featureTour')"
              @click="void emit('startTour')"
            />
          </UTooltip>
        </div>
      </template>
    </template>
    <input ref="uploadInput" type="file" multiple class="hidden" @change="emit('upload', $event)" />
  </div>

  <div v-if="manager.currentUploadName.value" class="border-b border-(--app-border) bg-(--app-panel-bg) px-3 py-1.5">
    <div class="mb-1 flex items-center justify-between gap-2 text-[10px] text-(--app-muted)">
      <span class="truncate">{{ manager.currentUploadName.value }}</span>
      <span>{{ manager.uploadProgress.value }}%</span>
    </div>
    <div class="flex items-center gap-2">
      <UProgress :value="manager.uploadProgress.value" size="xs" class="flex-1" />
      <span v-if="manager.queuedUploadCount.value" class="shrink-0 text-[11px] text-(--app-muted)">
        +{{ manager.queuedUploadCount.value }}
      </span>
    </div>
  </div>
</template>
