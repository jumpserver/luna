<script lang="ts" setup>
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { LangType, LanguagePreference } from "~/types";

import { resolveLanguageFromSystem } from "~/utils";

useApplicationConfig();

let applyLanguageSeq = 0;
const LOCALE_PREFIX_RE = /^\/[a-z]{2}(?:-[A-Z]{2})?(?=\/|$)/;

const route = useRoute();

const { isMacOS } = usePlatform();
const { locale, setLocale } = useI18n();
const { userTheme, applyThemePreference, applySystemThemePreference } = useThemeAdapter();

const { applyPrimaryColor } = useColor();
const settingManager = useSettingManager();

const { language, fontFamily, primaryColorLight, primaryColorDark, hydrationPromise, isHydrated } = settingManager;

const unlistenPrimaryColor = ref<UnlistenFn | null>(null);
const unlistenTheme = ref<UnlistenFn | null>(null);
const unlistenFont = ref<UnlistenFn | null>(null);

const backgroundColor = computed(() => {
  const isDark = userTheme.value === "dark";

  // 只在 macOS 下设置透明度
  if (isMacOS.value) {
    return isDark ? "rgba(30, 30, 30, 0.8)" : "rgba(240, 240, 240, 0.4)";
  } else {
    return isDark ? "rgba(30, 30, 30, 0.8)" : "rgba(240, 240, 240, 0.83)";
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

watch(() => [userTheme.value, primaryColorLight.value, primaryColorDark.value], applyCurrentThemeColor, {
  immediate: true
});

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

function applyCurrentThemeColor() {
  const mode = userTheme.value === "dark" ? "dark" : "light";
  const hex = mode === "dark" ? (primaryColorDark.value as string) : (primaryColorLight.value as string);

  if (hex) {
    applyPrimaryColor(hex);
  }
}

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
      </UApp>
    </Body>
  </Html>
</template>
