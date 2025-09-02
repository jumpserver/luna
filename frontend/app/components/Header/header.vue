<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import type { ActionItem } from '~/types/index';
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

const { setUserLoggedIn } = userInfoStore;
const { setTheme, setLang, setCollapse } = userSettingStore;
const { theme, language, collapse } = storeToRefs(userSettingStore);

const { loggedIn } = storeToRefs(userInfoStore);

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
 * @description 处理登录成功后的逻辑
 * @param cookies 获取到的 cookies 数据
 */
const _handleLoginSuccess = (cookies: any[]) => {
  console.log('🎉 登录成功，处理 cookies:', cookies);

  // 提取关键的认证信息
  const authCookies = {
    sessionId: '',
    csrfToken: '',
    orgId: '',
    publicKey: '',
    allCookies: cookies,
  };

  cookies.forEach((cookie) => {
    switch (cookie.name) {
      case 'jms_sessionid':
        authCookies.sessionId = cookie.value;
        break;
      case 'jms_csrftoken':
        authCookies.csrfToken = cookie.value;
        break;
      case 'X-JMS-ORG':
        authCookies.orgId = cookie.value;
        break;
      case 'jms_public_key':
        authCookies.publicKey = cookie.value;
        break;
    }
  });

  console.log('🔐 提取的认证信息:', {
    sessionId: authCookies.sessionId ? '✅ 已获取' : '❌ 缺失',
    csrfToken: authCookies.csrfToken ? '✅ 已获取' : '❌ 缺失',
    orgId: authCookies.orgId ? '✅ 已获取' : '❌ 缺失',
    publicKey: authCookies.publicKey ? '✅ 已获取' : '❌ 缺失',
  });

  // 保存认证信息到本地存储
  try {
    localStorage.setItem('jumpserver_auth', JSON.stringify(authCookies));
    console.log('💾 认证信息已保存到本地存储');
  } catch (error) {
    console.error('❌ 保存认证信息失败:', error);
  }

  // 更新用户登录状态
  userInfoStore.setUserLoggedIn(true);

  // 显示登录成功提示
  console.log('✅ 用户登录状态已更新');

  // 这里可以触发其他需要认证信息的操作
  // 例如：刷新用户信息、获取权限列表等

  // 可以发送通知
  // useNotification().success('登录成功！');
};

/**
 * @description 清除认证信息
 */
const clearAuthInfo = () => {
  try {
    localStorage.removeItem('jumpserver_auth');
    userInfoStore.setUserLoggedIn(false);
    console.log('🧹 认证信息已清除');
  } catch (error) {
    console.error('❌ 清除认证信息失败:', error);
  }
};

/**
 * @description 打开登录窗口
 */
const openLoginPage = async () => {
  try {
    const loginPage = new useTauriWebviewWindowWebviewWindow('loginPage', {
      title: '',
      url: 'https://y4.cmdb.cc',
      width: 600,
      height: 800,
      minWidth: 600,
      minHeight: 800,
    });

    console.log('✅ 登录窗口已创建:', loginPage);

    const unsubscribe = await useTauriEventListen(
      'login-cookies-detected',
      (event) => {
        console.log('🍪 收到 cookies 变化通知:', event.payload);
        _handleLoginSuccess(event.payload as any[]);

        // 关闭登录窗口
        loginPage.close().catch((err) => {
          console.warn('关闭登录窗口失败:', err);
        });

        // 取消事件监听
        unsubscribe();
      }
    );

    await useTauriCoreInvoke('start_cookie_watcher', {
      windowLabel: 'loginPage',
      origin: 'https://y4.cmdb.cc',
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

  // 检查是否已有保存的认证信息
  const hasUser = userInfoStore.getUserData();

  if (hasUser.length > 0) {
    setUserLoggedIn(true);
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
