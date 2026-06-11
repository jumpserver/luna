<script setup lang="ts">
import { getConfiguredAppName, isDefaultAppName, normalizeAppName } from "~/composables/useAppName";

definePageMeta({
  layout: "setting"
});

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
    version.value = await useTauriAppGetVersion();
  } catch {}

  try {
    // 运行时读取 Tauri productName，避免只依赖 VITE_APP_NAME 导致定制构建的 About 页面显示为空。
    const runtimeAppName = (await useTauriAppGetName()).trim();
    if (runtimeAppName) {
      appName.value = normalizeAppName(runtimeAppName);
    }
  } catch {}
});

const openLink = async (url: string) => {
  try {
    await useTauriOpenerOpenUrl(url);
  } catch (e) {
    console.error("open link failed", e);
  }
};
</script>

<template>
  <UContainer class="h-full">
    <div class="h-full flex flex-col gap-2 items-center justify-center">
      <img :src="logoSrc" :alt="appName" class="w-16 h-16 rounded-xl">

      <div class="space-y-2">
        <p class="text-base font-semibold">
          {{ appName }}

          <UBadge icon="i-lucide-rocket" size="sm" color="primary" variant="soft">
            v{{ version }}
          </UBadge>
        </p>

        <div v-if="isDefaultProduct" class="flex items-center justify-center gap-3 text-sm text-gray-400">
          <button
            v-for="link in links"
            :key="link.to"
            type="button"
            class="inline-flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
            @click="openLink(link.to)"
          >
            <UIcon :name="link.icon" />
            {{ link.label }}
          </button>
        </div>
      </div>

      <div v-if="isDefaultProduct" class="flex items-center justify-center gap-3 text-sm text-gray-400">
        <button
          type="button"
          class="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
          @click="openLink(website)"
        >
          <UIcon name="i-lucide-mail" />
          {{ website }}
        </button>
      </div>
    </div>
  </UContainer>
</template>
