<script setup lang="ts">
import type { FavoriteFolder } from "~/composables/useFavoriteFolders";
import type { AssetItem } from "~/types";

defineOptions({ name: "FavoriteTreeNode" });
const props = defineProps<{ folder: FavoriteFolder, level?: number }>();
const emit = defineEmits<{
  select: [asset: AssetItem]
  contextmenu: [asset: AssetItem, event: MouseEvent]
  create: [parentId: string]
}>();

const open = ref(props.folder.open);
const toggle = () => {
  open.value = !open.value;
};
</script>

<template>
  <div>
    <div
      class="group/folder flex h-7 items-center gap-1 rounded-lg pr-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
      :style="{ paddingLeft: `${12 + (level || 0) * 14}px` }"
    >
      <button type="button" class="flex min-w-0 flex-1 items-center gap-1 text-left" @click="toggle">
        <UIcon name="i-lucide-chevron-right" class="size-2.5 shrink-0 text-gray-400 transition-transform" :class="open ? 'rotate-90' : ''" />
        <UIcon :name="open ? 'i-tabler-folder-open' : 'i-tabler-folder'" class="size-3.5 shrink-0 text-gray-500" />
        <span class="truncate font-medium">{{ folder.name }}</span>
      </button>
      <UTooltip :text="$t('Favorite.CreateSubfolder')" :delay-duration="150">
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-folder-plus"
          class="size-5 justify-center p-0 opacity-0 group-hover/folder:opacity-100"
          @click.stop="emit('create', folder.id)"
        />
      </UTooltip>
    </div>
    <div v-if="open">
      <FavoriteTreeNode
        v-for="child in folder.children"
        :key="child.id"
        :folder="child"
        :level="(level || 0) + 1"
        @select="emit('select', $event)"
        @contextmenu="(asset, event) => emit('contextmenu', asset, event)"
        @create="emit('create', $event)"
      />
      <button
        v-for="asset in folder.assets"
        :key="`${folder.id}-${asset.id}`"
        type="button"
        class="flex h-7 w-full items-center gap-1.5 rounded-lg pr-1 text-left text-[11px] hover:bg-black/5 dark:hover:bg-white/10"
        :style="{ paddingLeft: `${28 + (level || 0) * 14}px` }"
        @dblclick="emit('select', asset)"
        @contextmenu.prevent="emit('contextmenu', asset, $event)"
      >
        <UIcon name="i-lucide-terminal" class="size-3.5 shrink-0 text-gray-500" />
        <span class="truncate font-ui-mono">{{ asset.name }}</span>
      </button>
    </div>
  </div>
</template>
