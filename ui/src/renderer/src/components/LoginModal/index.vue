<template>
  <n-modal
    :show="showModal"
    :show-icon="false"
    :closable="true"
    preset="dialog"
    class="rounded-lg"
    style="width: 31rem"
    @close="handleMaskClick"
    @mask-click="handleMaskClick"
  >
    <template #header>
      <n-flex align="center">
        <n-text depth="1">{{ t('Common.Tip') }}</n-text>
      </n-flex>
    </template>

    <template #default>
      <n-flex vertical justify="space-evenly" align="flex-start" class="w-full h-20">
        <n-input
          v-model:value="siteLocation"
          clearable
          size="medium"
          class="w-20"
          :status="inputStatus"
          :placeholder="t('Common.LoginModalPlaceholder')"
        >
          <template #prefix>
            <n-icon :component="Location" />
          </template>
        </n-input>
      </n-flex>
    </template>

    <template #action>
      <n-button round :disabled="!siteLocation" size="small" type="primary" @click="jumpToLogin">
        {{ t('Common.SignIn') }}
      </n-button>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMessage } from 'naive-ui';
import { Location } from '@vicons/carbon';
import { useDebounceFn } from '@vueuse/core';
import { readText } from 'clipboard-polyfill';
import { URL_REGEXP } from '@renderer/config/constance';
import { useUserStore } from '@renderer/store/module/userStore';

const props = withDefaults(
  defineProps<{
    showModal: boolean;
  }>(),
  { showModal: false }
);

const emits = defineEmits<{
  (e: 'close-mask'): void;
}>();

const { t } = useI18n();
const message = useMessage();
const userStore = useUserStore();

const inputStatus = ref('');
const siteLocation = ref('');

/**
 * @description 不输入站点之前不允许关闭遮罩
 */
const handleMaskClick = (): void => {
  emits('close-mask');
};

function sanitizeUrl(url: string): string {
  return url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\u3000/g, ''); // 去空格 + 去全角空格 + 去末尾/
}

/**
 * @description 登录按钮的回调
 */
const jumpToLogin = () => {
  const sanitizedUrl = sanitizeUrl(siteLocation.value);

  const hasProtocol = /^https?:\/\//i.test(sanitizedUrl);

  if (!hasProtocol) {
    message.error(t('Message.ProtocolRequired'), { closable: true });
    inputStatus.value = 'error';
    return;
  }

  const sameSiteUser = userStore.userInfo
    ? userStore.userInfo.filter(item => item.currentSite === sanitizedUrl)
    : [];

  if (sameSiteUser.length !== 0) {
    // 如果用户已经登录了该站点，直接切换到该用户
    const existingUser = sameSiteUser[0];

    // 检查是否是当前用户
    if (existingUser.session === userStore.session) {
      message.info(t('Message.AlreadyLoggedIn'), { closable: true });
      inputStatus.value = 'warning';
      return;
    }

    message.success(t('Message.SwitchedToExistingAccount'), { closable: true });
    emits('close-mask');
    return;
  }

  if (!URL_REGEXP.test(sanitizedUrl)) {
    message.error(t('Message.EnterTheCorrectSite'), { closable: true });
    inputStatus.value = 'error';
    return;
  }

  userStore.setCurrentSit(sanitizedUrl);
  window.electron.ipcRenderer.send('user-login', sanitizedUrl);

  inputStatus.value = 'success';
};

/**
 * @description 组织鼠标右键默认行为，改为右键粘贴 ip 内容
 */
const handleContextMenu = async () => {
  try {
    let text = await readText();

    if (text) {
      text = sanitizeUrl(text);
      const hasProtocol = /^https?:\/\//i.test(text);

      if (!hasProtocol) {
        siteLocation.value = text;
        message.error(t('Message.ProtocolRequired'), { closable: true });
        return;
      }

      if (URL_REGEXP.test(text)) {
        siteLocation.value = text;
      } else {
        siteLocation.value = text;
        message.error(`${text} ${t('Message.ErrorSiteInput')}`, { closable: true });
      }
    }
  } catch (error) {
    console.error('Failed to read clipboard:', error);
  }
};

/**
 * @description 监听回车键
 */
const handleEnterKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    jumpToLogin();
  }
};

const debounceHandleEnterKeyDown = useDebounceFn(handleEnterKeyDown, 500);

watch(
  () => props.showModal,
  newValue => {
    if (!newValue) {
      window.removeEventListener('contextmenu', handleContextMenu, false);
      window.removeEventListener('keydown', debounceHandleEnterKeyDown, false);
    } else {
      window.addEventListener('contextmenu', handleContextMenu, false);
      window.addEventListener('keydown', debounceHandleEnterKeyDown, false);
    }
  },
  { immediate: true }
);
</script>
