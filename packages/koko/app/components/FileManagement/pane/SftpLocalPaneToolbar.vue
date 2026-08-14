<script setup lang="ts">
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";

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
const uploadInput = ref<HTMLInputElement | null>(null);
const { t } = useI18n();

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
</script>

<template>
  <div
    data-sftp-tour="navigation"
    class="sftp-file-management__toolbar flex shrink-0 items-center gap-1.5 border-b border-(--app-border) bg-(--app-panel-bg) px-3"
  >
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
    <div
      class="flex h-8 min-w-0 flex-1 items-center overflow-x-auto rounded-[3px] border border-(--app-border) bg-(--app-input-bg) px-2 font-ui-mono text-[12px] text-(--app-fg)"
    >
      <span class="min-w-0 truncate">{{ currentPath || t("koko.localFile.folder") }}</span>
    </div>
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
  </div>

  <div
    data-sftp-tour="file-actions"
    class="sftp-file-management__actionbar flex shrink-0 items-center gap-2 border-b border-(--app-border) bg-(--app-panel-bg) px-3"
  >
    <div class="flex min-w-0 flex-1 items-center gap-1.5">
      <USelectMenu
        v-if="quickPathItems.length"
        v-model="selectedQuickPath"
        value-key="value"
        :items="quickPathItems"
        size="xs"
        class="w-32 shrink-0"
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
      <UButton
        icon="i-lucide-folder-plus"
        color="neutral"
        variant="soft"
        size="xs"
        class="shrink-0"
        @click="emit('create', 'folder')"
      >
        {{ t("koko.fileManagement.newFolder") }}
      </UButton>
      <UButton
        icon="i-lucide-file-plus-2"
        color="neutral"
        variant="soft"
        size="xs"
        class="shrink-0"
        @click="emit('create', 'file')"
      >
        {{ t("koko.fileManagement.newFile") }}
      </UButton>
    </div>
    <div class="flex shrink-0 items-center gap-1.5">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        size="sm"
        :placeholder="t('koko.actions.search')"
        class="w-40 max-w-[32vw] shrink-0"
        :ui="{ base: 'h-8 text-[12px]' }"
      />
      <UButton icon="i-lucide-upload" color="primary" variant="solid" size="xs" @click="uploadInput?.click()">
        {{ t("koko.actions.upload") }}
      </UButton>
      <input ref="uploadInput" type="file" multiple class="hidden" @change="emit('upload', $event)" />
    </div>
  </div>
</template>
