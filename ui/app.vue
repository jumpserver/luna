<script setup lang="ts">
import { isChenSingleRoute } from "~/chen/v1/standalone";
import { clientNoticeOverlay } from "~/shared/desktop/bridge";

const route = useRoute();
const nativeNotices = Boolean(clientNoticeOverlay());
if (!nativeNotices) {
  useNotificationLayout();
  const { initialTheme } = useThemeAdapter();
  onMounted(initialTheme);
}
const single = computed(() => isChenSingleRoute(route.path));
const SingleAppShell = defineAsyncComponent(() => import("~/chen/v1/SingleAppShell.vue"));
const ManagedApp = defineAsyncComponent(() => import("~/components/ManagedApp.vue"));
</script>

<template>
  <UApp v-if="nativeNotices"><NuxtPage /></UApp>
  <ClientLockGuard v-else>
    <SingleAppShell v-if="single" />
    <WebSessionLockGuard v-else>
      <ManagedApp />
    </WebSessionLockGuard>
  </ClientLockGuard>
</template>
