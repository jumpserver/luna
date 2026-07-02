<script setup lang="ts">
import type { AssetTreeKind, AssetTreeNode } from "~/types";

defineOptions({ name: "AssetTreeNode" });

const props = defineProps<{
  node: AssetTreeNode
  treeKind: Exclude<AssetTreeKind, "search">
  searchMode?: boolean
}>();

const emit = defineEmits<{
  select: [node: AssetTreeNode]
  toggle: [node: AssetTreeNode, kind: Exclude<AssetTreeKind, "search">]
  contextmenu: [node: AssetTreeNode, event: MouseEvent]
}>();

const isParent = computed(() => Boolean(props.node.isParent || props.node.children?.length));
const isOpen = computed(() => Boolean(props.node.open));

const icon = computed(() => {
  if (isParent.value) return isOpen.value ? "solar:folder-open-bold" : "solar:folder-with-files-bold";
  const iconSkin = (props.node.iconSkin || "").toLowerCase();
  const data = props.node.meta?.data || {};
  const value = String(data.category?.value || data.category || data.type?.value || data.type || iconSkin).toLowerCase();
  if (value.includes("database")) return "i-lucide-database";
  if (value.includes("windows")) return "i-lucide-monitor";
  if (value.includes("web")) return "i-lucide-globe";
  if (value.includes("device")) return "i-lucide-router";
  return "i-lucide-terminal";
});

const activate = () => {
  if (isParent.value && !props.searchMode) {
    emit("toggle", props.node, props.treeKind);
  } else {
    emit("select", props.node);
  }
};
</script>

<template>
  <div role="treeitem" :aria-expanded="isParent ? isOpen : undefined">
    <button
      type="button"
      class="group flex h-7 w-full cursor-pointer items-center gap-1 rounded-sm pr-1 text-left text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/10"
      :class="node.chkDisabled ? 'opacity-40' : ''"
      :style="{ paddingLeft: `${6 + (node.level || 0) * 14}px` }"
      :title="node.title || node.name"
      @click="activate"
      @contextmenu.prevent="emit('contextmenu', node, $event)"
    >
      <span class="grid size-3 shrink-0 place-items-center">
        <UIcon
          v-if="isParent"
          name="i-lucide-chevron-right"
          class="size-2.5 text-gray-400 transition-transform"
          :class="isOpen ? 'rotate-90' : ''"
        />
      </span>
      <UIcon :name="node.loading ? 'i-lucide-loader-circle' : icon" class="size-3.5 shrink-0 text-gray-500 dark:text-gray-400" :class="node.loading ? 'animate-spin' : ''" />
      <span class="min-w-0 flex-1 truncate font-medium">{{ node.name }}</span>
    </button>

    <div v-if="isParent && isOpen" role="group">
      <AssetTreeNode
        v-for="child in node.children || []"
        :key="`${treeKind}-${child.id}`"
        :node="child"
        :tree-kind="treeKind"
        @select="emit('select', $event)"
        @toggle="(target, kind) => emit('toggle', target, kind)"
        @contextmenu="(target, event) => emit('contextmenu', target, event)"
      />
      <div v-if="node.loading" class="h-7" />
    </div>
  </div>
</template>
