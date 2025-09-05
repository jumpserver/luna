<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { ActionItem, Cookies } from '~/types/index';

import { getProfile } from '~/api/modules/user';
import { useUserInfoStore } from '~/store/modules/userInfo';
import { useUserSettingStore } from '~/store/modules/userSetting';

type LocaleCode = (typeof locales.value)[number]['code'];

const REG_EXP =
  /^(?:https?:\/\/(?:localhost|\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]+\]|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})(?::\d{1,5})?(?:[/?#]\S*)?|\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]+\])$/;

// TODO 系统主题默认第一次使用时将适配

const { t, setLocale, locales } = useI18n();
const toast = useToast();
const colorMode = useColorMode();
const appConfig = useAppConfig();
const userInfoStore = useUserInfoStore();
const userSettingStore = useUserSettingStore();

const darkColor = appConfig.componentsConfig.header.darkColor;
const lightColor = appConfig.componentsConfig.header.lightColor;

const { setUserLoggedIn, setUserData } = userInfoStore;
const { setTheme, setLang, setCollapse } = userSettingStore;
const { theme, language, collapse } = storeToRefs(userSettingStore);

const { loggedIn, currentUser } = storeToRefs(userInfoStore);

const openModal = ref(false);
const inputSite = ref('');
const loginPage = ref<WebviewWindow | null>(null);
const subscribeEvent = ref<UnlistenFn | null>(null);
const hasValidationError = ref(false);
const errorMessage = ref('');
const inputRef = ref<any>(null);

const isDarkMode = computed(() => theme.value === 'dark');

const supportLanguages = computed(() => {
  return locales.value.map((locale: any) => ({
    label: locale.name,
    value: locale.code,
    type: 'checkbox' as const,
    checked: locale.code === language.value,
    onUpdateChecked: (checked: boolean) => {
      if (checked) {
        changeLocale(locale.code);

        nextTick(() => {
          setLang(locale.code);
        });
      }
    },
  })) as DropdownMenuItem[];
});

const computedSwitchMode = computed<ActionItem>(() => {
  return {
    key: 'switchMode',
    iconName: isDarkMode.value
      ? 'line-md:moon-alt-to-sunny-outline-loop-transition'
      : 'line-md:moon-alt-loop',
    tooltipLabel: isDarkMode.value
      ? t('ToolTips.LightMode')
      : t('ToolTips.DarkMode'),
    onClick: toggleDarkMode,
    type: 'action',
  };
});

/**
 * @description 切换颜色 mode
 */
function toggleDarkMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark';

  nextTick(() => {
    setTheme(colorMode.value === 'dark' ? 'dark' : 'light');
  });
}

/**
 * @description 切换语言
 * @param payload 语言代码
 */
function changeLocale(payload: LocaleCode) {
  setLocale(payload);

  nextTick(() => {
    setLang(payload);
  });
}

/**
 * @description 切换折叠状态
 */
const handleCollapse = () => {
  setCollapse(!collapse.value);
};

/**
 * @description 窗口拖拽
 * @param event 鼠标事件
 */
const handleWindowDrag = async (event: MouseEvent) => {
  if (event.button !== 0) return;

  try {
    const windows = await useTauriWindowGetAllWindows();
    windows.forEach((window) => {
      window.startDragging();
    });
  } catch (error) {
    console.error(error);
  }
};

/**
 * @description 清除认证信息
 */
const clearAuthInfo = () => {
  userInfoStore.setUserLoggedIn(false);
};

/**
 * @description 打开登录窗口
 */
const openLoginPage = () => {
  openModal.value = true;
  hasValidationError.value = false;
  errorMessage.value = '';

  nextTick(() => {
    inputRef.value?.$el?.querySelector('input')?.focus();
  });
};

const handleConfirm = () => {
  hasValidationError.value = false;
  errorMessage.value = '';

  if (!inputSite.value) {
    hasValidationError.value = true;
    errorMessage.value = t('Login.EmptyUrlError');

    nextTick(() => {
      inputRef.value?.$el?.querySelector('input')?.focus();
    });
    return;
  }

  if (!REG_EXP.test(inputSite.value)) {
    hasValidationError.value = true;
    errorMessage.value = t('Login.InvalidUrlError');

    nextTick(() => {
      inputRef.value?.$el?.querySelector('input')?.focus();
    });
    return;
  }

  loginPage.value = new useTauriWebviewWindowWebviewWindow('loginPage', {
    title: '',
    url: inputSite.value,
    width: 600,
    height: 800,
    minWidth: 600,
    minHeight: 800,
  });

  nextTick(async () => {
    await useTauriCoreInvoke('url_watcher', {
      name: 'loginPage',
      origin: inputSite.value,
    });

    openModal.value = false;
  });
};

/**
 * @description 清除验证错误
 */
const clearValidationError = () => {
  if (hasValidationError.value) {
    hasValidationError.value = false;
    errorMessage.value = '';
  }
};

const handleClipboard = (value: string) => {
  inputSite.value = value;
};

const items = ref(['Backlog', 'Todo', 'In Progress', 'Done']);
const value = ref('Backlog');

const dropItems = ref<DropdownMenuItem[][]>([
  [
    {
      label: 'Profile',
      icon: 'i-lucide-user',
    },
    {
      label: 'Billing',
      icon: 'i-lucide-credit-card',
    },
    {
      label: 'Settings',
      icon: 'i-lucide-cog',
      kbds: [','],
    },
    {
      label: 'Keyboard shortcuts',
      icon: 'i-lucide-monitor',
    },
  ],
  [
    {
      label: 'Team',
      icon: 'i-lucide-users',
    },
    {
      label: 'Invite users',
      icon: 'i-lucide-user-plus',
      children: [
        [
          {
            label: 'Email',
            icon: 'i-lucide-mail',
          },
          {
            label: 'Message',
            icon: 'i-lucide-message-square',
          },
        ],
        [
          {
            label: 'More',
            icon: 'i-lucide-circle-plus',
          },
        ],
      ],
    },
    {
      label: 'New team',
      icon: 'i-lucide-plus',
      kbds: ['meta', 'n'],
    },
  ],
  [
    {
      label: 'GitHub',
      icon: 'i-simple-icons-github',
      to: 'https://github.com/nuxt/ui',
      target: '_blank',
    },
    {
      label: 'Support',
      icon: 'i-lucide-life-buoy',
      to: '/components/dropdown-menu',
    },
    {
      label: 'API',
      icon: 'i-lucide-cloud',
      disabled: true,
    },
  ],
  [
    {
      label: 'Logout',
      icon: 'i-lucide-log-out',
      kbds: ['shift', 'meta', 'q'],
      onClick: clearAuthInfo,
    },
  ],
]);

onMounted(async () => {
  setLocale(language.value as LocaleCode);

  subscribeEvent.value = await useTauriEventListen(
    'login-success-detected',
    (event) => {
      const { status, data } = event.payload as {
        status: string;
        data: string;
      };

      const profileData = JSON.parse(data);

      console.log(status, JSON.parse(data));

      if (status === 'success' && profileData) {
        toast.add({
          title: t('Login.LoginSuccess'),
          description: t('Login.LoginSuccessDescription'),
          color: 'success',
          icon: 'line-md:check-all',
        });

        setUserData(inputSite.value, {
          avatar_url: profileData.avatar_url,
          name: profileData.name,
        });

        setUserLoggedIn(true);
      }
    }
  );
});

onBeforeUnmount(() => {
  if (subscribeEvent.value) {
    subscribeEvent.value();
  }
});
</script>

<template>
  <div
    :style="{
      backgroundColor: colorMode.value === 'dark' ? darkColor : lightColor,
    }"
    class="flex items-center justify-between px-4 h-12 cursor-pointer"
    @mousedown="handleWindowDrag"
  >
    <section class="flex items-center h-full">
      <UIcon
        v-show="collapse"
        name="i-lucide-panel-left-open"
        class="size-5 cursor-pointer hover:text-[#55B787]"
        @click="handleCollapse"
      />

      <USelect
        v-model="value"
        :items="items"
        :style="{
          marginLeft: collapse ? '0.625rem' : '',
        }"
        :ui="{
          trailingIcon:
            'group-data-[state=open]:rotate-180 transition-transform duration-200',
        }"
        size="md"
        class="w-56"
        placeholder="Default"
        icon="eos-icons:organization-outlined"
      />
    </section>

    <section class="flex items-center h-full gap-3 mr-2">
      <UDropdownMenu arrow size="sm" :items="supportLanguages">
        <UButton
          icon="i-lucide-globe"
          size="sm"
          color="neutral"
          variant="outline"
          class="rounded-lg"
        />
      </UDropdownMenu>

      <UButton
        :icon="computedSwitchMode.iconName"
        size="sm"
        color="neutral"
        variant="outline"
        class="rounded-lg"
        @click.prevent="computedSwitchMode.onClick"
      />

      <UDropdownMenu
        v-if="loggedIn"
        :items="dropItems"
        :ui="{
          content: 'w-48',
        }"
      >
        <UAvatar size="sm" :src="`${inputSite}/${currentUser?.avatar_url}`" />
      </UDropdownMenu>

      <UButton
        v-else
        size="sm"
        variant="subtle"
        icon="line-md:log-in"
        @click="openLoginPage"
      >
        {{ t('Common.UnSigned') }}
      </UButton>
    </section>

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
          :ui="{
            base: 'peer',
          }"
          placeholder=" "
          @input="clearValidationError"
        >
          <label
            class="pointer-events-none absolute left-0 -top-2.5 text-xs font-medium px-1.5 transition-all peer-focus:-top-2.5 peer-focus:text-xs peer-focus:font-medium peer-placeholder-shown:text-sm peer-placeholder-shown:top-1.5 peer-placeholder-shown:font-normal"
          >
            <span class="inline-flex bg-default px-1">
              {{ t('Login.Description') }}
            </span>
          </label>

          <template v-if="inputSite?.length" #trailing>
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
  </div>
</template>
