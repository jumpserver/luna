<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { ActionItem, Cookies } from '~/types/index';

import { getProfile } from '~/api/modules/user';
import { useUserInfoStore } from '~/store/modules/userInfo';
import { useUserSettingStore } from '~/store/modules/userSetting';

type LocaleCode = (typeof locales.value)[number]['code'];

// TODO 系统主题默认第一次使用时将适配

const { t, setLocale, locales } = useI18n();
const colorMode = useColorMode();
const appConfig = useAppConfig();
const userInfoStore = useUserInfoStore();
const userSettingStore = useUserSettingStore();

const darkColor = appConfig.componentsConfig.header.darkColor;
const lightColor = appConfig.componentsConfig.header.lightColor;

const { setUserLoggedIn, setUserData } = userInfoStore;
const { setTheme, setLang, setCollapse } = userSettingStore;
const { theme, language, collapse } = storeToRefs(userSettingStore);

const { loggedIn } = storeToRefs(userInfoStore);

const loginPage = ref<WebviewWindow | null>(null);
const subscribeEvent = ref<UnlistenFn | null>(null);

const isDarkMode = computed(() => theme.value === 'dark');

const supportLanguages = computed(() => {
  return locales.value.map((locale) => ({
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
    iconName: isDarkMode.value ? 'i-lucide-sun' : 'i-lucide-moon',
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
  try {
    loginPage.value = new useTauriWebviewWindowWebviewWindow('loginPage', {
      title: '',
      url: 'https://y4.cmdb.cc',
      width: 600,
      height: 800,
      minWidth: 600,
      minHeight: 800,
    });

    nextTick(async () => {
      // 启动URL监听器，监听重定向到 /ui/ 的情况（登录成功后会跳转到 /ui/#/pam/dashboard）
      await useTauriCoreInvoke('start_url_watcher', {
        windowLabel: 'loginPage',
        targetUrlPattern: '/ui/#/',
      });
    });
  } catch (error) {
    console.error('❌ 创建登录窗口失败:', error);
  }
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
      const cookies: Cookies[] = event.payload as Cookies[];

      console.log('🎉 检测到登录成功，获取到cookies:', cookies);

      if (cookies.length === 0) {
        console.warn('⚠️ 登录成功但未获取到cookies');
        return;
      }

      const csrfToken = cookies.find((c) => {
        return c.name.includes('csrf') || c.name.includes('CSRF');
      })?.value;

      const cookieHeader = cookies
        .map((c) => `${c.name}=${c.value}`)
        .join('; ');

      console.log('🍪 Cookie Header:', cookieHeader);
      console.log('🔐 CSRF Token:', csrfToken);

      if (!csrfToken) {
        console.warn('⚠️ 未找到CSRF Token，但仍然尝试设置用户数据');
      }

      // 关闭登录窗口
      // if (loginPage.value) {
      //   loginPage.value.close();
      //   loginPage.value = null;
      // }

      const siteUrl = 'https://y4.cmdb.cc';

      // 设置当前站点
      userInfoStore.setCurrentSite(siteUrl);

      // 设置用户数据
      setUserData(siteUrl, {
        avatar_url: '',
        name: '',
        headerJson: cookieHeader,
        csrf_token: csrfToken || '',
      });

      console.log('🔧 用户数据设置完成:');
      console.log('  - 站点:', siteUrl);
      console.log('  - CSRF Token:', csrfToken);
      console.log('  - Cookie Header:', cookieHeader);

      nextTick(async () => {
        try {
          const res = await getProfile();
          console.log('✅ 获取用户信息成功:', res);

          // 设置登录状态
          // setUserLoggedIn(true);
        } catch (error) {
          console.error('❌ 获取用户信息失败:', error);
        }
      });
    }
  );

  // 检查是否已有保存的认证信息
  // const hasUser = userInfoStore.getUserData();

  // if (hasUser.length > 0) {
  //   setUserLoggedIn(true);
  // }
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
        <UAvatar size="sm" src="https://github.com/benjamincanac.png" />
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
  </div>
</template>
