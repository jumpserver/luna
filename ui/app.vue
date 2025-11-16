<script lang="ts" setup>
import { useUserInfoStore } from "~/store/modules/userInfo";
import { storeToRefs } from "pinia";

useApplicationConfig();
const userInfoStore = useUserInfoStore();

const LOCALE_PREFIX_RE = /^\/[a-z]{2}(?:-[A-Z]{2})?(?=\/|$)/;

const route = useRoute();

const { locale, setLocale } = useI18n();

const { currentSite } = storeToRefs(userInfoStore);
const { isMacOS } = usePlatform();
const { userTheme, applyThemePreference, applySystemThemePreference } = useThemeAdapter();

const { applyPrimaryColor } = useColor();
const settingManager = useSettingManager();

const { fontFamily, primaryColorLight, primaryColorDark, setLang } = settingManager;

const backgroundColor = computed(() => {
  const isDark = userTheme.value === "dark";

  // 只在 macOS 下设置透明度
  if (isMacOS.value) {
    return isDark ? "rgba(30, 30, 30, 0.6)" : "rgba(240, 240, 240, 0.4)";
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

function applyCurrentThemeColor() {
  const mode = userTheme.value === "dark" ? "dark" : "light";
  const hex = mode === "dark" ? (primaryColorDark.value as string) : (primaryColorLight.value as string);
  if (hex) {
    applyPrimaryColor(hex);
  }
}

// 启动时根据存储的字体家族应用一次（并在变更时同步）
function applyFont(font: string) {
  if (!font) return;
  document.documentElement.style.setProperty("--font-sans", font);
  document.documentElement.style.setProperty("--font-heading", font);
}

onMounted(async () => {
  try {
    await useTauriEventListen("primary-color-changed", (event: any) => {
      const hex = (event?.payload?.hex || event?.payload || "").toString();
      const mode = (event?.payload?.mode || "").toString();

      if (hex) {
        if (!mode || mode === (userTheme.value as string)) {
          applyPrimaryColor(hex);
        }
      }
    });

    await useTauriEventListen("theme-changed", async (event: any) => {
      const mode = (event?.payload?.mode || event?.payload || "").toString();

      if (mode === "withSystem") {
        await applySystemThemePreference();
      } else if (mode === "light" || mode === "dark") {
        applyThemePreference(mode as any);
      }

      // 应用当前主题对应的主色
      applyCurrentThemeColor();
    });

    await useTauriEventListen("font-changed", async (event: any) => {
      const value = (event?.payload?.value || event?.payload || "").toString();

      if (!value) return;

      document.documentElement.style.setProperty("--font-sans", value);
      document.documentElement.style.setProperty("--font-heading", value);
    });

    await useTauriEventListen("language-changed", async (event: any) => {
      const code = (event?.payload?.code || event?.payload || "").toString();

      if (!code) return;

      try {
        // 全局覆盖：主窗口也执行一次 applyLanguageToAll，
        // 确保本窗口的站点映射与内存状态即时同步
        await setLocale(code as any);
        setLang(code);
        userInfoStore.applyLanguageToAll(code);
      } catch {}
    });

    await useWarmupSetting();
  } catch (error) {
    console.error(error);
  }
});

// 切换账号时，按站点映射立即应用语言
watch(
  () => currentSite.value,
  (site) => {
    const s = (site || "").toString();
    if (!s) return;
    try {
      const lang = settingManager.getSiteLanguage(s) as string;
      if (lang && lang !== (locale.value as string)) {
        setLocale(lang as any);
        setLang(lang);
      }
    } catch {}
  },
  { immediate: true }
);
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
