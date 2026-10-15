<script setup lang="ts">
import { desktopOpener } from "~/shared/desktop/bridge";

const { t } = useI18n();
const toast = useToast();
const { pending, dismiss, confirm } = useClientCompatibility();
const open = computed({
  get: () => pending.value !== null,
  set: (value) => {
    if (!value) dismiss();
  }
});
const downloadUrl = computed(() => {
  const site = pending.value?.site;
  return site ? `${site.replace(/\/+$/, "")}/core/download/` : "";
});
const openDownload = async () => {
  if (!downloadUrl.value) return;
  try {
    await desktopOpener.openUrl(downloadUrl.value);
  } catch {
    toast.add({ title: t("Common.OperationFailed"), color: "error" });
  }
};
const formatVersion = (value?: string) => {
  const version = value?.trim();
  return version ? `v${version.replace(/^v/, "")}` : "";
};
const description = computed(() => {
  const result = pending.value;
  if (!result) return "";
  const reason =
    result.status === "unknown"
      ? t(`ClientCompatibility.${result.reason || "network"}`)
      : result.failures
          .map((failure) =>
            t(`ClientCompatibility.${failure}`, {
              client: formatVersion(result.clientVersion),
              minClient: formatVersion(result.minClientVersion),
              core: formatVersion(result.coreVersion),
              minCore: formatVersion(result.minCoreVersion)
            })
          )
          .join(" ");
  return `${reason} ${t("ClientCompatibility.ContinuePrompt", { site: result.site })}`;
});
</script>

<template>
  <ModalAlertDialog
    v-model:open="open"
    :title="t('ClientCompatibility.Title')"
    :confirm-label="t('ClientCompatibility.Continue')"
    @confirm="confirm"
  >
    <template #body>
      <div class="space-y-3 text-sm break-words">
        <p>{{ description }}</p>
        <ULink
          v-if="downloadUrl"
          :to="downloadUrl"
          external
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary hover:underline"
          @click.prevent="openDownload"
        >
          {{ t("Setting.DownloadClient") }}
        </ULink>
      </div>
    </template>
  </ModalAlertDialog>
</template>
