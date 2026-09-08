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
  focusedAssetId?: string;
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
const rowRef = useTemplateRef<HTMLButtonElement>("row");

const isParent = computed(() =>
  Boolean(props.node.meta?.type === "node" || props.node.isParent || props.node.children?.length)
);
const isOpen = computed(() => Boolean(props.node.open));
const isChecked = computed(() => props.checkedAssetIds?.includes(props.node.id) || false);
const nodeAssetId = computed(() =>
  String(props.node.meta?.data?.id || props.node.key || (props.node.isParent ? "" : props.node.id))
);
const isAutomationFocused = computed(
  () => Boolean(props.focusedAssetId) && !isParent.value && nodeAssetId.value === props.focusedAssetId
);
const workspaceTourTarget = computed(() => {
  if (props.searchMode || props.batchMode || props.node.meta?.type === "recent-connections") return undefined;
  return isParent.value ? "node" : "asset";
});
const iconCandidates = computed(() => {
  const iconSkin = (props.node.iconSkin || "").toLowerCase();
  const data = props.node.meta?.data || {};
  const choiceText = (value: string | { name?: string; value?: string } | undefined) =>
    typeof value === "object" ? [value?.name, value?.value] : [value];

  return [
    ...choiceText(data.platform),
    data.platform_type,
    ...choiceText(data.category),
    ...choiceText(data.type),
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
const assetCountTitle = computed(() =>
  t(props.node.id === "ungrouped" ? "Tree.UngroupedAssetCount" : "Tree.AuthorizationAssetCount")
);

const activate = () => {
  if (isParent.value && !props.searchMode) {
    emit("toggle", props.node, props.treeKind);
  } else if (props.batchMode) {
    emit("check", props.node);
  } else {
    emit("select", props.node);
  }
};

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const animateBranchHeight = (el: Element, from: number, to: number, done: () => void) => {
  const node = el as HTMLElement;
  if (reducedMotion()) {
    done();
    return;
  }

  node.style.overflow = "hidden";
  node.style.height = `${from}px`;
  void node.offsetHeight;

  let timer = 0;
  const finish = (event?: Event) => {
    if (event && (event.target !== node || (event as TransitionEvent).propertyName !== "height")) return;
    node.removeEventListener("transitionend", finish);
    clearTimeout(timer);
    node.style.height = "";
    node.style.overflow = "";
    node.style.transition = "";
    done();
  };

  node.addEventListener("transitionend", finish);
  timer = window.setTimeout(finish, 280);
  node.style.transition = "height 220ms cubic-bezier(0.22, 1, 0.36, 1)";
  node.style.height = `${to}px`;
};

const enterBranch = (el: Element, done: () => void) => {
  animateBranchHeight(el, 0, (el as HTMLElement).scrollHeight, done);
};

const leaveBranch = (el: Element, done: () => void) => {
  animateBranchHeight(el, (el as HTMLElement).scrollHeight, 0, done);
};

watch(
  isAutomationFocused,
  async (focused) => {
    if (!focused) return;
    await nextTick();
    rowRef.value?.scrollIntoView({ block: "nearest" });
  },
  { immediate: true }
);
</script>

<template>
  <div role="treeitem" :aria-expanded="isParent ? isOpen : undefined">
    <div class="group relative">
      <button
        ref="row"
        type="button"
        class="app-tree-row sidebar-row flex w-max min-w-full cursor-pointer items-center gap-1 pr-1 text-left outline-none"
        :class="[
          node.chkDisabled ? 'opacity-40' : '',
          node.meta?.type === 'recent-connections' && node.children?.length ? 'pr-9' : '',
          isAutomationFocused ? 'bg-[var(--app-hover-soft)] text-[var(--app-fg)]' : ''
        ]"
        :style="{ paddingLeft: `${10 + (node.level || 0) * 14}px` }"
        :title="node.title || node.name"
        :aria-current="isAutomationFocused ? 'true' : undefined"
        :data-workspace-tour="workspaceTourTarget"
        @click="activate"
        @contextmenu.prevent="emit('contextmenu', node, $event)"
      >
        <span class="app-tree-icon-slot grid shrink-0 place-items-center">
          <UIcon
            v-if="isParent"
            name="i-lucide-chevron-right"
            class="app-tree-toggle-icon sidebar-icon-sm transition-transform duration-200 ease-out motion-reduce:transition-none"
            :class="isOpen ? 'rotate-90' : ''"
          />
        </span>
        <span
          v-if="batchMode && !isParent"
          class="app-tree-icon-slot sidebar-icon-muted grid shrink-0 place-items-center"
        >
          <UIcon
            :name="isChecked ? 'i-lucide-square-check-big' : 'i-lucide-square'"
            class="app-tree-icon sidebar-icon"
          />
        </span>
        <UIcon v-if="node.loading" name="i-lucide-loader-circle" class="app-tree-icon sidebar-icon animate-spin" />
        <AppTreeFolderIcon
          v-else-if="isFolderIcon"
          :open="isOpen"
          class="app-tree-icon sidebar-icon tree-folder-icon"
        />
        <UIcon v-else-if="icon" :name="icon" class="app-tree-icon sidebar-icon" />
        <img v-else-if="iconSrc" :src="iconSrc" alt="" class="app-tree-icon sidebar-icon-img" />
        <span
          class="inline-flex min-w-max flex-1 items-center font-medium"
          :class="!isParent ? 'font-ui-mono tracking-[0.01em]' : ''"
        >
          <span class="whitespace-nowrap">{{ node.name }}</span>
          <span
            v-if="isParent && node.assetCount != null"
            class="ml-1 shrink-0"
            :title="treeKind === 'authorization' ? '' : assetCountTitle"
          >
            ({{ node.assetCount }})
          </span>
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

    <Transition :css="false" @enter="enterBranch" @leave="leaveBranch">
      <div v-if="isParent && isOpen" class="min-w-max" role="group">
        <AssetTreeNode
          v-for="child in node.children || []"
          :key="`${treeKind}-${child.id}`"
          :node="child"
          :tree-kind="treeKind"
          :search-mode="searchMode"
          :batch-mode="batchMode"
          :checked-asset-ids="checkedAssetIds"
          :focused-asset-id="focusedAssetId"
          @select="emit('select', $event)"
          @toggle="(target, kind) => emit('toggle', target, kind)"
          @contextmenu="(target, event) => emit('contextmenu', target, event)"
          @check="(target) => emit('check', target)"
          @clear-recent="emit('clearRecent')"
        />
        <div v-if="node.loadingMore" class="app-tree-row grid place-items-center" aria-hidden="true">
          <UIcon name="i-lucide-loader-circle" class="app-tree-icon sidebar-icon animate-spin" />
        </div>
        <div v-if="node.loading" class="app-tree-row" />
      </div>
    </Transition>
  </div>
</template>
