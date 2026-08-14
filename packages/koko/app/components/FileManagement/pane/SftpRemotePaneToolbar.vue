<script setup lang="ts">
import type { SftpFileEntry, useSftpFileManager } from "#koko/composables/sftp/useSftpFileManager";

defineProps<{
  manager: ReturnType<typeof useSftpFileManager>;
  title?: string;
  pathSegments: string[];
}>();

const emit = defineEmits<{
  navigate: [segmentIndex: number];
  createFolder: [];
  createFile: [];
  upload: [event: Event];
}>();

const search = defineModel<string>("search", { required: true });
const showHiddenFiles = defineModel<boolean>("showHiddenFiles", { default: false });
const uploadInput = ref<HTMLInputElement | null>(null);
const { t } = useI18n();
</script>

<template>
  <div v-if="title" class="flex h-9 shrink-0 items-center gap-1 bg-[var(--workspace-surface-main)] px-2">
    <div
      class="flex h-7 min-w-20 max-w-48 items-center gap-1 rounded-md bg-accented px-1.5 text-[11px] leading-none text-highlighted"
    >
      <UIcon name="i-lucide-server" class="size-3.5 shrink-0 text-success" />
      <span class="min-w-0 truncate">{{ title }}</span>
    </div>
  </div>
  <div
    data-sftp-tour="navigation"
    class="sftp-file-management__toolbar flex shrink-0 items-center gap-1.5 border-b border-(--app-border) bg-(--app-panel-bg) px-3"
  >
    <UButton
      icon="i-lucide-chevron-left"
      color="neutral"
      variant="ghost"
      size="sm"
      :disabled="!manager.canGoBack.value"
      :title="t('koko.fileManagement.back')"
      @click="void manager.goBack()"
    />
    <UButton
      icon="i-lucide-chevron-right"
      color="neutral"
      variant="ghost"
      size="sm"
      :disabled="!manager.canGoForward.value"
      :title="t('koko.fileManagement.forward')"
      @click="void manager.goForward()"
    />
    <UButton
      icon="i-lucide-arrow-up"
      color="neutral"
      variant="ghost"
      size="sm"
      :disabled="manager.currentPath.value === '/'"
      :title="t('koko.drawer.up')"
      @click="manager.changeDirectory({ name: '..', is_dir: true } as SftpFileEntry)"
    />
    <UButton
      icon="i-lucide-house"
      color="neutral"
      variant="ghost"
      size="sm"
      :disabled="!manager.canGoHome.value"
      :title="t('koko.fileManagement.home')"
      @click="void manager.goHome()"
    />
    <UButton
      icon="i-lucide-refresh-cw"
      color="neutral"
      variant="ghost"
      size="sm"
      :title="t('koko.fileManagement.refresh')"
      @click="void manager.loadCurrentDirectory()"
    />
    <div
      class="flex h-8 min-w-0 flex-1 items-center overflow-x-auto rounded-[3px] border border-(--app-border) bg-(--app-input-bg) px-1 font-ui-mono text-[12px] text-(--app-fg)"
    >
      <button
        type="button"
        class="shrink-0 rounded-[3px] px-1.5 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--app-focus-ring)"
        aria-label="/"
        :aria-current="pathSegments.length === 0 ? 'page' : undefined"
        @click="emit('navigate', -1)"
      >
        /
      </button>
      <template v-for="(segment, index) in pathSegments" :key="`${segment}:${index}`">
        <UIcon name="i-lucide-chevron-right" class="size-3 shrink-0 text-(--app-muted)" />
        <button
          type="button"
          class="shrink-0 rounded px-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--app-focus-ring)"
          :class="index === pathSegments.length - 1 ? 'font-semibold' : 'text-(--app-muted)'"
          :aria-label="`/${pathSegments.slice(0, index + 1).join('/')}`"
          :aria-current="index === pathSegments.length - 1 ? 'page' : undefined"
          @click="emit('navigate', index)"
        >
          {{ segment }}
        </button>
      </template>
    </div>
    <UButton
      :icon="showHiddenFiles ? 'i-lucide-eye' : 'i-lucide-eye-off'"
      color="neutral"
      :variant="showHiddenFiles ? 'soft' : 'ghost'"
      size="sm"
      :title="showHiddenFiles ? t('koko.fileManagement.hideHiddenFiles') : t('koko.fileManagement.showHiddenFiles')"
      @click="showHiddenFiles = !showHiddenFiles"
    />
    <UInput
      v-model="search"
      icon="i-lucide-search"
      size="sm"
      :placeholder="t('koko.actions.search')"
      class="w-47.5 shrink-0 max-w-[38%]"
      :ui="{ base: 'h-8 text-[12px]' }"
    />
  </div>
  <div
    data-sftp-tour="file-actions"
    class="sftp-file-management__actionbar flex shrink-0 items-center justify-between gap-2 border-b border-(--app-border) bg-(--app-panel-bg) px-3"
  >
    <div class="flex min-w-0 items-center gap-1.5">
      <UButton icon="i-lucide-folder-plus" color="neutral" variant="soft" size="xs" @click="emit('createFolder')">
        {{ t("koko.fileManagement.newFolder") }}
      </UButton>
      <UButton icon="i-lucide-file-plus-2" color="neutral" variant="soft" size="xs" @click="emit('createFile')">
        {{ t("koko.fileManagement.newFile") }}
      </UButton>
    </div>
    <UButton icon="i-lucide-upload" color="primary" variant="solid" size="xs" @click="uploadInput?.click()">
      {{ t("koko.actions.upload") }}
    </UButton>
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
