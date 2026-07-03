import type { DropdownMenuItem } from "@nuxt/ui";
import type { ThemePresetId } from "~/types";
import { DARK_THEME_PRESETS, getThemePreset, LIGHT_THEME_PRESETS } from "~/composables/useThemePresets";

export const useThemeOptions = () => {
  const { t } = useI18n();
  const {
    lightThemePreset,
    darkThemePreset,
    setLightThemePreset,
    setDarkThemePreset,
    setPrimaryColorLight,
    setPrimaryColorDark
  } = useSettingManager();
  const { userTheme, manualSetTheme } = useThemeAdapter();
  const { applyPrimaryColor } = useColor();

  const darkThemeIds = new Set<ThemePresetId>(DARK_THEME_PRESETS.map((item) => item.id));

  const currentThemePresetId = computed<ThemePresetId>(() =>
    userTheme.value === "dark" ? darkThemePreset.value : lightThemePreset.value
  );

  const currentThemePresetLabel = computed(
    () => getThemePreset(currentThemePresetId.value)?.label || t("Common.Theme")
  );

  const themeSelectItems = computed(() => [
    ...LIGHT_THEME_PRESETS.map((item) => ({
      id: item.id,
      label: `${t("Common.Light")} · ${item.label}`
    })),
    ...DARK_THEME_PRESETS.map((item) => ({
      id: item.id,
      label: `${t("Common.Dark")} · ${item.label}`
    }))
  ]);

  const selectThemePreset = (presetId: ThemePresetId) => {
    const preset = getThemePreset(presetId);
    if (!preset) return;

    const mode = darkThemeIds.has(presetId) ? "dark" : "light";

    manualSetTheme(mode);
    applyPrimaryColor(preset.accent);

    if (mode === "dark") {
      setDarkThemePreset(presetId);
      setPrimaryColorDark(preset.accent);
    } else {
      setLightThemePreset(presetId);
      setPrimaryColorLight(preset.accent);
    }

    try {
      useTauriEventEmit("theme-changed", { mode });
      useTauriEventEmit("primary-color-changed", { hex: preset.accent, mode });
    } catch {}
  };

  const themeDropdownItems = computed<DropdownMenuItem[][]>(() => [
    [
      {
        label: t("Common.LightThemes"),
        disabled: true
      },
      ...LIGHT_THEME_PRESETS.map((item) => ({
        label: item.label,
        icon: currentThemePresetId.value === item.id ? "i-lucide-check" : "i-lucide-sun-medium",
        onSelect: () => selectThemePreset(item.id)
      }))
    ],
    [
      {
        label: t("Common.DarkThemes"),
        disabled: true
      },
      ...DARK_THEME_PRESETS.map((item) => ({
        label: item.label,
        icon: currentThemePresetId.value === item.id ? "i-lucide-check" : "i-lucide-moon-star",
        onSelect: () => selectThemePreset(item.id)
      }))
    ]
  ]);

  return {
    currentThemePresetId,
    currentThemePresetLabel,
    themeSelectItems,
    themeDropdownItems,
    selectThemePreset
  };
};
