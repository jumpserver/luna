<script lang="ts" setup>
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { LangType, LanguagePreference } from "~/types";

import AclDialog from "~/components/Modal/aclDialog.vue";
import ConnectionFormModal from "~/components/Modal/connectionFormModal.vue";
import { DEFAULT_DARK_THEME_PRESET, DEFAULT_LIGHT_THEME_PRESET } from "~/composables/useThemePresets";
import { resolveLanguageFromSystem } from "~/utils";

useApplicationConfig();

let applyLanguageSeq = 0;
const LOCALE_PREFIX_RE = /^\/[a-z]{2}(?:-[A-Z]{2})?(?=\/|$)/;

const route = useRoute();
const authSession = useAuthSession();

const { isMacOS } = usePlatform();
const { locale, setLocale } = useI18n();
const { userTheme, applyThemePreference, applySystemThemePreference } = useThemeAdapter();

const { applyPrimaryColor } = useColor();
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

const toolWindowTheme = computed(() => {
  if (route.query.tool_window !== "1") return null;

  const mode = route.query.theme === "dark" ? "dark" : route.query.theme === "light" ? "light" : null;
  const preset = typeof route.query.themePreset === "string" ? route.query.themePreset : "";
  const accent = typeof route.query.accent === "string" ? route.query.accent : "";

  return {
    mode,
    preset,
    accent
  };
});

const unlistenPrimaryColor = ref<UnlistenFn | null>(null);
const unlistenTheme = ref<UnlistenFn | null>(null);
const unlistenFont = ref<UnlistenFn | null>(null);

const backgroundColor = computed(() => {
  const isDark = (toolWindowTheme.value?.mode || userTheme.value) === "dark";

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
  const mode = toolWindowTheme.value?.mode || (userTheme.value === "dark" ? "dark" : "light");
  const hex =
    toolWindowTheme.value?.accent ||
    (mode === "dark" ? (primaryColorDark.value as string) : (primaryColorLight.value as string));

  if (hex) {
    applyPrimaryColor(hex);
  }
}

function applyThemePreset() {
  if (!import.meta.client) return;

  const mode = toolWindowTheme.value?.mode || (userTheme.value === "dark" ? "dark" : "light");
  const preset =
    toolWindowTheme.value?.preset ||
    (mode === "dark"
      ? darkThemePreset.value || DEFAULT_DARK_THEME_PRESET
      : lightThemePreset.value || DEFAULT_LIGHT_THEME_PRESET);

  document.documentElement.dataset.themePreset = preset;
}

watch(() => [userTheme.value, primaryColorLight.value, primaryColorDark.value], applyCurrentThemeColor, {
  immediate: true
});

watch(() => [userTheme.value, lightThemePreset.value, darkThemePreset.value], applyThemePreset, { immediate: true });
watch(
  () => route.fullPath,
  () => {
    applyCurrentThemeColor();
    applyThemePreset();
  },
  { immediate: true }
);

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
  if (route.query.tool_window !== "1") {
    void authSession.bootstrapPersistedSession();
  }

  if (!isTauriRuntime()) return;

  // 初始化 HTTP 回调服务器 (开发环境)
  try {
    await useTauriCoreInvoke("init_http_callback_server", {});
  } catch (error) {
    // 忽略错误，生产环境不需要此服务
    console.debug("HTTP callback server initialization:", error);
  }

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
        <FileTransferCenter />
        <ConnectionFormModal />
        <AclDialog />
      </UApp>
    </Body>
  </Html>
</template>
