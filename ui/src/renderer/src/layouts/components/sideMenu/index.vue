<template>
  <n-flex vertical justify="space-between" class="py-4" style="height: calc(100% - 30px)">
    <div>
      <n-menu
        v-model:value="selectedKey"
        :options="options"
        :collapsed="collapsed"
        :collapsed-width="64"
        :collapsed-icon-size="22"
        class="w-full flex flex-col items-center"
      />
      <n-divider class="!my-3" />
    </div>

    <!-- 未登录状态 -->
    <div>
      <n-flex v-if="userOptions.length === 0" align="center" justify="center">
        <n-button text strong @click="handleAddAccount"> {{ t('Common.UnLogged') }} </n-button>
      </n-flex>

      <template v-else>
        <n-popselect
          size="small"
          trigger="click"
          placement="top"
          class="custom-popselect rounded-xl"
          :class="{ 'account-popselect': true }"
          :style="{
            width: '16rem',
            marginLeft: '1rem'
          }"
          :options="[]"
          @update:show="handlePopSelectShow"
        >
          <!-- trigger  -->
          <n-flex
            align="center"
            :justify="collapsed ? 'center' : 'space-between'"
            :style="{ padding: collapsed ? '0' : '0 1rem' }"
            class="w-full !flex-nowrap cursor-pointer transition-all duration-300 ease-in-out"
          >
            <n-flex
              align="center"
              class="!gap-0 w-full"
              :style="{ justifyContent: collapsed ? 'center' : '' }"
            >
              <n-avatar
                v-if="currentUser?.avatar_url"
                round
                size="medium"
                class="cursor-pointer w-8 h-8 transition-all duration-300"
                :src="currentUser?.avatar_url"
              />

              <n-flex
                v-if="!collapsed"
                align="center"
                justify="space-between"
                class="ml-3 flex-1 overflow-hidden transition-all duration-500"
                :style="{
                  maxWidth: collapsed ? '0' : '200px',
                  opacity: collapsed ? '0' : '1',
                  transform: collapsed ? 'translateX(-20px)' : 'translateX(0)',
                  gap: '2px'
                }"
              >
                <n-text depth="1" strong class="whitespace-nowrap text-sm">
                  {{ currentUser?.label }}
                </n-text>

                <ChevronUp v-if="indicatorArrow" :size="16" />
                <ChevronLeft v-else :size="16" />
              </n-flex>
            </n-flex>
          </n-flex>

          <template #header>
            <n-text depth="3" strong> {{ t('Common.SwitchAccount') }} </n-text>
          </template>

          <template #empty>
            <n-flex vertical justify="start" class="w-full">
              <AccountList
                :username="currentUser.label!"
                :user-token="currentUser.value!"
                :user-site="currentUser.currentSite!"
                :user-avator="currentUser.avatar_url!"
              />
            </n-flex>
          </template>

          <template #action>
            <n-flex vertical align="center" justify="start" class="w-full !gap-y-[5px]">
              <!-- 切换账号  -->
              <n-popselect
                :key="userOptions.length + '-' + userOptions.map(o => o.value).join(',')"
                v-model:value="currentAccount"
                trigger="click"
                placement="right"
                :style="{
                  width: '14rem',
                  marginLeft: '1rem'
                }"
                :options="userOptions"
                :class="{ 'account-popselect': false }"
                :render-label="renderLabel"
                @update:value="handleUpdateCurrentAccount"
              >
                <n-button text class="w-full justify-start">
                  <template #icon>
                    <n-icon :component="ArrowSync20Regular" :size="20" />
                  </template>
                  {{ t('Common.SwitchAccount') }}
                </n-button>

                <template #action>
                  <n-button text class="w-full" @click="handleAddAccount">
                    {{ t('Common.AddAccount') }}
                  </n-button>
                </template>
              </n-popselect>

              <!-- 切换语言 -->
              <n-flex justify="space-between" align="center" class="w-full !flex-nowrap">
                <n-button text class="flex-1 justify-start w-full" @click="handleChangeLang">
                  <template #icon>
                    <Earth />
                  </template>
                  {{ t('Common.SwitchLanguage') }}
                </n-button>

                <n-text class="vertical-middle flex-shrink-0" depth="3"> {{ currentLang }} </n-text>
              </n-flex>

              <!-- 切换外观 -->
              <n-flex justify="space-between" align="center" class="w-full !flex-nowrap">
                <n-button text class="flex-1 justify-start w-full">
                  <template #icon>
                    <Palette />
                  </template>
                  {{ t('Common.Appearance') }}
                </n-button>

                <n-switch
                  v-model:value="active"
                  size="medium"
                  class="flex-shrink-0"
                  @update:value="handleChangeTheme"
                >
                  <template #checked-icon>
                    <n-icon :component="Sun" />
                  </template>
                  <template #unchecked-icon>
                    <n-icon :component="Moon" />
                  </template>
                </n-switch>
              </n-flex>

              <n-flex justify="space-between" align="center" class="w-full !flex-nowrap">
                <n-button text class="flex-1 justify-start w-full">
                  <template #icon>
                    <Rocket />
                  </template>
                  {{ t('Common.Version') }}
                </n-button>

                <n-text depth="1"> {{ versionMessage }} </n-text>
              </n-flex>

              <n-flex justify="space-between" align="center" class="w-full !flex-nowrap">
                <n-button
                  text
                  class="flex-1 justify-start w-full"
                  @click="handleRemoveCurrentAccount"
                >
                  <template #icon>
                    <LogOut />
                  </template>
                  {{ t('Common.RemoveAccount') }}
                </n-button>
              </n-flex>
            </n-flex>
          </template>
        </n-popselect>
      </template>
    </div>
  </n-flex>

  <RemoveAccountConfirm
    :show-modal="showModal"
    :on-confirm="handleRemoveAccount"
    :on-cancel="() => (showModal = false)"
  />
</template>

<script setup lang="ts">
import mittBus from '@renderer/eventBus';
import AccountList from '../AccountList/index.vue';

import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { NAvatar, NText, NFlex } from 'naive-ui';
import { computed, watch, ref, inject, onMounted } from 'vue';
import { Earth, LogOut, Palette, ChevronUp, ChevronLeft, Rocket } from 'lucide-vue-next';

import { Moon, Sun } from '@vicons/tabler';
import { useDebounceFn } from '@vueuse/core';
import { ArrowSync20Regular } from '@vicons/fluent';
import { useUserStore } from '@renderer/store/module/userStore';
import { useElectronConfig } from '@renderer/hooks/useElectronConfig';
import { setUserRemoving } from '@renderer/api/index';

import { menuOptions, getAccountOptionsRender, RemoveAccountConfirm } from './config';

import type { SelectOption } from 'naive-ui';
import type { IUserInfo } from '@renderer/store/interface';

withDefaults(defineProps<{ collapsed: boolean }>(), {
  collapsed: false
});

const options = menuOptions();
const userStore = useUserStore();

const { t, locale } = useI18n();
const { getDefaultSetting } = useElectronConfig();
const { currentUser: storeCurrentUser } = storeToRefs(userStore);

const currentUser = computed(() => {
  return {
    label: storeCurrentUser?.value?.username,
    value: storeCurrentUser?.value?.session,
    avatar_url: storeCurrentUser?.value?.avatar_url,
    currentSite: storeCurrentUser?.value?.currentSite
  };
});

const userOptions = computed(() => {
  // 确保使用最新的用户数据，避免缓存问题
  const currentUserInfo = userStore.userInfo || [];
  const options = currentUserInfo.map((item: IUserInfo) => {
    return {
      label: item.username,
      value: item.session,
      avatar_url: item.avatar_url,
      display_name: item.display_name,
      currentSite: item.currentSite
    };
  });

  return options;
});

const active = ref(false);
const showModal = ref(false);
const indicatorArrow = ref(false);
const currentLang = ref('');
const versionMessage = ref('');
const selectedKey = ref('linux-page');
const currentAccount = ref(userStore.currentUser?.session);
const accountToRemove = ref('');

const setNewAccount = inject<() => void>('setNewAccount');
const removeAccount = inject<(session?: string) => void>('removeAccount');
const switchAccount = inject<(session: string) => void>('switchAccount');

const handlePopSelectShow = (show: boolean) => {
  indicatorArrow.value = show;
};

const renderLabel = (option: SelectOption) => {
  return getAccountOptionsRender(option, (session: string) => {
    showModal.value = true;
    accountToRemove.value = session;
  });
};

/**
 * @description 添加账号
 */
const handleAddAccount = () => {
  setNewAccount ? setNewAccount() : null;
};

/**
 * @description 移除当前账号
 */
const handleRemoveCurrentAccount = () => {
  if (userStore.currentUser?.session) {
    // 在删除前设置用户删除状态，防止401错误干扰删除流程
    setUserRemoving(true);

    accountToRemove.value = userStore.currentUser.session;
    showModal.value = true;
  } else {
    console.error('没有当前用户，无法删除');
  }
};

/**
 * @description 移除账号
 */
const handleRemoveAccount = async () => {
  const targetUser = userStore.userInfo?.find(user => user.session === accountToRemove.value);
  if (!targetUser) {
    showModal.value = false;
    // 重置用户删除状态
    setUserRemoving(false);
    return;
  }

  try {
    if (removeAccount) {
      await removeAccount(accountToRemove.value);
    }
  } catch (error) {
    console.error('删除账号失败:', error);
  } finally {
    showModal.value = false;
    // 延迟重置用户删除状态，确保删除操作完全完成
    setTimeout(() => {
      setUserRemoving(false);
    }, 1000);
  }
};

const debouncedSearch = useDebounceFn(() => {
  mittBus.emit('search', 'reset');
}, 300);

/**
 * @description 切换外观
 * @param value
 */
const handleChangeTheme = async (value: boolean) => {
  try {
    const { theme } = await getDefaultSetting();

    mittBus.emit('changeTheme', theme as string);

    value ? (active.value = true) : (active.value = false);
  } catch (e) {
    console.error(e);
  }
};

/**
 * @description 切换语言
 */
const handleChangeLang = async () => {
  const { language } = await getDefaultSetting();

  mittBus.emit('changeLang', language as string);

  switch (currentLang.value) {
    case 'zh': {
      locale.value = 'en';
      break;
    }
    case 'en': {
      locale.value = 'zh';
      break;
    }
  }

  currentLang.value = language === 'zh' ? 'English' : '中文';
};

/**
 * @description 切换账号
 * @param token
 */
const handleUpdateCurrentAccount = (token: string) => {
  switchAccount ? switchAccount(token) : null;
};

watch(
  () => userStore.currentUser,
  newUser => {
    if (newUser && Reflect.ownKeys(newUser).length > 0) {
      debouncedSearch();
      // 更新currentAccount以保持与当前用户同步
      currentAccount.value = newUser.session;
    }
  }
);

onMounted(async () => {
  const { theme, language } = await getDefaultSetting();

  try {
    window.electron.ipcRenderer.send('get-app-version');
    window.electron.ipcRenderer.on('app-version-response', (_event, version) => {
      versionMessage.value = version;
    });
  } catch (error) {
    console.error('获取版本信息失败:', error);
  }

  active.value = theme === 'light';
  currentLang.value = language === 'zh' ? '中文' : 'English';
});
</script>

<style scoped lang="scss">
@use './index.scss';
</style>
