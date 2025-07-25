import type { PropType } from 'vue';
import type { MenuOption, SelectOption } from 'naive-ui';

import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import { defineComponent, h } from 'vue';
import { setUserRemoving } from '@renderer/api/index';
import SvgIcon from '@renderer/components/SvgIcon/index.vue';
import { Ellipsis, Layers, Star, Trash2 } from 'lucide-vue-next';
import { NAvatar, NButton, NFlex, NModal, NText } from 'naive-ui';

export const menuOptions = () => {
  const { t } = useI18n();

  return [
    {
      label: '资源目录',
      key: 'resource-directory',
      icon: () => <Layers size={16} />,
      children: [
        {
          label: () => (
            <RouterLink to={{ name: 'Linux' }}>
              <span>Linux</span>
            </RouterLink>
          ),
          key: 'linux-page',
          icon: () => <SvgIcon iconName="icon-linux" />
        },
        {
          label: () => (
            <RouterLink to={{ name: 'Windows' }}>
              <span>Windows</span>
            </RouterLink>
          ),
          key: 'windows-page',
          icon: () => <SvgIcon iconName="icon-windows" />
        },
        {
          label: () => (
            <RouterLink to={{ name: 'Database' }}>
              <span>Database</span>
            </RouterLink>
          ),
          key: 'database-page',
          icon: () => <SvgIcon iconName="icon-database" />
        },
        {
          label: () => (
            <RouterLink to={{ name: 'Device' }}>
              <span>Device</span>
            </RouterLink>
          ),
          key: 'device-page',
          icon: () => <SvgIcon iconName="icon-devices" />
        }
      ]
    },
    {
      label: t('Common.Other'),
      key: 'other',
      icon: () => <Ellipsis size={16} />,
      children: [
        {
          label: () => (
            <RouterLink to={{ name: 'Favorite' }}>
              <span>Favorite</span>
            </RouterLink>
          ),
          key: 'favorite-page',
          icon: () => <Star size={16} />
        }
      ]
    }
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
