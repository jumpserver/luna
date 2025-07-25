import type { Component } from 'vue';

import { h } from 'vue';
import { Search } from '@vicons/tabler';
import { NEmpty, NFlex, NIcon, NInput, NText } from 'naive-ui';
import { Edit16Filled, TagError24Filled } from '@vicons/fluent';
import { CheckCircleRound, DeleteRound, RadioButtonUncheckedRound } from '@vicons/material';

export interface ICustomBody {
  id: string;

  label: string;

  isChecked: boolean;
}

export const renderIcon = (icon: Component) => {
  return () =>
    h(NIcon, null, {
      default: () => h(icon),
    });
};

/**
 * @description 自定义 tag 的 search 部分
 */
export const renderCustomInput = (items: Array<ICustomBody>) => {
  if (items.length > 0) {
    return h(
      'div',
      {
        style: 'display: flex; align-items: center; padding: 8px 12px;',
      },
      [
        h(
          NInput,
          {
            round: true,
            clearable: true,
            size: 'small',
            placeholder: 'Search Tags',
            style: 'border-radius: 10px; font-size: 12px',
          },
          {
            prefix: () =>
              h(NIcon, null, {
                default: () => h(Search),
              }),
          },
        ),
      ],
    );
  }

  return null;
};

/**
 * @description 自定义 tag 的 body 部分
 * @param items
 */
export const renderCustomBody = (items: Array<ICustomBody>) => {
  if (items.length > 0) {
    return items.map((item) => {
      return h(
        NFlex,
        {
          key: item?.id,
          style: 'flex-wrap: wrap; padding: 8px 12px;',
        },
        {
          default: () => [
            h(
              NFlex,
              {
                justify: 'space-between',
                style: 'width: 100%',
              },
              {
                default: () => [
                  // check 图标和 label 部分
                  h(
                    NFlex,
                    {
                      align: 'center',
                      style: 'cursor: pointer',
                    },
                    {
                      default: () => [
                        h(
                          NIcon,
                          {
                            size: 20,
                            color: item?.isChecked ? '#4C917D' : '#fff',
                            style: 'cursor: pointer',
                          },
                          {
                            default: () =>
                              h(item?.isChecked ? CheckCircleRound : RadioButtonUncheckedRound),
                          },
                        ),
                        h(NText, { depth: 3 }, { default: () => item?.label }), // 保持不变
                      ],
                    },
                  ),
                  // suffix 部分
                  h(
                    NFlex,
                    {
                      align: 'center',
                      style: 'cursor: pointer',
                    },
                    {
                      default: () => [
                        h(
                          NIcon,
                          {
                            size: 16,
                            color: '#fff',
                          },
                          {
                            default: () => h(Edit16Filled),
                          },
                        ),
                        h(
                          NIcon,
                          {
                            size: 16,
                            color: '#fff',
                          },
                          {
                            default: () => h(DeleteRound),
                          },
                        ),
                      ],
                    },
                  ),
                ],
              },
            ),
          ],
        },
      );
    });
  }

  return h(
    NEmpty,
    {
      style: 'padding: 12px 12px',
      description: 'You don\'t have any tags yet',
    },
    {
      icon: renderIcon(TagError24Filled),
    },
  );
};

/**
 * @description 通用的 select label
 */
export const createLabel = (iconComponent: Component, label: string) => {
  return h(
    NFlex,
    {
      align: 'center',
      style: { flexwrap: 'nowrap' },
    },
    {
      default: () => [
        h(NIcon, {
          size: '16',
          component: iconComponent,
        }),
        h(
          NText,
          { depth: 1, tag: 'div', style: { color: 'inherit' } },
          {
            default: () => label,
          },
        ),
      ],
    },
  );
};
