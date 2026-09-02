import type { DropdownMenuItem } from "@nuxt/ui";
import type { ThemeRevealOrigin } from "~/composables/useThemeAdapter";
import type { ThemePresetOption } from "~/composables/useThemePresets";
import type { ThemePresetId } from "~/types";
import { DARK_THEME_PRESETS, getThemePreset, LIGHT_THEME_PRESETS } from "~/composables/useThemePresets";
import { desktopEmit } from "~/shared/desktop/bridge";

export const useThemeOptions = () => {
  const { t } = useI18n();
  const { lightThemePreset, darkThemePreset } = useSettingManager();
  const { userTheme, themeMode, followSystem, manualSetTheme, enableFollowSystem } = useThemeAdapter();

  const currentAppearanceMode = computed<"withSystem" | "light" | "dark">(() => {
    if (themeMode.value === "withSystem" || (!themeMode.value && followSystem.value)) {
      return "withSystem";
    }

    if (themeMode.value === "dark" || userTheme.value === "dark") return "dark";

    return "light";
  });

  const applyAppearanceMode = async (mode: "withSystem" | "light" | "dark", origin?: ThemeRevealOrigin | null) => {
    if (currentAppearanceMode.value === mode) return;

    if (mode === "withSystem") {
      await enableFollowSystem(origin);
    } else {
      manualSetTheme(mode, undefined, origin);
    }

    void desktopEmit("theme-changed", { mode }).catch(() => undefined);
  };

  const darkThemeIds = new Set<ThemePresetId>(DARK_THEME_PRESETS.map((item) => item.id));

  const currentThemePresetId = computed<ThemePresetId>(() =>
    userTheme.value === "dark" ? darkThemePreset.value : lightThemePreset.value
  );

  const themePresetLabel = (preset: ThemePresetOption | null | undefined) => {
    if (!preset) return t("Common.Theme");
    return preset.label;
  };

  const currentThemePresetLabel = computed(() => themePresetLabel(getThemePreset(currentThemePresetId.value)));

  const themeSelectItems = computed(() => [
    ...LIGHT_THEME_PRESETS.map((item) => ({
      id: item.id,
      label: `${t("Common.Light")} · ${themePresetLabel(item)}`
    })),
    ...DARK_THEME_PRESETS.map((item) => ({
      id: item.id,
      label: `${t("Common.Dark")} · ${themePresetLabel(item)}`
    }))
  ]);

  const selectThemePreset = (presetId: ThemePresetId) => {
    const preset = getThemePreset(presetId);
    if (!preset) return;

    const mode = darkThemeIds.has(presetId) ? "dark" : "light";
    if (currentThemePresetId.value === presetId && currentAppearanceMode.value === mode) return;

    manualSetTheme(mode, { preset: presetId, accent: preset.accent });

    void desktopEmit("theme-changed", { mode }).catch(() => undefined);
    void desktopEmit("primary-color-changed", { hex: preset.accent, mode }).catch(() => undefined);
  };

  const appearanceModeItems = computed<DropdownMenuItem[]>(() => [
    {
      label: t("Common.WithSystem"),
      icon: "i-lucide-monitor",
      type: "checkbox",
      checked: currentAppearanceMode.value === "withSystem",
      onUpdateChecked: (checked: boolean) => {
        if (checked) void applyAppearanceMode("withSystem");
      }
    },
    {
      label: t("Common.Light"),
      icon: "i-lucide-sun-medium",
      type: "checkbox",
      checked: currentAppearanceMode.value === "light",
      onUpdateChecked: (checked: boolean) => {
        if (checked) void applyAppearanceMode("light");
      }
    },
    {
      label: t("Common.Dark"),
      icon: "i-lucide-moon-star",
      type: "checkbox",
      checked: currentAppearanceMode.value === "dark",
      onUpdateChecked: (checked: boolean) => {
        if (checked) void applyAppearanceMode("dark");
      }
    }
  ]);

  const themeDropdownItems = computed<DropdownMenuItem[][]>(() => [
    [
      {
        label: t("Common.LightThemes"),
        disabled: true
      },
      ...LIGHT_THEME_PRESETS.map((item) => ({
        label: themePresetLabel(item),
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
        label: themePresetLabel(item),
        icon: currentThemePresetId.value === item.id ? "i-lucide-check" : "i-lucide-moon-star",
        onSelect: () => selectThemePreset(item.id)
      }))
    ]
  ]);

  return {
    currentThemePresetId,
    currentThemePresetLabel,
    themePresetLabel,
    currentAppearanceMode,
    appearanceModeItems,
    applyAppearanceMode,
    themeSelectItems,
    themeDropdownItems,
    selectThemePreset
  };
};
