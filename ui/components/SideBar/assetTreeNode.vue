<script setup lang="ts">
import type { AssetTreeCheckState } from "~/composables/useAssetTree";
import type { AssetItem, AssetTreeKind, AssetTreeNode } from "~/types";
import { assetTreeAssetId, canCheckAssetTreeNode, isAssetTreeBranch } from "~/composables/useAssetTree";
import { resolveAssetIconFromCandidates } from "~/utils/assetIcon";

defineOptions({ name: "AssetTreeNode" });

const props = defineProps<{
  node: AssetTreeNode;
  treeKind: Exclude<AssetTreeKind, "search">;
  searchMode?: boolean;
  batchMode?: boolean;
  checkedAssets?: ReadonlyMap<string, AssetItem>;
  branchCheckStates?: ReadonlyMap<AssetTreeNode, AssetTreeCheckState>;
  batchCheckPending?: boolean;
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
const rowRef = useTemplateRef<HTMLElement>("row");
const checkboxId = useId();

const isParent = computed(() => isAssetTreeBranch(props.node));
const isOpen = computed(() => Boolean(props.node.open));
const nodeAssetId = computed(() => assetTreeAssetId(props.node));
const isChecked = computed(() => props.checkedAssets?.has(nodeAssetId.value) || false);
const canCheck = computed(() => canCheckAssetTreeNode(props.node));
const batchLeaf = computed(() => props.batchMode && !isParent.value);
const rowPadding = computed(() => `${10 + (props.node.level || 0) * 14}px`);
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
  if (has("database", "mysql", "mariadb", "oracle", "dameng", "postgres", "sqlserver", "redis", "mongodb", "db2")) {
    return "i-lucide-database";
  }
  if (has("directory service", "directory_service", "directory-service", "windows_ad")) return "i-lucide-network";
  if (has("device", "network")) return "i-lucide-router";
  if (has("website", "web")) return "i-lucide-globe";
  if (has("cloud")) return "i-tabler-cloud-lock";
  if (has("windows")) return "i-lucide-monitor";
  if (has("host", "linux", "unix")) return "i-lucide-server";
  if (has("gpt") || hasExact("ai")) return "i-lucide-bot";
  if (has("custom", "other")) return "i-lucide-box";

  return "";
});

const assetIcon = computed(() => resolveAssetIconFromCandidates(iconCandidates.value, appBaseURL));

const icon = computed(() => {
  if (props.node.meta?.type === "recent-connections") return "i-lucide-history";
  if (typeGroupIcon.value) return typeGroupIcon.value;
  if (isParent.value) return isOpen.value ? "i-tabler-folder-open" : "i-tabler-folder";
  return "";
});
const isFolderIcon = computed(() => icon.value === "i-tabler-folder" || icon.value === "i-tabler-folder-open");
const assetCountTitle = computed(() =>
  t(props.node.id === "ungrouped" ? "Tree.UngroupedAssetCount" : "Tree.AuthorizationAssetCount")
);
const assetTooltip = computed(() => {
  if (isParent.value) return undefined;
  const { title, name, meta } = props.node;

  const address = meta?.data?.address?.trim();
  const comment = meta?.data?.comment?.trim();
  if (!comment) return title?.trim() || address || name;
  // Recent connections may have stored the full tree title as the comment.
  if (!address || comment === address || comment.startsWith(`${address}\n`)) return comment;
  return `${address}\n${comment}`;
});

const activate = () => {
  if (isParent.value && !props.searchMode) {
    emit("toggle", props.node, props.treeKind);
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
    <div
      ref="row"
      class="app-tree-row sidebar-row group relative flex w-full items-center gap-1 pr-1"
      :class="[
        node.chkDisabled ? 'opacity-40' : '',
        node.meta?.type === 'recent-connections' && node.children?.length ? 'pr-9' : '',
        isAutomationFocused ? 'bg-[var(--app-hover-soft)] text-[var(--app-fg)]' : ''
      ]"
      :style="{ paddingLeft: rowPadding }"
      @contextmenu.prevent="emit('contextmenu', node, $event)"
    >
      <button
        v-if="isParent && !searchMode"
        type="button"
        tabindex="-1"
        class="app-tree-icon-slot grid shrink-0 cursor-pointer place-items-center"
        :aria-label="t(isOpen ? 'Tree.Collapse' : 'Tree.Expand')"
        :aria-expanded="isOpen"
        @click="activate"
      >
        <UIcon
          name="i-lucide-chevron-right"
          class="app-tree-toggle-icon sidebar-icon-sm transition-transform duration-200 ease-out motion-reduce:transition-none"
          :class="isOpen ? 'rotate-90' : ''"
        />
      </button>
      <span v-else class="app-tree-icon-slot shrink-0" aria-hidden="true" />
      <UCheckbox
        v-if="batchMode && canCheck"
        :id="checkboxId"
        size="xs"
        class="app-tree-icon-slot grid shrink-0 place-items-center"
        :model-value="isParent ? (branchCheckStates?.get(node) ?? false) : isChecked"
        :disabled="batchCheckPending"
        :aria-label="isParent ? node.name : undefined"
        @update:model-value="emit('check', node)"
      />
      <span v-else-if="batchMode" class="app-tree-icon-slot shrink-0" aria-hidden="true" />
      <UTooltip
        :text="assetTooltip"
        :delay-duration="500"
        :content="{ side: 'right', align: 'start', sideOffset: 6 }"
        :ui="{ content: 'h-auto max-w-xs py-1.5', text: 'whitespace-pre-wrap wrap-anywhere' }"
        ignore-non-keyboard-focus
      >
        <component
          :is="batchLeaf ? 'label' : 'button'"
          :for="batchLeaf && canCheck ? checkboxId : undefined"
          :type="batchLeaf ? undefined : 'button'"
          class="flex h-full min-w-min flex-1 items-center gap-1 rounded-(--app-radius) text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--app-focus-ring)"
          :class="{ 'cursor-pointer': !batchLeaf || (canCheck && !batchCheckPending) }"
          :title="isParent ? node.title || node.name : undefined"
          :aria-current="isAutomationFocused ? 'true' : undefined"
          :aria-expanded="isParent && !searchMode ? isOpen : undefined"
          :data-workspace-tour="workspaceTourTarget"
          @click="!batchLeaf && activate()"
        >
          <UIcon v-if="node.loading" name="i-lucide-loader-circle" class="app-tree-icon sidebar-icon animate-spin" />
          <AppTreeFolderIcon
            v-else-if="isFolderIcon"
            :open="isOpen"
            class="app-tree-icon sidebar-icon tree-folder-icon"
          />
          <UIcon v-else-if="icon" :name="icon" class="app-tree-icon sidebar-icon" />
          <AppAssetIcon v-else :src="assetIcon.src" :fallback="assetIcon.fallback" />
          <span
            class="inline-flex min-w-min flex-1 items-center font-medium"
            :class="!isParent ? 'tracking-[0.01em]' : ''"
          >
            <span class="sidebar-tree-label truncate" :title="isParent ? node.name : undefined">{{ node.name }}</span>
            <span
              v-if="isParent && node.assetCount != null"
              class="ml-1 shrink-0"
              :title="treeKind === 'authorization' ? '' : assetCountTitle"
            >
              ({{ node.assetCount }})
            </span>
          </span>
        </component>
      </UTooltip>
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
      <div v-if="isParent && isOpen" role="group">
        <AssetTreeNode
          v-for="child in node.children || []"
          :key="`${treeKind}-${child.id}`"
          :node="child"
          :tree-kind="treeKind"
          :search-mode="searchMode"
          :batch-mode="batchMode"
          :checked-assets="checkedAssets"
          :branch-check-states="branchCheckStates"
          :batch-check-pending="batchCheckPending"
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
