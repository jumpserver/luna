<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

import { resolveSessionSurface } from "~/shared/connectors/registry";

const props = defineProps<{ tab: WorkspaceSessionTab }>();

const surfaceComponent = computed(() => resolveSessionSurface(props.tab));
const surfaceRef = ref<{ focus?: () => void } | null>(null);
const { activeTabId, closeSession, toSurfaceTab } = useWorkspaceTabs();

const splitSurfaces = computed(() => props.tab.splitSessions || []);
const hasSplit = computed(() => splitSurfaces.value.length > 0);

function surfaceInstanceKey(tab: WorkspaceSessionTab) {
  const payload = tab.payload || {};
  const tokenId = String(payload.id || payload.token?.id || "");
  const webUrl = String(payload.webUrl || "");
  const connectMethod = String(payload.connectMethod?.value || "");

  return [tab.id, tokenId, webUrl, connectMethod].join(":");
}

function focusSurface() {
  surfaceRef.value?.focus?.();
}

function splitSurfaceTab(split: NonNullable<WorkspaceSessionTab["splitSessions"]>[number]) {
  return toSurfaceTab(props.tab, split.id, split.payload, split.status);
}

watch(
  () => activeTabId.value,
  (tabId) => {
    if (tabId === props.tab.id) nextTick(focusSurface);
  }
);

defineExpose({ focus: focusSurface });
</script>

<template>
  <div class="h-full min-h-0 w-full overflow-hidden" @mousedown="focusSurface">
    <div v-if="!hasSplit" class="h-full min-h-0">
      <WorkspaceConnectionSetupPane v-if="tab.status === 'selecting'" :tab="tab" class="h-full min-h-0" />
      <component :is="surfaceComponent" v-else :key="surfaceInstanceKey(tab)" ref="surfaceRef" :tab="tab" />
    </div>

    <div
      v-else
      class="grid h-full min-h-0 divide-x divide-black/8 dark:divide-white/10"
      :class="splitSurfaces.length > 1 ? 'grid-rows-2' : 'grid-cols-2'"
    >
      <div class="relative min-h-0 min-w-0">
        <component :is="surfaceComponent" :key="surfaceInstanceKey(tab)" ref="surfaceRef" :tab="tab" />
      </div>

      <div
        v-for="split in splitSurfaces"
        :key="split.id"
        class="group relative min-h-0 min-w-0"
      >
        <button
          type="button"
          class="absolute top-2 right-2 z-10 flex size-6 items-center justify-center rounded-md bg-black/45 text-white opacity-0 transition-opacity hover:bg-black/60 group-hover:opacity-100"
          aria-label="关闭分屏"
          @click.stop="closeSession(split.id)"
        >
          <UIcon name="i-lucide-x" class="size-3.5" />
        </button>
        <component
          :is="surfaceComponent"
          :key="surfaceInstanceKey(splitSurfaceTab(split))"
          :tab="splitSurfaceTab(split)"
          class="h-full"
        />
      </div>
    </div>
  </div>
</template>
