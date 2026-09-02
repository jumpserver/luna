<script setup lang="ts">
import { getPublicSettings } from "~/composables/useApiRequest";
import { getConfiguredAppName, isDefaultAppName, normalizeAppName } from "~/composables/useAppName";
import { desktopApp, desktopOpener } from "~/shared/desktop/bridge";

const appName = ref(getConfiguredAppName());
const logoSrc = computed(() => "/logo.png");
const isDefaultProduct = computed(() => isDefaultAppName(appName.value));
const website = "https://jumpserver.org";

const version = ref("");
const licenseCompany = ref("");
const showCommunityLinks = ref(false);
const { t } = useI18n();
const links = computed(() => [
  {
    label: "GitHub",
    icon: "line-md:github",
    to: "https://github.com/jumpserver/jumpserver"
  },
  {
    label: "Discord",
    icon: "line-md:discord",
    to: "https://discord.com/invite/W6vYXmAQG2"
  },
  {
    label: t("Setting.OfficialWebsite"),
    icon: "i-lucide-globe-2",
    to: website
  }
]);

onMounted(async () => {
  try {
    version.value = await desktopApp.getVersion();
  } catch {}

  try {
    // 运行时读取 Electron productName，避免只依赖 VITE_APP_NAME 导致定制构建的 About 页面显示为空。
    const runtimeAppName = (await desktopApp.getName()).trim();
    if (runtimeAppName) {
      appName.value = normalizeAppName(runtimeAppName);
    }
  } catch {}

  try {
    const settings = await getPublicSettings();
    const corporation = settings.XPACK_LICENSE_INFO?.corporation;
    showCommunityLinks.value = settings.XPACK_LICENSE_IS_VALID !== true;
    if (settings.XPACK_LICENSE_IS_VALID === true && typeof corporation === "string") {
      licenseCompany.value = corporation.trim();
    }
  } catch {
    showCommunityLinks.value = true;
  }
});

const openLink = async (url: string) => {
  if (!isDesktopRuntime()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  try {
    await desktopOpener.openUrl(url);
  } catch (e) {
    console.error("open link failed", e);
  }
};
</script>

<template>
  <div class="flex min-h-[420px] items-center justify-center py-8">
    <section class="flex w-full max-w-md flex-col items-center text-center">
      <img :src="logoSrc" :alt="appName" class="size-20 rounded-2xl" />

      <div class="mt-4 flex items-center gap-2">
        <h2 class="text-xl font-semibold text-highlighted">{{ appName }}</h2>
        <UBadge v-if="version" size="sm" color="primary" variant="soft">v{{ version }}</UBadge>
      </div>

      <div
        v-if="licenseCompany"
        class="mt-5 inline-flex max-w-full items-center gap-2.5 rounded-lg border border-default bg-elevated/40 px-3 py-2 text-left"
      >
        <span class="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <UIcon name="i-lucide-badge-check" class="size-4" />
        </span>
        <p class="min-w-0 break-words text-sm">
          <span class="mr-2 text-xs text-muted">{{ t("Setting.LicensedTo") }}</span>
          <span class="font-medium text-highlighted">{{ licenseCompany }}</span>
        </p>
      </div>

      <div v-if="isDefaultProduct && showCommunityLinks" class="mt-4 flex flex-wrap items-center justify-center gap-1">
        <UButton
          v-for="link in links"
          :key="link.to"
          :label="link.label"
          :icon="link.icon"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="openLink(link.to)"
        />
      </div>
    </section>
  </div>
</template>
