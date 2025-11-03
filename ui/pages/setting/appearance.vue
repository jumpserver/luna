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

const selectedFont = ref<string>("system");
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

const FALLBACK_FONTS = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial';
const OPEN_SANS_VALUE = '"Open Sans", ' + FALLBACK_FONTS;

const fontsItems = ref<FontItem[]>([
  {
    label: t("Common.SystemDefault"),
    id: "system",
    value: FALLBACK_FONTS
  }
]);

const loadSystemFonts = async () => {
  const fallback = FALLBACK_FONTS;

  try {
    const families = await useTauriCoreInvoke<string[]>("list_system_fonts");

    const dynamicItems: FontItem[] = (families || []).map((name) => ({
      id: name,
      label: name,
      value: `"${name}", ${fallback}`
    }));

    const systemDefault = fontsItems.value[0];

    if (!systemDefault) return;

    const hasOpenSans = dynamicItems.some((i) => i.label.toLowerCase() === "open sans");
    const openSansItem: FontItem | null = hasOpenSans
      ? null
      : { id: "openSans", label: "Open Sans", value: OPEN_SANS_VALUE };

    fontsItems.value = openSansItem
      ? [systemDefault, openSansItem, ...dynamicItems]
      : [systemDefault, ...dynamicItems];
  } catch (e) {
    fontsItems.value = [
      fontsItems.value[0]!,
      { label: "Open Sans", id: "openSans", value: '"Open Sans", ' + fallback },
      {
        label: "Noto Sans SC",
        id: "notoSansSC",
        value: '"Noto Sans SC", "Noto Sans", ' + fallback
      },
      { label: "Inter", id: "inter", value: '"Inter", ' + fallback }
    ];
  } finally {
    const savedRaw = fontFamily.value;
    // 默认值：Open Sans
    const normalizedSaved = !savedRaw || savedRaw === "System UI" ? OPEN_SANS_VALUE : savedRaw;

    if (normalizedSaved !== savedRaw) {
      setFontFamily(normalizedSaved);
    }

    const matched = fontsItems.value.find((i) => i.value === normalizedSaved);

    selectedFont.value = matched?.id || "system";
    applyFont(normalizedSaved);
  }
};

onMounted(() => {
  loadSystemFonts();
});

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
    try {
      useTauriEventEmit("font-changed", { value });
    } catch {}
  }
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
      <USelectMenu
        v-model="selectedFont"
        :items="fontsItems"
        value-key="id"
        option-attribute="label"
        class="w-56"
      />
    </div>
  </div>
</template>
