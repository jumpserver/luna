<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { PermissionOrgs, PermOrgItem, UserData, UserIntiInfo, LangType, ThemeType } from "~/types/index";

import { resolveLanguageFromCookies } from "~/utils";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { useSettingManager } from "~/composables/useSettingManager";

const props = defineProps<{ collapse: boolean }>();

const toast = useToast();
const appConfig = useAppConfig();
const userInfoStore = useUserInfoStore();

const { isMacOS } = usePlatform();
const { t, setLocale, locales } = useI18n();
// prettier-ignore
const { loggedIn, currentSite, userMap, currentUser, currentLanguage } = storeToRefs(userInfoStore);

const { setLang, theme, primaryColorLight, primaryColorDark } = useSettingManager();
const { manualSetTheme, enableFollowSystem, followSystem, userTheme } = useThemeAdapter();
const { applyPrimaryColor } = useColor();

const inputSite = ref("");
const errorMessage = ref("");
const openModal = ref(false);
const hasValidationError = ref(false);
const loginPage = ref<WebviewWindow | null>(null);
const unlistenErrorPageRef = ref<UnlistenFn | null>(null);
const unlistenLoginSuccessRef = ref<UnlistenFn | null>(null);
const unlistenLoginFailedRef = ref<UnlistenFn | null>(null);
const unlistenLoginFailedTimeoutRef = ref<UnlistenFn | null>(null);
const inputRef = ref<ComponentPublicInstance | null>(null);

useEventBus().on("login", openLoginPage);

const normalizedInputSite = computed(() => normalizeSite(inputSite.value));
const selectedLanguage = ref<LangType>(currentLanguage.value);

// TODO 后续逻辑统一到一个位置
const languageItems = computed(() => {
  const arr = (locales.value as any[]) || [];
  return arr.map((l: any) => ({
    id: l.code || l,
    label: l.name || l
  }));
});

const languageChildren = computed(() => [
  languageItems.value.map((item) => ({
    label: item.label,
    type: "checkbox",
    checked: selectedLanguage.value === (item.id as LangType),
    onUpdateChecked: (checked: boolean) => {
      if (!checked) return;
      handleLanguageChange(item.id as LangType);
    }
  }))
]);

const appearanceOptions = computed(() => [
  { id: "withSystem", label: t("Common.WithSystem") },
  { id: "light", label: t("Common.Light") },
  { id: "dark", label: t("Common.Dark") }
]);

const selectedAppearance = computed<ThemeType>({
  get: () => {
    if (followSystem.value) return "withSystem";

    const saved = (theme.value || "") as ThemeType;
    if (saved === "dark" || saved === "light") return saved;

    const current = (userTheme.value || "") as ThemeType;
    if (current === "dark" || current === "light") return current;

    return "light";
  },
  set: (id: ThemeType) => {
    if (id === "withSystem") {
      void enableFollowSystem().then(() => {
        useTauriEventEmit("theme-changed", { mode: "withSystem" });
        nextTick().then(() => applyCurrentThemeColor(true));
      });
      return;
    }

    manualSetTheme(id as any);
    useTauriEventEmit("theme-changed", { mode: id });
    nextTick().then(() => applyCurrentThemeColor(true));
  }
});

const appearanceChildren = computed(() => [
  appearanceOptions.value.map((opt) => ({
    label: opt.label,
    type: "checkbox",
    checked: selectedAppearance.value === (opt.id as ThemeType),
    onUpdateChecked: (checked: boolean) => {
      if (!checked) return;
      if (selectedAppearance.value !== (opt.id as ThemeType)) {
        selectedAppearance.value = opt.id as ThemeType;
      }
    }
  }))
]);

const profileMenuItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: t("Login.AddAccount"),
      icon: "i-lucide-user-round-plus",
      onClick: openLoginPage
    },
    {
      label: t("Login.SwitchSite"),
      icon: "i-lucide-arrow-down-up",
      children: switchAccountChildren()
    },
     {
      label: t("Common.Appearance"),
      icon: "solar:palette-linear",
      children: appearanceChildren.value
    },
    {
      label: t("Common.Language"),
      icon: "solar:global-outline",
      children: languageChildren.value
    }
  ],
  [
    {
      label: t("Login.Logout"),
      icon: "solar:login-outline",
      color: "error",
      ui: {
        itemLabel:
          "!text-error group-data-highlighted:!text-error group-data-[state=open]:!text-error group-data-[state=checked]:!text-error",
        itemLeadingIcon:
          "group-data-[state=checked]:text-error group-data-highlighted:!text-error group-data-[state=open]:!text-error"
      },
      onClick: clearAuthInfo
    }
  ]
]);

watch(
  () => currentLanguage.value,
  async (lang: LangType) => {
    const target = lang === "zh" ? "zh" : "en";
    await setLocale(target);
    if (lang && lang !== selectedLanguage.value) {
      selectedLanguage.value = lang;
    }
  },
  { immediate: true }
);

watch(
  () => userTheme.value,
  () => {
    applyCurrentThemeColor();
  }
);

const applyCurrentThemeColor = (broadcast = false) => {
  const modeNow = (userTheme.value as string) || (selectedAppearance.value as string);
  const hexNow = modeNow === "dark" ? primaryColorDark.value : primaryColorLight.value;

  if (hexNow) {
    applyPrimaryColor(hexNow);
    if (broadcast) {
      useTauriEventEmit("primary-color-changed", { hex: hexNow, mode: modeNow });
    }
  }
};

const handleLanguageChange = (code: LangType) => {
  if (!code || code === selectedLanguage.value) return;

  selectedLanguage.value = code;
  setLang(code);
  userInfoStore.applyLanguageToAll(code);
  useTauriEventEmit("language-changed", { code });
};

/**
 * @description 标准化站点输入：去除首尾空格 + 去除末尾斜杠
 * @param value 站点输入
 * @returns 标准化后的站点
 */
function normalizeSite(value: string): string {
  const s = (value || "").trim();
  if (!s) return "";
  return s.replace(/\/+$/, "");
}

/**
 * @description 初始化可选组织（去重）
 */
function initSelectOrganization(permissionOrgData: PermissionOrgs) {
  const orgs = [
    ...(permissionOrgData.pam_orgs || []),
    ...(permissionOrgData.audit_orgs || []),
    ...(permissionOrgData.console_orgs || []),
    ...(permissionOrgData.workbench_orgs || [])
  ];

  const uniqueOrgs = orgs.filter((org, index, self) => index === self.findIndex((t: PermOrgItem) => t.id === org.id));

  return uniqueOrgs;
}

/**
 * @description 打开登录页面
 */
function openLoginPage() {
  openModal.value = true;
  hasValidationError.value = false;
  errorMessage.value = "";
  nextTick(() => {
    inputRef.value?.$el.querySelector("input")?.focus();
  });
}

/**
 * @description 清除验证错误
 */
function clearValidationError() {
  if (hasValidationError.value) {
    hasValidationError.value = false;
    errorMessage.value = "";
  }
}

/**
 * @description 切换账户子菜单
 * @returns 切换账户子菜单
 */
function switchAccountChildren() {
  const items: DropdownMenuItem[] = (Object.values(userMap.value) as UserData[]).map((u: UserData) => {
    let host = u.site;

    try {
      host = new URL(u.site).host;
    } catch (e) {
      console.log("e", e);
    }

    const label = `${host}`;
    const isCurrent = u.site === currentSite.value;

    return {
      label,
      type: "checkbox",
      checked: isCurrent,
      onUpdateChecked: (checked: boolean) => {
        if (!checked || isCurrent) return;
        handleSwitchAccount(u.site);
      }
    } as DropdownMenuItem;
  });

  return [items];
}

/**
 * @description 切换账户
 * @param site 站点
 */
function handleSwitchAccount(site: string) {
  if (site === currentSite.value) return;

  userInfoStore.setCurrentSite(site);

  nextTick(() => {
    useEventBus().emit("refresh", undefined);
  });
}

/**
 * @description 清除认证信息
 */
function clearAuthInfo() {
  userInfoStore.deleteUserData(currentSite.value);
}

/**
 * @description 处理剪贴板输入
 * @param value 剪贴板输入
 */
const handleClipboard = (value: string) => {
  inputSite.value = normalizeSite(value);
};

/**
 * @description 处理确认输入
 */
const handleConfirm = async () => {
  hasValidationError.value = false;
  errorMessage.value = "";

  const normalizedSite = normalizedInputSite.value;
  const urlRegExp = appConfig.componentsConfig.urlRegExp;

  if (!normalizedSite) {
    hasValidationError.value = true;
    errorMessage.value = t("Login.EmptyUrlError");

    nextTick(() => {
      inputRef.value?.$el?.querySelector("input")?.focus();
    });

    return;
  }

  const users = Object.values(userMap.value) as UserData[];

  if (users.some((user) => normalizeSite(user.site) === normalizedSite)) {
    hasValidationError.value = true;
    errorMessage.value = t("Login.AlreadyLoggedInError");

    return;
  }

  if (!urlRegExp.test(normalizedSite)) {
    hasValidationError.value = true;
    errorMessage.value = t("Login.InvalidUrlError");

    nextTick(() => {
      inputRef.value?.$el?.querySelector("input")?.focus();
    });

    return;
  }

  // 预检 TLS/证书
  const target = normalizedSite.startsWith("http") ? normalizedSite : `https://${normalizedSite}`;

  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 5000);
    // no-cors 能发起请求（即使拿不到具体响应），若 TLS/证书错误会直接抛出
    await fetch(target, { mode: "no-cors", cache: "no-store", method: "GET", signal: ac.signal });

    clearTimeout(to);
  } catch (e: any) {
    const msg = String(e?.message || e || "Network error");
    const low = msg.toLowerCase();
    const isAbort = e?.name === "AbortError";
    const online = typeof navigator !== "undefined" ? navigator.onLine : true;

    let isHttps = false;

    const u = new URL(target);
    isHttps = u.protocol === "https:";

    // 关键词匹配 + 平台/协议启发：在 macOS + https 的失败优先视作证书/ATS问题（除非明确超时/离线）
    const keywordCert =
      low.includes("certificate") ||
      low.includes("ssl") ||
      low.includes("x509") ||
      low.includes("handshake") ||
      low.includes("app transport security") ||
      low.includes("secure connection") ||
      low.includes("ats") ||
      low.includes("hostname") ||
      low.includes("mismatch");

    const heuristicCert = isMacOS.value && isHttps && !isAbort && online;
    const isCertLike = keywordCert || heuristicCert;

    const desc = isCertLike
      ? isMacOS.value
        ? t("Login.InvalidCertificateMac")
        : t("Login.InvalidCertificateGeneric")
      : t("Login.NetworkError");

    toast.add({
      title: t("Login.LoginFailed"),
      description: `${desc}`,
      color: "error",
      icon: "line-md:close-circle"
    });
    return;
  }

  loginPage.value = new useTauriWebviewWindowWebviewWindow("loginPage", {
    title: `${t("Common.LoginSite")} - ${normalizedSite}`,
    url: normalizedSite,
    width: 600,
    height: 800,
    minWidth: 600,
    minHeight: 800,
    // hiddenTitle: true,
    // titleBarStyle: "overlay",
    trafficLightPosition: new LogicalPosition(10, 19)
  });

  setTimeout(async () => {
    await useTauriCoreInvoke("url_watcher", {
      name: "loginPage",
      origin: normalizedSite
    });

    openModal.value = false;
  });
};

/**
 * @description 处理版本兼容
 */
const handleVersions = (version: string[] | string, appVersion: string) => {
  if (version === "incompatible") {
    return { status: "incompatible" as const, match: false, versions: [] as string[] };
  }

  const versions = Array.isArray(version) ? version : [];
  const match = versions.length > 0 ? versions.includes(appVersion) : true;
  return { status: "list" as const, match, versions };
};

onMounted(async () => {
  applyCurrentThemeColor();

  unlistenErrorPageRef.value = await useTauriEventListen("error-page", (event) => {
    const { status, reason } = event.payload as {
      status: string;
      reason: string;
    };

    if (status === "failure" && reason === "cookies-not-found") {
      toast.add({
        title: t("Login.LoginFailed"),
        description: t("Login.LoginFailedErrorPage"),
        color: "error",
        icon: "line-md:close-circle"
      });

      nextTick(() => userInfoStore.setUserLoggedIn(false));
    }
  });

  unlistenLoginSuccessRef.value = await useTauriEventListen("login-success-detected", async (event) => {
    const {
      status,
      profile,
      cookies,
      version,
      current_org,
      resolved_site,
      permission_orgs,
      xpack_license_valid
    } = event.payload as UserIntiInfo;
    const appVersion = await useTauriAppGetVersion().catch(() => "");

    let versionMessage: string | string[] = version ?? "";

    if (version === "incompatible") {
    } else if (typeof version === "string" && version.length > 0) {
      try {
        versionMessage = JSON.parse(version);
      } catch (_) {
        versionMessage = [];
      }
    } else {
      versionMessage = [];
    }

    const { status: vStatus, match: vMatch } = handleVersions(versionMessage, appVersion);

    const profileData = JSON.parse((profile as any).data);
    const currentOrgData = JSON.parse((current_org as any).data);
    const permissionOrgData = JSON.parse((permission_orgs as any).data) as PermissionOrgs;

    const normalizedSite = normalizedInputSite.value;
    const resolvedSite = resolved_site || normalizedSite;

    if (status === "success" && profileData) {
      const language = resolveLanguageFromCookies(cookies);

      if (vStatus !== "incompatible" && !vMatch) {
        useEventBus().emit("versionAlert", { type: "noMatch", version: versionMessage[versionMessage.length - 1] });
      }

      // 对于旧的 jms 获取 versions 的接口会返回 404
      if (vStatus === "incompatible") {
        useEventBus().emit("versionAlert", { type: "incompatible" });
      }

      const availableOrgs = xpack_license_valid === false ? [] : initSelectOrganization(permissionOrgData);

      userInfoStore.setUserData(resolvedSite, {
        name: profileData.name,
        headerJson: cookies,
        site: resolvedSite,
        org: currentOrgData,
        system_roles: profileData.system_roles,
        availableOrgs,
        xpackLicenseValid: xpack_license_valid ?? false,
        language,
        connectionInfo: {
          protocol: "",
          username: ""
        }
      });

      userInfoStore.setOrganizations(availableOrgs);
      userInfoStore.setCurrentOrg(currentOrgData);
      userInfoStore.setUserLoggedIn(true);

      await setLocale(language);

      nextTick(() => {
        toast.add({
          title: t("Login.LoginSuccess"),
          description: t("Login.LoginSuccessDescription"),
          color: "primary",
          icon: "line-md:check-all"
        });

        useEventBus().emit("refresh", undefined);
      });
    }
  });

  unlistenLoginFailedRef.value = await useTauriEventListen("login-failed-detected", () => {
    toast.add({
      title: t("Login.LoginFailed"),
      description: t("Login.LoginFailedDescription"),
      color: "error",
      icon: "line-md:close-circle"
    });
    userInfoStore.setUserLoggedIn(false);
  });

  unlistenLoginFailedTimeoutRef.value = await useTauriEventListen("login-failed-timeout", () => {
    toast.add({
      title: t("Login.LoginFailed"),
      description: t("Login.LoginFailedTimeout"),
      color: "error",
      icon: "line-md:close-circle"
    });
    nextTick(() => userInfoStore.setUserLoggedIn(false));
  });
});

onBeforeUnmount(() => {
  if (unlistenErrorPageRef.value) unlistenErrorPageRef.value();
  if (unlistenLoginSuccessRef.value) unlistenLoginSuccessRef.value();
  if (unlistenLoginFailedRef.value) unlistenLoginFailedRef.value();
  if (unlistenLoginFailedTimeoutRef.value) unlistenLoginFailedTimeoutRef.value();
});
</script>

<template>
  <UDropdownMenu
    v-if="loggedIn"
    :items="profileMenuItems"
    size="sm"
    side="top"
    align="start"
    :ui="{ content: 'w-56 p-1' }"
  >
    <div
      class="flex items-center py-2 px-2 w-full min-w-0 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors mb-1"
      :style="{
        justifyContent: collapse ? 'center' : ''
      }"
    >
      <UUser
        size="sm"
        :avatar="{
          src: '/user_avatar.png'
        }"
        :ui="props.collapse ? { root: 'justify-center gap-0' } : undefined"
      >
        <template #name>
          <UTooltip v-if="!props.collapse" arrow :text="currentUser?.name">
            <span class="block md:max-w-[150px] truncate leading-tight text-sm font-medium cursor-pointer">
              {{ currentUser?.name }}
            </span>
          </UTooltip>
        </template>
      </UUser>
    </div>
  </UDropdownMenu>

  <UButton v-else variant="subtle" icon="line-md:log-in" class="w-full mb-2" @click="openLoginPage">
    <span v-if="!props.collapse">
      {{ t("Common.Login") }}
    </span>
  </UButton>

  <Modal
    v-model:open="openModal"
    :title="t('Login.Title')"
    @update:open="openModal = $event"
    @confirm="handleConfirm"
    @clipboard="handleClipboard"
  >
    <div class="space-y-1">
      <UInput
        ref="inputRef"
        v-model="inputSite"
        :color="hasValidationError ? 'error' : 'primary'"
        :ui="{ base: 'peer' }"
        placeholder=" "
        autocapitalize="none"
        autocorrect="off"
        @input="clearValidationError"
      >
        <label
          class="pointer-events-none absolute left-0 -top-2.5 text-xs font-medium px-1.5 transition-all peer-focus:-top-2.5 peer-focus:text-xs peer-focus:font-medium peer-placeholder-shown:text-sm peer-placeholder-shown:top-1.5 peer-placeholder-shown:font-normal"
        >
          <span class="inline-flex bg-default px-1">
            {{ t("Login.Description") }}
          </span>
        </label>

        <template v-if="normalizedInputSite?.length" #trailing>
          <UButton
            color="neutral"
            variant="link"
            size="sm"
            icon="i-lucide-circle-x"
            aria-label="Clear input"
            @click="
              inputSite = '';
              clearValidationError();
            "
          />
        </template>
      </UInput>

      <div v-if="hasValidationError" class="text-red-500 text-xs px-1">
        {{ errorMessage }}
      </div>
    </div>
  </Modal>
</template>

<style scoped></style>
