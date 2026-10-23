<script setup lang="ts">
import { applyUiRadius, isUiRadius } from "~/composables/useSettingStorage";
import { getUiLocale } from "../../../i18n/ui";

// Share local appearance and translations, without mounting Core auth, language sync,
// asset/modal, AI or face-monitor lifecycle components.
const { locale, setLocale } = useI18n();
const uiLocale = computed(() => getUiLocale(locale.value));
const settings = useSettingManager();
const theme = useThemeAdapter();
watch(
  [settings.theme, settings.lightThemePreset, settings.darkThemePreset],
  ([value]) => theme.applyThemePreference(value === "dark" ? "dark" : "light"),
  { immediate: true }
);
watch(
  [settings.uiFontSize, settings.codeFontSize, settings.uiRadius],
  ([ui, code, radius]) => {
    if (!import.meta.client) return;
    document.documentElement.style.setProperty("--app-ui-font-size", `${ui}px`);
    document.documentElement.style.setProperty("--app-code-font-size", `${code}px`);
    applyUiRadius(isUiRadius(radius) ? radius : "small");
  },
  { immediate: true }
);
onMounted(async () => {
  await theme.initialTheme();
  const language = settings.language.value;
  if (language !== "system") await setLocale(language);
});
</script>

<template>
  <Html class="overflow-hidden">
    <Body class="h-screen w-screen font-sans antialiased">
      <UApp :locale="uiLocale"><NuxtPage /></UApp>
    </Body>
  </Html>
</template>
