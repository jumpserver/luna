<script lang="ts" setup>
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { LangType, LanguagePreference } from "~/types";

import { DEFAULT_DARK_THEME_PRESET, DEFAULT_LIGHT_THEME_PRESET, getThemePreset } from "~/composables/useThemePresets";
import { resolveLanguageFromSystem } from "~/utils";

useApplicationConfig();

let applyLanguageSeq = 0;
const LOCALE_PREFIX_RE = /^\/[a-z]{2}(?:-[A-Z]{2})?(?=\/|$)/;

const route = useRoute();

const { isMacOS } = usePlatform();
const { locale, setLocale } = useI18n();
const { userTheme, applyThemePreference, applySystemThemePreference } = useThemeAdapter();
const { bootstrapPersistedSession } = useAuthSession();

const { alpha, applyPrimaryColor, darken, lighten } = useColor();
const settingManager = useSettingManager();

const {
  language,
  fontFamily,
  primaryColorLight,
  primaryColorDark,
  lightThemePreset,
  darkThemePreset,
  hydrationPromise,
  isHydrated
} = settingManager;

const unlistenPrimaryColor = ref<UnlistenFn | null>(null);
const unlistenTheme = ref<UnlistenFn | null>(null);
const unlistenFont = ref<UnlistenFn | null>(null);

const backgroundColor = computed(() => {
  const isDark = userTheme.value === "dark";

  // 只在 macOS 下设置透明度
  if (isMacOS.value) {
    return isDark
      ? "color-mix(in srgb, var(--app-frame-bg) 82%, transparent)"
      : "color-mix(in srgb, var(--app-frame-bg) 90%, transparent)";
  } else {
    return isDark
      ? "color-mix(in srgb, var(--app-frame-bg) 84%, transparent)"
      : "color-mix(in srgb, var(--app-frame-bg) 92%, transparent)";
  }
});

const pageKey = computed(() => route.path.replace(LOCALE_PREFIX_RE, ""));

const platformClass = computed(() => {
  const platformKey = isMacOS.value ? "darwin" : "windows";
  return `platform-${platformKey}`;
});

// 因为 <Body> 是一个虚拟组件，底层并不会响应 Vue 的 :style 绑定。它的作用是把插槽内容插入到真正的 <body> 中，但自身不是一个响应式桥梁。
useHead({
  bodyAttrs: {
    class: computed(() => `${platformClass.value} font-sans antialiased h-screen w-screen`),
    style: computed(
      () => `
        background-color: ${backgroundColor.value};
      `
    )
  }
});

function applyCurrentThemeColor() {
  const mode = userTheme.value === "dark" ? "dark" : "light";
  const hex = mode === "dark" ? (primaryColorDark.value as string) : (primaryColorLight.value as string);

  if (hex) {
    applyPrimaryColor(hex);
  }
}

function applyThemePreset() {
  if (!import.meta.client) return;

  const mode = userTheme.value === "dark" ? "dark" : "light";
  const preset
    = mode === "dark"
      ? darkThemePreset.value || DEFAULT_DARK_THEME_PRESET
      : lightThemePreset.value || DEFAULT_LIGHT_THEME_PRESET;

  document.documentElement.dataset.themePreset = preset;

  const presetOption = getThemePreset(preset);

  if (presetOption?.family === "luna" && presetOption.baseColor) {
    applyLunaThemePreset(presetOption.baseColor);
    return;
  }

  clearLunaThemePreset();
}

const lunaThemeVariables = [
  "--theme-bg",
  "--theme-fg",
  "--theme-muted",
  "--theme-border",
  "--theme-accent",
  "--theme-surface",
  "--theme-surface-hover",
  "--theme-shadow-soft",
  "--app-bg",
  "--app-fg",
  "--app-muted",
  "--app-border",
  "--app-frame-bg",
  "--app-main-bg",
  "--app-sidebar-bg",
  "--app-panel-bg",
  "--app-header-bg",
  "--app-footer-bg",
  "--app-input-bg",
  "--app-card-bg",
  "--app-card-bg-soft",
  "--app-hover-soft",
  "--app-hover-strong",
  "--app-selected-soft",
  "--app-scrollbar-thumb",
  "--app-scrollbar-thumb-hover",
  "--bg-hover-light",
  "--bg-hover-dark",
  "--bg-selected-light",
  "--bg-selected-dark",
  "--sidebar-divider-light",
  "--sidebar-divider-dark",
  "--sidebar-surface-light",
  "--sidebar-surface-dark"
] as const;

function clearLunaThemePreset() {
  const root = document.documentElement;

  lunaThemeVariables.forEach((token) => {
    root.style.removeProperty(token);
  });
}

function applyLunaThemePreset(baseColor: string) {
  const root = document.documentElement;
  const themeBg = darken(13, baseColor);
  const themeSurface = darken(8, baseColor);
  const themeHeader = lighten(0, baseColor);
  const themePanel = darken(2, baseColor);
  const themeHover = darken(4, baseColor);
  const themeSelected = lighten(5, baseColor);
  const themeBorder = "rgba(0, 0, 0, 0.3)";
  const themeMuted = lighten(20, baseColor);

  const lunaVars: Record<(typeof lunaThemeVariables)[number], string> = {
    "--theme-bg": themeBg,
    "--theme-fg": "#EFEFF0",
    "--theme-muted": themeMuted,
    "--theme-border": themeBorder,
    "--theme-accent": "#1ab394",
    "--theme-surface": themeSurface,
    "--theme-surface-hover": themeSelected,
    "--theme-shadow-soft": "0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.28)",
    "--app-bg": themeBg,
    "--app-fg": "#EFEFF0",
    "--app-muted": alpha(0.78, "#EFEFF0"),
    "--app-border": themeBorder,
    "--app-frame-bg": themeHeader,
    "--app-main-bg": themeBg,
    "--app-sidebar-bg": themeSurface,
    "--app-panel-bg": alpha(0.92, themePanel),
    "--app-header-bg": themeHeader,
    "--app-footer-bg": darken(6, baseColor),
    "--app-input-bg": darken(1, baseColor),
    "--app-card-bg": alpha(0.68, darken(2, baseColor)),
    "--app-card-bg-soft": alpha(0.86, darken(2, baseColor)),
    "--app-hover-soft": alpha(0.55, themeHover),
    "--app-hover-strong": alpha(0.8, lighten(10, baseColor)),
    "--app-selected-soft": alpha(0.92, themeSelected),
    "--app-scrollbar-thumb": lighten(10, baseColor),
    "--app-scrollbar-thumb-hover": lighten(18, baseColor),
    "--bg-hover-light": alpha(0.55, themeHover),
    "--bg-hover-dark": alpha(0.55, themeHover),
    "--bg-selected-light": alpha(0.92, themeSelected),
    "--bg-selected-dark": alpha(0.92, themeSelected),
    "--sidebar-divider-light": themeBorder,
    "--sidebar-divider-dark": themeBorder,
    "--sidebar-surface-light": themeSurface,
    "--sidebar-surface-dark": themeSurface
  };

  Object.entries(lunaVars).forEach(([token, value]) => {
    root.style.setProperty(token, value);
  });
}

watch(() => [userTheme.value, primaryColorLight.value, primaryColorDark.value], applyCurrentThemeColor, {
  immediate: true
});

watch(() => [userTheme.value, lightThemePreset.value, darkThemePreset.value], applyThemePreset, { immediate: true });

watch(
  () => fontFamily.value,
  (val) => applyFont(val),
  { immediate: true }
);

watch(
  () => language.value,
  (pref) => {
    applyLanguagePreference(pref);
  }
);

watch(
  () => isHydrated.value,
  (ready) => {
    if (ready) {
      applyAfterHydration();
    }
  }
);

function applyFont(font: string) {
  if (!font) return;

  document.documentElement.style.setProperty("--font-sans", font);
  document.documentElement.style.setProperty("--font-heading", font);
}

async function resolveEffectiveLanguage(pref: LanguagePreference): Promise<LangType> {
  if (pref === "system") {
    return await resolveLanguageFromSystem();
  }

  return pref;
}

async function applyLanguagePreference(pref: LanguagePreference) {
  const seq = ++applyLanguageSeq;

  try {
    const next = await resolveEffectiveLanguage(pref);

    if (seq !== applyLanguageSeq) return;
    if ((locale.value as string) === next) return;

    await setLocale(next as any);
  } catch (err) {
    console.error("apply language failed", err);
  }
}

async function applyAfterHydration() {
  if (hydrationPromise.value) {
    try {
      await hydrationPromise.value;
    } catch (err) {
      console.error("wait hydration failed", err);
    }
  }

  applyCurrentThemeColor();
}

onMounted(async () => {
  if (!isTauriRuntime()) {
    await bootstrapPersistedSession();
    return;
  }

  // 初始化 HTTP 回调服务器 (开发环境)
  try {
    await useTauriCoreInvoke("init_http_callback_server", {});
  } catch (error) {
    // 忽略错误，生产环境不需要此服务
    console.debug("HTTP callback server initialization:", error);
  }

  await bootstrapPersistedSession();

  try {
    unlistenPrimaryColor.value = await useTauriEventListen("primary-color-changed", (event: any) => {
      const hex = (event?.payload?.hex || event?.payload || "").toString();
      const mode = (event?.payload?.mode || "").toString();

      if (hex) {
        if (!mode || mode === (userTheme.value as string)) {
          applyPrimaryColor(hex);
        }
      }
    });
  } catch (err) {
    console.error("listen primary-color-changed failed", err);
  }

  try {
    unlistenTheme.value = await useTauriEventListen("theme-changed", async (event: any) => {
      const mode = (event?.payload?.mode || event?.payload || "").toString();

      if (mode === "withSystem") {
        await applySystemThemePreference();
      } else if (mode === "light" || mode === "dark") {
        applyThemePreference(mode as any);
      }

      // 应用当前主题对应的主色
      applyCurrentThemeColor();
    });
  } catch (err) {
    console.error("listen theme-changed failed", err);
  }

  try {
    unlistenFont.value = await useTauriEventListen("font-changed", (event: any) => {
      const value = (event?.payload?.value || event?.payload || "").toString();

      if (!value) return;

      applyFont(value);
    });
  } catch (err) {
    console.error("listen font-changed failed", err);
  }
});

onBeforeUnmount(() => {
  unlistenPrimaryColor.value?.();
  unlistenTheme.value?.();
  unlistenFont.value?.();
});
</script>

<template>
  <Html class="overflow-x-hidden overflow-y-hidden">
    <Body class="font-sans antialiased h-screen w-screen">
      <UApp>
        <NuxtLayout>
          <NuxtPage :page-key="pageKey" />
        </NuxtLayout>
      </UApp>
    </Body>
  </Html>
</template>
