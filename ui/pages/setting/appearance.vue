<script setup lang="ts">
import type { UiRadius } from "~/composables/useSettingStorage";
import type { CodeMirrorThemePresetId } from "~/shared/theme/presets/codemirror";
import type { ThemePresetId } from "~/types";
import { useSettingManager } from "~/composables/useSettingManager";

import { MAX_FONT_SIZE, MIN_FONT_SIZE, UI_RADIUS_PX } from "~/composables/useSettingStorage";
import { useThemeOptions } from "~/composables/useThemeOptions";
import { DARK_THEME_PRESETS, getThemePreset, LIGHT_THEME_PRESETS } from "~/composables/useThemePresets";
import { desktopEmit, desktopInvoke } from "~/shared/desktop/bridge";
import { CODEMIRROR_THEME_PRESETS, isCodeMirrorThemePresetId } from "~/shared/theme/presets/codemirror";
import { TERMINAL_THEME_PRESETS } from "~/shared/theme/presets/terminal";

interface FontItem {
  id: string;
  value: string;
  label: string;
}

const SYSTEM_FONT_FAMILY = "system-ui, sans-serif";
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
  "#84cc16"
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
  "#a3e635"
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
  codeMirrorThemePreset,
  modernIsland,
  setModernIsland,
  uiRadius,
  setUiRadius
} = useSettingManager();

const { applyPrimaryColor } = useColor();
const { userTheme } = useThemeAdapter();
const { currentAppearanceMode, applyAppearanceMode, themePresetLabel } = useThemeOptions();

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

const themeRevealOrigin = ref<{ x: number; y: number } | null>(null);

const selectedAppearanceMode = computed<"withSystem" | "light" | "dark">({
  get: () => currentAppearanceMode.value,
  set: (mode) => {
    void applyAppearanceMode(mode, themeRevealOrigin.value);
  }
});

const onThemePointerDown = (event: PointerEvent) => {
  themeRevealOrigin.value = { x: event.clientX, y: event.clientY };
};

const lightThemeItems = computed(() =>
  LIGHT_THEME_PRESETS.map((preset) => ({ id: preset.id, label: themePresetLabel(preset) }))
);
const darkThemeItems = computed(() =>
  DARK_THEME_PRESETS.map((preset) => ({ id: preset.id, label: themePresetLabel(preset) }))
);

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

const selectedModernIsland = computed<boolean>({
  get: () => modernIsland.value,
  set: (enabled: boolean) => setModernIsland(enabled)
});

const selectedUiRadius = computed<UiRadius>({
  get: () => uiRadius.value,
  set: (radius: UiRadius) => setUiRadius(radius)
});

const radiusItems = computed(() => [
  { id: "none" as const, label: t("Setting.UiRadiusNone"), preview: UI_RADIUS_PX.none },
  { id: "small" as const, label: t("Setting.UiRadiusSmall"), preview: UI_RADIUS_PX.small },
  { id: "large" as const, label: t("Setting.UiRadiusLarge"), preview: UI_RADIUS_PX.large }
]);

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

function sameHex(left: string, right: string) {
  return left.replace("#", "").toLowerCase() === right.replace("#", "").toLowerCase();
}

function resetAccent(mode: "light" | "dark") {
  const preset = getThemePreset(mode === "light" ? lightThemePreset.value : darkThemePreset.value);
  if (preset?.accent) setAccentColor(mode, preset.accent);
}

function setAccentColor(mode: "light" | "dark", color: string) {
  if (!color) return;

  const hex = userTheme.value === mode ? applyPrimaryColor(color) : color;

  if (mode === "light") {
    setPrimaryColorLight(hex);
  } else {
    setPrimaryColorDark(hex);
  }

  void desktopEmit("primary-color-changed", { hex, mode });
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
      void desktopEmit("primary-color-changed", { hex: hexNow, mode: modeNow });
    }
  }
}

const loadSystemFonts = async () => {
  const fallback = SYSTEM_FONT_FAMILY;

  try {
    const families = await desktopInvoke<string[]>("list_system_fonts");

    const dynamicItems: FontItem[] = (families || []).map((name) => ({
      id: name,
      label: name,
      value: `"${name}", ${fallback}`
    }));

    const systemDefault = fontsItems.value[0];

    if (!systemDefault) return;

    fontsItems.value = [systemDefault, ...dynamicItems];
  } catch {
    fontsItems.value = fontsItems.value[0] ? [fontsItems.value[0]] : fontsItems.value;
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
      void desktopEmit("font-changed", { value });
    } catch {}
  }
);
</script>

<template>
  <div class="space-y-8">
    <SettingsGroup :divided="false">
      <SettingsRow :title="t('Common.Theme')">
        <div @pointerdown="onThemePointerDown">
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
      </SettingsRow>
    </SettingsGroup>

    <SettingsSection :title="t('Setting.ThemePalette')" :description="t('Setting.ThemePaletteDescription')">
      <div class="space-y-4">
        <SettingsGroup :title="t('Common.LightThemePalette')" icon="i-lucide-sun-medium">
          <SettingsRow :title="t('Setting.ThemeStyle')" :description="t('Setting.LightThemeDescription')">
            <USelect
              v-model="selectedLightTheme"
              :items="lightThemeItems"
              value-key="id"
              :aria-label="t('Common.LightThemePalette')"
              size="sm"
              class="w-full sm:w-64"
            />
          </SettingsRow>
          <SettingsRow :title="t('Common.PrimaryColor')" :description="t('Setting.PrimaryColorDescription')" fluid>
            <div class="flex items-center justify-end gap-2">
              <div class="flex flex-wrap justify-end gap-1.5">
                <button
                  v-for="color in LIGHT_ACCENT_COLORS"
                  :key="color"
                  type="button"
                  class="size-4.5 shrink-0 rounded-full"
                  :class="
                    sameHex(lightAccentColor, color)
                      ? 'ring-2 ring-(--theme-accent) ring-offset-2 ring-offset-(--app-surface-card)'
                      : ''
                  "
                  :style="{ backgroundColor: color }"
                  :aria-label="color"
                  :aria-pressed="sameHex(lightAccentColor, color)"
                  @click="lightAccentColor = color"
                />
              </div>
              <div class="flex shrink-0 items-center gap-1.5">
                <ColorPicker v-model="lightAccentColor" compact />
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :label="t('Setting.ResetAccent')"
                  @click="resetAccent('light')"
                />
              </div>
            </div>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup :title="t('Common.DarkThemePalette')" icon="i-lucide-moon-star">
          <SettingsRow :title="t('Setting.ThemeStyle')" :description="t('Setting.DarkThemeDescription')">
            <USelect
              v-model="selectedDarkTheme"
              :items="darkThemeItems"
              value-key="id"
              :aria-label="t('Common.DarkThemePalette')"
              size="sm"
              class="w-full sm:w-64"
            />
          </SettingsRow>
          <SettingsRow :title="t('Common.PrimaryColor')" :description="t('Setting.PrimaryColorDescription')" fluid>
            <div class="flex items-center justify-end gap-2">
              <div class="flex flex-wrap justify-end gap-1.5">
                <button
                  v-for="color in DARK_ACCENT_COLORS"
                  :key="color"
                  type="button"
                  class="size-4.5 shrink-0 rounded-full"
                  :class="
                    sameHex(darkAccentColor, color)
                      ? 'ring-2 ring-(--theme-accent) ring-offset-2 ring-offset-(--app-surface-card)'
                      : ''
                  "
                  :style="{ backgroundColor: color }"
                  :aria-label="color"
                  :aria-pressed="sameHex(darkAccentColor, color)"
                  @click="darkAccentColor = color"
                />
              </div>
              <div class="flex shrink-0 items-center gap-1.5">
                <ColorPicker v-model="darkAccentColor" compact />
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :label="t('Setting.ResetAccent')"
                  @click="resetAccent('dark')"
                />
              </div>
            </div>
          </SettingsRow>
        </SettingsGroup>
      </div>
    </SettingsSection>

    <SettingsSection
      :title="t('Setting.WorkspaceAppearance')"
      :description="t('Setting.WorkspaceAppearanceDescription')"
    >
      <SettingsGroup>
        <SettingsRow :title="t('Setting.ModernIsland')" :description="t('Setting.ModernIslandDescription')">
          <USwitch v-model="selectedModernIsland" :aria-label="t('Setting.ModernIsland')" />
        </SettingsRow>

        <SettingsRow :title="t('Setting.UiRadius')" :description="t('Setting.UiRadiusDescription')">
          <div class="flex shrink-0 gap-2">
            <UButton
              v-for="item in radiusItems"
              :key="item.id"
              color="neutral"
              variant="outline"
              size="sm"
              class="min-w-16 flex-col gap-1 px-3 py-2"
              :class="
                selectedUiRadius === item.id ? 'bg-(--app-selected-soft) ring-1 ring-(--theme-accent)' : 'opacity-70'
              "
              :ui="{ base: 'rounded-[length:var(--app-radius)]' }"
              @click="selectedUiRadius = item.id"
            >
              <span
                class="h-4 w-8 bg-[color-mix(in_srgb,var(--app-fg)_14%,transparent)] shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--app-fg)_58%,transparent)]"
                :style="{ borderRadius: item.preview }"
              />
              <span class="text-[11px]">{{ item.label }}</span>
            </UButton>
          </div>
        </SettingsRow>

        <SettingsRow :title="t('Setting.InterfaceFont')" :description="t('Setting.InterfaceFontDescription')">
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
        </SettingsRow>

        <SettingsRow :title="t('Setting.InterfaceFontSize')" :description="t('Setting.InterfaceFontSizeDescription')">
          <div class="flex items-center gap-2">
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
              :ui="{ base: 'rounded-[length:var(--app-radius)] text-center tabular-nums' }"
            />
            <span class="w-4 text-xs text-muted">px</span>
          </div>
        </SettingsRow>

        <SettingsRow :title="t('Setting.CodeFontSize')" :description="t('Setting.CodeFontSizeDescription')">
          <div class="flex items-center gap-2">
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
              :ui="{ base: 'rounded-[length:var(--app-radius)] text-center tabular-nums' }"
            />
            <span class="w-4 text-xs text-muted">px</span>
          </div>
        </SettingsRow>

        <SettingsRow :title="t('Common.TerminalColorScheme')" :description="t('Setting.TerminalAppearanceDescription')">
          <USelect
            v-model="selectedTerminalTheme"
            :items="terminalThemeItems"
            value-key="id"
            :aria-label="t('Common.TerminalColorScheme')"
            size="sm"
            class="w-full sm:w-64"
          />
        </SettingsRow>

        <SettingsRow :title="t('Common.CodeMirrorColorScheme')" :description="t('Setting.EditorAppearanceDescription')">
          <USelect
            v-model="selectedCodeMirrorTheme"
            :items="codeMirrorThemeItems"
            value-key="id"
            :aria-label="t('Common.CodeMirrorColorScheme')"
            size="sm"
            class="w-full sm:w-64"
          />
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  </div>
</template>
