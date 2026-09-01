<script setup lang="ts">
import { getConfiguredAppName, isDefaultAppName, normalizeAppName } from "~/composables/useAppName";
import { desktopApp, desktopOpener } from "~/shared/desktop/bridge";

const appName = ref(getConfiguredAppName());
const logoSrc = computed(() => "/logo.png");
const isDefaultProduct = computed(() => isDefaultAppName(appName.value));
const website = "https://jumpserver.org";

const version = ref<string>("—");
const links = [
  {
    label: "GitHub",
    icon: "line-md:github",
    to: "https://github.com/jumpserver/jumpserver"
  },
  {
    label: "Discord",
    icon: "line-md:discord",
    to: "https://discord.com/invite/W6vYXmAQG2"
  }
];

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
});

const openLink = async (url: string) => {
  try {
    await desktopOpener.openUrl(url);
  } catch (e) {
    console.error("open link failed", e);
  }
};
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-4">
    <img :src="logoSrc" :alt="appName" class="size-16 rounded-xl" />

    <div class="flex flex-col items-center gap-3">
      <div class="flex items-center gap-2">
        <p class="text-base font-semibold text-highlighted">{{ appName }}</p>
        <UBadge icon="i-lucide-rocket" size="sm" color="primary" variant="soft">v{{ version }}</UBadge>
      </div>

      <div v-if="isDefaultProduct" class="flex items-center justify-center gap-2">
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

      <UButton
        v-if="isDefaultProduct"
        :label="website"
        icon="i-lucide-mail"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="openLink(website)"
      />
    </div>
  </div>
</template>
