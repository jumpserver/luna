<script setup lang="ts">
import type { FavoriteFolder } from "~/composables/useFavoriteFolders";
import type { AssetItem } from "~/types";

defineOptions({ name: "FavoriteTreeNode" });
const props = defineProps<{ folder: FavoriteFolder; level?: number }>();
const emit = defineEmits<{
  select: [asset: AssetItem];
  contextmenu: [asset: AssetItem, event: MouseEvent];
  folderContextmenu: [folder: FavoriteFolder, event: MouseEvent];
  toggleFolder: [folder: FavoriteFolder];
}>();

const toggle = () => {
  emit("toggleFolder", props.folder);
};
</script>

<template>
  <div class="app-tree">
    <div
      class="app-tree-row sidebar-row group/folder flex items-center gap-1 rounded-lg pr-1"
      :style="{ paddingLeft: `${10 + (level || 0) * 14}px` }"
      @contextmenu.prevent="emit('folderContextmenu', folder, $event)"
    >
      <button type="button" class="flex min-w-0 flex-1 items-center gap-1 text-left" @click="toggle">
        <UIcon
          name="i-lucide-chevron-right"
          class="app-tree-toggle-icon sidebar-icon-sm transition-transform"
          :class="folder.open ? 'rotate-90' : ''"
        />
        <UIcon
          :name="folder.open ? 'i-tabler-folder-open' : 'i-tabler-folder'"
          class="app-tree-icon sidebar-icon tree-folder-icon"
        />
        <span class="truncate font-medium">{{ folder.name }}</span>
      </button>
    </div>
    <div v-if="folder.open">
      <FavoriteTreeNode
        v-for="child in folder.children"
        :key="child.id"
        :folder="child"
        :level="(level || 0) + 1"
        @select="emit('select', $event)"
        @contextmenu="(asset, event) => emit('contextmenu', asset, event)"
        @folder-contextmenu="(target, event) => emit('folderContextmenu', target, event)"
        @toggle-folder="(target) => emit('toggleFolder', target)"
      />
      <button
        v-for="asset in folder.assets"
        :key="`${folder.id}-${asset.id}`"
        type="button"
        class="app-tree-row sidebar-row flex w-full items-center gap-1.5 rounded-lg pr-1 text-left"
        :style="{ paddingLeft: `${26 + (level || 0) * 14}px` }"
        @dblclick="emit('select', asset)"
        @contextmenu.prevent="emit('contextmenu', asset, $event)"
      >
        <UIcon name="i-lucide-terminal" class="app-tree-icon sidebar-icon" />
        <span class="truncate font-ui-mono">{{ asset.name }}</span>
      </button>
    </div>
  </div>
</template>
