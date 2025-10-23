<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { PermissionOrgs, PermOrgItem, UserData, UserIntiInfo } from "~/types/index";

import { LogicalPosition } from "@tauri-apps/api/dpi";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { useUserSettingStore } from "~/store/modules/userSetting";

type LocaleCode = (typeof locales.value)[number]["code"];

const props = defineProps<{ collapse: boolean }>();

const REG_EXP =
  /^(?:https?:\/\/(?:localhost|\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]+\]|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})(?::\d{1,5})?(?:[/?#]\S*)?|\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]+\])$/;

const toast = useToast();
const userInfoStore = useUserInfoStore();
const useSettingStore = useUserSettingStore();

const { t, setLocale, locales } = useI18n();
const { manualSetTheme } = useThemeAdapter();

const { setLang } = useSettingStore;
const { language, theme } = storeToRefs(useSettingStore);
// prettier-ignore
const { loggedIn, currentSite, userMap, currentUser } = storeToRefs(userInfoStore);

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

const isDarkMode = computed(() => theme.value === "dark");

const supportLanguages = computed<DropdownMenuItem[]>(() => {
  return locales.value.map((locale: any) => ({
    label: locale.name,
    value: locale.code,
    type: "checkbox" as const,
    checked: locale.code === language.value,
    onUpdateChecked: (checked: boolean) => {
      if (checked) changeLocale(locale.code);
    }
  }));
});

const themeToggleMenuItem = computed<DropdownMenuItem>(() => ({
  label: isDarkMode.value ? t("ToolTips.LightMode") : t("ToolTips.DarkMode"),
  icon: isDarkMode.value ? "i-lucide-sun" : "i-lucide-moon",
  onClick: () => manualSetTheme(isDarkMode.value ? "light" : "dark")
}));

const profileMenuItems = computed<DropdownMenuItem[][]>(() => [
  [
    themeToggleMenuItem.value,
    {
      label: t("Common.Language"),
      icon: "i-lucide-globe",
      children: [supportLanguages.value]
    }
  ],
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
    }
  ],
  [
    {
      label: t("Login.Logout"),
      icon: "solar:login-outline",
      class: "logout-menu-item",
      ui: {
        itemLabel: "text-error",
        itemLeadingIcon:
          "text-error group-data-highlighted:!text-error group-data-[state=open]:!text-error",
        itemTrailingIcon: "text-error",
        item: "data-highlighted:before:bg-error/15 data-[state=open]:before:bg-error/15 data-highlighted:before:bg-red-500/15 data-[state=open]:before:bg-red-500/15"
      },
      onClick: clearAuthInfo
    }
  ]
]);

/**
 * @description 切换语言
 * @param payload 语言代码
 */
function changeLocale(payload: LocaleCode) {
  setLang(payload);
  setLocale(payload);
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

  const uniqueOrgs = orgs.filter(
    (org, index, self) => index === self.findIndex((t: PermOrgItem) => t.id === org.id)
  );

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
  const items: DropdownMenuItem[] = (Object.values(userMap.value) as UserData[]).map(
    (u: UserData) => {
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
        icon: isCurrent ? "i-lucide-check" : "i-lucide-user",
        onClick: () => handleSwitchAccount(u.site)
      } as DropdownMenuItem;
    }
  );

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
const handleConfirm = () => {
  hasValidationError.value = false;
  errorMessage.value = "";

  const normalizedSite = normalizedInputSite.value;

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

  if (!REG_EXP.test(normalizedSite)) {
    hasValidationError.value = true;
    errorMessage.value = t("Login.InvalidUrlError");

    nextTick(() => {
      inputRef.value?.$el?.querySelector("input")?.focus();
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
    hiddenTitle: true,
    titleBarStyle: "overlay",
    trafficLightPosition: new LogicalPosition(10, 22)
  });

  nextTick(async () => {
    await useTauriCoreInvoke("url_watcher", {
      name: "loginPage",
      origin: normalizedSite
    });
    openModal.value = false;
  });
};

onMounted(async () => {
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

  unlistenLoginSuccessRef.value = await useTauriEventListen("login-success-detected", (event) => {
    const { status, profile, permission_orgs, current_org, cookies } =
      event.payload as UserIntiInfo;

    const profileData = JSON.parse((profile as any).data);
    const permissionOrgData = JSON.parse((permission_orgs as any).data) as PermissionOrgs;
    const currentOrgData = JSON.parse((current_org as any).data);
    const normalizedSite = normalizedInputSite.value;

    if (status === "success" && profileData) {
      toast.add({
        title: t("Login.LoginSuccess"),
        description: t("Login.LoginSuccessDescription"),
        color: "success",
        icon: "line-md:check-all"
      });

      const availableOrgs = initSelectOrganization(permissionOrgData);

      userInfoStore.setUserData(normalizedSite, {
        name: profileData.name,
        headerJson: cookies,
        site: normalizedSite,
        org: currentOrgData,
        system_roles: profileData.system_roles,
        availableOrgs,
        connectionInfo: {
          protocol: "",
          username: ""
        }
      });

      userInfoStore.setOrganizations(availableOrgs);
      userInfoStore.setCurrentOrg(currentOrgData);
      userInfoStore.setUserLoggedIn(true);

      nextTick(() => {
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
    <div class="w-full rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors mb-1">
      <div
        class="flex items-center py-1"
        :style="{
          justifyContent: collapse ? 'center' : '',
          paddingLeft: collapse ? '' : '10px'
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
            <span v-if="!props.collapse" class="leading-tight text-sm font-medium truncate">
              {{ currentUser?.name }}
            </span>
          </template>
        </UUser>
      </div>
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

<style scoped>
.logout-menu-item[data-highlighted]::before,
.logout-menu-item[data-state="open"]::before {
  background-color: rgb(239 68 68 / 0.15) !important;
}
</style>
