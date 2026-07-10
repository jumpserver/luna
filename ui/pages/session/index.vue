<script setup lang="ts">
definePageMeta({ layout: "connect" });

const route = useRoute();
const router = useRouter();

onMounted(async () => {
  const payload = route.query.asset_window_payload;
  if (typeof payload !== "string" || !payload) return;

  try {
    const parsed = decodeLegacyWindowPayload(payload);
    await router.replace(buildSessionPath(parsed.asset, parsed.connectionInfo));
  } catch {
    await router.replace("/");
  }
});
</script>

<template>
  <div class="grid h-dvh place-items-center text-sm text-muted">
    <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
  </div>
</template>
