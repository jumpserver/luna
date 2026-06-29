<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

const props = defineProps<{
  tab: WorkspaceSessionTab
}>();

const iframeRef = ref<HTMLIFrameElement | null>(null);
const { activeTabId, markSessionConnected } = useWorkspaceTabs();

const iframeSrc = computed(() => String(props.tab.payload?.webUrl || ""));

function focus() {
  iframeRef.value?.focus();
}

function handleIframeLoad() {
  markSessionConnected(props.tab.id);
  focus();
}

watch(
  () => activeTabId.value,
  (tabId) => {
    if (tabId === props.tab.id) {
      nextTick(focus);
    }
  }
);

defineExpose({ focus });
</script>

<template>
  <div class="h-full min-h-0 w-full" @mousedown="focus">
    <iframe
      ref="iframeRef"
      :src="iframeSrc"
      class="h-full w-full border-0 bg-white dark:bg-zinc-950"
      allow="clipboard-read; clipboard-write"
      title="Web Connector"
      @load="handleIframeLoad"
    />
  </div>
</template>
