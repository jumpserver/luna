<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { UserData } from "~/types/index";

import { useSettingManager } from "~/composables/useSettingManager";
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

const props = withDefaults(
  defineProps<{
    collapse?: boolean;
    placement?: "sidebar" | "topbar";
  }>(),
  {
    collapse: false,
    placement: "sidebar"
  }
);

const isTopbar = computed(() => props.placement === "topbar");

const recentSiteLimit = 5;

const { addErrorToast } = useErrorToast();
const appConfig = useAppConfig();
const localePath = useLocalePath();
const userInfoStore = useUserInfoStore();

const { t } = useI18n();
const { loggedIn, currentAccountId, userMap, currentUser } = storeToRefs(userInfoStore);
const { applyLoginPayload } = useAuthSession();
const { openSettings } = useSettingsWindow();

const { primaryColorLight, primaryColorDark, recentSites, setRecentSites, hydrationPromise } = useSettingManager();
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
const unlistenAuthUrlRef = ref<UnlistenFn | null>(null);
const unlistenErrorPageRef = ref<UnlistenFn | null>(null);
const unlistenLoginFailedRef = ref<UnlistenFn | null>(null);
const inputRef = ref<ComponentPublicInstance | null>(null);
const siteNameInputRef = ref<ComponentPublicInstance | null>(null);
const profileOpen = ref(false);

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
const accountOrganization = computed(() => currentUser.value?.org?.name || "—");
const accountRoleList = computed(() =>
  (currentUser.value?.system_roles || []).map((role) => role.display_name).filter(Boolean)
);
const accountRoles = computed(() => accountRoleList.value.join(", ") || t("UserProfile.NoRole"));

const siteSwitcherItems = computed<DropdownMenuItem[][]>(() => [
  (Object.entries(userMap.value) as [string, UserData][]).map(([accountId, account]) => ({
    label: account.siteName || account.site,
    description: account.name,
    type: "checkbox" as const,
    checked: accountId === currentAccountId.value,
    onUpdateChecked: (checked: boolean) => {
      if (checked && accountId !== currentAccountId.value) handleSwitchAccount(accountId);
    }
  })),
  [
    {
      label: t("Login.AddAccount"),
      icon: "i-lucide-user-round-plus",
      onClick: openAddSite
    }
  ]
]);

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
      useTauriEventEmit("primary-color-changed", { hex: hexNow, mode: modeNow });
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
  if (!isTauriRuntime()) return true;

  await useTauriCoreInvoke("set_api_session", {
    sessionKey: accountId,
    origin: site,
    bearerToken: "",
    orgId: ""
  });

  const [versionResponse, appVersion] = await Promise.all([
    useTauriCoreInvoke<VersionMessageResponse>("get_version_message", {}).catch(() => {
      return null;
    }),
    useTauriAppGetVersion().catch(() => "")
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
  if (!isTauriRuntime()) {
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

/**
 * @description 过滤输入中的控制字符
 */
// eslint-disable-next-line no-control-regex
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

  if (!isTauriRuntime()) {
    redirectToWebLogin();
    return;
  }

  try {
    clearLoginBtnUnlockTimer();
    loginBtn.value = true;
    const accountId = editingAccountId.value || globalThis.crypto.randomUUID();
    const ok = await checkVersionBeforeOAuth(accountId, normalizedSite);
    if (!ok) return;

    const payload = await useTauriCoreInvoke<any>("auth_login", {
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

  if (!isTauriRuntime()) return;

  unlistenAuthUrlRef.value = await useTauriEventListen("auth_url", (event) => {
    const url = (event?.payload || "").toString();
    if (!url) return;

    clearLoginBtnUnlockTimer();
    loginBtn.value = false;
    openModal.value = false;
    navigateTo({ path: localePath({ path: "/auth/browser" }), query: { auth_url: url } });
    if (url && typeof url === "string") {
      useTauriOpenerOpenUrl(url);
    }
  });

  unlistenErrorPageRef.value = await useTauriEventListen("error-page", (event) => {
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

  unlistenLoginFailedRef.value = await useTauriEventListen("login-failed-detected", (event) => {
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
    v-if="loggedIn"
    v-model:open="profileOpen"
    :content="{ align: isTopbar ? 'end' : 'start', side: isTopbar ? 'bottom' : 'top', sideOffset: 8 }"
    :ui="{
      content: 'w-64 overflow-hidden rounded-xl bg-default p-0 shadow-xl ring-1 ring-[var(--app-border-strong)]'
    }"
  >
    <UTooltip v-if="isTopbar" arrow :text="accountTooltip">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-circle-user-round"
        :aria-label="accountTooltip"
      />
    </UTooltip>

    <button
      v-else
      type="button"
      class="sidebar-row flex items-center py-1 px-1.5 w-full min-w-0 rounded-lg"
      :style="{
        justifyContent: collapse ? 'center' : ''
      }"
    >
      <div class="flex items-center gap-2 min-w-0">
        <UIcon name="i-lucide-circle-user-round" class="sidebar-icon" />
        <UTooltip v-if="!props.collapse" arrow :text="currentUser?.name">
          <span class="block md:max-w-[150px] truncate leading-tight text-sm font-medium cursor-pointer">
            {{ currentUser?.name }}
          </span>
        </UTooltip>
      </div>
    </button>

    <template #content>
      <div class="w-full">
        <button
          type="button"
          class="group flex w-full items-center gap-3 rounded-t-xl border-b border-default px-3 py-3 text-left transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          @click="openUserSettings"
        >
          <UAvatar :alt="currentUser?.name || t('Common.User')" color="primary" size="md" class="shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-highlighted">
              {{ currentUser?.name || t("Common.User") }}
            </p>
            <p class="truncate text-xs text-muted" :title="accountSite">
              {{ accountSite }}
            </p>
          </div>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-4 shrink-0 text-dimmed transition-transform group-hover:translate-x-0.5 group-hover:text-muted"
          />
        </button>

        <div class="space-y-0.5 p-1.5 text-xs">
          <div class="flex min-h-8 items-center gap-3 rounded-md px-2 py-1.5">
            <span class="shrink-0 text-dimmed">{{ t("UserProfile.CurrentOrganization") }}</span>
            <span class="min-w-0 truncate font-medium text-highlighted" :title="accountOrganization">
              {{ accountOrganization }}
            </span>
          </div>
          <div class="flex min-h-8 items-center gap-3 rounded-md px-2 py-1.5">
            <span class="shrink-0 text-dimmed">{{ t("UserProfile.SystemRoles") }}</span>
            <span
              class="min-w-0 truncate font-medium text-highlighted"
              :class="{ 'text-muted': accountRoleList.length === 0 }"
              :title="accountRoles"
            >
              {{ accountRoles }}
            </span>
          </div>
        </div>

        <div v-if="isTauriRuntime()" class="border-t border-default p-1.5">
          <UDropdownMenu
            :items="siteSwitcherItems"
            size="sm"
            :content="{ align: 'end', side: 'left', sideOffset: 6 }"
            :ui="{ content: 'w-64 max-h-72 overflow-y-auto p-1' }"
          >
            <UButton
              :label="t('Login.SwitchSite')"
              icon="i-lucide-arrow-left-right"
              trailing-icon="i-lucide-chevron-right"
              color="neutral"
              variant="ghost"
              size="sm"
              block
              class="justify-start"
              :ui="{ trailingIcon: 'ms-auto' }"
              @click.stop
            />
          </UDropdownMenu>
        </div>

        <div class="border-t border-default p-1.5">
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

  <UTooltip v-else-if="isTopbar" arrow :text="accountTooltip">
    <UButton
      color="neutral"
      variant="ghost"
      size="sm"
      icon="i-lucide-circle-user-round"
      :aria-label="accountTooltip"
      @click="openLoginPage"
    />
  </UTooltip>

  <button
    v-else
    type="button"
    class="sidebar-row flex items-center py-1 px-1.5 w-full min-w-0 rounded-lg"
    :style="{ justifyContent: collapse ? 'center' : '' }"
    @click="openLoginPage"
  >
    <div class="flex items-center gap-2 min-w-0">
      <UIcon name="i-lucide-circle-user-round" class="sidebar-icon" />
      <span v-if="!props.collapse" class="block md:max-w-[150px] truncate leading-tight text-sm font-medium">
        {{ t("Common.Account") }}
      </span>
    </div>
  </button>

  <Modal
    v-if="isTauriRuntime()"
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
