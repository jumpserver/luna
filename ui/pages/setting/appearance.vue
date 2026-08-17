<script setup lang="ts">
import type { ThemePresetId } from "~/types";
import { useSettingManager } from "~/composables/useSettingManager";
import { useThemeOptions } from "~/composables/useThemeOptions";
import { CODEMIRROR_THEME_PRESETS, isCodeMirrorThemePresetId } from "~/shared/theme/presets/codemirror";
import { TERMINAL_THEME_PRESETS } from "~/shared/theme/presets/terminal";

interface FontItem {
  id: string;
  value: string;
  label: string;
}

definePageMeta({
  layout: "setting"
});

const FALLBACK_FONTS =
  '"Inter", "Noto Sans SC", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const { t } = useI18n();
const {
  fontFamily,
  primaryColorLight,
  primaryColorDark,
  hydrationPromise,
  isHydrated,
  setFontFamily,
  setPrimaryColorLight,
  setPrimaryColorDark,
  setTerminalThemePreset,
  setCodeMirrorThemePreset,
  terminalThemePreset,
  codeMirrorThemePreset
} = useSettingManager();

const { applyPrimaryColor } = useColor();
const { userTheme } = useThemeAdapter();
const { currentThemePresetId, selectThemePreset, themeSelectItems } = useThemeOptions();

const selectedFont = ref<string>("system");
const fontsItems = ref<FontItem[]>([
  {
    label: t("Common.SystemDefault"),
    id: "system",
    value: FALLBACK_FONTS
  }
]);

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
  if (userTheme.value === "light") {
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

const selectedThemePreset = computed<string>({
  get: () => currentThemePresetId.value,
  set: (id: string) => {
    selectThemePreset(id as ThemePresetId);
  }
});

const terminalThemeItems = computed(() =>
  TERMINAL_THEME_PRESETS.map((item) => ({
    id: item.id,
    label: item.id === "follow-app" ? t("Common.FollowAppTheme") : item.label
  }))
);
const codeMirrorThemeItems = computed(() => [
  ...CODEMIRROR_THEME_PRESETS.map((item) => ({
    id: item.id,
    label: item.id === "follow-app" ? t("Common.FollowAppTheme") : item.label
  }))
]);

function applyFont(font: string) {
  const root = document.documentElement;
  root.style.setProperty("--font-sans", font);
  root.style.setProperty("--font-heading", font);
}

function selectCodeMirrorTheme(id: string) {
  if (isCodeMirrorThemePresetId(id)) setCodeMirrorThemePreset(id);
}

function applyCurrentThemeColor(broadcast = false) {
  const modeNow = (userTheme.value as string) || "light";
  const hexNow = modeNow === "dark" ? primaryColorDark.value : primaryColorLight.value;

  if (hexNow) {
    applyPrimaryColor(hexNow);
    if (broadcast) {
      useTauriEventEmit("primary-color-changed", { hex: hexNow, mode: modeNow });
    }
  }
}

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
  } catch {
    fontsItems.value = [
      fontsItems.value[0]!,
      { label: "System UI", id: "systemUI", value: fallback },
      {
        label: "Noto Sans SC",
        id: "notoSansSC",
        value: `"Noto Sans SC", "Noto Sans", ${fallback}`
      },
      { label: "Inter", id: "inter", value: `"Inter", ${fallback}` }
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
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">{{ t("Common.Appearance") }}</span>
      <SettingSelect
        v-model="selectedThemePreset"
        :items="themeSelectItems"
        :aria-label="t('Common.Appearance')"
        class="w-64"
      />
    </div>

    <USeparator />

    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">{{ t("Common.TerminalColorScheme") }}</span>
      <SettingSelect
        :model-value="terminalThemePreset"
        :items="terminalThemeItems"
        :aria-label="t('Common.TerminalColorScheme')"
        class="w-64"
        @update:model-value="setTerminalThemePreset"
      />
    </div>

    <USeparator />

    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">{{ t("Common.CodeMirrorColorScheme") }}</span>
      <SettingSelect
        :model-value="codeMirrorThemePreset"
        :items="codeMirrorThemeItems"
        :aria-label="t('Common.CodeMirrorColorScheme')"
        class="w-64"
        @update:model-value="selectCodeMirrorTheme"
      />
    </div>

    <USeparator />

    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">{{ t("Common.PrimaryColor") }}</span>
      <ColorPicker v-model="mainColor" :colors="predefineColors" class="w-40" />
    </div>

    <USeparator />

    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">{{ t("Common.Fonts") }}</span>
      <SettingSelect v-model="selectedFont" :items="fontsItems" :aria-label="t('Common.Fonts')" class="w-48" />
    </div>
  </div>
</template>
