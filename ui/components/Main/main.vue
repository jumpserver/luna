<script setup lang="ts">
type alertType = "incompatible" | "noMatch";

const { theme } = useSettingManager();
const { componentsConfig } = useAppConfig();
const clearSelectionCallback = ref<(() => void) | null>(null);

const { t } = useI18n();
const latestVersion = ref("");
const alertType = ref<"" | alertType>("");
const isAlertOpen = ref(false);

const description = computed(() => {
  if (alertType.value === "incompatible") return t("Login.VersionIncompatible");
  if (alertType.value === "noMatch") return t("Login.VersionNoMatch", { version: latestVersion.value });
  return "";
});

const clearSelection = () => {
  if (clearSelectionCallback.value) {
    clearSelectionCallback.value();
  }
};

const providerClearSelection = (callback: () => void) => {
  clearSelectionCallback.value = callback;
};

useEventBus().on("versionAlert", ({ type, version }: { type: string; version?: string }) => {
  alertType.value = type as alertType;
  isAlertOpen.value = true;

  if (version) {
    latestVersion.value = version;
  }
});

provide("providerClearSelection", providerClearSelection);
</script>

<template>
  <UCard
    variant="soft"
    class="w-full"
    :style="{
      borderTopRightRadius: '0px',
      borderTopLeftRadius: '0px',
      borderBottomLeftRadius: '0px',
      borderBottomRightRadius: '0px',
      backgroundColor:
        theme === 'dark'
          ? componentsConfig.pages.mainCardDarkBackgroundColor
          : componentsConfig.pages.mainCardLightBackgroundColor
    }"
    :ui="{
      header: 'p-0 sm:p-0',
      body: 'p-2 pr-1 sm:p-4 px-4 h-[calc(100vh-58px)]',
      root: 'rounded-none'
    }"
    @click="clearSelection"
  >
    <template #header>
      <Header />
    </template>

    <UAlert
      v-if="description && isAlertOpen"
      v-model:open="isAlertOpen"
      close
      color="primary"
      variant="soft"
      :description="description"
      icon="solar:shield-warning-linear"
      class="mb-4 mr-4"
    />

    <slot />
  </UCard>
</template>
