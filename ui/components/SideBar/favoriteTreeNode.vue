<script setup lang="ts">
import type { ComponentPublicInstance } from "vue";
import type { FavoriteFolder } from "~/composables/useFavoriteFolders";
import type { AssetItem } from "~/types";
import { FAVORITE_FOLDER_NAME_MAX_LENGTH } from "~/composables/useFavoriteFolders";
import { resolveAssetIconFromFields } from "~/utils/assetIcon";

defineOptions({ name: "FavoriteTreeNode" });
const props = defineProps<{
  folder: FavoriteFolder;
  level?: number;
  editingFolderId?: string | null;
  editingValue?: string;
}>();
const emit = defineEmits<{
  select: [asset: AssetItem];
  contextmenu: [asset: AssetItem, event: MouseEvent];
  folderContextmenu: [folder: FavoriteFolder, event: MouseEvent];
  toggleFolder: [folder: FavoriteFolder];
  updateEditingValue: [value: string];
  finishFolderRename: [folder: FavoriteFolder];
  cancelFolderRename: [];
}>();
const appBaseURL = useRuntimeConfig().app.baseURL;
const renameInputRef = ref<ComponentPublicInstance | null>(null);
const isEditing = computed(() => props.editingFolderId === props.folder.id);
const editValue = computed({
  get: () => props.editingValue || "",
  set: (value: string) => emit("updateEditingValue", value)
});

const resolveAssetIcon = (asset: AssetItem) => resolveAssetIconFromFields(asset, appBaseURL);

const toggle = () => {
  emit("toggleFolder", props.folder);
};

const focusRenameInput = async () => {
  await nextTick();
  const root = renameInputRef.value?.$el as HTMLElement | undefined;
  const input = root instanceof HTMLInputElement ? root : root?.querySelector("input");
  input?.focus();
  input?.select();
};

watch(
  isEditing,
  (editing) => {
    if (editing) void focusRenameInput();
  },
  { immediate: true }
);
</script>

<template>
  <div class="app-tree">
    <UTooltip v-if="!isEditing" :text="folder.name" :delay-duration="150">
      <button
        type="button"
        class="app-tree-row sidebar-row flex w-max min-w-full cursor-pointer items-center gap-1 pr-1 text-left outline-none"
        :style="{ paddingLeft: `${10 + (level || 0) * 14}px` }"
        @click="toggle"
        @contextmenu.prevent="emit('folderContextmenu', folder, $event)"
      >
        <span class="app-tree-icon-slot grid shrink-0 place-items-center">
          <UIcon
            name="i-lucide-chevron-right"
            class="app-tree-toggle-icon sidebar-icon-sm transition-transform"
            :class="folder.open ? 'rotate-90' : ''"
          />
        </span>
        <AppTreeFolderIcon :open="folder.open" class="app-tree-icon sidebar-icon tree-folder-icon" />
        <span class="inline-flex min-w-max flex-1 items-center font-medium">
          <span class="whitespace-nowrap">{{ folder.name }}</span>
          <span class="ml-1 shrink-0">({{ folder.assetCount || 0 }})</span>
        </span>
      </button>
    </UTooltip>
    <div
      v-else
      class="app-tree-row sidebar-row flex w-max min-w-full items-center gap-1 pr-1 text-left outline-none"
      :style="{ paddingLeft: `${10 + (level || 0) * 14}px` }"
      @click.stop
      @pointerdown.stop
    >
      <span class="app-tree-icon-slot grid shrink-0 place-items-center">
        <UIcon
          name="i-lucide-chevron-right"
          class="app-tree-toggle-icon sidebar-icon-sm transition-transform"
          :class="folder.open ? 'rotate-90' : ''"
        />
      </span>
      <AppTreeFolderIcon :open="folder.open" class="app-tree-icon sidebar-icon tree-folder-icon" />
      <UInput
        ref="renameInputRef"
        v-model="editValue"
        size="xs"
        class="w-36"
        :maxlength="FAVORITE_FOLDER_NAME_MAX_LENGTH"
        :ui="{ base: 'h-5 py-0 px-1 text-xs' }"
        @click.stop
        @pointerdown.stop
        @keydown.enter.prevent="emit('finishFolderRename', folder)"
        @keydown.esc.prevent="emit('cancelFolderRename')"
        @blur="emit('finishFolderRename', folder)"
      />
      <span class="shrink-0 font-medium">({{ folder.assetCount || 0 }})</span>
    </div>
    <div v-if="folder.open">
      <FavoriteTreeNode
        v-for="child in folder.children"
        :key="child.id"
        :folder="child"
        :level="(level || 0) + 1"
        :editing-folder-id="editingFolderId"
        :editing-value="editingValue"
        @select="emit('select', $event)"
        @contextmenu="(asset, event) => emit('contextmenu', asset, event)"
        @folder-contextmenu="(target, event) => emit('folderContextmenu', target, event)"
        @toggle-folder="(target) => emit('toggleFolder', target)"
        @update-editing-value="emit('updateEditingValue', $event)"
        @finish-folder-rename="emit('finishFolderRename', $event)"
        @cancel-folder-rename="emit('cancelFolderRename')"
      />
      <UTooltip
        v-for="asset in folder.assets"
        :key="`${folder.id}-${asset.id}`"
        :text="asset.name"
        :delay-duration="150"
      >
        <button
          type="button"
          class="app-tree-row sidebar-row flex w-max min-w-full cursor-pointer items-center gap-1 pr-1 text-left outline-none"
          :style="{ paddingLeft: `${10 + ((level || 0) + 1) * 14}px` }"
          @click="emit('select', asset)"
          @contextmenu.prevent="emit('contextmenu', asset, $event)"
        >
          <span class="app-tree-icon-slot grid shrink-0 place-items-center" />
          <img
            v-if="resolveAssetIcon(asset).src"
            :src="resolveAssetIcon(asset).src"
            alt=""
            class="app-tree-icon sidebar-icon-img"
          />
          <UIcon v-else :name="resolveAssetIcon(asset).fallback" class="app-tree-icon sidebar-icon" />
          <span class="min-w-max flex-1 whitespace-nowrap font-medium font-ui-mono tracking-[0.01em]">
            {{ asset.name }}
          </span>
        </button>
      </UTooltip>
    </div>
  </div>
</template>
