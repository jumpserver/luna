<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { UserData, UserIntiInfo } from '~/types/index';
import { LogicalPosition } from '@tauri-apps/api/dpi';
import { useUserInfoStore } from '~/store/modules/userInfo';
import { useUserSettingStore } from '~/store/modules/userSetting';

const props = defineProps<{ collapse: boolean }>();

const { t, setLocale, locales } = useI18n();
const toast = useToast();

const userInfoStore = useUserInfoStore();
const useSettingStore = useUserSettingStore();
const { manualSetTheme } = useThemeAdapter();

const { language, theme } = storeToRefs(useSettingStore);
const { setLang } = useSettingStore;
const { loggedIn, currentSite, userMap, currentUser } = storeToRefs(userInfoStore);

type LocaleCode = (typeof locales.value)[number]['code'];

const isDarkMode = computed(() => theme.value === 'dark');

const supportLanguages = computed<DropdownMenuItem[]>(() => {
  return locales.value.map((locale: any) => ({
    label: locale.name,
    value: locale.code,
    type: 'checkbox' as const,
    checked: locale.code === language.value,
    onUpdateChecked: (checked: boolean) => {
      if (checked) changeLocale(locale.code);
    },
  }));
});

function changeLocale(payload: LocaleCode) {
  setLang(payload);
  setLocale(payload as any);
}

const inputSite = ref('');
const errorMessage = ref('');
const openModal = ref(false);
const hasValidationError = ref(false);
const loginPage = ref<WebviewWindow | null>(null);
const unlistenErrorPageRef = ref<UnlistenFn | null>(null);
const unlistenLoginSuccessRef = ref<UnlistenFn | null>(null);
const unlistenLoginFailedRef = ref<UnlistenFn | null>(null);
const inputRef = ref<ComponentPublicInstance | null>(null);

const normalizedInputSite = computed(() => normalizeSite(inputSite.value));

const REG_EXP =
  /^(?:https?:\/\/(?:localhost|\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]+\]|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})(?::\d{1,5})?(?:[\/?#]\S*)?|\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]+\])$/;

function normalizeSite(value: string): string {
  const s = (value || '').trim();
  if (!s) return '';
  return s.replace(/\/+$/, '');
}

function openLoginPage() {
  openModal.value = true;
  hasValidationError.value = false;
  errorMessage.value = '';
  nextTick(() => {
    inputRef.value?.$el.querySelector('input')?.focus();
  });
}

function clearValidationError() {
  if (hasValidationError.value) {
    hasValidationError.value = false;
    errorMessage.value = '';
  }
}

const handleClipboard = (value: string) => {
  inputSite.value = normalizeSite(value);
};

const switchAccountChildren = computed<DropdownMenuItem[][]>(() => {
  const items: DropdownMenuItem[] = (
    Object.values(userMap.value || {}) as UserData[]
  ).map((u: UserData) => {
    let host = u.site;
    try {
      host = new URL(u.site).host;
    } catch {}
    const label = `${host}`;
    const isCurrent = u.site === currentSite.value;
    return {
      label,
      icon: isCurrent ? 'i-lucide-check' : 'i-lucide-user',
      onClick: () => handleSwitchAccount(u.site),
    } as DropdownMenuItem;
  });
  return [items];
});

const themeToggleMenuItem = computed<DropdownMenuItem>(() => ({
  label: isDarkMode.value ? t('ToolTips.LightMode') : t('ToolTips.DarkMode'),
  icon: isDarkMode.value ? 'i-lucide-sun' : 'i-lucide-moon',
  onClick: () => manualSetTheme(isDarkMode.value ? 'light' : 'dark'),
}));

const profileMenuItems = computed<DropdownMenuItem[][]>(() => [
  [
    themeToggleMenuItem.value,
    { label: t('Common.Language'), icon: 'i-lucide-globe', children: [supportLanguages.value] },
  ],
  [
    { label: t('Login.AddAccount'), icon: 'i-lucide-user-round-plus', onClick: openLoginPage },
    { label: t('Login.SwitchSite'), icon: 'i-lucide-arrow-down-up', children: switchAccountChildren.value },
  ],
  [
    { label: t('Login.Logout'), icon: 'solar:login-outline', color: 'error', onClick: clearAuthInfo },
  ],
]);

function handleSwitchAccount(site: string) {
  if (site === currentSite.value) return;
  userInfoStore.setCurrentSite(site);
  nextTick(() => {
    useEventBus().emit('refresh', undefined);
  });
}

function clearAuthInfo() {
  userInfoStore.deleteUserData(currentSite.value);
}

const handleConfirm = () => {
  hasValidationError.value = false;
  errorMessage.value = '';
  const normalizedSite = normalizedInputSite.value;
  if (!normalizedSite) {
    hasValidationError.value = true;
    errorMessage.value = t('Login.EmptyUrlError');
    nextTick(() => {
      inputRef.value?.$el?.querySelector('input')?.focus();
    });
    return;
  }
  if (
    Object.values(userMap.value || {}).some(
      (user) => normalizeSite(user.site) === normalizedSite
    )
  ) {
    hasValidationError.value = true;
    errorMessage.value = t('Login.AlreadyLoggedInError');
    return;
  }
  if (!REG_EXP.test(normalizedSite)) {
    hasValidationError.value = true;
    errorMessage.value = t('Login.InvalidUrlError');
    nextTick(() => {
      inputRef.value?.$el?.querySelector('input')?.focus();
    });
    return;
  }

  loginPage.value = new useTauriWebviewWindowWebviewWindow('loginPage', {
    title: `${t('Common.LoginSite')} - ${normalizedSite}`,
    url: normalizedSite,
    width: 600,
    height: 800,
    minWidth: 600,
    minHeight: 800,
    hiddenTitle: true,
    titleBarStyle: 'overlay',
    trafficLightPosition: new LogicalPosition(10, 22),
  });

  nextTick(async () => {
    await useTauriCoreInvoke('url_watcher', {
      name: 'loginPage',
      origin: normalizedSite,
    });
    openModal.value = false;
  });
};

onMounted(async () => {
  unlistenErrorPageRef.value = await useTauriEventListen('error-page', (event) => {
    const { status, reason } = event.payload as { status: string; reason: string };
    if (status === 'failure' && reason === 'cookies-not-found') {
      toast.add({
        title: t('Login.LoginFailed'),
        description: t('Login.LoginFailedErrorPage'),
        color: 'error',
        icon: 'line-md:close-circle',
      });
      nextTick(() => userInfoStore.setUserLoggedIn(false));
    }
  });

  unlistenLoginSuccessRef.value = await useTauriEventListen('login-success-detected', (event) => {
    const { status } = event.payload as UserIntiInfo;
    if (status === 'success') {
      toast.add({
        title: t('Login.LoginSuccess'),
        description: t('Login.LoginSuccessDescription'),
        color: 'success',
        icon: 'line-md:check-all',
      });
    }
  });
});

onBeforeUnmount(() => {
  if (unlistenErrorPageRef.value) unlistenErrorPageRef.value();
  if (unlistenLoginSuccessRef.value) unlistenLoginSuccessRef.value();
  if (unlistenLoginFailedRef.value) unlistenLoginFailedRef.value();
});
</script>

<template>
  <UDropdownMenu
    v-if="loggedIn"
    :items="profileMenuItems"
    side="top"
    align="start"
    :ui="{ content: 'w-56' }"
  >
    <div class="w-full rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
      <div v-if="!props.collapse" class="flex items-center gap-3 px-2 py-2 text-left">
        <UAvatar size="sm" src="/user_avatar.png" />
        <div class="flex-1 leading-tight">
          <div class="text-sm font-medium truncate">
            {{ currentUser?.value?.name ?? currentUser?.name }}
          </div>
        </div>
      </div>
      <div v-else class="flex items-center justify-center px-2 py-2">
        <UAvatar size="sm" src="/user_avatar.png" />
      </div>
    </div>
  </UDropdownMenu>

  <UButton
    v-else
    size="sm"
    variant="subtle"
    icon="line-md:log-in"
    class="w-full"
    @click="openLoginPage"
  >
    {{ t('Common.Login') }}
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
          <span class="inline-flex bg-default px-1">{{ t('Login.Description') }}</span>
        </label>

        <template v-if="normalizedInputSite?.length" #trailing>
          <UButton
            color="neutral"
            variant="link"
            size="sm"
            icon="i-lucide-circle-x"
            aria-label="Clear input"
            @click="inputSite = ''; clearValidationError();"
          />
        </template>
      </UInput>

      <div v-if="hasValidationError" class="text-red-500 text-xs px-1">
        {{ errorMessage }}
      </div>
    </div>
  </Modal>
</template>


