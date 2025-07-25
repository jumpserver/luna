<script setup lang="ts">
import type { Ref } from 'vue';

import { useI18n } from 'vue-i18n';
import { useMessage } from 'naive-ui';
import { useRoute } from 'vue-router';
import mittBus from '@renderer/eventBus';
import { Conf } from 'electron-conf/renderer';
import { ArrowBarRight } from '@vicons/tabler';
import { Folder28Regular } from '@vicons/fluent';
import { useSettingStore } from '@renderer/store/module/settingStore';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue';

import type {
  IClient,
} from './config/index';

import {
  boolOptions,
  charsetOptions,
  databaseOptions,
  linuxOptions,
  resolutionsOptions,
  windowsOptions,
} from './config/index';

const props = withDefaults(defineProps<{ active: boolean }>(), {
  active: false,
});

const { t } = useI18n();
const route = useRoute();
const message = useMessage();
const settingStore = useSettingStore();

const charset = ref(settingStore.charset);
const rdp_resolution = ref(settingStore.rdp_resolution);
const is_backspace_as_ctrl_h = ref(settingStore.is_backspace_as_ctrl_h);

const currentOption: Ref<IClient[] | null> = ref(null);

const platform = ref('');

const conf = new Conf();

const updateCurrentOptions = (newValue: string | null) => {
  switch (newValue) {
    case 'Linux':
      currentOption.value = linuxOptions.value;
      break;
    case 'Windows':
      currentOption.value = windowsOptions.value;
      break;
    case 'Database':
      currentOption.value = databaseOptions.value;
      break;
    default:
      currentOption.value = [];
  }
};

const enabledItems = computed(() => {
  // 获取所有启用状态的 item 标签作为展开的名称
  return currentOption.value
    ? currentOption.value.filter(item => item.is_set).map(item => item.display_name)
    : [];
});

const handleItemChange = async (item: IClient) => {
  const configName = `${platform.value}.${item.type}`;
  const newList
    = currentOption.value
      ?.filter(option => option.type === item.type)
      .map((option) => {
        if (option.name !== item.name) {
          // 过滤掉 `item.match_first` 中的匹配项
          option.match_first = option.match_first.filter(i => !item.match_first.includes(i));
        }
        return toRaw(option);
      }) || [];

  await conf.set(configName, newList);
};

const openFile = (item: IClient) => {
  window.document.getElementById(item.name)!.click();
};

const changeFile = (item: IClient) => {
  const fileInput = window.document.getElementById(item.name) as HTMLInputElement;
  item.path = fileInput?.files?.[0]?.path || '';
  handleItemChange(item).then(() => {
    message.success(`${t('Message.ChangeSuccess')}`);
  });
};

const copyToClipboard = (text: string) => {
  navigator.clipboard
    .writeText(text)
    .then(() => message.success(`${t('Message.CopyToClipboard')}`))
    .catch();
};

/**
 * @description 关闭抽屉
 */
const closeDrawer = () => {
  mittBus.emit('createDrawer');
};

/**
 * @deprecated 当只有一个处于启用状态时不允许关闭当前 Switch，只有点击启用其他 Option 时该状态关闭
 *
 * @param item
 */
const handleChangeSwitchValue = (item: IClient) => {
  nextTick(() => {
    const enabledOptions = currentOption.value?.filter(option => option.is_set);
    if (enabledOptions && enabledOptions.length === 0) {
      message.warning(`${t('Message.EnableOneOption')}`);
      item.is_set = true;
      return;
    }
    handleItemChange(item).then(() => {
      message.success(`${t('Message.ChangeSuccess')}`);
    });
  });
};

const initPlatformData = async () => {
  const platformData = await conf.get(platform.value);
  if (platformData) {
    linuxOptions.value = [...platformData.terminal, ...platformData.filetransfer];
    windowsOptions.value = platformData.remotedesktop;
    databaseOptions.value = platformData.databases;
  }
};

const checkMatch = async (protocol: string) => {
  const platformData = await conf.get(platform.value);
  const clients = [
    ...platformData.terminal,
    ...platformData.filetransfer,
    ...platformData.remotedesktop,
    ...platformData.databases,
  ];
  const enabledOptions = clients.filter(
    option => option.is_set && option.match_first.includes(protocol),
  );
  if (enabledOptions && enabledOptions.length === 0) {
    message.warning(`${t('Message.NotMatched')}`);
  }
  else {
    message.success(`${t('Message.ConnectSuccess')}`);
  }
};

watch(
  () => route.name,
  (newValue) => {
    if (newValue && typeof newValue === 'string') {
      updateCurrentOptions(newValue);
    }
  },
  { immediate: true },
);

watch([charset, is_backspace_as_ctrl_h, rdp_resolution], () => {
  settingStore.charset = charset.value;
  settingStore.is_backspace_as_ctrl_h = is_backspace_as_ctrl_h.value;
  settingStore.rdp_resolution = rdp_resolution.value;
});

onMounted(() => {
  window.electron.ipcRenderer.send('get-platform');
  window.electron.ipcRenderer.on('platform-response', (_event, _platform) => {
    platform.value = _platform;
    initPlatformData();
  });
  mittBus.on('checkMatch', checkMatch);
});
onBeforeUnmount(() => {
  mittBus.off('checkMatch', checkMatch);
});
</script>

<template>
  <n-drawer
    v-model:show="props.active"
    placement="right"
    to="#drawer-target"
    :width="350"
    :show-mask="false"
    :trap-focus="false"
    :block-scroll="false"
    :mask-closable="false"
    class="!rounded-[unset] bg-primary border-l-primary border-l"
  >
    <n-drawer-content footer-style="border: unset;" body-content-style="padding: 15px 5px 40px">
      <template #header>
        <n-flex align="center" justify="space-between">
          <n-text depth="1">
            {{ t('Setting.Default') }}
          </n-text>
          <n-flex>
            <n-icon
              size="20"
              :component="ArrowBarRight"
              class="icon-hover rounded-[5px]"
              @click="closeDrawer"
            />
          </n-flex>
        </n-flex>
      </template>

      <n-scrollbar>
        <template #default>
          <n-flex class="mx-[15px]">
            <n-card
              v-for="item of currentOption"
              :key="item"
              :bordered="false"
              size="small"
              header-style="font-size: 13px;"
              class="rounded-[10px] !bg-secondary"
            >
              <n-collapse :trigger-areas="['extra']" :default-expanded-names="enabledItems">
                <n-collapse-item :name="item.display_name" :title="item.display_name">
                  <template #header-extra>
                    <n-switch
                      v-model:value="item.is_set"
                      size="small"
                      @update:value="handleChangeSwitchValue(item)"
                    >
                      <template #checked>
                        {{ t('Setting.Enabled') }}
                      </template>
                      <template #unchecked>
                        {{ t('Setting.NotEnabled') }}
                      </template>
                    </n-switch>
                  </template>
                  <n-form :model="item">
                    <n-form-item
                      :label="t('Setting.ApplicationPath')"
                      label-style="font-size: 13px"
                    >
                      <n-input-group>
                        <n-input
                          v-model:value="item.path"
                          size="small"
                          :disabled="item.is_internal || platform === 'macos'"
                        />
                        <input
                          :id="item.name"
                          type="file"
                          name="filename"
                          style="display: none"
                          @change="changeFile(item)"
                        >
                        <n-button
                          type="primary"
                          ghost
                          size="small"
                          :disabled="item.is_internal || platform === 'macos'"
                          @click="openFile(item)"
                        >
                          <n-icon :component="Folder28Regular" size="14" />
                        </n-button>
                      </n-input-group>
                    </n-form-item>
                    <n-form-item :label="t('Setting.Protocol')" label-style="font-size: 13px">
                      <n-select
                        v-model:value="item.match_first"
                        multiple
                        :options="
                          item.protocol.map((value: any) => ({ label: value, value }))
                        "
                        @update:value="handleItemChange(item)"
                      />
                    </n-form-item>
                    <n-form-item
                      :label="t('Setting.Comment')"
                      label-style="font-size: 13px"
                      label-placement="left"
                    >
                      <n-popover>
                        <template #trigger>
                          <span class="truncate">
                            {{ item.comment.en ? item.comment.en : t('Setting.NoDescription') }}
                          </span>
                        </template>
                        {{ item.comment.en ? item.comment.en : t('Setting.NoDescription') }}
                      </n-popover>
                    </n-form-item>
                    <n-form-item
                      :label="t('Setting.DownloadUrl')"
                      label-style="font-size: 13px"
                      feedback-style="min-height: unset"
                      label-placement="left"
                    >
                      <n-popover>
                        <template #trigger>
                          <n-a
                            href="#"
                            class="truncate"
                            @click.prevent="copyToClipboard(item.download_url)"
                          >
                            {{ item.download_url ? item.download_url : t('Common.None') }}
                          </n-a>
                        </template>
                        {{ item.download_url ? item.download_url : t('Common.None') }}
                      </n-popover>
                    </n-form-item>
                  </n-form>
                </n-collapse-item>
              </n-collapse>
            </n-card>

            <n-card
              :bordered="false"
              size="small"
              header-style="font-size: 13px;"
              class="rounded-[10px] !bg-secondary"
            >
              <n-collapse :trigger-areas="['main']">
                <n-collapse-item :title="t('Setting.Advanced')" name="advanced">
                  <n-form>
                    <n-form-item :label="t('Setting.Charset')" label-style="font-size: 13px">
                      <n-select v-model:value="charset" size="small" :options="charsetOptions" />
                    </n-form-item>
                    <n-form-item
                      :label="t('Setting.BackspaceAsCtrlH')"
                      label-style="font-size: 13px"
                    >
                      <n-select
                        v-model:value="is_backspace_as_ctrl_h"
                        size="small"
                        :options="boolOptions"
                      />
                    </n-form-item>
                    <n-form-item :label="t('Setting.Resolution')" label-style="font-size: 13px">
                      <n-select
                        v-model:value="rdp_resolution"
                        size="small"
                        :options="resolutionsOptions"
                      />
                    </n-form-item>
                  </n-form>
                </n-collapse-item>
              </n-collapse>
            </n-card>
          </n-flex>
        </template>
      </n-scrollbar>
    </n-drawer-content>
  </n-drawer>
</template>

<style lang="scss" scoped>
:deep(.n-form-item-feedback-wrapper) {
  min-height: 15px;
}

:deep(.n-collapse-item-arrow) {
  display: none !important;
}
</style>
