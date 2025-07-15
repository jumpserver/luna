import { renderIcon } from '@renderer/layouts/components/HeaderSection/helper';
import { useI18n } from 'vue-i18n';
import { h } from 'vue';
import { defineComponent, PropType } from 'vue';

import { BrandWindows, Database, Terminal2, Star } from '@vicons/tabler';
import { NFlex, NAvatar, NText, NButton, NModal } from 'naive-ui';
import { Trash2 } from 'lucide-vue-next';
import { Devices } from '@vicons/carbon';
import { RouterLink } from 'vue-router';
import { setUserRemoving } from '@renderer/api/index';

import type { MenuOption, SelectOption } from 'naive-ui';

export const menuOptions = () => {
  const { t } = useI18n();

  return [
    {
      label: () =>
        h(
          RouterLink,
          {
            to: {
              name: 'Linux'
            }
          },
          { default: () => 'Linux' }
        ),
      key: 'linux-page',
      icon: renderIcon(Terminal2)
    },
    {
      label: () =>
        h(
          RouterLink,
          {
            to: {
              name: 'Windows'
            }
          },
          { default: () => 'Windows' }
        ),
      key: 'windows-page',
      icon: renderIcon(BrandWindows)
    },
    {
      label: () =>
        h(
          RouterLink,
          {
            to: {
              name: 'Database'
            }
          },
          { default: () => t('Router.Database') }
        ),
      key: 'database-page',
      icon: renderIcon(Database)
    },
    {
      label: () =>
        h(
          RouterLink,
          {
            to: {
              name: 'Device'
            }
          },
          { default: () => t('Router.Device') }
        ),
      key: 'device-page',
      icon: renderIcon(Devices)
    },
    {
      label: () =>
        h(
          RouterLink,
          {
            to: {
              name: 'Favorite'
            }
          },
          { default: () => t('Router.Favorite') }
        ),
      key: 'favorite-page',
      icon: renderIcon(Star)
    }
    // {
    //   label: () =>
    //     h(
    //       RouterLink,
    //       {
    //         to: {
    //           name: 'History'
    //         }
    //       },
    //       { default: () => t('Router.History') }
    //     ),
    //   key: 'history-page',
    //   icon: renderIcon(History)
    // }
  ] as MenuOption[];
};

/**
 * @description 获取账号选项渲染 此处必须由于 render-label 必须返回一个 VNode 因此不能写 TSX
 * @param option
 * @returns
 */
export const getAccountOptionsRender = (
  option: SelectOption,
  callback?: (session: string) => void
) => {
  return h(
    NFlex,
    {
      class: 'w-full !gap-x-0',
      align: 'center',
      justify: 'start'
    },
    {
      default: () => [
        h(NAvatar, {
          round: true,
          size: 'small',
          src: option.avatar_url as string,
          class: 'mr-2'
        }),
        h(
          NText,
          {
            depth: 1,
            class: 'font-medium text-sm flex-1'
          },
          { default: () => option.label }
        ),
        h(
          NFlex,
          {
            class: 'ml-auto',
            align: 'center'
          },
          {
            default: () => [
              h(
                NButton,
                {
                  size: 'tiny',
                  type: 'error',
                  round: true,
                  quaternary: true,
                  onClick: e => {
                    e.stopPropagation();
                    // 在删除前设置用户删除状态，防止401错误干扰删除流程
                    setUserRemoving(true);
                    callback?.(option.value as string);
                  }
                },
                {
                  icon: () => {
                    return h(Trash2, {
                      size: 16
                    });
                  }
                }
              )
            ]
          }
        )
      ]
    }
  );
};

export const RemoveAccountConfirm = defineComponent({
  name: 'RemoveAccountConfirm',
  props: {
    showModal: {
      type: Boolean,
      required: true
    },
    onConfirm: {
      type: Function as PropType<() => void>,
      default: undefined
    },
    onCancel: {
      type: Function as PropType<() => void>,
      default: undefined
    }
  },
  setup(props) {
    const { t } = useI18n();

    return () => (
      <NModal
        preset="dialog"
        title={t('Message.RemoveAccount')}
        content={t('Message.RemoveAccountConfirm')}
        positiveText={t('Common.Confirm')}
        negativeText={t('Common.Cancel')}
        class="rounded-lg"
        closable={false}
        showIcon={false}
        show={props.showModal}
        onPositiveClick={props.onConfirm}
        onNegativeClick={props.onCancel}
        positiveButtonProps={{ type: 'error', round: true }}
        negativeButtonProps={{ round: true }}
      />
    );
  }
});
