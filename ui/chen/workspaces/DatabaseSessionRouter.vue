<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import { useGoChenProtocol } from "~/chen/v1/routing";

const props = defineProps<{ tab: WorkspaceSessionTab }>();
// Freeze the backend decision before consuming the connection token.
const goV1 = useGoChenProtocol(props.tab.protocol, useRuntimeConfig().public.chenGoV1Protocols);
const surface = goV1
  ? defineAsyncComponent(() => import("~/chen/v1/GoDatabaseSessionSurface.vue"))
  : defineAsyncComponent(() => import("~/chen/workspaces/DatabaseSessionSurface.vue"));
const child = ref<{ focus?: () => void } | null>(null);
defineExpose({ focus: () => child.value?.focus?.() });
</script>

<template>
  <component :is="surface" ref="child" :tab="tab" />
</template>
