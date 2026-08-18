<script setup lang="ts">
import type { AssetTreeKind, AssetTreeNode } from "~/types";

defineOptions({ name: "AssetTreeNode" });

const props = defineProps<{
  node: AssetTreeNode;
  treeKind: Exclude<AssetTreeKind, "search">;
  searchMode?: boolean;
  batchMode?: boolean;
  checkedAssetIds?: string[];
}>();

const emit = defineEmits<{
  select: [node: AssetTreeNode];
  toggle: [node: AssetTreeNode, kind: Exclude<AssetTreeKind, "search">];
  contextmenu: [node: AssetTreeNode, event: MouseEvent];
  check: [node: AssetTreeNode];
  clearRecent: [];
}>();
const { t } = useI18n();

const isParent = computed(() => Boolean(props.node.isParent || props.node.children?.length));
const isOpen = computed(() => Boolean(props.node.open));
const isChecked = computed(() => props.checkedAssetIds?.includes(props.node.id) || false);
const iconCandidates = computed(() => {
  const iconSkin = (props.node.iconSkin || "").toLowerCase();
  const data = props.node.meta?.data || {};

  return [
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
});

const iconSrc = computed(() => {
  if (isParent.value) return "";

  const candidates = iconCandidates.value;

  const has = (keyword: string) => candidates.some((value) => value.includes(keyword));

  if (has("k8s") || has("kubernetes")) return "/icons/kubernetes.svg";
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
  if (props.node.meta?.type === "recent-connections") return "i-lucide-history";
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
    <div class="group relative">
      <button
        type="button"
        class="sidebar-row flex h-7 w-full cursor-pointer items-center gap-1 rounded-md pr-1 text-left text-xs"
        :class="[
          node.chkDisabled ? 'opacity-40' : '',
          node.meta?.type === 'recent-connections' && node.children?.length ? 'pr-6' : ''
        ]"
        :style="{ paddingLeft: `${10 + (node.level || 0) * 14}px` }"
        :title="node.title || node.name"
        @click="activate"
        @contextmenu.prevent="emit('contextmenu', node, $event)"
      >
        <span class="grid size-3 shrink-0 place-items-center">
          <UIcon
            v-if="isParent"
            name="i-lucide-chevron-right"
            class="sidebar-icon-sm transition-transform"
            :class="isOpen ? 'rotate-90' : ''"
          />
        </span>
        <span v-if="batchMode && !isParent" class="grid size-3.5 shrink-0 place-items-center sidebar-icon-muted">
          <UIcon :name="isChecked ? 'i-lucide-square-check-big' : 'i-lucide-square'" class="sidebar-icon" />
        </span>
        <UIcon
          v-if="node.loading || icon"
          :name="node.loading ? 'i-lucide-loader-circle' : icon"
          class="sidebar-icon"
          :class="node.loading ? 'animate-spin' : isParent ? 'tree-folder-icon' : ''"
        />
        <img v-else-if="iconSrc" :src="iconSrc" alt="" class="sidebar-icon-img" />
        <span
          class="min-w-0 flex-1 truncate font-medium"
          :class="!isParent ? 'font-ui-mono text-[11px] tracking-[0.01em]' : ''"
        >
          {{ node.name }}
        </span>
      </button>
      <button
        v-if="node.meta?.type === 'recent-connections' && node.children?.length"
        type="button"
        class="absolute top-1 right-1 grid size-5 shrink-0 place-items-center rounded text-muted opacity-0 transition-[color,background-color,opacity] group-hover:opacity-100 hover:bg-[var(--app-hover-strong)] hover:text-highlighted focus-visible:opacity-100"
        :aria-label="t('RecentConnections.Clear')"
        :title="t('RecentConnections.Clear')"
        @click.stop="emit('clearRecent')"
      >
        <UIcon name="i-lucide-trash-2" class="size-3.5" />
      </button>
    </div>

    <div v-if="isParent && isOpen" role="group">
      <AssetTreeNode
        v-for="child in node.children || []"
        :key="`${treeKind}-${child.id}`"
        :node="child"
        :tree-kind="treeKind"
        :search-mode="searchMode"
        :batch-mode="batchMode"
        :checked-asset-ids="checkedAssetIds"
        @select="emit('select', $event)"
        @toggle="(target, kind) => emit('toggle', target, kind)"
        @contextmenu="(target, event) => emit('contextmenu', target, event)"
        @check="(target) => emit('check', target)"
        @clear-recent="emit('clearRecent')"
      />
      <div v-if="node.loading" class="h-7" />
    </div>
  </div>
</template>
