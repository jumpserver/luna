<script setup lang="ts">
import type { AssetTreeKind, AssetTreeNode } from "~/types";
import { withBase } from "ufo";

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
const appBaseURL = useRuntimeConfig().app.baseURL;

const isParent = computed(() => Boolean(props.node.isParent || props.node.children?.length));
const isOpen = computed(() => Boolean(props.node.open));
const isChecked = computed(() => props.checkedAssetIds?.includes(props.node.id) || false);
const workspaceTourTarget = computed(() => {
  if (props.searchMode || props.batchMode) return undefined;
  if (isParent.value && props.node.meta?.type !== "recent-connections") return "node";
  return undefined;
});
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
    iconSkin,
    props.node.key,
    props.node.id,
    props.node.name
  ]
    .map((value) => String(value || "").toLowerCase())
    .filter(Boolean);
});

const typeGroupIcon = computed(() => {
  if (props.treeKind !== "type" || !isParent.value || (props.node.level || 0) !== 0) return "";

  const has = (...keywords: string[]) =>
    iconCandidates.value.some((value) => keywords.some((keyword) => value.includes(keyword)));
  const hasExact = (...keywords: string[]) => iconCandidates.value.some((value) => keywords.includes(value));

  if (has("k8s", "kubernetes", "container")) return "i-lucide-container";
  if (has("database", "mysql", "mariadb", "oracle", "postgres", "sqlserver", "redis", "mongodb")) {
    return "i-lucide-database";
  }
  if (has("directory service", "directory_service", "directory-service", "windows_ad")) return "i-lucide-network";
  if (has("device", "network")) return "i-lucide-router";
  if (has("website", "web")) return "i-lucide-globe";
  if (has("cloud")) return "i-lucide-cloud";
  if (has("windows")) return "i-lucide-monitor";
  if (has("host", "linux", "unix")) return "i-lucide-server";
  if (has("gpt") || hasExact("ai")) return "i-lucide-bot";
  if (has("custom", "other")) return "i-lucide-box";

  return "";
});

const iconSrc = computed(() => {
  if (isParent.value) return "";

  const candidates = iconCandidates.value;

  const has = (keyword: string) => candidates.some((value) => value.includes(keyword));

  let src = "";
  if (has("k8s") || has("kubernetes")) src = "/icons/kubernetes.svg";
  else if (has("linux") || has("unix")) src = "/icons/linux.png";
  else if (has("windows")) src = "/icons/windows.png";
  else if (has("mysql")) src = "/icons/mysql.png";
  else if (has("mariadb")) src = "/icons/mariadb.png";
  else if (has("oracle")) src = "/icons/oracle.png";
  else if (has("postgres")) src = "/icons/postgre.png";
  else if (has("sqlserver")) src = "/icons/sqlserver.png";
  else if (has("redis")) src = "/icons/redis.png";
  else if (has("mongodb")) src = "/icons/mongodb.png";
  else if (has("dameng")) src = "/icons/dameng.png";
  else if (has("clickhouse")) src = "/icons/clickhouse.png";
  else if (has("database")) src = "/icons/mysql.png";

  return src ? withBase(src, appBaseURL) : "";
});

const icon = computed(() => {
  if (props.node.meta?.type === "recent-connections") return "i-lucide-history";
  if (typeGroupIcon.value) return typeGroupIcon.value;
  if (isParent.value) return isOpen.value ? "i-tabler-folder-open" : "i-tabler-folder";
  if (iconSrc.value) return "";
  if (iconCandidates.value.some((value) => value.includes("web"))) return "i-lucide-globe";
  if ((props.node.meta?.data?.platform_type || "").toLowerCase().includes("device")) return "i-lucide-router";
  return "i-lucide-terminal";
});
const isFolderIcon = computed(() => icon.value === "i-tabler-folder" || icon.value === "i-tabler-folder-open");

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
          node.meta?.type === 'recent-connections' && node.children?.length ? 'pr-9' : ''
        ]"
        :style="{ paddingLeft: `${10 + (node.level || 0) * 14}px` }"
        :title="node.title || node.name"
        :data-workspace-tour="workspaceTourTarget"
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
          :class="node.loading ? 'animate-spin' : isFolderIcon ? 'tree-folder-icon' : ''"
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
        class="sidebar-icon-button absolute top-1/2 right-2.5 grid size-6 -translate-y-1/2 place-items-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        :aria-label="t('RecentConnections.Clear')"
        :title="t('RecentConnections.Clear')"
        @click.stop="emit('clearRecent')"
      >
        <UIcon name="i-lucide-trash-2" class="sidebar-icon" />
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
