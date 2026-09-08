<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import WebProxySurface from "@jumpserver/web-proxy/surface";
import { desktopWebProxy, desktopWindow } from "~/shared/desktop/bridge";
const props = defineProps<{ tab: WorkspaceSessionTab }>();
const emit = defineEmits<{ reconnect: [] }>();
const { activeTabId, markSessionConnected, tabs } = useWorkspaceTabs();
const { isMacOS } = usePlatform();
const surface = ref<InstanceType<typeof WebProxySurface>>();
const request = computed(() =>
  props.tab.payload?.webProxy
    ? {
        ...props.tab.payload.webProxy,
        tokenId: props.tab.payload.id || props.tab.payload.token?.id || "",
        tokenValue: props.tab.payload.value || props.tab.payload.token?.value || ""
      }
    : undefined
);
const ownerTabId = computed(
  () => tabs.value.find((tab) => tab.panes.some((pane) => pane.id === props.tab.id))?.id || props.tab.id
);
const supported = isDesktopRuntime();
const macInset = supported && isMacOS && desktopWindow.label().startsWith("asset-");
const unregister = registerWorkspaceSessionCloseGuard(
  props.tab.id,
  () => surface.value?.close() ?? Promise.resolve(true)
);
onBeforeUnmount(unregister);
defineExpose({ focus: () => surface.value?.focus() });
</script>

<template>
  <WebProxySurface
    ref="surface"
    :request="request"
    :bridge="desktopWebProxy"
    :active="activeTabId === ownerTabId"
    :supported="supported"
    :mac-inset="macInset"
    reconnectable
    @connected="markSessionConnected(props.tab.id)"
    @reconnect="emit('reconnect')"
  />
</template>
