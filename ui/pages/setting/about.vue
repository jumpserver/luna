<script setup lang="ts">
import { getPublicSettings } from "~/composables/useApiRequest";
import { getConfiguredAppName, isDefaultAppName, normalizeAppName } from "~/composables/useAppName";
import { desktopApp, desktopOpener } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { isDefaultInterfaceLogo } from "~/utils/interfaceLogo";

const FALLBACK_LOGO = "/logo.png";
const appName = ref(getConfiguredAppName());
const logoSrc = ref(FALLBACK_LOGO);
const isDefaultProduct = computed(() => isDefaultAppName(appName.value));
const website = "https://jumpserver.org";

const productVersion = ref("");
const licenseCompany = ref("");
const isEnterpriseEdition = ref(false);
const showCommunityLinks = ref(false);
const isWebRuntime = computed(() => !isDesktopRuntime());
const downloadCenterUrl = computed(() =>
  import.meta.client ? withWebSitePrefix("/core/download/") : "/core/download/"
);
const { t } = useI18n();
const productInfo = computed(() => [
  {
    label: t("Setting.Product"),
    value: t(isEnterpriseEdition.value ? "Setting.EnterpriseEdition" : "Setting.CommunityEdition")
  },
  { label: t("Common.Version"), value: productVersion.value || "—" },
  { label: t("Setting.LicenseCompany"), value: licenseCompany.value || "—" }
]);
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

function resolveInterfaceLogo(path?: string) {
  if (isDefaultInterfaceLogo(path)) return FALLBACK_LOGO;
  const logo = path!.trim();
  if (!isDesktopRuntime()) return withWebSitePrefix(logo);
  const site = useUserInfoStore().currentSite;
  if (!site) return FALLBACK_LOGO;
  try {
    const siteUrl = new URL(site);
    return new URL(withWebSitePrefix(logo, siteUrl.pathname), siteUrl.origin).href;
  } catch {
    return FALLBACK_LOGO;
  }
}

function onLogoError() {
  if (logoSrc.value !== FALLBACK_LOGO) logoSrc.value = FALLBACK_LOGO;
}

onMounted(async () => {
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
    const interfaceVersion = settings.INTERFACE?.version;
    isEnterpriseEdition.value = settings.XPACK_LICENSE_EDITION_ULTIMATE === true;
    showCommunityLinks.value = settings.XPACK_LICENSE_IS_VALID !== true;
    if (typeof interfaceVersion === "string") productVersion.value = interfaceVersion.trim();
    if (settings.XPACK_LICENSE_IS_VALID === true && typeof corporation === "string") {
      licenseCompany.value = corporation.trim();
    }
    logoSrc.value = resolveInterfaceLogo(settings.INTERFACE?.logo_logout);
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
  <div class="flex min-h-[420px] items-center justify-center py-8 sm:py-12">
    <section
      class="w-full max-w-xl overflow-hidden rounded-[length:var(--app-radius)] border border-[var(--app-border)] bg-[var(--app-card-bg)]"
    >
      <header class="flex items-center gap-4 px-5 py-6 sm:px-8">
        <img
          :src="logoSrc"
          :alt="appName"
          class="size-14 shrink-0 rounded-[length:var(--app-radius)] sm:size-16"
          @error="onLogoError"
        />
        <div class="min-w-0">
          <h2 class="truncate text-lg font-semibold tracking-[-0.02em] text-highlighted sm:text-xl">{{ appName }}</h2>
          <p class="mt-1 text-xs leading-5 text-muted">{{ t("Setting.AboutDescription") }}</p>
        </div>
      </header>

      <div class="border-t border-[var(--app-border)]">
        <dl class="divide-y divide-[var(--app-border)] px-5 sm:px-8">
          <div
            v-for="item in productInfo"
            :key="item.label"
            class="grid grid-cols-[7rem_minmax(0,1fr)] gap-4 py-3 text-sm"
          >
            <dt class="text-muted">{{ item.label }}</dt>
            <dd class="min-w-0 break-words font-medium text-highlighted">{{ item.value }}</dd>
          </div>
          <div v-if="isWebRuntime" class="grid grid-cols-[7rem_minmax(0,1fr)] gap-4 py-3 text-sm">
            <dt class="text-muted">{{ t("Setting.DownloadCenter") }}</dt>
            <dd>
              <ULink
                :to="downloadCenterUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {{ t("Setting.DownloadCenter") }}
                <UIcon name="i-lucide-arrow-up-right" class="size-3.5" />
              </ULink>
            </dd>
          </div>
        </dl>

        <div v-if="isDefaultProduct && showCommunityLinks" class="flex flex-wrap gap-1 px-4 py-3 sm:px-7">
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
      </div>
    </section>
  </div>
</template>
