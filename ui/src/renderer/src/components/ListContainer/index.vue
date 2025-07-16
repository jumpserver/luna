<template>
  <n-grid
    v-if="listData.length > 0"
    :x-gap="12"
    :y-gap="12"
    :item-responsive="true"
    :cols="currentLayout === 'grid' ? 2 : 1"
    class="h-full px-4"
    responsive="screen"
  >
    <n-gi v-for="item of listData" :key="item.id">
      <n-card
        hoverable
        size="small"
        class="h-20rounded-md cursor-pointer"
        :content-style="{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }"
        @contextmenu="handleContextMenu(item, $event)"
      >
        <template #header>
          <n-flex vertical align="start" class="w-full !gap-y-2">
            <n-text depth="2" class="cursor-pointer font-mono font-normal text-sm">
              {{ item.name }}
            </n-text>

            <n-flex justify="start" align="center" class="w-full">
              <n-flex class="w-full">
                <n-popover trigger="hover" size="small" placement="top">
                  <template #trigger>
                    <n-tag size="small" type="info" :bordered="false" class="cursor-pointer">
                      <span class="font-normal tracking-wider">
                        {{ t('Common.CurrentAccount') }}:
                      </span>

                      <span class="font-normal">
                        {{ getAssetAccount(item.id) || '-' }}
                      </span>
                    </n-tag>
                  </template>

                  {{ t('Common.CurrentAccount') }}: {{ getAssetAccount(item.id) || '-' }}
                </n-popover>

                <n-popover trigger="hover" size="small" placement="top">
                  <template #trigger>
                    <n-tag size="small" type="info" :bordered="false" class="cursor-pointer">
                      <span class="font-normal tracking-wider">
                        {{ t('Common.CurrentProtocol') }}:
                      </span>
                      <span class="font-normal">
                        {{ getAssetProtocol(item.id) || '-' }}
                      </span>
                    </n-tag>
                  </template>

                  {{ t('Common.CurrentProtocol') }}: {{ getAssetProtocol(item.id) || '-' }}
                </n-popover>

                <n-tag size="small" :bordered="false" type="success">
                  {{ t('Common.Connectable') }}
                  <template #icon>
                    <n-icon :component="CheckmarkCircle" />
                  </template>
                </n-tag>

                <n-tag size="small" :bordered="false" :type="item.is_active ? 'success' : 'error'">
                  {{ item.is_active ? t('Common.Active') : t('Common.Inactive') }}
                  <template #icon>
                    <n-icon v-if="item.is_active" :component="CheckmarkCircle" />
                    <n-icon v-else :component="CloseCircle" />
                  </template>
                </n-tag>
              </n-flex>
            </n-flex>
          </n-flex>
        </template>

        <template #header-extra>
          <n-popover trigger="hover">
            <template #trigger>
              <n-icon
                :component="Desktop"
                :size="16"
                class="outline-none icon-hover"
                @click="handleConnect(item, $event)"
              ></n-icon>
            </template>

            <span>
              {{ t('Common.QuickConnect') }}
            </span>
          </n-popover>
        </template>

        <n-divider class="!m-0" dashed />

        <n-card :bordered="false" :content-style="{ padding: '0' }" class="h-full">
          <n-flex align="center" class="h-full mt-2">
            <n-text depth="1" class="font-normal">{{ t('Common.Address') }}: </n-text>

            <n-ellipsis style="max-width: 240px">
              <n-text depth="2"> {{ item.address }} </n-text>
            </n-ellipsis>
          </n-flex>
        </n-card>
      </n-card>
    </n-gi>
  </n-grid>

  <n-dropdown
    trigger="manual"
    size="small"
    :x="rightX"
    :y="rightY"
    :show-arrow="true"
    :options="rightOptions"
    :show="showRightDropdown"
    :on-clickoutside="onClickRightOutside"
    @select="handleOptionSelect"
  />
</template>

<script setup lang="ts">
import mittBus from '@renderer/eventBus';
import { ref, watch, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMessage } from 'naive-ui';
import { useContextMenu } from '@renderer/hooks/useContextMenu';
import { useAssetStore } from '@renderer/store/module/assetStore';
import { useHistoryStore } from '@renderer/store/module/historyStore';
import { useAccountModal } from '@renderer/components/MainSection/helper';

import { Desktop } from '@vicons/fa';
import { CheckmarkCircle, CloseCircle } from '@vicons/ionicons5';
import { createConnectToken, getLocalClientUrl } from '@renderer/api/modals/asset';

import type { IListItem, IItemDetail } from '@renderer/components/MainSection/interface';
import type { IAssetDetailMessageReturn, IConnectionData } from '@renderer/hooks/useContextMenu';

withDefaults(
  defineProps<{
    currentLayout: string;
    listData: IListItem[];
  }>(),
  {
    currentLayout: 'list',
    listData: () => []
  }
);

const { t } = useI18n();
const { rightOptions, getAssetDetailMessage, handleOptionSelect } = useContextMenu();

const message = useMessage();
const assetStore = useAssetStore();
const historyStore = useHistoryStore();

const rightX = ref(0);
const rightY = ref(0);

const showRightDropdown = ref(false);
const savedData = ref<Partial<IAssetDetailMessageReturn>>();

const onClickRightOutside = () => {
  showRightDropdown.value = false;
};

const getAssetAccount = (assetId: string) => {
  const assetInfo = assetStore.getAssetMap(assetId);
  return assetInfo?.account?.label;
};

const getAssetProtocol = (assetId: string) => {
  const assetInfo = assetStore.getAssetMap(assetId);
  return assetInfo?.protocol?.label;
};

const handleConnectionError = (
  error: Error | { response?: { data?: { code?: string; error?: string; message?: string } } }
) => {
  console.log(error);
  const errorData = error['response']?.data;

  if (errorData) {
    const serverError = errorData.error || errorData.message || errorData.detail || errorData.code;

    if (serverError.includes('Connect method not support')) {
      message.error(`${t('Message.ConnectMethodNotSupport')}: ${serverError.split(':')[1].trim()}`);
      return;
    }

    if (errorData?.code !== 'notice') {
      message.error(serverError || `${t('Message.AssetNotice')}`);
      return;
    }

    if (errorData?.code !== 'reject') {
      message.error(serverError || `${t('Message.AssetDeny')}`);
      return;
    }

    if (serverError === 'No asset or inactive asset') {
      message.error(t('Message.NoAssetOrInactiveAsset'));
      return;
    }
  } else {
    const errorMessage = error.message || 'Unknown error';
    message.error(errorMessage);
  }
};

const handleContextMenu = async (item: IListItem, event: MouseEvent) => {
  const result = await getAssetDetailMessage(item, event, false);

  if (!result || typeof result === 'boolean') {
    showRightDropdown.value = false;
    message.error(`${t('Message.ErrorGetAssetDetail')}`);
    return;
  }

  // 用于处理用户右键点击，然后去点击外层的 icon 触发连接的逻辑
  const { id, detailMessage, connectionData } = result;

  savedData.value = {
    id,
    detailMessage,
    connectionData
  };

  showRightDropdown.value = true;
  rightX.value = event.clientX;
  rightY.value = event.clientY;
};

const connectionDispatch = async (
  id: string,
  detailMessage: Ref<Partial<IItemDetail>>,
  connectionData: Ref<Partial<IConnectionData>>
) => {
  let method: string;
  const neededInput = assetStore.getAssetMap(id)?.account?.has_secret;

  // 如果账号需要输入密码
  if (!neededInput) {
    const { inputPassword, confirmed } = useAccountModal('@OTHER', t);

    return new Promise<boolean>(resolve => {
      watch(confirmed, async newValue => {
        if (newValue && inputPassword.value) {
          connectionData.value.input_secret = inputPassword.value;

          // 获取连接方法
          switch (connectionData.value.protocol) {
            case 'ssh':
            case 'telnet':
              method = 'ssh_client';
              break;
            case 'rdp':
              method = 'mstsc';
              break;
            case 'sftp':
              method = 'sftp_client';
              break;
            case 'vnc':
              method = 'vnc_client';
              break;
            default:
              method = 'db_client';
          }

          try {
            const token = await createConnectToken(connectionData.value, method);
            if (token) {
              historyStore.setHistorySession({ ...detailMessage.value });

              const res = await getLocalClientUrl(token);
              if (res) {
                mittBus.emit('checkMatch', connectionData.value.protocol as string);
                window.electron.ipcRenderer.send('open-client', res.url);
              }
              resolve(true);
            } else {
              resolve(false);
            }
          } catch (error) {
            handleConnectionError(error as Error | { response?: { data?: { code?: string } } });
            resolve(false);
          }
        } else {
          // 用户取消了输入
          resolve(false);
        }
      });
    });
  }

  // 如果不需要输入密码，直接连接
  switch (connectionData.value.protocol) {
    case 'ssh':
    case 'telnet':
      method = 'ssh_client';
      break;
    case 'rdp':
      method = 'mstsc';
      break;
    case 'sftp':
      method = 'sftp_client';
      break;
    case 'vnc':
      method = 'vnc_client';
      break;
    default:
      method = 'db_client';
  }

  try {
    const token = await createConnectToken(connectionData.value, method);

    if (token) {
      historyStore.setHistorySession({ ...detailMessage.value });

      const res = await getLocalClientUrl(token);
      if (res) {
        mittBus.emit('checkMatch', connectionData.value.protocol as string);
        window.electron.ipcRenderer.send('open-client', res.url);
      }
    } else {
      return false;
    }
  } catch (error) {
    handleConnectionError(error as Error | { response?: { data?: { code?: string } } });
    return false;
  }

  return true;
};

const handleConnect = async (item: IListItem, event: MouseEvent) => {
  try {
    const result = await getAssetDetailMessage(item, event, true);

    if (!result || typeof result === 'boolean') {
      message.error(`${t('Message.ErrorGetAssetDetail')}`);
      return;
    }

    const { id, detailMessage, connectionData } = result;

    // 等待connectionDispatch完成，它现在返回一个Promise
    const success = await connectionDispatch(id, detailMessage, connectionData);

    if (!success) {
      // 如果连接不成功（例如用户取消了输入），可以在这里添加处理逻辑
      console.log('Connection was cancelled or failed');
    }
  } catch (error: unknown) {
    handleConnectionError(error as Error | { response?: { data?: { code?: string } } });
  }
};
</script>
