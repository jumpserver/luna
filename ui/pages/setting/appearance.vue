<script setup lang="ts">
import type { SelectItem } from "@nuxt/ui";
import type { themeType } from "~/store/modules/userSetting";

import { useUserSettingStore } from "~/store/modules/userSetting";

interface FontItem {
  id: string;
  value: string;
  label: string;
}

definePageMeta({
  layout: "setting"
});

const { t } = useI18n();
const userSettingStore = useUserSettingStore();
const { theme, fontFamily, primaryColorLight, primaryColorDark } = storeToRefs(userSettingStore);
const { setFontFamily, setPrimaryColorLight, setPrimaryColorDark } = userSettingStore;

const { applyPrimaryColor } = useColor();
const { manualSetTheme, enableFollowSystem, followSystem, userTheme } = useThemeAdapter();

const selectedFont = ref<string>("");
const selectedAppearance = ref<themeType>(
  followSystem.value ? "withSystem" : theme.value || "light"
);

const mainColor = computed<string>({
  get: () =>
    userTheme.value === "dark"
      ? primaryColorDark.value || "#34d399"
      : primaryColorLight.value || "#1ab394",
  set: (color: string) => {
    if (!color) return;

    const hex = applyPrimaryColor(color);

    if (userTheme.value === "dark") {
      setPrimaryColorDark(hex);
    } else {
      setPrimaryColorLight(hex);
    }

    try {
      useTauriEventEmit("primary-color-changed", { hex });
    } catch {}
  }
});

const predefineColors = computed<string[]>(() => {
  if (theme.value === "light") {
    return [
      "#1ab394",
      "#3b82f6",
      "#8b5cf6",
      "#f59e0b",
      "#ec4899",
      "#06b6d4",
      "#64748b",
      "#f43f5e",
      "#84cc16",
      "#6366f1",
      "#fbbf24",
      "#14b8a6"
    ];
  } else {
    return [
      "#34d399",
      "#60a5fa",
      "#a78bfa",
      "#fbbf24",
      "#f472b6",
      "#67e8f9",
      "#94a3b8",
      "#fb7185",
      "#a3e635",
      "#818cf8",
      "#fcd34d",
      "#2dd4bf"
    ];
  }
});

const appearanceItems = computed<SelectItem[]>(() => [
  { label: t("Common.WithSystem"), id: "withSystem" },
  { label: t("Common.Light"), id: "light" },
  { label: t("Common.Dark"), id: "dark" }
]);

const fontsItems = computed<FontItem[]>(() => [
  {
    label: t("Common.SystemDefault"),
    id: "system",
    value:
      'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Noto Sans", "Liberation Sans", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"'
  },
  {
    label: "Open Sans",
    id: "openSans",
    value:
      '"Open Sans", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Noto Sans", "Liberation Sans"'
  },
  {
    label: "Noto Sans SC",
    id: "notoSansSC",
    value:
      '"Noto Sans SC", "Noto Sans", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial'
  },
  {
    label: "Inter",
    id: "inter",
    value: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Noto Sans"'
  }
]);

// prettier-ignore
selectedFont.value = (fontsItems.value.find(i => i.value === fontFamily.value)?.id as string) || 'system';

watch(
  () => selectedAppearance.value,
  async (id) => {
    if (id === "withSystem") {
      await enableFollowSystem();
      useTauriEventEmit("theme-changed", { mode: "withSystem" });
    } else {
      manualSetTheme(id as any);
      useTauriEventEmit("theme-changed", { mode: id });
    }
  },
  { immediate: true }
);

watch(
  () => userTheme.value,
  () => {
    const hex =
      userTheme.value === "dark"
        ? primaryColorDark.value || "#34d399"
        : primaryColorLight.value || "#1ab394";

    applyPrimaryColor(hex);
    useTauriEventEmit("primary-color-changed", { hex });
  },
  { immediate: true }
);

watch(
  () => selectedFont.value,
  (id) => {
    const item = fontsItems.value.find((i: FontItem) => i.id === id) || fontsItems.value[0];
    const value = item?.value || fontsItems.value[0]?.value;

    if (!value) return;

    applyFont(value);
    setFontFamily(value);
  },
  { immediate: true }
);

function applyFont(font: string) {
  const root = document.documentElement;
  root.style.setProperty("--font-sans", font);
  root.style.setProperty("--font-heading", font);
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">{{ t("Common.Appearance") }}</span>
      <USelect v-model="selectedAppearance" value-key="id" :items="appearanceItems" class="w-40" />
    </div>

    <USeparator />

    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">{{ t("Common.PrimaryColor") }}</span>
      <el-color-picker v-model="mainColor" show-alpha :predefine="predefineColors" class="w-40" />
    </div>

    <USeparator />

    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">{{ t("Common.Fonts") }}</span>
      <USelect
        v-model="selectedFont"
        :items="(fontsItems as unknown as SelectItem[])"
        value-key="id"
        option-attribute="label"
        class="w-56"
      />
    </div>
  </div>
</template>
