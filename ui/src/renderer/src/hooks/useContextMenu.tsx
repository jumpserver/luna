import type { Ref } from 'vue';
import type { DropdownOption, ConfigProviderProps } from 'naive-ui';
import type { IListItem, IItemDetail } from '@renderer/components/MainSection/interface';
import type { Permed_protocols, Permed_accounts } from '@renderer/components/MainSection/interface';

import mittBus from '@renderer/eventBus';

import {
  NFlex,
  NText,
  NScrollbar,
  useLoadingBar,
  NDescriptions,
  NDescriptionsItem,
  lightTheme,
  darkTheme,
  createDiscreteApi
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { ref, computed, watch, nextTick } from 'vue';
import { useElectronConfig } from './useElectronConfig';
import { useAccountModal } from '@renderer/components/MainSection/helper';
import { useAssetStore } from '@renderer/store/module/assetStore';
import { createConnectToken, getAssetDetail, getLocalClientUrl } from '@renderer/api/modals/asset';
import { useHistoryStore } from '@renderer/store/module/historyStore';

import { Eye, FileText, UsersRound, UserRoundCheck, Check } from 'lucide-vue-next';

export interface IConnectionData {
  asset: string;
  account: string;
  protocol: string;
  input_username: string;
  input_secret: string;
}

export interface IAssetDetailMessageReturn {
  id: string;
  detailMessage: Ref<Partial<IItemDetail>>;
  connectionData: Ref<Partial<IConnectionData>>;
}

export const useContextMenu = () => {
  const { t } = useI18n();
  const { getDefaultSetting } = useElectronConfig();

  const loadingBar = useLoadingBar();
  const assetStore = useAssetStore();
  const historyStore = useHistoryStore();

  const selectedAccount = ref('');
  const selectedProtocol = ref('');

  const defaultTheme = ref('');

  const connectionData: Ref<Partial<IConnectionData>> = ref({});
  const detailMessage: Ref<Partial<IItemDetail>> = ref({});
  const rightOptions: Ref<DropdownOption[]> = ref([
    // {
    //   label: t('Common.QuickConnect'),
    //   key: 'connect-direction',
    //   icon: () => <Link size={16} />
    // },
    {
      label: t('Common.AssetDetails'),
      icon: () => <Eye size={16} />,
      key: 'asset-details'
    },
    {
      type: 'divider',
      key: 'd1'
    },
    {
      label: t('Common.ConnectionProtocol'),
      key: 'optional-protocol',
      icon: () => <FileText size={16} />,
      children: []
    },
    {
      label: t('Common.AccountList'),
      key: 'available-account',
      icon: () => <UsersRound size={16} />,
      children: []
    }
  ]);

  getDefaultSetting().then(res => {
    if (res) {
      defaultTheme.value = res.theme;
    }
  });

  const configProviderPropsRef = computed<ConfigProviderProps>(() => ({
    theme: defaultTheme.value === 'light' ? lightTheme : darkTheme
  }));

  const { modal } = createDiscreteApi(['modal'], {
    configProviderProps: configProviderPropsRef
  });

  const createModal = () => {
    modal.create({
      title: t('Common.AssetDetails'),
      preset: 'card',
      bordered: false,
      style: {
        width: '40rem',
        maxHeight: '80vh',
        borderRadius: '10px'
      },
      content: () => {
        return (
          <NScrollbar style="max-height: 60vh; overflow-y: auto;">
            <NDescriptions label-placement="left" column={1} bordered>
              <NDescriptionsItem label={t('Common.PlatformInfo')}>
                {t('Common.PlatformID')}: {detailMessage?.value?.platform.id || ''}
                <br />
                {t('Common.PlatformName')}: {detailMessage?.value?.platform.name || ''}
              </NDescriptionsItem>
              <NDescriptionsItem label={t('Common.PlatformID')}>
                {detailMessage?.value?.platform.id || ''}
              </NDescriptionsItem>
              <NDescriptionsItem label={t('Common.PlatformName')}>
                {detailMessage.value.category.label}
              </NDescriptionsItem>
              <NDescriptionsItem label={t('Common.Connectivity')}>
                {detailMessage.value.connectivity.label}
              </NDescriptionsItem>
              <NDescriptionsItem label={t('Common.Category')}>
                {detailMessage.value.nodes.map(node => {
                  return <div key={node.id}>{`${node.name} (ID: ${node.id})`}</div>;
                })}
              </NDescriptionsItem>
              <NDescriptionsItem label={t('Common.Nodes')}>
                {detailMessage.value.permed_protocols.map(protocol => {
                  return (
                    <div key={protocol.name}>{`${protocol.name} (Port: ${protocol.port})`}</div>
                  );
                })}
              </NDescriptionsItem>
              <NDescriptionsItem label={t('Common.PermedAccounts')}>
                {detailMessage.value.permed_accounts.map(account => {
                  return (
                    <div
                      key={account.id}
                    >{`${account.name} (${account.username || t('Common.NoUsername')})`}</div>
                  );
                })}
              </NDescriptionsItem>
            </NDescriptions>
          </NScrollbar>
        );
      }
    });
  };

  const handleConnection = async () => {
    let method: string;
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

    const token = await createConnectToken(connectionData.value, method);

    if (token) {
      mittBus.emit('checkMatch', connectionData.value.protocol as string);
      historyStore.setHistorySession({ ...detailMessage.value });
      getLocalClientUrl(token).then(res => {
        if (res) {
          window.electron.ipcRenderer.send('open-client', res.url);
        }
      });
    }
  };

  const handleManualSelect = (account: Permed_accounts | '', protocol: Permed_protocols | '') => {
    if (account) {
      selectedAccount.value = account.id;
    }

    if (protocol) {
      selectedProtocol.value = protocol.name;
    }

    nextTick(() => {
      const originalMessage = assetStore.getAssetMap(detailMessage.value.id!);

      if (account && account.alias === '@USER') {
        connectionData.value.account = '@USER';
        connectionData.value.input_username = originalMessage?.account?.username as string;

        if (!originalMessage?.account?.has_secret) {
          const { inputPassword, confirmed } = useAccountModal('@USER', t);

          watch(confirmed, async newValue => {
            if (newValue && inputPassword.value) {
              connectionData.value = {
                asset: detailMessage.value.id,
                account: '@USER',
                protocol: assetStore.getAssetMap(detailMessage.value.id!)?.protocol?.key as string,
                input_username: '',
                input_secret: inputPassword.value
              };

              await handleConnection();
            }
          });
        }
      }

      if (account && account.alias === '@INPUT') {
        connectionData.value.account = '@INPUT';

        const { inputPassword, inputUsername, confirmed } = useAccountModal('@INPUT', t);

        watch(confirmed, async newValue => {
          if (newValue && inputUsername.value && inputPassword.value) {
            connectionData.value = {
              asset: detailMessage.value.id,
              account: '@INPUT',
              protocol: assetStore.getAssetMap(detailMessage.value.id!)?.protocol?.key as string,
              input_username: inputUsername.value,
              input_secret: inputPassword.value
            };

            await handleConnection();
          }
        });
      }

      const newAssetMap = {
        account: {
          type: 'render',
          has_secret: account ? account?.has_secret : originalMessage?.account?.has_secret,
          alias: account ? account?.alias : originalMessage?.account?.alias,
          label: account ? account.name : originalMessage?.account?.label,
          key: account ? account?.id : originalMessage?.account?.key,
          id: account ? account?.id : originalMessage?.account?.id,
          name: account ? account?.name : originalMessage?.account?.name,
          username: account ? account?.username : originalMessage?.account?.username,
          secret_type: account ? account?.secret_type : originalMessage?.account?.secret_type
        },
        protocol: {
          type: 'render',
          key: protocol ? protocol.name : originalMessage?.protocol?.key,
          label: protocol ? protocol.name : originalMessage?.protocol?.label

          // name: protocol ? protocol.name : originalMessage?.protocol?.name,
          // port: protocol ? protocol.port : originalMessage?.protocol?.port,
          // public: protocol ? protocol.public : originalMessage?.protocol?.public,
        }
      };

      assetStore.setAssetMap(detailMessage.value.id!, newAssetMap);
    });
  };

  const getAssetDetailMessage = async (
    item: IListItem,
    event: MouseEvent,
    isQuickConnect: boolean = false
  ): Promise<boolean | IAssetDetailMessageReturn> => {
    loadingBar.start();
    event.stopPropagation();

    try {
      const assetDetail: IItemDetail = await getAssetDetail(item.id);
      detailMessage.value = assetDetail;

      if (assetDetail) {
        // prettier-ignore
        const accountMenuItem: DropdownOption = rightOptions.value.find( option => option.key === 'available-account')!;
        // prettier-ignore
        const protocolMenuItem: DropdownOption = rightOptions.value.find(option => option.key === 'optional-protocol')!;

        selectedProtocol.value = assetStore.getAssetMap(assetDetail.id!)?.protocol?.key as string;
        selectedAccount.value = assetStore.getAssetMap(assetDetail.id!)?.account?.key as string;

        protocolMenuItem!.children = assetDetail.permed_protocols
          .filter((protocol: Permed_protocols) => protocol.public)
          .map(protocol => ({
            type: 'render',
            render: () => {
              return (
                <NFlex
                  justify="space-between"
                  align="center"
                  class={`w-full px-4 py-1 cursor-pointer !flex-nowrap ${
                    defaultTheme.value === 'light'
                      ? 'hover:bg-[#F3F3F5]'
                      : 'hover:bg-[rgba(255,255,255,0.09)]'
                  }`}
                  onClick={() => handleManualSelect('', protocol)}
                >
                  <NText class="min-w-20">{protocol.name}</NText>
                  {selectedProtocol.value === protocol.name && (
                    <Check
                      size={14}
                      color={defaultTheme.value === 'light' ? '#18a058' : '#63e2b7'}
                    />
                  )}
                </NFlex>
              );
            },
            key: protocol.name,
            label: protocol.name
          })) as DropdownOption[];

        accountMenuItem!.children = [
          {
            type: 'render',
            key: 'account-scrollbar',
            render: () => {
              return (
                <NScrollbar style="max-height: 240px">
                  <NFlex vertical class="!gap-0">
                    {assetDetail.permed_accounts
                      .filter((account: Permed_accounts) => account.alias !== '@ANON')
                      .map(account => (
                        <NFlex
                          key={account.id}
                          justify="space-between"
                          align="center"
                          class={`w-full px-4 py-1 cursor-pointer !flex-nowrap ${
                            defaultTheme.value === 'light'
                              ? 'hover:bg-[#F3F3F5]'
                              : 'hover:bg-[rgba(255,255,255,0.09)]'
                          }`}
                          onClick={() => handleManualSelect(account, '')}
                        >
                          <NText class="min-w-40">
                            {account.name +
                              (account.alias === account.username || account.alias.startsWith('@')
                                ? ''
                                : '(' + account.username + ')')}
                          </NText>
                          {selectedAccount.value === account.id && (
                            <UserRoundCheck
                              size={14}
                              color={defaultTheme.value === 'light' ? '#18a058' : '#63e2b7'}
                            />
                          )}
                        </NFlex>
                      ))}
                  </NFlex>
                </NScrollbar>
              );
            }
          }
        ] as DropdownOption[];

        if (!assetStore.getAssetMap(assetDetail.id!)) {
          // 获取第一个非特殊账号
          // 直接从 assetDetail.permed_accounts 中获取第一个符合条件的账号
          const firstNormalAccount = assetDetail.permed_accounts.find(
            (account: Permed_accounts) =>
              account.alias !== '@USER' && account.alias !== '@INPUT' && account.alias !== '@ANON'
          );

          // 获取第一个协议
          const firstProtocol = assetDetail.permed_protocols.find(
            (protocol: Permed_protocols) => protocol.public
          );

          if (firstNormalAccount && firstProtocol) {
            const accountObject = {
              type: 'render',
              has_secret: firstNormalAccount.has_secret,
              alias: firstNormalAccount.alias,
              label: firstNormalAccount.name,
              key: firstNormalAccount.id,
              id: firstNormalAccount.id,
              name: firstNormalAccount.name,
              username: firstNormalAccount.username,
              secret_type: firstNormalAccount.secret_type
            };

            const protocolObject = {
              type: 'render',
              key: firstProtocol.name,
              label: firstProtocol.name
            };

            assetStore.setAssetMap(detailMessage.value.id!, {
              account: accountObject,
              protocol: protocolObject
            });

            // 更新连接数据
            connectionData.value = {
              asset: assetDetail.id,
              account: firstNormalAccount.id,
              protocol: firstProtocol.name,
              input_username: firstNormalAccount.username || '',
              input_secret: ''
            };
          } else {
            console.error('No suitable account or protocol found');
          }
        } else {
          const originalMessage = assetStore.getAssetMap(detailMessage.value.id!);
          // 只在快速连接时处理特殊账号类型
          if (
            isQuickConnect &&
            ['@USER', '@INPUT'].includes(originalMessage.account.alias as string)
          ) {
            if (originalMessage.account.alias === '@USER') {
              const { inputPassword, confirmed } = useAccountModal('@USER', t);
              watch(confirmed, async newValue => {
                if (newValue && inputPassword.value) {
                  connectionData.value = {
                    asset: detailMessage.value.id,
                    account: '@USER',
                    protocol: originalMessage.protocol.key as string,
                    input_username: '',
                    input_secret: inputPassword.value
                  };
                  await handleConnection();
                }
              });
            } else {
              const { inputPassword, inputUsername, confirmed } = useAccountModal('@INPUT', t);
              watch(confirmed, async newValue => {
                if (newValue && inputUsername.value && inputPassword.value) {
                  connectionData.value = {
                    asset: detailMessage.value.id,
                    account: '@INPUT',
                    protocol: originalMessage.protocol.key as string,
                    input_username: inputUsername.value,
                    input_secret: inputPassword.value
                  };
                  await handleConnection();
                }
              });
            }
          } else {
            connectionData.value = {
              asset: assetDetail.id,
              account: originalMessage.account.id as string,
              protocol: originalMessage.protocol.key as string,
              input_username: originalMessage.account.username as string,
              input_secret: ''
            };
          }
        }
      }

      return Promise.resolve({
        id: detailMessage.value.id!,
        detailMessage: detailMessage,
        connectionData: connectionData
      } as IAssetDetailMessageReturn);
    } catch (e) {
      return Promise.resolve(false);
    } finally {
      loadingBar.finish();
    }
  };

  const handleOptionSelect = (key: string) => {
    switch (key) {
      case 'asset-details':
        createModal();
        break;
      case 'connect-direction':
        break;
      case 'optional-protocol':
        break;
    }
  };

  const handleThemeChange = (theme: string) => {
    switch (theme) {
      case 'light':
        defaultTheme.value = 'dark';
        break;
      case 'dark':
        defaultTheme.value = 'light';
        break;
    }
  };

  mittBus.on('changeTheme', handleThemeChange);

  return {
    rightOptions,
    handleOptionSelect,
    getAssetDetailMessage
  };
};
