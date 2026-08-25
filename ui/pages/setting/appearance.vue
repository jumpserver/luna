<script setup lang="ts">
import type { CodeMirrorThemePresetId } from "~/shared/theme/presets/codemirror";
import type { ThemePresetId } from "~/types";

import { useSettingManager } from "~/composables/useSettingManager";
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from "~/composables/useSettingStorage";
import { useThemeOptions } from "~/composables/useThemeOptions";
import { DARK_THEME_PRESETS, getThemePreset, LIGHT_THEME_PRESETS } from "~/composables/useThemePresets";
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

const SYSTEM_FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const LEGACY_DEFAULT_FONT_FAMILY =
  '"Inter", "Noto Sans SC", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const LIGHT_ACCENT_COLORS = [
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
const DARK_ACCENT_COLORS = [
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

const { t } = useI18n();
const {
  fontFamily,
  uiFontSize,
  codeFontSize,
  primaryColorLight,
  primaryColorDark,
  lightThemePreset,
  darkThemePreset,
  hydrationPromise,
  isHydrated,
  setFontFamily,
  setUiFontSize,
  setCodeFontSize,
  setPrimaryColorLight,
  setPrimaryColorDark,
  setLightThemePreset,
  setDarkThemePreset,
  setTerminalThemePreset,
  setCodeMirrorThemePreset,
  terminalThemePreset,
  codeMirrorThemePreset
} = useSettingManager();

const { applyPrimaryColor } = useColor();
const { userTheme } = useThemeAdapter();
const { currentAppearanceMode, applyAppearanceMode } = useThemeOptions();

const selectedFont = ref<string>("system");
const selectedUiFontSize = computed<number>({
  get: () => uiFontSize.value,
  set: (size) => setUiFontSize(size)
});
const selectedCodeFontSize = computed<number>({
  get: () => codeFontSize.value,
  set: (size) => setCodeFontSize(size)
});
const fontsItems = ref<FontItem[]>([
  {
    label: t("Common.SystemDefault"),
    id: "system",
    value: SYSTEM_FONT_FAMILY
  }
]);

const appearanceModes = computed(() => [
  {
    id: "withSystem" as const,
    label: t("Common.System")
  },
  {
    id: "light" as const,
    label: t("Common.Light")
  },
  {
    id: "dark" as const,
    label: t("Common.Dark")
  }
]);

const selectedAppearanceMode = computed<"withSystem" | "light" | "dark">({
  get: () => currentAppearanceMode.value,
  set: (mode) => {
    void applyAppearanceMode(mode);
  }
});

const lightThemeItems = LIGHT_THEME_PRESETS.map(({ id, label }) => ({ id, label }));
const darkThemeItems = DARK_THEME_PRESETS.map(({ id, label }) => ({ id, label }));

const selectedLightTheme = computed<ThemePresetId>({
  get: () => lightThemePreset.value,
  set: (id: string) => selectPalette("light", id as ThemePresetId)
});

const selectedDarkTheme = computed<ThemePresetId>({
  get: () => darkThemePreset.value,
  set: (id: string) => selectPalette("dark", id as ThemePresetId)
});

const lightAccentColor = computed<string>({
  get: () => primaryColorLight.value || "#1ab394",
  set: (color: string) => setAccentColor("light", color)
});

const darkAccentColor = computed<string>({
  get: () => primaryColorDark.value || "#34d399",
  set: (color: string) => setAccentColor("dark", color)
});

const selectedTerminalTheme = computed<string>({
  get: () => terminalThemePreset.value,
  set: (id: string) => setTerminalThemePreset(id)
});

const selectedCodeMirrorTheme = computed<CodeMirrorThemePresetId>({
  get: () => codeMirrorThemePreset.value,
  set: (id: string) => selectCodeMirrorTheme(id)
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

function setAccentColor(mode: "light" | "dark", color: string) {
  if (!color) return;

  const hex = userTheme.value === mode ? applyPrimaryColor(color) : color;

  if (mode === "light") {
    setPrimaryColorLight(hex);
  } else {
    setPrimaryColorDark(hex);
  }

  useTauriEventEmit("primary-color-changed", { hex, mode });
}

function selectPalette(mode: "light" | "dark", id: ThemePresetId) {
  const preset = getThemePreset(id);
  if (!preset) return;

  if (mode === "light") {
    setLightThemePreset(id);
  } else {
    setDarkThemePreset(id);
  }

  setAccentColor(mode, preset.accent);
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
  const fallback = SYSTEM_FONT_FAMILY;

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
    const normalizedSaved =
      !savedRaw || savedRaw === "System UI" || savedRaw === LEGACY_DEFAULT_FONT_FAMILY ? SYSTEM_FONT_FAMILY : savedRaw;

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
  <div class="space-y-8">
    <section aria-labelledby="theme-mode-heading">
      <UCard
        variant="outline"
        :ui="{
          root: 'rounded-xl bg-[var(--app-surface-card)] ring-[var(--app-border)]',
          body: 'p-0 sm:p-0'
        }"
      >
        <div class="flex min-h-16 items-center justify-between gap-6 px-4 py-3">
          <h2 id="theme-mode-heading" class="text-sm font-semibold text-highlighted">
            {{ t("Common.Theme") }}
          </h2>
          <UTabs
            v-model="selectedAppearanceMode"
            :items="appearanceModes"
            value-key="id"
            :content="false"
            color="neutral"
            variant="pill"
            size="xs"
            :ui="{
              root: 'w-auto shrink-0',
              list: 'w-auto bg-[var(--app-surface-canvas)] p-1 ring-1 ring-[var(--app-border)]',
              indicator: 'bg-[var(--app-state-hover-strong)] shadow-sm',
              trigger: 'grow-0 px-3 data-[state=active]:text-highlighted focus-visible:outline-[var(--app-focus-ring)]'
            }"
          />
        </div>
      </UCard>
    </section>

    <section aria-labelledby="palette-heading">
      <div class="mb-4">
        <h2 id="palette-heading" class="text-sm font-semibold text-highlighted">
          {{ t("Setting.ThemePalette") }}
        </h2>
        <p class="mt-1 text-xs text-muted">
          {{ t("Setting.ThemePaletteDescription") }}
        </p>
      </div>

      <div class="space-y-4">
        <UCard
          variant="outline"
          :ui="{
            root: 'rounded-xl bg-[var(--app-surface-card)] ring-[var(--app-border)]',
            body: 'divide-y divide-[var(--app-border)] p-0 sm:p-0'
          }"
        >
          <div class="flex items-center gap-2 px-4 py-3">
            <UIcon name="i-lucide-sun-medium" class="size-4 text-muted" />
            <span class="text-sm font-semibold text-highlighted">{{ t("Common.LightThemePalette") }}</span>
          </div>
          <div class="setting-row">
            <div>
              <p class="setting-row__label">{{ t("Setting.ThemeStyle") }}</p>
              <p class="setting-row__description">{{ t("Setting.LightThemeDescription") }}</p>
            </div>
            <USelect
              v-model="selectedLightTheme"
              :items="lightThemeItems"
              value-key="id"
              :aria-label="t('Common.LightThemePalette')"
              size="sm"
              class="w-full sm:w-64"
            />
          </div>
          <div class="setting-row">
            <div>
              <p class="setting-row__label">{{ t("Common.PrimaryColor") }}</p>
              <p class="setting-row__description">{{ t("Setting.PrimaryColorDescription") }}</p>
            </div>
            <ColorPicker v-model="lightAccentColor" :colors="LIGHT_ACCENT_COLORS" class="w-full sm:w-40" />
          </div>
        </UCard>

        <UCard
          variant="outline"
          :ui="{
            root: 'rounded-xl bg-[var(--app-surface-card)] ring-[var(--app-border)]',
            body: 'divide-y divide-[var(--app-border)] p-0 sm:p-0'
          }"
        >
          <div class="flex items-center gap-2 px-4 py-3">
            <UIcon name="i-lucide-moon-star" class="size-4 text-muted" />
            <span class="text-sm font-semibold text-highlighted">{{ t("Common.DarkThemePalette") }}</span>
          </div>
          <div class="setting-row">
            <div>
              <p class="setting-row__label">{{ t("Setting.ThemeStyle") }}</p>
              <p class="setting-row__description">{{ t("Setting.DarkThemeDescription") }}</p>
            </div>
            <USelect
              v-model="selectedDarkTheme"
              :items="darkThemeItems"
              value-key="id"
              :aria-label="t('Common.DarkThemePalette')"
              size="sm"
              class="w-full sm:w-64"
            />
          </div>
          <div class="setting-row">
            <div>
              <p class="setting-row__label">{{ t("Common.PrimaryColor") }}</p>
              <p class="setting-row__description">{{ t("Setting.PrimaryColorDescription") }}</p>
            </div>
            <ColorPicker v-model="darkAccentColor" :colors="DARK_ACCENT_COLORS" class="w-full sm:w-40" />
          </div>
        </UCard>
      </div>
    </section>

    <section aria-labelledby="workspace-appearance-heading">
      <div class="mb-4">
        <h2 id="workspace-appearance-heading" class="text-sm font-semibold text-highlighted">
          {{ t("Setting.WorkspaceAppearance") }}
        </h2>
        <p class="mt-1 text-xs text-muted">
          {{ t("Setting.WorkspaceAppearanceDescription") }}
        </p>
      </div>

      <UCard
        variant="outline"
        :ui="{
          root: 'rounded-xl bg-[var(--app-surface-card)] ring-[var(--app-border)]',
          body: 'divide-y divide-[var(--app-border)] p-0 sm:p-0'
        }"
      >
        <div class="setting-row">
          <div>
            <p class="setting-row__label">{{ t("Setting.InterfaceFont") }}</p>
            <p class="setting-row__description">{{ t("Setting.InterfaceFontDescription") }}</p>
          </div>
          <USelectMenu
            v-model="selectedFont"
            :items="fontsItems"
            value-key="id"
            label-key="label"
            :search-input="{ placeholder: t('Setting.SearchFonts') }"
            virtualize
            :aria-label="t('Setting.InterfaceFont')"
            size="sm"
            class="w-full sm:w-56"
          />
        </div>

        <div class="setting-row">
          <div>
            <p class="setting-row__label">{{ t("Setting.InterfaceFontSize") }}</p>
            <p class="setting-row__description">{{ t("Setting.InterfaceFontSizeDescription") }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <UInputNumber
              v-model="selectedUiFontSize"
              orientation="vertical"
              :min="MIN_FONT_SIZE"
              :max="MAX_FONT_SIZE"
              :step="1"
              :format-options="{ maximumFractionDigits: 0 }"
              :aria-label="t('Setting.InterfaceFontSize')"
              size="sm"
              class="w-20"
              :ui="{ base: 'rounded-[3px] text-center tabular-nums' }"
            />
            <span class="w-4 text-xs text-muted">px</span>
          </div>
        </div>

        <div class="setting-row">
          <div>
            <p class="setting-row__label">{{ t("Setting.CodeFontSize") }}</p>
            <p class="setting-row__description">{{ t("Setting.CodeFontSizeDescription") }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <UInputNumber
              v-model="selectedCodeFontSize"
              orientation="vertical"
              :min="MIN_FONT_SIZE"
              :max="MAX_FONT_SIZE"
              :step="1"
              :format-options="{ maximumFractionDigits: 0 }"
              :aria-label="t('Setting.CodeFontSize')"
              size="sm"
              class="w-20"
              :ui="{ base: 'rounded-[3px] text-center tabular-nums' }"
            />
            <span class="w-4 text-xs text-muted">px</span>
          </div>
        </div>

        <div class="setting-row">
          <div>
            <p class="setting-row__label">{{ t("Common.TerminalColorScheme") }}</p>
            <p class="setting-row__description">{{ t("Setting.TerminalAppearanceDescription") }}</p>
          </div>
          <USelect
            v-model="selectedTerminalTheme"
            :items="terminalThemeItems"
            value-key="id"
            :aria-label="t('Common.TerminalColorScheme')"
            size="sm"
            class="w-full sm:w-64"
          />
        </div>

        <div class="setting-row">
          <div>
            <p class="setting-row__label">{{ t("Common.CodeMirrorColorScheme") }}</p>
            <p class="setting-row__description">{{ t("Setting.EditorAppearanceDescription") }}</p>
          </div>
          <USelect
            v-model="selectedCodeMirrorTheme"
            :items="codeMirrorThemeItems"
            value-key="id"
            :aria-label="t('Common.CodeMirrorColorScheme')"
            size="sm"
            class="w-full sm:w-64"
          />
        </div>
      </UCard>
    </section>
  </div>
</template>

<style scoped>
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 0.75rem 1rem;
}

.setting-row__label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--app-text-primary);
}

.setting-row__description {
  margin-top: 0.125rem;
  font-size: 0.75rem;
  line-height: 1.25rem;
  color: var(--app-text-muted);
}

@media (max-width: 639px) {
  .setting-row {
    align-items: stretch;
    flex-direction: column;
    gap: 0.625rem;
  }
}
</style>
