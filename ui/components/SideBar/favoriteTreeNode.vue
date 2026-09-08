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
    <UTooltip :text="folder.name" :delay-duration="150">
      <button
        type="button"
        class="app-tree-row sidebar-row flex w-full cursor-pointer items-center gap-1 pr-1 text-left outline-none"
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
        <span class="min-w-0 flex-1 truncate font-medium">{{ folder.name }}</span>
      </button>
    </UTooltip>
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
      <UTooltip
        v-for="asset in folder.assets"
        :key="`${folder.id}-${asset.id}`"
        :text="asset.name"
        :delay-duration="150"
      >
        <button
          type="button"
          class="app-tree-row sidebar-row flex w-full cursor-pointer items-center gap-1 pr-1 text-left outline-none"
          :style="{ paddingLeft: `${10 + ((level || 0) + 1) * 14}px` }"
          @click="emit('select', asset)"
          @contextmenu.prevent="emit('contextmenu', asset, $event)"
        >
          <span class="app-tree-icon-slot grid shrink-0 place-items-center" />
          <UIcon name="i-lucide-terminal" class="app-tree-icon sidebar-icon" />
          <span class="min-w-0 flex-1 truncate font-medium font-ui-mono tracking-[0.01em]">{{ asset.name }}</span>
        </button>
      </UTooltip>
    </div>
  </div>
</template>
