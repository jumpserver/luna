<script setup lang="ts">
import type { AssetTreeKind, AssetTreeNode } from "~/types";

defineOptions({ name: "AssetTreeNode" });

const props = defineProps<{
  node: AssetTreeNode
  treeKind: Exclude<AssetTreeKind, "search">
  searchMode?: boolean
  batchMode?: boolean
  checkedAssetIds?: string[]
}>();

const emit = defineEmits<{
  select: [node: AssetTreeNode]
  toggle: [node: AssetTreeNode, kind: Exclude<AssetTreeKind, "search">]
  contextmenu: [node: AssetTreeNode, event: MouseEvent]
  check: [node: AssetTreeNode]
}>();

const isParent = computed(() => Boolean(props.node.isParent || props.node.children?.length));
const isOpen = computed(() => Boolean(props.node.open));
const isChecked = computed(() => props.checkedAssetIds?.includes(props.node.id) || false);
const iconSrc = computed(() => {
  if (isParent.value) return "";

  const iconSkin = (props.node.iconSkin || "").toLowerCase();
  const data = props.node.meta?.data || {};

  const candidates = [
    data.platform?.name,
    data.platform?.value,
    data.platform,
    data.platform_type,
    data.category?.value,
    data.category,
    data.type?.value,
    data.type,
    props.node.type,
    iconSkin
  ]
    .map((value) => String(value || "").toLowerCase())
    .filter(Boolean);

  const has = (keyword: string) => candidates.some((value) => value.includes(keyword));

  if (has("linux") || has("unix")) return "/icons/linux.png";
  if (has("windows")) return "/icons/windows.png";
  if (has("web")) return "/icons/browser.png";
  if (has("mysql")) return "/icons/mysql.png";
  if (has("mariadb")) return "/icons/mariadb.png";
  if (has("oracle")) return "/icons/oracle.png";
  if (has("postgres")) return "/icons/postgre.png";
  if (has("sqlserver")) return "/icons/sqlserver.png";
  if (has("redis")) return "/icons/redis.png";
  if (has("mongodb")) return "/icons/mongodb.png";
  if (has("dameng")) return "/icons/dameng.png";
  if (has("clickhouse")) return "/icons/clickhouse.png";
  if (has("database")) return "/icons/mysql.png";

  return "";
});

const icon = computed(() => {
  if (isParent.value) return isOpen.value ? "i-tabler-folder-open" : "i-tabler-folder";
  if (iconSrc.value) return "";
  if ((props.node.meta?.data?.platform_type || "").toLowerCase().includes("device")) return "i-lucide-router";
  return "i-lucide-terminal";
});

const activate = () => {
  if (isParent.value && !props.searchMode) {
    emit("toggle", props.node, props.treeKind);
  } else if (props.batchMode) {
    emit("check", props.node);
  } else {
    emit("select", props.node);
  }
};
</script>

<template>
  <div role="treeitem" :aria-expanded="isParent ? isOpen : undefined">
    <button
      type="button"
      class="group flex h-7 w-full cursor-pointer items-center gap-1 rounded-lg pr-1 text-left text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/10"
      :class="node.chkDisabled ? 'opacity-40' : ''"
      :style="{ paddingLeft: `${12 + (node.level || 0) * 14}px` }"
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
      <span
        v-if="batchMode && !isParent"
        class="grid size-3.5 shrink-0 place-items-center text-gray-400"
      >
        <UIcon :name="isChecked ? 'i-lucide-square-check-big' : 'i-lucide-square'" class="size-3.5" />
      </span>
      <UIcon
        v-if="node.loading || icon"
        :name="node.loading ? 'i-lucide-loader-circle' : icon"
        class="size-3.5 shrink-0 text-gray-500 dark:text-gray-400"
        :class="node.loading ? 'animate-spin' : ''"
      />
      <img
        v-else-if="iconSrc"
        :src="iconSrc"
        alt=""
        class="size-3.5 shrink-0 object-contain"
      >
      <span class="min-w-0 flex-1 truncate font-medium" :class="!isParent ? 'font-ui-mono text-[11px] tracking-[0.01em]' : ''">{{ node.name }}</span>
    </button>

    <div v-if="isParent && isOpen" role="group">
      <AssetTreeNode
        v-for="child in node.children || []"
        :key="`${treeKind}-${child.id}`"
        :node="child"
        :tree-kind="treeKind"
        :batch-mode="batchMode"
        :checked-asset-ids="checkedAssetIds"
        @select="emit('select', $event)"
        @toggle="(target, kind) => emit('toggle', target, kind)"
        @contextmenu="(target, event) => emit('contextmenu', target, event)"
        @check="(target) => emit('check', target)"
      />
      <div v-if="node.loading" class="h-7" />
    </div>
  </div>
</template>
