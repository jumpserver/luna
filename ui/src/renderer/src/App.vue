<template>
  <n-config-provider
    :locale="defaultLang === 'zh' ? zhCN : enUS"
    :theme="defaultTheme === 'dark' ? darkTheme : lightTheme"
    :class="defaultTheme === 'dark' ? 'theme-dark' : 'theme-light'"
    :theme-overrides="defaultTheme === 'dark' ? darkThemeOverrides : lightThemeOverrides"
  >
    <n-modal-provider>
      <n-message-provider>
        <div class="custom-header ele_drag bg-primary border-b-primary border-b">
          <div class="logo">
            <img :src="iconImage" alt="" />
            <span class="title text-primary">JumpServer Client</span>
          </div>
        </div>
        <LoginModal :show-modal="showLoginModal" @close-mask="handleModalOpacity" />
        <router-view />
      </n-message-provider>
    </n-modal-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import mittBus from './eventBus';
import LoginModal from './components/LoginModal/index.vue';

import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useUserStore } from './store/module/userStore';
import { useUserAccount } from './hooks/useUserAccount';
import { useElectronConfig } from './hooks/useElectronConfig';
import { getIconImage, getAvatarImage } from './utils/common';
import { darkThemeOverrides, lightThemeOverrides } from './overrides';
import { computed, watch, onBeforeUnmount, onMounted, ref, provide } from 'vue';
import { darkTheme, enUS, zhCN, lightTheme, createDiscreteApi } from 'naive-ui';

import type { ConfigProviderProps } from 'naive-ui';

const { t, locale } = useI18n();
const { getDefaultSetting, setDefaultSetting } = useElectronConfig();
const {
  showLoginModal,
  setNewAccount,
  removeAccount,
  switchAccount,
  handleModalOpacity,
  handleCredentialsReceived,
  restoreSavedCookies
} = useUserAccount();

const router = useRouter();
const userStore = useUserStore();

const defaultLang = ref('');
const defaultTheme = ref('');
const iconImage = ref<string>('');
const avatarImage = ref<string | null>(null);

const configProviderPropsRef = computed<ConfigProviderProps>(() => ({
  theme: defaultTheme.value === 'light' ? lightTheme : darkTheme
}));

provide('setNewAccount', setNewAccount);
provide('removeAccount', removeAccount);
provide('switchAccount', switchAccount);

watch(
  () => defaultLang.value,
  nv => {
    if (nv) {
      locale.value = nv;
    }
  }
);

const { notification } = createDiscreteApi(['notification'], {
  configProviderProps: configProviderPropsRef
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
  } catch (e) {
    notification.create({
      type: 'info',
      content: t('Message.GetDefaultSettingFailed'),
      duration: 2000
    });
  }

  // 恢复保存的 cookie（在检查登录状态之前）
  await restoreSavedCookies();

  // 检查是否需要显示登录框（在 restoreSavedCookies 完成后重新检查）
  if (!userStore.session || !userStore.userInfo || userStore.userInfo.length <= 0) {
    handleModalOpacity();
  } else {
    // 如果有用户信息，导航到主页面
    router.push({ name: 'Linux' });
  }

  // 监听合并后的登录凭据事件
  window.electron.ipcRenderer.on(
    'set-login-credentials',
    (_e, credentials: { session: string; csrfToken: string; site: string }) =>
      handleCredentialsReceived(credentials)
  );

  mittBus.on('changeLang', handleLangChange);
  mittBus.on('changeTheme', handleThemeChange);
});

onBeforeUnmount(() => {
  mittBus.off('changeLang', handleLangChange);
  mittBus.off('changeTheme', handleThemeChange);
});
</script>

<style scoped lang="scss">
.n-config-provider {
  height: 100%;
  width: 100%;
}
</style>
