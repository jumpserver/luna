<script setup lang="ts">
type alertTypes = "incompatible" | "noMatch";

const { theme } = useSettingManager();
const { componentsConfig } = useAppConfig();
const { activeWorkspaceMode } = useWorkspaceMode();
const clearSelectionCallback = ref<(() => void) | null>(null);

const { t } = useI18n();
const latestVersion = ref("");
const alertType = ref<"" | alertTypes>("");
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

const cardUi = computed(() => ({
  header: "p-0 sm:p-0 shrink-0",
  body: "p-0 sm:p-0 flex-1 min-h-0 overflow-hidden flex flex-col",
  root: "rounded-none h-screen flex flex-col min-h-0"
}));

useEventBus().on("versionAlert", ({ type, version }: { type: string, version?: string }) => {
  alertType.value = type as alertTypes;
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
    class="flex h-full w-full min-h-0 flex-col"
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
    :ui="cardUi"
    @click="clearSelection"
  >
    <template #header>
      <Header v-if="activeWorkspaceMode !== 'assets'" />
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
