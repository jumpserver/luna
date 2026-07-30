<script setup lang="ts">
import type { WorkspacePane } from "~/composables/useWorkspaceTabs";

import { resolveSessionSurface } from "~/shared/connectors/registry";

const props = defineProps<{ pane: WorkspacePane }>();
const { toSurfaceTab } = useWorkspaceTabs();
const {
  getPaneTarget,
  registerPaneSurface,
  unregisterPaneSurface
} = useWorkspacePaneSurfaceRegistry();
const surfaceTab = computed(() => toSurfaceTab(props.pane));
const surfaceTarget = computed(() => getPaneTarget(props.pane.id));
const surfaceComponent = computed(() => resolveSessionSurface(surfaceTab.value));
const { reconnectSession } = useWorkspaceTabMenu();
let surfaceInstance: { focus?: () => void } | null = null;

const surfaceInstanceKey = computed(() => {
  const payload = props.pane.payload || {};
  const tokenId = String(payload.id || payload.token?.id || "");
  const webUrl = String(payload.webUrl || "");
  const connectMethod = String(payload.connectMethod?.value || "");

  return [props.pane.id, tokenId, webUrl, connectMethod].join(":");
});

function setSurfaceInstance(instance: unknown) {
  const nextInstance = instance as { focus?: () => void } | null;
  if (surfaceInstance === nextInstance) return;

  if (surfaceInstance) unregisterPaneSurface(props.pane.id, surfaceInstance);
  surfaceInstance = nextInstance;
  if (surfaceInstance) registerPaneSurface(props.pane.id, surfaceInstance);
}

onBeforeUnmount(() => {
  if (surfaceInstance) unregisterPaneSurface(props.pane.id, surfaceInstance);
});
</script>

<template>
  <Teleport v-if="pane.mode === 'session' && surfaceTarget" :to="surfaceTarget">
    <component
      :is="surfaceComponent"
      :key="surfaceInstanceKey"
      :ref="setSurfaceInstance"
      :tab="surfaceTab"
      class="h-full"
      @reconnect="void reconnectSession(surfaceTab)"
    />
  </Teleport>
</template>
