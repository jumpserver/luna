<script setup lang="ts">
import type { AssetItem, AssetTreeNode } from "~/types";
import { useUserInfoStore } from "~/store/modules/userInfo";

const open = ref(false);
const search = ref("");
const loading = ref(false);
const results = ref<AssetItem[]>([]);
const { fetchTree, treeNodeToAsset } = useAssetTree();
const { recentConnections } = useRecentConnections();
const userInfoStore = useUserInfoStore();
const { openLocalShell } = useWorkspaceTabs();
const localShellAvailable = computed(() => isTauriRuntime());

function flatten(nodes: AssetTreeNode[]): AssetItem[] {
  return nodes.flatMap((node) => (node.isParent ? flatten(node.children || []) : [treeNodeToAsset(node)]));
}

const runSearch = useDebounceFn(async (value: string) => {
  if (!value.trim()) {
    results.value = [];
    return;
  }
  loading.value = true;
  try {
    results.value = flatten(await fetchTree("search", undefined, value.trim()));
  } finally {
    loading.value = false;
  }
}, 250);

function selectAsset(asset: AssetItem) {
  open.value = false;
  search.value = "";
  results.value = [];
  useEventBus().emit("workspaceConnectAsset", {
    ...asset,
    savedConnection: asset.savedConnection || userInfoStore.getConnectionInfoForAsset(asset.id) || undefined
  });
}

function selectLocalShell() {
  open.value = false;
  openLocalShell();
}

watch(search, runSearch);
watch(open, (value) => {
  if (!value) search.value = "";
});
</script>

<template>
  <UPopover v-model:open="open" :content="{ align: 'start', side: 'bottom', sideOffset: 8 }" :ui="{ content: 'p-0' }">
    <UTooltip text="新建连接" :delay-duration="150">
      <button
        type="button"
        class="grid size-6 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-[var(--app-hover-strong)] hover:text-highlighted"
        aria-label="新建连接"
      >
        <UIcon name="i-lucide-plus" class="size-4" />
      </button>
    </UTooltip>

    <template #content>
      <div class="w-[360px] overflow-hidden rounded-xl bg-default shadow-xl ring-1 ring-black/10 dark:ring-white/12">
        <div class="border-b border-default p-2">
          <UInput
            v-model="search"
            autofocus
            icon="i-lucide-search"
            size="sm"
            variant="none"
            placeholder="搜索资产名称或地址…"
            :ui="{ base: 'h-8 rounded-lg bg-elevated/70 ring-1 ring-inset ring-default' }"
          />
        </div>
        <div class="max-h-80 min-h-32 overflow-y-auto p-1.5">
          <template v-if="localShellAvailable && !search.trim()">
            <div class="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">本地</div>
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-elevated"
              @click="selectLocalShell"
            >
              <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-elevated">
                <UIcon name="i-lucide-square-terminal" class="size-4 text-muted" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm text-highlighted">Local Shell</span>
                <span class="block truncate text-[11px] text-muted">打开本机终端</span>
              </span>
              <UIcon name="i-lucide-chevron-right" class="size-3.5 shrink-0 text-dimmed" />
            </button>
          </template>
          <div class="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
            {{ search.trim() ? "搜索结果" : "最近连接" }}
          </div>
          <div v-if="loading" class="grid h-24 place-items-center">
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-muted" />
          </div>
          <button
            v-for="asset in search.trim() ? results : recentConnections"
            v-else
            :key="asset.id"
            type="button"
            class="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-elevated"
            @click="selectAsset(asset)"
          >
            <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-elevated">
              <UIcon name="i-lucide-monitor" class="size-4 text-muted" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm text-highlighted">{{ asset.name }}</span>
              <span class="block truncate font-ui-mono text-[11px] text-muted">
                {{ asset.address || asset.platform }}
              </span>
            </span>
            <UIcon name="i-lucide-chevron-right" class="size-3.5 shrink-0 text-dimmed" />
          </button>
          <div
            v-if="!loading && (search.trim() ? results : recentConnections).length === 0"
            class="grid h-24 place-items-center text-xs text-muted"
          >
            {{ search.trim() ? "未找到匹配资产" : "暂无最近连接" }}
          </div>
        </div>
      </div>
    </template>
  </UPopover>
</template>
