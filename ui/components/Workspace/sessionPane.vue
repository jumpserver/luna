<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

import { resolveSessionSurface } from "~/shared/connectors/registry";

const props = defineProps<{ tab: WorkspaceSessionTab }>();

const surfaceComponent = computed(() => resolveSessionSurface(props.tab));
const surfaceRef = ref<{ focus?: () => void } | null>(null);
const { activeTabId } = useWorkspaceTabs();

function focusSurface() {
  surfaceRef.value?.focus?.();
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
    <component :is="surfaceComponent" ref="surfaceRef" :tab="tab" />
  </div>
</template>
