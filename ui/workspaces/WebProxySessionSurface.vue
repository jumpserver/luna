<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import WebProxySurface from "@jumpserver/web-proxy/surface";
import { desktopWebProxy, desktopWindow } from "~/shared/desktop/bridge";
const props = defineProps<{ tab: WorkspaceSessionTab }>();
const emit = defineEmits<{ reconnect: [] }>();
const { activeTabId, markSessionConnected, markSessionDisconnected, tabs } = useWorkspaceTabs();
const { isMacOS } = usePlatform();
const colorMode = useColorMode();
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
    :style="{ paddingBottom: 'var(--workspace-client-policy-notice-inset, 0px)' }"
    :request="request"
    :bridge="desktopWebProxy"
    :active="activeTabId === ownerTabId"
    :supported="supported"
    :color-scheme="colorMode.value === 'dark' ? 'dark' : 'light'"
    :mac-inset="macInset"
    reconnectable
    @connected="markSessionConnected(props.tab.id)"
    @fatal="markSessionDisconnected(props.tab.id, $event)"
    @reconnect="emit('reconnect')"
  />
</template>
