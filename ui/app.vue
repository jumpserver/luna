<script setup lang="ts">
import { isChenSingleRoute } from "~/chen/v1/standalone";
import { isLocalAgentRoute } from "~/shared/agents/route";
import { clientNoticeOverlay } from "~/shared/desktop/bridge";

const route = useRoute();
const nativeNotices = Boolean(clientNoticeOverlay());
if (!nativeNotices) {
  useNotificationLayout();
  const { initialTheme } = useThemeAdapter();
  onMounted(initialTheme);
}
const single = computed(() => isChenSingleRoute(route.path));
const localAgent = computed(() => isLocalAgentRoute(route.path));
const SingleAppShell = defineAsyncComponent(() => import("~/chen/v1/SingleAppShell.vue"));
const ManagedApp = defineAsyncComponent(() => import("~/components/ManagedApp.vue"));
</script>

<template>
  <UApp v-if="nativeNotices"><NuxtPage /></UApp>
  <ClientLockGuard v-else>
    <UApp v-if="localAgent"><NuxtPage /></UApp>
    <SingleAppShell v-else-if="single" />
    <WebSessionLockGuard v-else>
      <ManagedApp />
    </WebSessionLockGuard>
  </ClientLockGuard>
</template>
