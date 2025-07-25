<script setup lang="ts">
import type { ConfigProviderProps } from 'naive-ui';

import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import { createDiscreteApi, darkTheme, enUS, lightTheme, zhCN } from 'naive-ui';

import mittBus from './eventBus';
import { useUserStore } from './store/module/userStore';
import { useUserAccount } from './hooks/useUserAccount';
import LoginModal from './components/LoginModal/index.vue';
import { useElectronConfig } from './hooks/useElectronConfig';
import { getAvatarImage, getIconImage } from './utils/common';
import { darkThemeOverrides, lightThemeOverrides } from './overrides';

const { t, locale } = useI18n();
const { getDefaultSetting, setDefaultSetting } = useElectronConfig();
const {
  showLoginModal,
  setNewAccount,
  removeAccount,
  switchAccount,
  handleModalOpacity,
  handleCredentialsReceived,
  restoreSavedCookies,
} = useUserAccount();

const router = useRouter();
const userStore = useUserStore();

const defaultLang = ref('');
const defaultTheme = ref('');
const iconImage = ref<string>('');
const avatarImage = ref<string | null>(null);

const configProviderPropsRef = computed<ConfigProviderProps>(() => ({
  theme: defaultTheme.value === 'light' ? lightTheme : darkTheme,
}));

provide('setNewAccount', setNewAccount);
provide('removeAccount', removeAccount);
provide('switchAccount', switchAccount);

watch(
  () => defaultLang.value,
  (nv) => {
    if (nv) {
      locale.value = nv;
    }
  },
);

const { notification } = createDiscreteApi(['notification'], {
  configProviderProps: configProviderPropsRef,
});

/**
 * @description 切换语言
 */
const handleLangChange = async (lang: string) => {
  switch (lang) {
    case 'zh': {
      defaultLang.value = 'en';
      break;
    }
    case 'en': {
      defaultLang.value = 'zh';
      break;
    }
  }

  setDefaultSetting({ language: defaultLang.value });
};

/**
 * @description 切换主题
 * @param theme
 */
const handleThemeChange = async (theme: string) => {
  switch (theme) {
    case 'light': {
      defaultTheme.value = 'dark';
      break;
    }
    case 'dark': {
      defaultTheme.value = 'light';
      break;
    }
  }

  window.electron.ipcRenderer.send('update-titlebar-overlay', defaultTheme.value);

  setDefaultSetting({ theme: defaultTheme.value });
};

onMounted(async () => {
  try {
    const res = await getIconImage();

    if (res) {
      iconImage.value = res;
    }

    avatarImage.value = await getAvatarImage();

    const { theme, language } = await getDefaultSetting();

    defaultTheme.value = theme;
    defaultLang.value = language;
  }
  catch (e) {
    notification.create({
      type: 'info',
      content: t('Message.GetDefaultSettingFailed'),
      duration: 2000,
    });
  }

  // 首先尝试从文件系统加载已保存的cookies信息
  try {
    const savedCookiesResult = await window.electron.ipcRenderer.invoke('get-all-saved-cookies');

    if (
      savedCookiesResult.success
      && savedCookiesResult.data
      && savedCookiesResult.data.length > 0
    ) {
      // 如果存在已保存的cookies，但userStore中没有用户信息，则尝试从最新的cookies恢复
      if (
        (!userStore.userInfo || userStore.userInfo.length === 0)
        && savedCookiesResult.data.length > 0
      ) {
        // 按时间戳排序，使用最新的cookies
        const latestCookieInfo = savedCookiesResult.data.sort(
          (a, b) => b.timestamp - a.timestamp,
        )[0];

        // 尝试恢复最新的用户会话
        const cookies = await window.electron.ipcRenderer.invoke(
          'get-site-cookies',
          latestCookieInfo.site,
          latestCookieInfo.sessionId,
        );

        if (cookies && cookies.length > 0) {
          // 模拟用户信息，仅用于恢复cookies
          const mockUser = {
            session: latestCookieInfo.sessionId,
            currentSite: latestCookieInfo.site,
            csrfToken: '', // 将从cookies中获取
            username: 'Restored User',
            display_name: ['Restored User'],
            avatar_url: null,
          };

          userStore.setCurrentUser(mockUser);
        }
      }
    }
  }
  catch (error) {
    console.error('加载已保存的cookies失败:', error);
  }

  // 恢复保存的 cookie（在检查登录状态之前）
  const cookiesRestored = await restoreSavedCookies();

  // 检查是否需要显示登录框
  if (
    !userStore.session
    || !userStore.userInfo
    || userStore.userInfo.length <= 0
    || !cookiesRestored
  ) {
    // 如果cookies恢复失败，清理可能的残留状态
    if (!cookiesRestored && userStore.userInfo && userStore.userInfo.length > 0) {
      console.warn('Cookies恢复失败，清理用户状态');
      userStore.reset();
    }

    handleModalOpacity();
  }
  else {
    // 如果有用户信息且cookies恢复成功，导航到主页面
    router.push({ name: 'Linux' });
  }

  // 监听合并后的登录凭据事件
  window.electron.ipcRenderer.on(
    'set-login-credentials',
    (_e, credentials: { session: string; csrfToken: string; site: string }) =>
      handleCredentialsReceived(credentials),
  );

  mittBus.on('changeLang', handleLangChange);
  mittBus.on('changeTheme', handleThemeChange);
});

onBeforeUnmount(() => {
  mittBus.off('changeLang', handleLangChange);
  mittBus.off('changeTheme', handleThemeChange);
});
</script>

<template>
  <n-config-provider
    :locale="defaultLang === 'zh' ? zhCN : enUS"
    :theme="defaultTheme === 'dark' ? darkTheme : lightTheme"
    :class="defaultTheme === 'dark' ? 'theme-dark' : 'theme-light'"
    :theme-overrides="defaultTheme === 'dark' ? darkThemeOverrides : lightThemeOverrides"
  >
    <n-modal-provider>
      <n-message-provider>
        <!-- <div class="custom-header ele_drag bg-primary border-b-primary border-b">
          <div class="logo">
            <img :src="iconImage" alt="" />
            <span class="title text-primary">JumpServer Client</span>
          </div>
        </div> -->
        <!-- <CustomHeader /> -->
        <LoginModal :show-modal="showLoginModal" @close-mask="handleModalOpacity" />
        <router-view />
      </n-message-provider>
    </n-modal-provider>
  </n-config-provider>
</template>

<style scoped lang="scss">
.n-config-provider {
  height: 100%;
  width: 100%;
}
</style>
