<script setup lang="ts">
import type { DesktopUnlistenFn } from "~/shared/desktop/bridge";
import type { LangType, ThemePresetId, UserData } from "~/types/index";

import { useSettingManager } from "~/composables/useSettingManager";
import { DARK_THEME_PRESETS, getThemePreset, LIGHT_THEME_PRESETS } from "~/composables/useThemePresets";
import { desktopApp, desktopEmit, desktopInvoke, desktopListen } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";
import RecentSites from "./recentSites.vue";

interface VersionAlertPayload {
  type: string;
  version?: string;
}

interface VersionMessageResponse {
  status: number;
  data: string;
  success: boolean;
}

const recentSiteLimit = 5;

const { addErrorToast } = useErrorToast();
const appConfig = useAppConfig();
const localePath = useLocalePath();
const userInfoStore = useUserInfoStore();

const { t, locales, locale } = useI18n();
const { loggedIn, currentAccountId, userMap, currentUser } = storeToRefs(userInfoStore);
const { applyLoginPayload } = useAuthSession();
const { openSettings } = useSettingsWindow();
const {
  currentAppearanceMode,
  applyAppearanceMode,
  currentThemePresetId,
  currentThemePresetLabel,
  selectThemePreset,
  themePresetLabel
} = useThemeOptions();

const {
  primaryColorLight,
  primaryColorDark,
  recentSites,
  setRecentSites,
  hydrationPromise,
  setLang,
  setLightThemePreset,
  setDarkThemePreset,
  setPrimaryColorLight,
  setPrimaryColorDark
} = useSettingManager();
const { userTheme } = useThemeAdapter();
const { applyPrimaryColor } = useColor();

const inputSite = ref("");
const inputSiteName = ref("");
const siteNameEdited = ref(false);
const editingAccountId = ref("");
const errorMessage = ref("");
const loginBtn = ref(false);
const openModal = ref(false);
const hasValidationError = ref(false);
const validationField = ref<"site" | "name" | null>(null);
const recentSitesDismissed = ref(false);
const unlistenAuthUrlRef = ref<DesktopUnlistenFn | null>(null);
const unlistenErrorPageRef = ref<DesktopUnlistenFn | null>(null);
const unlistenLoginFailedRef = ref<DesktopUnlistenFn | null>(null);
const inputRef = ref<ComponentPublicInstance | null>(null);
const siteNameInputRef = ref<ComponentPublicInstance | null>(null);
const profileOpen = ref(false);
const profileOpenedByPointer = ref(false);

let loginBtnUnlockTimer: ReturnType<typeof setTimeout> | null = null;

useEventBus().on("login", openLoginPage);

const normalizedInputSite = computed(() => normalizeSite(inputSite.value));
const normalizedInputSiteName = computed(() => inputSiteName.value.trim());

const normalizedRecentSites = computed(() => {
  const raw = Array.isArray(recentSites.value) ? recentSites.value : [];
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const site of raw) {
    const value = normalizeSite(site);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
    if (normalized.length >= recentSiteLimit) break;
  }

  return normalized;
});

const filteredRecentSites = computed(() => {
  const query = normalizeSite(inputSite.value).toLowerCase();
  const list = normalizedRecentSites.value;
  if (!query) return list;

  return list.filter((site) => site.toLowerCase().includes(query));
});

const showRecentSites = computed(
  () => openModal.value && !recentSitesDismissed.value && filteredRecentSites.value.length > 0
);

const clearLoginBtnUnlockTimer = () => {
  if (loginBtnUnlockTimer) {
    clearTimeout(loginBtnUnlockTimer);
    loginBtnUnlockTimer = null;
  }
};

const enableLoginBtnAfter = (ms: number) => {
  clearLoginBtnUnlockTimer();

  loginBtnUnlockTimer = setTimeout(() => {
    loginBtn.value = false;
    loginBtnUnlockTimer = null;
  }, ms);
};

const accountTooltip = computed(() => {
  if (loggedIn.value && currentUser.value?.name) return currentUser.value.name;
  return t("Common.Account");
});

const accountSite = computed(() => currentUser.value?.siteName || currentUser.value?.site || "—");
const siteAccounts = computed(() => Object.entries(userMap.value) as [string, UserData][]);
const hasMultipleSites = computed(() => siteAccounts.value.length > 1);

const languageItems = computed(() =>
  ((locales.value as Array<{ code?: string; name?: string } | string>) || []).map((item) => {
    const id = typeof item === "string" ? item : item.code || "";
    const label = typeof item === "string" ? item : item.name || id;
    return { id, label };
  })
);

const selectedLanguage = computed({
  get: () => locale.value,
  set: (code: string) => {
    if (code) setLang(code as LangType);
  }
});

const currentLanguageLabel = computed(
  () => languageItems.value.find((item) => item.id === locale.value)?.label || locale.value
);

const appearanceModes = computed(() => [
  { id: "withSystem" as const, label: t("Common.System") },
  { id: "light" as const, label: t("Common.Light") },
  { id: "dark" as const, label: t("Common.Dark") }
]);

const selectedAppearanceMode = computed({
  get: () => currentAppearanceMode.value,
  set: (mode: "withSystem" | "light" | "dark") => {
    void applyAppearanceMode(mode);
  }
});

const currentAppearanceLabel = computed(
  () => appearanceModes.value.find((item) => item.id === currentAppearanceMode.value)?.label || ""
);

const menuTabsUi = {
  root: "w-full",
  list: "w-full bg-[var(--app-surface-canvas)] p-1 ring-1 ring-[var(--app-border)]",
  indicator: "bg-[var(--app-state-hover-strong)] shadow-sm",
  trigger: "flex-1 px-3 data-[state=active]:text-highlighted focus-visible:outline-[var(--app-focus-ring)]"
};

const currentThemeAccent = computed(() => getThemePreset(currentThemePresetId.value)?.accent || "var(--theme-accent)");
const themePaletteOpen = ref(false);

const resolvedPaletteMode = computed<"light" | "dark">(() => {
  if (currentAppearanceMode.value === "light") return "light";
  if (currentAppearanceMode.value === "dark") return "dark";
  return userTheme.value === "dark" ? "dark" : "light";
});

const visibleThemePresets = computed(() =>
  resolvedPaletteMode.value === "dark" ? DARK_THEME_PRESETS : LIGHT_THEME_PRESETS
);

watch(profileOpen, (open) => {
  if (!open) themePaletteOpen.value = false;
});

const handleProfileOpenAutoFocus = (event: Event) => {
  if (profileOpenedByPointer.value) event.preventDefault();
  profileOpenedByPointer.value = false;
};

const applyPalettePreset = (id: ThemePresetId) => {
  const preset = getThemePreset(id);
  if (!preset) return;

  if (currentAppearanceMode.value !== "withSystem") {
    selectThemePreset(id);
    return;
  }

  applyPrimaryColor(preset.accent);
  if (resolvedPaletteMode.value === "dark") {
    setDarkThemePreset(id);
    setPrimaryColorDark(preset.accent);
  } else {
    setLightThemePreset(id);
    setPrimaryColorLight(preset.accent);
  }

  try {
    void desktopEmit("primary-color-changed", { hex: preset.accent, mode: resolvedPaletteMode.value });
  } catch {}
};

const accountInitial = (name?: string) => {
  const trimmed = (name || "").trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : "?";
};

watch(
  () => userTheme.value,
  () => {
    applyCurrentThemeColor();
  }
);

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

function getDefaultSiteName(value: string): string {
  const normalized = normalizeSite(value);
  if (!normalized) return "";

  try {
    return new URL(normalized).hostname || normalized;
  } catch {
    const withoutScheme = normalized.replace(/^[a-z][a-z\d+.-]*:\/\//i, "");
    const authority = withoutScheme.split(/[/?#]/, 1)[0] || "";
    const host = authority.includes("@") ? authority.split("@").pop() || authority : authority;

    if (!host) return normalized;

    const ipv6Match = host.match(/^\[([^\]]+)\](?::\d+)?$/);
    if (ipv6Match) return ipv6Match[1] || normalized;

    return host.replace(/:\d+$/, "");
  }
}

const ensureRecentSitesReady = async () => {
  if (hydrationPromise.value) {
    await hydrationPromise.value;
  }
};

const saveRecentSite = async (site: string) => {
  try {
    const normalized = normalizeSite(site);
    if (!normalized) return;

    await ensureRecentSitesReady();
    const next = [normalized, ...normalizedRecentSites.value.filter((item) => item !== normalized)].slice(
      0,
      recentSiteLimit
    );
    setRecentSites(next);
  } catch (err) {
    console.error("save recent sites failed", err);
  }
};

const removeRecentSite = async (site: string) => {
  try {
    const normalized = normalizeSite(site);
    if (!normalized) return;

    await ensureRecentSitesReady();
    const next = normalizedRecentSites.value.filter((item) => item !== normalized);
    setRecentSites(next);
  } catch (err) {
    console.error("remove recent site failed", err);
  }
};

const clearRecentSites = async () => {
  try {
    await ensureRecentSitesReady();
    setRecentSites([]);
  } catch (err) {
    console.error("clear recent sites failed", err);
  }
};

const selectRecentSite = (site: string) => {
  inputSite.value = site;
  inputSiteName.value = getDefaultSiteName(site);
  siteNameEdited.value = false;
  clearValidationError();
  recentSitesDismissed.value = true;
  nextTick(() => {
    inputRef.value?.$el?.querySelector("input")?.focus();
  });
};

const handleClearInput = () => {
  inputSite.value = "";
  if (!siteNameEdited.value) inputSiteName.value = "";
  clearValidationError();
  recentSitesDismissed.value = false;
};

function normalizeVersionMessage(response: VersionMessageResponse) {
  if (response.status === 404) {
    return { status: "incompatible" as const, versions: [] as string[] };
  }

  if (!response.data) {
    return { status: "list" as const, versions: [] as string[] };
  }

  try {
    const parsed = JSON.parse(response.data);
    const versions = Array.isArray(parsed)
      ? parsed.map((item) => (item == null ? "" : String(item))).filter((v) => v.length > 0)
      : [];
    return { status: "list" as const, versions };
  } catch {
    return { status: "list" as const, versions: [] as string[] };
  }
}

function normalizeMajorMinor(version: string) {
  const cleaned = (version || "").trim();
  if (!cleaned) return "";

  const parts = cleaned.split(".");
  const major = (parts[0] || "").replace(/\D/g, "");
  if (!major) return "";

  const minor = (parts[1] || "").replace(/\D/g, "");
  return minor ? `${major}.${minor}` : major;
}

function normalizeMajorMinorList(versions: string[]) {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const version of versions) {
    const value = normalizeMajorMinor(version);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

const emitVersionAlertAndCloseModal = (payload: VersionAlertPayload) => {
  openModal.value = false;
  loginBtn.value = false;
  useEventBus().emit("versionAlert", payload);
};

const checkVersionBeforeOAuth = async (accountId: string, site: string) => {
  if (!isDesktopRuntime()) return true;

  await desktopInvoke("set_api_session", {
    sessionKey: accountId,
    origin: site,
    bearerToken: "",
    orgId: ""
  });

  const [versionResponse, appVersion] = await Promise.all([
    desktopInvoke<VersionMessageResponse>("get_version_message").catch(() => {
      return null;
    }),
    desktopApp.getVersion().catch(() => "")
  ]);

  if (!versionResponse || versionResponse.status === 0) {
    console.warn("Skip version precheck before OAuth because version endpoint is unavailable", {
      site,
      versionResponse
    });
    return true;
  }

  const { status: versionStatus, versions } = normalizeVersionMessage(versionResponse);

  if (versionStatus === "incompatible") {
    emitVersionAlertAndCloseModal({ type: "incompatible" });
    return false;
  }

  const normalizedAppVersion = normalizeMajorMinor(appVersion);
  const normalizedVersions = normalizeMajorMinorList(versions);

  if (normalizedAppVersion && normalizedVersions.length > 0) {
    if (!normalizedVersions.includes(normalizedAppVersion)) {
      emitVersionAlertAndCloseModal({ type: "noMatch", version: versions[versions.length - 1] });
      return false;
    }
  } else if (appVersion && versions.length > 0 && !versions.includes(appVersion)) {
    emitVersionAlertAndCloseModal({ type: "noMatch", version: versions[versions.length - 1] });
    return false;
  }

  return true;
};

/**
 * @description 打开登录页面
 */
function openLoginPage() {
  profileOpen.value = false;

  if (!isDesktopRuntime()) {
    redirectToWebLogin();
    return;
  }

  const reauthUser = !loggedIn.value ? currentUser.value : null;
  editingAccountId.value = reauthUser ? currentAccountId.value : "";
  inputSite.value = reauthUser?.site || "";
  inputSiteName.value = reauthUser?.siteName || reauthUser?.site || "";
  siteNameEdited.value = Boolean(reauthUser);
  openModal.value = true;
  recentSitesDismissed.value = false;
  hasValidationError.value = false;
  validationField.value = null;
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
    validationField.value = null;
    errorMessage.value = "";
  }
}

/**
 * @description 清除认证信息
 */
function clearAuthInfo() {
  profileOpen.value = false;
  userInfoStore.deleteUserData(currentAccountId.value);
}

function handleSwitchAccount(accountId: string) {
  if (accountId === currentAccountId.value) return;

  profileOpen.value = false;
  userInfoStore.setCurrentAccount(accountId);
  nextTick(() => useEventBus().emit("refresh", undefined));
}

function openAddSite() {
  profileOpen.value = false;
  openLoginPage();
}

async function openUserSettings() {
  profileOpen.value = false;
  await openSettings("/setting/user");
}

async function openPreferences() {
  profileOpen.value = false;
  await openSettings();
}

async function openTools() {
  profileOpen.value = false;
  await navigateTo(localePath({ path: "/tools" }));
}

/**
 * @description 过滤输入中的控制字符
 */
// oxlint-disable-next-line no-control-regex
const sanitizeInput = (value: string) => value.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

/**
 * @description 输入事件处理：移除控制字符，并保持光标位置
 * 移除控制字符后，用“移除前的长度差”修正光标，保证左右键仍可正常移动
 */
const handleInputSanitize = (event: Event) => {
  const target = event.target as HTMLInputElement | null;

  if (!target) return;

  const raw = target.value;
  const caret = target.selectionStart ?? raw.length;

  const sanitized = sanitizeInput(raw);

  if (sanitized !== raw) {
    const beforeCaretRaw = raw.slice(0, caret);
    const beforeCaretSanitized = sanitizeInput(beforeCaretRaw);
    const removedBeforeCaret = beforeCaretRaw.length - beforeCaretSanitized.length;

    target.value = sanitized;

    const newCaret = Math.max(0, caret - removedBeforeCaret);
    target.setSelectionRange(newCaret, newCaret);
  }

  inputSite.value = sanitized;
  if (!siteNameEdited.value) {
    inputSiteName.value = getDefaultSiteName(sanitized);
  }
  recentSitesDismissed.value = false;
  clearValidationError();
};

const handleSiteNameInputSanitize = (event: Event) => {
  const target = event.target as HTMLInputElement | null;
  if (!target) return;

  const sanitized = sanitizeInput(target.value);
  if (sanitized !== target.value) target.value = sanitized;

  inputSiteName.value = sanitized;
  siteNameEdited.value = true;
  clearValidationError();
};

/**
 * @description 处理剪贴板输入
 * @param value 剪贴板输入
 */
const handleClipboard = (value: string) => {
  inputSite.value = normalizeSite(value);
  if (!siteNameEdited.value) inputSiteName.value = getDefaultSiteName(inputSite.value);
  recentSitesDismissed.value = false;
};

/**
 * @description 处理确认输入
 */
const handleConfirm = async () => {
  if (loginBtn.value) return;

  errorMessage.value = "";
  hasValidationError.value = false;
  validationField.value = null;

  const normalizedSite = normalizedInputSite.value;
  const siteName = normalizedInputSiteName.value;
  const urlRegExp = appConfig.componentsConfig.urlRegExp;

  if (!normalizedSite) {
    hasValidationError.value = true;
    validationField.value = "site";
    errorMessage.value = t("Login.EmptyUrlError");

    nextTick(() => {
      inputRef.value?.$el?.querySelector("input")?.focus();
    });

    return;
  }

  if (!siteName) {
    hasValidationError.value = true;
    validationField.value = "name";
    errorMessage.value = t("Login.EmptySiteNameError");
    nextTick(() => {
      siteNameInputRef.value?.$el?.querySelector("input")?.focus();
    });
    return;
  }

  const duplicateName = (Object.entries(userMap.value) as [string, UserData][]).some(
    ([accountId, user]) =>
      accountId !== editingAccountId.value && user.siteName.trim().toLowerCase() === siteName.toLowerCase()
  );

  if (duplicateName) {
    hasValidationError.value = true;
    validationField.value = "name";
    errorMessage.value = t("Login.DuplicateSiteNameError");
    nextTick(() => {
      siteNameInputRef.value?.$el?.querySelector("input")?.focus();
    });
    return;
  }

  if (!urlRegExp.test(normalizedSite)) {
    hasValidationError.value = true;
    validationField.value = "site";
    errorMessage.value = t("Login.InvalidUrlError");

    nextTick(() => {
      inputRef.value?.$el?.querySelector("input")?.focus();
    });

    return;
  }

  if (!isDesktopRuntime()) {
    redirectToWebLogin();
    return;
  }

  try {
    clearLoginBtnUnlockTimer();
    loginBtn.value = true;
    const accountId = editingAccountId.value || globalThis.crypto.randomUUID();
    const ok = await checkVersionBeforeOAuth(accountId, normalizedSite);
    if (!ok) return;

    const payload = await desktopInvoke<any>("auth_login", {
      site: normalizedSite,
      sessionId: accountId
    });
    await applyLoginPayload(payload, { showToast: true, navigateHome: true, accountId, siteName });
    void saveRecentSite(normalizedSite);
  } catch (e: any) {
    const raw = (e?.message || e || "").toString();
    const looksLikeSiteIssue = [
      "Failed to fetch OAuth config",
      "OAuth config endpoint returned",
      "Failed to parse OAuth config JSON",
      "Failed to read response body"
    ].some((needle) => raw.includes(needle));

    hasValidationError.value = true;
    validationField.value = "site";
    errorMessage.value = looksLikeSiteIssue ? t("Login.InvalidSiteError") : raw || t("Login.LoginFailed");

    if (!looksLikeSiteIssue) {
      addErrorToast({
        title: t("Login.LoginFailed"),
        description: raw || t("Login.LoginFailed"),
        icon: "line-md:close-circle",
        progress: true,
        duration: 4000
      });
      enableLoginBtnAfter(2000);
    }

    nextTick(() => {
      inputRef.value?.$el?.querySelector("input")?.focus();
    });
  }
};

onMounted(async () => {
  applyCurrentThemeColor();

  if (!isDesktopRuntime()) return;

  unlistenAuthUrlRef.value = await desktopListen("auth_url", (event) => {
    const url = (event?.payload || "").toString();
    if (!url) return;

    clearLoginBtnUnlockTimer();
    loginBtn.value = false;
    openModal.value = false;
    navigateTo({ path: localePath({ path: "/auth/browser" }), query: { auth_url: url } });
  });

  unlistenErrorPageRef.value = await desktopListen("error-page", (event) => {
    const payload = (event?.payload || {}) as any;
    const status = (payload?.status || "").toString();
    const reason = (payload?.reason || "").toString();
    const message = (payload?.message || "").toString();

    if (status !== "failure") return;

    let description = message || t("Login.LoginFailedErrorPage");

    if (reason === "invalid-site") {
      description = t(" ");
    }

    addErrorToast({
      title: t("Login.LoginFailed"),
      description,
      icon: "line-md:close-circle",
      progress: true,
      duration: 4000
    });
    enableLoginBtnAfter(2000);

    if (reason === "invalid-site") {
      hasValidationError.value = true;
      validationField.value = "site";
      errorMessage.value = t("Login.InvalidSiteError");

      nextTick(() => {
        inputRef.value?.$el?.querySelector("input")?.focus();
      });

      return;
    }

    nextTick(() => {
      userInfoStore.setUserLoggedIn(false);
    });
  });

  unlistenLoginFailedRef.value = await desktopListen("login-failed-detected", (event) => {
    const payload = (event?.payload || {}) as any;
    const reason = (payload?.reason || "").toString();
    const message = (payload?.message || "").toString();

    let description = message || t("Login.LoginFailedDescription");

    if (reason === "invalid-site") {
      description = t("Login.InvalidSiteError");
    }

    addErrorToast({
      title: t("Login.LoginFailed"),
      description,
      icon: "line-md:close-circle",
      progress: true,
      duration: 4000
    });

    enableLoginBtnAfter(2000);

    if (reason === "invalid-site") {
      hasValidationError.value = true;
      validationField.value = "site";
      errorMessage.value = t("Login.InvalidSiteError");

      nextTick(() => {
        inputRef.value?.$el?.querySelector("input")?.focus();
      });

      return;
    }

    userInfoStore.setUserLoggedIn(false);
  });
});

onBeforeUnmount(() => {
  if (unlistenAuthUrlRef.value) unlistenAuthUrlRef.value();
  if (unlistenErrorPageRef.value) unlistenErrorPageRef.value();
  if (unlistenLoginFailedRef.value) unlistenLoginFailedRef.value();
  clearLoginBtnUnlockTimer();
});
</script>

<template>
  <UPopover
    v-model:open="profileOpen"
    :content="{
      align: 'end',
      side: 'bottom',
      sideOffset: 8,
      onOpenAutoFocus: handleProfileOpenAutoFocus
    }"
    :ui="{
      content:
        'max-h-[calc(100dvh-4rem)] w-64 overflow-y-auto rounded-xl bg-[var(--app-surface-overlay)] p-0 shadow-[var(--theme-shadow-soft)] ring-1 ring-[var(--app-border)] backdrop-blur-md'
    }"
  >
    <UTooltip arrow :text="accountTooltip">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        square
        :aria-label="accountTooltip"
        :ui="{ leadingIcon: 'size-4', base: 'rounded-full' }"
        @pointerdown="profileOpenedByPointer = true"
        @keydown="profileOpenedByPointer = false"
      >
        <UAvatar
          v-if="loggedIn"
          :alt="currentUser?.name || t('Common.User')"
          :text="accountInitial(currentUser?.name)"
          color="primary"
          size="xs"
        />
        <UIcon v-else name="i-lucide-circle-user-round" class="size-4" />
      </UButton>
    </UTooltip>

    <template #content>
      <div class="w-full">
        <template v-if="loggedIn">
          <UButton
            color="neutral"
            variant="ghost"
            block
            class="h-auto items-center justify-start gap-3 rounded-none rounded-t-xl px-3 py-3 text-left"
            :ui="{ base: 'rounded-none rounded-t-xl' }"
            @click="openUserSettings"
          >
            <UAvatar :alt="currentUser?.name || t('Common.User')" color="primary" size="md" class="shrink-0" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-semibold text-highlighted">
                {{ currentUser?.name || t("Common.User") }}
              </span>
              <span class="mt-0.5 block truncate text-xs font-normal text-muted" :title="accountSite">
                {{ accountSite }}
              </span>
            </span>
            <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed" />
          </UButton>

          <div v-if="isDesktopRuntime() && hasMultipleSites" class="border-t border-default p-1.5">
            <p class="px-2 pb-1 text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
              {{ t("UserProfile.SiteAccounts") }}
            </p>
            <div class="max-h-40 overflow-y-auto">
              <UButton
                v-for="[accountId, account] in siteAccounts"
                :key="accountId"
                color="neutral"
                variant="ghost"
                size="sm"
                block
                class="justify-start"
                @click="handleSwitchAccount(accountId)"
              >
                <UAvatar :alt="account.name" :text="accountInitial(account.name)" color="neutral" size="2xs" />
                <span class="min-w-0 flex-1 truncate text-left">{{ account.name }}</span>
                <span class="max-w-22 truncate text-xs font-normal text-muted">
                  {{ account.siteName || account.site }}
                </span>
                <UIcon
                  v-if="accountId === currentAccountId"
                  name="i-lucide-check"
                  class="size-3.5 shrink-0 text-primary"
                />
              </UButton>
            </div>
          </div>
        </template>

        <div v-else class="p-1.5">
          <UButton
            :label="t('Common.Login')"
            icon="i-lucide-log-in"
            color="primary"
            variant="soft"
            size="sm"
            block
            class="justify-start"
            @click="openLoginPage"
          />
        </div>

        <div class="space-y-2.5 border-t border-default p-2">
          <div class="space-y-1.5">
            <div class="flex items-center gap-2 px-1 text-[11px] font-medium text-muted">
              <UIcon name="i-lucide-languages" class="size-3.5" />
              <span>{{ t("Common.Language") }}</span>
              <span class="ms-auto text-[11px] font-normal text-muted">{{ currentLanguageLabel }}</span>
            </div>
            <UTabs
              v-model="selectedLanguage"
              :items="languageItems"
              value-key="id"
              :content="false"
              color="neutral"
              variant="pill"
              size="xs"
              :ui="menuTabsUi"
            />
          </div>

          <div class="space-y-1.5">
            <div class="flex items-center gap-2 px-1 text-[11px] font-medium text-muted">
              <UIcon name="i-lucide-palette" class="size-3.5" />
              <span>{{ t("Common.Theme") }}</span>
              <span class="ms-auto text-[11px] font-normal text-muted">{{ currentAppearanceLabel }}</span>
            </div>
            <UTabs
              v-model="selectedAppearanceMode"
              :items="appearanceModes"
              value-key="id"
              :content="false"
              color="neutral"
              variant="pill"
              size="xs"
              :ui="menuTabsUi"
            />
            <UPopover
              v-model:open="themePaletteOpen"
              :content="{ align: 'start', side: 'left', sideOffset: 8 }"
              :ui="{
                content:
                  'w-56 max-h-80 overflow-y-auto rounded-xl bg-[var(--app-surface-overlay)] p-1.5 shadow-[var(--theme-shadow-soft)] ring-1 ring-[var(--app-border)] backdrop-blur-md'
              }"
            >
              <UButton color="neutral" variant="ghost" size="sm" block class="h-8 justify-start gap-2 px-2">
                <span
                  class="size-2.5 shrink-0 rounded-full ring-1 ring-(--app-border)"
                  :style="{ backgroundColor: currentThemeAccent }"
                />
                <span class="min-w-0 flex-1 truncate text-left text-xs">{{ currentThemePresetLabel }}</span>
                <span class="text-[10px] text-muted">{{ t("Common.Appearance") }}</span>
                <UIcon name="i-lucide-chevron-right" class="size-3.5 shrink-0 text-muted" />
              </UButton>

              <template #content>
                <div class="space-y-0.5">
                  <UButton
                    v-for="item in visibleThemePresets"
                    :key="item.id"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    block
                    class="justify-start gap-2"
                    @click="applyPalettePreset(item.id)"
                  >
                    <span
                      class="size-2.5 shrink-0 rounded-full ring-1 ring-(--app-border)"
                      :style="{ backgroundColor: item.accent }"
                    />
                    <span class="min-w-0 flex-1 truncate text-left text-xs">{{ themePresetLabel(item) }}</span>
                    <UIcon
                      v-if="currentThemePresetId === item.id"
                      name="i-lucide-check"
                      class="size-3.5 shrink-0 text-primary"
                    />
                  </UButton>
                </div>
              </template>
            </UPopover>
          </div>
        </div>

        <div class="border-t border-default p-1.5">
          <UButton
            :label="t('Common.Settings')"
            icon="i-lucide-settings"
            color="neutral"
            variant="ghost"
            size="sm"
            block
            class="justify-start"
            @click="openPreferences"
          />
          <UButton
            v-if="isDesktopRuntime()"
            :label="t('Menu.MyTools')"
            icon="i-lucide-wrench"
            color="neutral"
            variant="ghost"
            size="sm"
            block
            class="justify-start"
            @click="openTools"
          />
          <UButton
            v-if="isDesktopRuntime()"
            :label="t('Login.AddAccount')"
            icon="i-lucide-user-round-plus"
            color="neutral"
            variant="ghost"
            size="sm"
            block
            class="justify-start"
            @click="openAddSite"
          />
        </div>

        <div v-if="loggedIn" class="border-t border-default p-1.5">
          <UButton
            :label="t('Login.Logout')"
            icon="i-lucide-log-out"
            color="error"
            variant="ghost"
            size="sm"
            block
            class="justify-start"
            @click="clearAuthInfo"
          />
        </div>
      </div>
    </template>
  </UPopover>

  <Modal
    v-if="isDesktopRuntime()"
    v-model:open="openModal"
    :title="t('Login.Title')"
    :disabled="loginBtn"
    @update:open="openModal = $event"
    @confirm="handleConfirm"
    @clipboard="handleClipboard"
  >
    <div class="space-y-3">
      <UInput
        ref="inputRef"
        v-model="inputSite"
        :color="validationField === 'site' ? 'error' : 'primary'"
        :ui="{ base: 'peer', leadingIcon: 'sidebar-icon', trailingIcon: 'sidebar-icon' }"
        placeholder=" "
        autocapitalize="none"
        autocorrect="off"
        @input="handleInputSanitize"
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
            :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
            @click="handleClearInput"
          />
        </template>
      </UInput>

      <UInput
        ref="siteNameInputRef"
        v-model="inputSiteName"
        :color="validationField === 'name' ? 'error' : 'primary'"
        :ui="{ base: 'peer', leadingIcon: 'sidebar-icon', trailingIcon: 'sidebar-icon' }"
        placeholder=" "
        @input="handleSiteNameInputSanitize"
      >
        <label
          class="pointer-events-none absolute left-0 -top-2.5 text-xs font-medium px-1.5 transition-all peer-focus:-top-2.5 peer-focus:text-xs peer-focus:font-medium peer-placeholder-shown:text-sm peer-placeholder-shown:top-1.5 peer-placeholder-shown:font-normal"
        >
          <span class="inline-flex bg-default px-1">
            {{ t("Login.SiteName") }}
          </span>
        </label>
      </UInput>

      <RecentSites
        :visible="showRecentSites"
        :sites="filteredRecentSites"
        @select="selectRecentSite"
        @remove="removeRecentSite"
        @clear="clearRecentSites"
      />

      <div v-if="hasValidationError" class="text-red-500 text-xs px-1">
        {{ errorMessage }}
      </div>
    </div>
  </Modal>
</template>
