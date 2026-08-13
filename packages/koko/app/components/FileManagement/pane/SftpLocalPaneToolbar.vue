<script setup lang="ts">
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";

defineProps<{
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
const uploadInput = ref<HTMLInputElement | null>(null);
const { t } = useI18n();
</script>

<template>
  <div class="flex shrink-0 items-center gap-1 border-b border-default p-2">
    <UButton
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      size="xs"
      :disabled="currentPath === rootPath"
      @click="emit('parent', { name: '..', is_dir: true } as SftpFileEntry)"
    />
    <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="xs" @click="emit('refresh')" />
    <div class="min-w-0 flex-1 truncate rounded bg-(--app-hover-soft) px-2 py-1 font-ui-mono text-[11px]">
      {{ currentPath || t("koko.localFile.folder") }}
    </div>
    <UButton
      icon="i-lucide-app-window"
      color="neutral"
      variant="ghost"
      size="xs"
      :title="t('koko.localFile.revealInFinder')"
      @click="emit('reveal')"
    />
    <UButton icon="i-lucide-folder-cog" color="neutral" variant="ghost" size="xs" @click="emit('setup')" />
    <UButton icon="i-lucide-upload" color="primary" variant="soft" size="xs" @click="uploadInput?.click()" />
    <input ref="uploadInput" type="file" multiple class="hidden" @change="emit('upload', $event)" />
  </div>
  <div
    v-if="quickPaths.length"
    class="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-default px-2 py-1"
  >
    <UButton
      v-for="item in quickPaths"
      :key="item.key"
      size="xs"
      color="neutral"
      :variant="currentPath.startsWith(item.path) ? 'soft' : 'ghost'"
      :icon="item.icon"
      :label="item.label"
      class="shrink-0"
      @click="emit('goToPath', item.path)"
    />
  </div>
  <div class="flex shrink-0 items-center justify-between gap-2 border-b border-default px-2 py-1.5">
    <div class="flex min-w-0 items-center gap-1">
      <UButton
        icon="i-lucide-folder-plus"
        color="neutral"
        variant="soft"
        size="xs"
        :title="t('koko.fileManagement.newFolder')"
        @click="emit('create', 'folder')"
      />
      <UButton
        icon="i-lucide-file-plus-2"
        color="neutral"
        variant="soft"
        size="xs"
        :title="t('koko.fileManagement.newFile')"
        @click="emit('create', 'file')"
      />
    </div>
    <UInput
      v-model="search"
      icon="i-lucide-search"
      size="sm"
      :placeholder="t('koko.actions.search')"
      class="w-44 max-w-[45%] shrink-0"
      :ui="{ base: 'h-7 text-[12px]' }"
    />
  </div>
</template>
