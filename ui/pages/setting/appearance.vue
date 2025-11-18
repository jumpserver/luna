<script setup lang="ts">
import type { ThemeType } from "~/types";
import type { SelectItem } from "@nuxt/ui";
import { useSettingManager } from "~/composables/useSettingManager";

interface FontItem {
  id: string;
  value: string;
  label: string;
}

definePageMeta({
  layout: "setting"
});

const { t } = useI18n();
const {
  theme,
  fontFamily,
  primaryColorLight,
  primaryColorDark,
  hydrationPromise,
  isHydrated,
  setFontFamily,
  setPrimaryColorLight,
  setPrimaryColorDark
} = useSettingManager();

const { applyPrimaryColor } = useColor();
const { manualSetTheme, enableFollowSystem, followSystem, userTheme } = useThemeAdapter();

const selectedFont = ref<string>("system");
const selectedAppearance = computed<ThemeType>({
  get: () => {
    if (followSystem.value) return "withSystem";

    const saved = (theme.value || "") as ThemeType;
    if (saved === "dark" || saved === "light") return saved;

    const current = (userTheme.value || "") as ThemeType;
    if (current === "dark" || current === "light") return current;

    return "light";
  },
  set: (id: ThemeType) => {
    if (id === "withSystem") {
      void enableFollowSystem().then(() => {
        useTauriEventEmit("theme-changed", { mode: "withSystem" });
        nextTick().then(() => applyCurrentThemeColor(true));
      });
      return;
    }

    manualSetTheme(id as any);
    useTauriEventEmit("theme-changed", { mode: id });
    nextTick().then(() => applyCurrentThemeColor(true));
  }
});

const mainColor = computed<string>({
  get: () => (userTheme.value === "dark" ? primaryColorDark.value || "#34d399" : primaryColorLight.value || "#1ab394"),
  set: (color: string) => {
    if (!color) return;

    const hex = applyPrimaryColor(color);

    if (userTheme.value === "dark") {
      setPrimaryColorDark(hex);
    } else {
      setPrimaryColorLight(hex);
    }

    useTauriEventEmit("primary-color-changed", { hex, mode: userTheme.value });
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

    fontsItems.value = [systemDefault, ...dynamicItems];
  } catch (e) {
    fontsItems.value = [
      fontsItems.value[0]!,
      { label: "System UI", id: "systemUI", value: fallback },
      {
        label: "Noto Sans SC",
        id: "notoSansSC",
        value: '"Noto Sans SC", "Noto Sans", ' + fallback
      },
      { label: "Inter", id: "inter", value: '"Inter", ' + fallback }
    ];
  } finally {
    const savedRaw = fontFamily.value;
    const normalizedSaved = !savedRaw || savedRaw === "System UI" ? FALLBACK_FONTS : savedRaw;

    if (normalizedSaved !== savedRaw) {
      setFontFamily(normalizedSaved);
    }

    const matched = fontsItems.value.find((i) => i.value === normalizedSaved);

    selectedFont.value = matched?.id || "system";
    applyFont(normalizedSaved);
  }
};

const applyCurrentThemeColor = (broadcast = false) => {
  const modeNow = (userTheme.value as string) || (selectedAppearance.value as string);
  const hexNow = modeNow === "dark" ? primaryColorDark.value : primaryColorLight.value;

  if (hexNow) {
    applyPrimaryColor(hexNow);
    if (broadcast) {
      useTauriEventEmit("primary-color-changed", { hex: hexNow, mode: modeNow });
    }
  }
};

onMounted(async () => {
  const promise = hydrationPromise.value;

  if (promise) {
    await promise;
  } else if (!isHydrated.value) {
    await nextTick();
  }

  applyCurrentThemeColor();
  loadSystemFonts();
});

watch(
  () => userTheme.value,
  () => {
    applyCurrentThemeColor();
  }
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
      <ColorPicker v-model="mainColor" :colors="predefineColors" class="w-40" />
    </div>

    <USeparator />

    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">{{ t("Common.Fonts") }}</span>
      <USelectMenu
        v-model="selectedFont"
        :items="fontsItems"
        :search-input="{ placeholder: t('Operation.Search') }"
        value-key="id"
        option-attribute="label"
        class="w-56"
      />
    </div>
  </div>
</template>
