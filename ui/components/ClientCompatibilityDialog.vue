<script setup lang="ts">
const { t } = useI18n();
const toast = useToast();
const { blocked, dismiss, retry, download } = useClientCompatibility();
const open = computed({
  get: () => blocked.value !== null,
  set: (value) => {
    if (!value) dismiss();
  }
});
const formatVersion = (value?: string) => {
  const version = value?.trim();
  return version ? `v${version.replace(/^v/, "")}` : "";
};
const description = computed(() => {
  const result = blocked.value;
  if (!result) return "";
  if (result.status === "unknown") return t(`ClientCompatibility.${result.reason || "network"}`);
  return result.failures
    .map((failure) =>
      t(`ClientCompatibility.${failure}`, {
        client: formatVersion(result.clientVersion),
        minClient: formatVersion(result.minClientVersion),
        core: formatVersion(result.coreVersion),
        minCore: formatVersion(result.minCoreVersion)
      })
    )
    .join("\n");
});
const canDownload = computed(
  () => blocked.value?.status === "incompatible" && blocked.value.failures.includes("client-too-old")
);
const openDownload = async () => {
  try {
    await download();
  } catch {
    toast.add({ title: t("ClientCompatibility.DownloadFailed"), color: "error" });
  }
};
</script>

<template>
  <UModal
    v-model:open="open"
    :title="
      t(blocked?.status === 'unknown' ? 'ClientCompatibility.UnknownTitle' : 'ClientCompatibility.IncompatibleTitle')
    "
    :description="description"
    :ui="{ content: 'max-w-md', description: 'whitespace-pre-line', footer: 'justify-end gap-2' }"
  >
    <template #body>
      <p class="break-all text-sm text-muted">{{ blocked?.site }}</p>
      <p class="mt-2 text-sm text-muted">{{ t("ClientCompatibility.ConnectionPaused") }}</p>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" @click="dismiss">{{ t("Common.Close") }}</UButton>
      <UButton v-if="canDownload" icon="i-lucide-external-link" @click="openDownload">
        {{ t("ClientCompatibility.Download") }}
      </UButton>
      <UButton v-else color="primary" icon="i-lucide-refresh-cw" @click="retry">
        {{ t("ClientCompatibility.Retry") }}
      </UButton>
    </template>
  </UModal>
</template>
