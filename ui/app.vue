<script lang="ts" setup>
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { LangType, LanguagePreference, PermissionOrgs, PermOrgItem, UserIntiInfo } from "~/types";

import { useUserInfoStore } from "~/store/modules/userInfo";
import { resolveLanguageFromSystem } from "~/utils";

useApplicationConfig();

let applyLanguageSeq = 0;
const LOCALE_PREFIX_RE = /^\/[a-z]{2}(?:-[A-Z]{2})?(?=\/|$)/;

const route = useRoute();
const localePath = useLocalePath();
const toast = useToast();

const { isMacOS } = usePlatform();
const { locale, setLocale, t } = useI18n();
const { userTheme, applyThemePreference, applySystemThemePreference } = useThemeAdapter();
const userInfoStore = useUserInfoStore();

const { applyPrimaryColor } = useColor();
const settingManager = useSettingManager();

const { language, fontFamily, primaryColorLight, primaryColorDark, hydrationPromise, isHydrated } = settingManager;

const unlistenPrimaryColor = ref<UnlistenFn | null>(null);
const unlistenTheme = ref<UnlistenFn | null>(null);
const unlistenFont = ref<UnlistenFn | null>(null);
const unlistenLoginSuccess = ref<UnlistenFn | null>(null);

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

function initSelectOrganization(permissionOrgData: PermissionOrgs) {
  const orgs = [
    ...(permissionOrgData.pam_orgs || []),
    ...(permissionOrgData.audit_orgs || []),
    ...(permissionOrgData.console_orgs || []),
    ...(permissionOrgData.workbench_orgs || [])
  ];

  return orgs.filter((org, index, self) => index === self.findIndex((item: PermOrgItem) => item.id === org.id));
}

function parseApiData<T>(value: { data?: string } | undefined, fallback: T): T {
  if (!value?.data) return fallback;

  try {
    return JSON.parse(value.data) as T;
  } catch (err) {
    console.error("parse login response failed", err);
    return fallback;
  }
}

function handleLoginSuccess(payload: UserIntiInfo & { bearer: string }) {
  const { status, profile, bearer, current_org, resolved_site, permission_orgs, xpack_license_valid } = payload;

  if (status !== "success") return;

  const profileData = parseApiData<any>(profile, null);
  const currentOrgData = parseApiData<any>(current_org, null);
  const permissionOrgData = parseApiData<PermissionOrgs>(permission_orgs, {} as PermissionOrgs);
  const resolvedSite = resolved_site || "";

  if (!profileData || !currentOrgData || !resolvedSite) return;

  const availableOrgs = xpack_license_valid === false ? [] : initSelectOrganization(permissionOrgData);

  userInfoStore.setUserData(resolvedSite, {
    name: profileData.name,
    bearerToken: bearer,
    site: resolvedSite,
    org: currentOrgData,
    system_roles: profileData.system_roles,
    availableOrgs,
    xpackLicenseValid: xpack_license_valid ?? false,
    connectionInfo: {
      protocol: "",
      username: ""
    }
  });

  userInfoStore.setOrganizations(availableOrgs);
  userInfoStore.setCurrentOrg(currentOrgData);
  userInfoStore.setUserLoggedIn(true);

  nextTick(() => {
    toast.add({
      title: t("Login.LoginSuccess"),
      color: "primary",
      icon: "line-md:check-all",
      progress: true
    });

    navigateTo({
      path: localePath({ path: "/" })
    });
  });
}

onMounted(async () => {
  try {
    unlistenLoginSuccess.value = await useTauriEventListen("login-success-detected", (event) => {
      handleLoginSuccess(event.payload as UserIntiInfo & { bearer: string });
    });
  } catch (err) {
    console.error("listen login-success-detected failed", err);
  }

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
  unlistenLoginSuccess.value?.();
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
