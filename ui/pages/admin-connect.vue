<script setup lang="ts">
import { buildAdminConnectSessionPath } from "~/composables/useSessionWindowConnect";

definePageMeta({ layout: "connect" });

const route = useRoute();
const router = useRouter();
const error = ref("");

onMounted(async () => {
  const path = buildAdminConnectSessionPath(route.query);
  if (!path) {
    error.value = "Missing asset, account, or protocol";
    return;
  }
  await router.replace(path);
});
</script>

<template>
  <div class="grid h-dvh place-items-center p-6 text-sm text-muted">
    <div v-if="error" class="flex max-w-sm flex-col items-center gap-3 text-center">
      <UIcon name="i-lucide-circle-alert" class="size-7" />
      <p>{{ error }}</p>
    </div>
    <UIcon v-else name="i-lucide-loader-circle" class="size-6 animate-spin" />
  </div>
</template>
