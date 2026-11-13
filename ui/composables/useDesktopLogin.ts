import type { LoginSitePrefill } from "~/composables/useEventBus";
import type { DesktopUnlistenFn } from "~/shared/desktop/bridge";
import type { UserData } from "~/types";
import { createSharedComposable } from "@vueuse/core";
import { useClientCompatibility } from "~/composables/useClientCompatibility";
import { closeCurrentSiteWorkspace, confirmLeaveCurrentSiteSessions } from "~/composables/useSiteAccountSwitch";
import { desktopInvoke, desktopListen, openDesktopAuthUrl } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";

// One controller is shared by the inline login form and the add-site dialog.
export const useDesktopLogin = createSharedComposable(() => {
  const recentSiteLimit = 10;
  const loginFailureToastId = "login-failed";
  const { addErrorToast } = useErrorToast();
  const appConfig = useAppConfig();
  const { t } = useI18n();
  const userInfoStore = useUserInfoStore();
  const { loggedIn, currentAccountId, userMap } = storeToRefs(userInfoStore);
  const { applyLoginPayload } = useAuthSession();
  const { recentSites, hiddenRecentSites, setRecentSites, hydrationPromise } = useSettingManager();
  const inlineVisible = ref(false);
  const inputSite = ref("");
  const inputSiteName = ref("");
  const siteNameEdited = ref(false);
  const editingAccountId = ref("");
  const errorMessage = ref("");
  const loginBtn = ref(false);
  const browserAuthUrl = ref("");
  const openModal = ref(false);
  const addingSite = ref(false);
  const hasValidationError = ref(false);
  const validationField = ref<"site" | "name" | null>(null);
  const unlistenAuthUrlRef = ref<DesktopUnlistenFn | null>(null);
  const unlistenErrorPageRef = ref<DesktopUnlistenFn | null>(null);
  const unlistenLoginFailedRef = ref<DesktopUnlistenFn | null>(null);
  const focusField = ref<"site" | "name">("site");
  const focusRequest = ref(0);
  const focusInput = (field: "site" | "name" = "site") => {
    focusField.value = field;
    focusRequest.value += 1;
  };
  let desktopListenersActive = true;
  let loginRequestGeneration = 0;
  let loginInFlight = false;

  const isCurrentLogin = (generation: number) =>
    desktopListenersActive && loginInFlight && generation === loginRequestGeneration;

  const retainDesktopListener = (
    target: typeof unlistenAuthUrlRef,
    unlisten: DesktopUnlistenFn,
    generation: number
  ) => {
    if (!isCurrentLogin(generation)) {
      unlisten();
      return false;
    }
    target.value = unlisten;
    return true;
  };

  const normalizedInputSite = computed(() => normalizeSite(inputSite.value));
  const normalizedInputSiteName = computed(() => inputSiteName.value.trim());

  const normalizedRecentSites = computed(() => {
    const raw = Array.isArray(recentSites.value) ? recentSites.value : [];
    const normalized: string[] = [];
    const seen = new Set<string>();

    for (const site of raw) {
      const value = normalizeHistorySite(site);
      if (!value || seen.has(value)) continue;
      seen.add(value);
      normalized.push(value);
      if (normalized.length >= recentSiteLimit) break;
    }

    return normalized;
  });

  const savedSiteSuggestions = computed(() =>
    [...new Set(Object.values(userMap.value).map((account) => normalizeHistorySite(account.site)))].filter(Boolean)
  );
  const hiddenSites = computed(
    () => new Set((Array.isArray(hiddenRecentSites.value) ? hiddenRecentSites.value : []).map(normalizeHistorySite))
  );
  const siteSuggestions = computed(() =>
    [...new Set([...savedSiteSuggestions.value, ...normalizedRecentSites.value])].filter(
      (site) => !hiddenSites.value.has(site)
    )
  );
  const removeRecentSite = async (site: string) => {
    await ensureRecentSitesReady();
    const normalized = normalizeHistorySite(site);
    // Removing a suggestion must not delete accounts or re-add their address on the next render.
    setRecentSites(
      normalizedRecentSites.value.filter((value) => value !== normalized),
      savedSiteSuggestions.value.filter((value) => value === normalized || hiddenSites.value.has(value))
    );
  };
  const clearRecentSites = async () => {
    await ensureRecentSitesReady();
    setRecentSites([], savedSiteSuggestions.value);
  };

  const stopLoginListeners = () => {
    for (const listener of [unlistenAuthUrlRef, unlistenErrorPageRef, unlistenLoginFailedRef]) {
      listener.value?.();
      listener.value = null;
    }
  };

  const cancelLogin = () => {
    loginRequestGeneration += 1;
    loginInFlight = false;
    loginBtn.value = false;
    browserAuthUrl.value = "";
    stopLoginListeners();
    void desktopInvoke("auth_cancel").catch((error) => console.debug("auth_cancel failed", error));
  };

  const backToLogin = () => {
    cancelLogin();
    clearValidationError();
    focusInput();
  };

  const closeLoginDialog = () => {
    cancelLogin();
    openModal.value = false;
  };

  watch(normalizedInputSite, () => {
    if (loginInFlight || browserAuthUrl.value) cancelLogin();
    else loginRequestGeneration += 1;
  });

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

  function normalizeHistorySite(value: unknown): string {
    if (typeof value !== "string") return "";
    const normalized = normalizeSite(value);
    if (!/^https?:\/\//i.test(normalized) || !appConfig.componentsConfig.urlRegExp.test(normalized)) return "";
    if (Array.from(normalized).some((character) => character.charCodeAt(0) <= 32 || character === "\\")) return "";
    try {
      const url = new URL(normalized);
      // A login site has no credentials or query/fragment authentication data.
      if (!url.hostname || url.username || url.password || /[?#]/.test(url.href)) return "";
      return normalizeSite(url.href);
    } catch {
      return "";
    }
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

  async function ensureRecentSitesReady() {
    if (hydrationPromise.value) {
      await hydrationPromise.value;
    }
  }

  const saveRecentSite = async (site: string) => {
    try {
      const normalized = normalizeHistorySite(site);
      if (!normalized) return;

      await ensureRecentSitesReady();
      const next = [normalized, ...normalizedRecentSites.value.filter((item) => item !== normalized)].slice(
        0,
        recentSiteLimit
      );
      setRecentSites(
        next,
        [...hiddenSites.value].filter((value) => value && value !== normalized)
      );
    } catch (err) {
      console.error("save recent sites failed", err);
    }
  };

  const handleClearInput = () => {
    inputSite.value = "";
    if (!siteNameEdited.value) inputSiteName.value = "";
    clearValidationError();
  };

  /**
   * @description 打开登录页面
   */
  function openLoginPage(accountId?: string, prefill?: LoginSitePrefill) {
    if (!isDesktopRuntime()) {
      redirectToWebLogin();
      return;
    }

    if (loginInFlight || browserAuthUrl.value) cancelLogin();
    addingSite.value = accountId === "" || loggedIn.value;
    const reauthAccountId =
      accountId ?? (!loggedIn.value ? currentAccountId.value || Object.keys(userMap.value)[0] || "" : "");
    const reauthUser = userMap.value[reauthAccountId];
    if (reauthUser && !loggedIn.value) userInfoStore.selectAccountForLogin(reauthAccountId);
    editingAccountId.value = reauthUser ? reauthAccountId : "";
    inputSite.value = reauthUser?.site || prefill?.site || "";
    inputSiteName.value = reauthUser?.siteName || reauthUser?.site || prefill?.siteName || prefill?.site || "";
    siteNameEdited.value = Boolean(reauthUser || prefill);
    openModal.value = !inlineVisible.value;
    hasValidationError.value = false;
    validationField.value = null;
    errorMessage.value = "";
    focusInput();
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
   * @description 过滤输入中的控制字符
   */
  // oxlint-disable-next-line no-control-regex
  const sanitizeInput = (value: string) => value.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

  const updateSite = (value: string) => {
    const sanitized = sanitizeInput(value || "");
    if (
      editingAccountId.value &&
      normalizeHistorySite(userMap.value[editingAccountId.value]?.site) !== normalizeHistorySite(sanitized)
    ) {
      editingAccountId.value = "";
      siteNameEdited.value = false;
    }
    inputSite.value = sanitized;
    if (!siteNameEdited.value) inputSiteName.value = getDefaultSiteName(sanitized);
    clearValidationError();
  };

  const selectSiteSuggestion = (site: string) => {
    const normalized = normalizeHistorySite(site);
    if (!normalized) return;
    const accounts = Object.entries(userMap.value).filter(
      ([, account]) => normalizeHistorySite(account.site) === normalized
    );
    const saved = accounts.find(([id]) => id === currentAccountId.value) || accounts[0];
    editingAccountId.value = addingSite.value ? "" : saved?.[0] || "";
    siteNameEdited.value = Boolean(saved);
    updateSite(normalized);
    if (saved) inputSiteName.value = saved[1].siteName || getDefaultSiteName(normalized);
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
   * @description 处理确认输入
   */
  const handleConfirm = async (confirmation?: { id?: number; accountId: string; generation: number }) => {
    if (loginInFlight || loginBtn.value || (confirmation && confirmation.generation !== loginRequestGeneration)) return;

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

      focusInput();

      return;
    }

    if (isDesktopRuntime()) void saveRecentSite(normalizedSite);

    if (!siteName) {
      hasValidationError.value = true;
      validationField.value = "name";
      errorMessage.value = t("Login.EmptySiteNameError");
      focusInput("name");
      return;
    }

    const duplicateName = (Object.entries(userMap.value) as [string, UserData][]).some(
      ([accountId, user]) =>
        accountId !== editingAccountId.value &&
        normalizeHistorySite(user.site) !== normalizeHistorySite(normalizedSite) &&
        user.siteName.trim().toLowerCase() === siteName.toLowerCase()
    );

    if (duplicateName) {
      hasValidationError.value = true;
      validationField.value = "name";
      errorMessage.value = t("Login.DuplicateSiteNameError");
      focusInput("name");
      return;
    }

    if (!urlRegExp.test(normalizedSite)) {
      hasValidationError.value = true;
      validationField.value = "site";
      errorMessage.value = t("Login.InvalidUrlError");

      focusInput();

      return;
    }

    if (!isDesktopRuntime()) {
      redirectToWebLogin();
      return;
    }

    const isReauth = Boolean(editingAccountId.value && editingAccountId.value === currentAccountId.value);
    const leavingCurrentSite = loggedIn.value && !isReauth;
    const generation = confirmation?.generation ?? ++loginRequestGeneration;
    if (leavingCurrentSite && !confirmation && !(await confirmLeaveCurrentSiteSessions("login", { close: false })))
      return;
    if (generation !== loginRequestGeneration) return;

    try {
      loginBtn.value = true;
      loginInFlight = true;
      browserAuthUrl.value = "";
      const accountId = confirmation?.accountId || editingAccountId.value || globalThis.crypto.randomUUID();
      useClientCompatibility().dismiss();
      if (!(await listenForLogin(generation))) return;
      const payload = await desktopInvoke<any>("auth_login", {
        site: normalizedSite,
        sessionId: accountId,
        compatibilityConfirmationId: confirmation?.id
      });
      if (generation !== loginRequestGeneration) return;
      if (payload?.status === "confirmation-required" && payload.compatibility) {
        const { status, reason } = payload.compatibility;
        if (status === "unknown" && (reason === "network" || reason === "timeout" || reason === "redirect")) {
          hasValidationError.value = true;
          validationField.value = "site";
          errorMessage.value = t(reason === "redirect" ? "ClientCompatibility.redirect" : "Login.InvalidSiteError");
          return;
        }
        openModal.value = false;
        loginBtn.value = false;
        useClientCompatibility().show(payload.compatibility, async () => {
          if (generation !== loginRequestGeneration) return;
          openModal.value = !inlineVisible.value;
          await handleConfirm({
            id: reason === "tls" ? undefined : payload.compatibility_confirmation_id,
            accountId,
            generation
          });
        });
        return;
      }
      if (!payload || payload.status !== "success") {
        if (payload && payload.status !== "stale") throw new Error(t("Login.LoginFailed"));
        return;
      }
      loginBtn.value = true;
      stopLoginListeners();
      if (leavingCurrentSite) await closeCurrentSiteWorkspace();
      if (generation !== loginRequestGeneration) return;
      if (!(await applyLoginPayload(payload, { showToast: true, navigateHome: true, accountId, siteName }))) {
        throw new Error(t("Login.LoginFailed"));
      }
      openModal.value = false;
    } catch (e: any) {
      if (generation !== loginRequestGeneration) return;
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
          id: loginFailureToastId,
          title: t("Login.LoginFailed"),
          description: raw || t("Login.LoginFailed"),
          icon: "line-md:close-circle",
          progress: true,
          duration: 4000
        });
      }

      focusInput();
    } finally {
      if (generation === loginRequestGeneration) {
        loginInFlight = false;
        loginBtn.value = false;
        browserAuthUrl.value = "";
        stopLoginListeners();
      }
    }
  };

  async function listenForLogin(generation: number) {
    const unlistenAuthUrl = await desktopListen("auth_url", (event) => {
      if (!isCurrentLogin(generation)) return;
      const url = (event?.payload || "").toString();
      if (!url) return;

      loginBtn.value = false;
      browserAuthUrl.value = url;
      void openDesktopAuthUrl(url);
    });
    if (!retainDesktopListener(unlistenAuthUrlRef, unlistenAuthUrl, generation)) return false;

    const unlistenErrorPage = await desktopListen("error-page", (event) => {
      if (!isCurrentLogin(generation)) return;
      const payload = (event?.payload || {}) as any;
      const status = (payload?.status || "").toString();
      const reason = (payload?.reason || "").toString();
      const message = (payload?.message || "").toString();

      if (status !== "failure") return;

      let description = message || t("Login.LoginFailedErrorPage");

      if (reason === "invalid-site") {
        description = t("Login.InvalidSiteError");
      }

      backToLogin();
      addErrorToast({
        id: loginFailureToastId,
        title: reason === "invalid-site" ? description : t("Login.LoginFailed"),
        description: reason === "invalid-site" ? undefined : description,
        icon: "line-md:close-circle",
        progress: true,
        duration: 4000
      });
      if (reason === "invalid-site") {
        hasValidationError.value = true;
        validationField.value = "site";
        errorMessage.value = t("Login.InvalidSiteError");

        focusInput();
      }
    });
    if (!retainDesktopListener(unlistenErrorPageRef, unlistenErrorPage, generation)) return false;

    const unlistenLoginFailed = await desktopListen("login-failed-detected", (event) => {
      if (!isCurrentLogin(generation)) return;
      const payload = (event?.payload || {}) as any;
      const reason = (payload?.reason || "").toString();
      const message = (payload?.message || "").toString();

      let description = message || t("Login.LoginFailedDescription");

      if (reason === "invalid-site") {
        description = t("Login.InvalidSiteError");
      }

      backToLogin();
      addErrorToast({
        id: loginFailureToastId,
        title: reason === "invalid-site" ? description : t("Login.LoginFailed"),
        description: reason === "invalid-site" ? undefined : description,
        icon: "line-md:close-circle",
        progress: true,
        duration: 4000
      });

      if (reason === "invalid-site") {
        hasValidationError.value = true;
        validationField.value = "site";
        errorMessage.value = t("Login.InvalidSiteError");

        focusInput();
      }
    });
    return retainDesktopListener(unlistenLoginFailedRef, unlistenLoginFailed, generation);
  }

  onScopeDispose(() => {
    desktopListenersActive = false;
    if (loginInFlight) cancelLogin();
    else stopLoginListeners();
  });

  return {
    inputSite,
    inputSiteName,
    focusField,
    focusRequest,
    normalizedInputSite,
    openModal,
    addingSite,
    inlineVisible,
    loginBtn,
    browserAuthUrl,
    editingAccountId,
    validationField,
    errorMessage,
    hasValidationError,
    siteSuggestions,
    removeRecentSite,
    clearRecentSites,
    selectSiteSuggestion,
    openLoginPage,
    backToLogin,
    closeLoginDialog,
    updateSite,
    handleClearInput,
    handleSiteNameInputSanitize,
    handleConfirm
  };
});
