<template>
  <n-tabs type="segment" animated>
    <n-tab-pane name="chap1" tab="资产树">
      <n-input v-model:value="pattern" placeholder="搜索" />
      <n-tree
        block-line
        :pattern="pattern"
        expand-on-click
        :data="data1"
        :node-props="nodeProps"
        :on-update:expanded-keys="updatePrefixWithExpaned"
      />
    </n-tab-pane>
    <n-tab-pane name="chap2" tab="类型树">
      <n-input v-model:value="pattern" placeholder="搜索" />
      <n-tree
        block-line
        :pattern="pattern"
        expand-on-click
        :data="data2"
        :node-props="nodeProps"
        :on-update:expanded-keys="updatePrefixWithExpaned"
      />
    </n-tab-pane>
  </n-tabs>
</template>

<script setup lang="ts">
import { reactive, ref, h } from 'vue';
import { useMessage, NIcon, TreeOption } from 'naive-ui';
import { Folder, FolderOpenOutline, FileTrayFullOutline } from '@vicons/ionicons5';

const message = useMessage();
const pattern = ref('');
const data1 = reactive([
  {
    key: '收藏夹',
    label: '收藏夹',
    prefix: () =>
      h(NIcon, null, {
        default: () => h(Folder)
      }),
    children: [
      {
        key: '空的',
        label: '空的',
        disabled: true,
        prefix: () =>
          h(NIcon, null, {
            default: () => h(Folder)
          })
      },
      {
        key: '我的文件',
        label: '我的文件',
        prefix: () =>
          h(NIcon, null, {
            default: () => h(Folder)
          }),
        children: [
          {
            label: 'template.txt',
            key: 'template.txt',
            prefix: () =>
              h(NIcon, null, {
                default: () => h(FileTrayFullOutline)
              })
          }
        ]
      }
    ]
  },
  {
    key: 'Default',
    label: 'Default',
    prefix: () =>
      h(NIcon, null, {
        default: () => h(Folder)
      }),
    children: [
      {
        key: '空的',
        label: '空的',
        disabled: true,
        prefix: () =>
          h(NIcon, null, {
            default: () => h(Folder)
          })
      },
      {
        key: '我的文件',
        label: '我的文件',
        prefix: () =>
          h(NIcon, null, {
            default: () => h(Folder)
          }),
        children: [
          {
            label: 'template.txt',
            key: 'template.txt',
            prefix: () =>
              h(NIcon, null, {
                default: () => h(FileTrayFullOutline)
              })
          }
        ]
      }
    ]
  }
]);
const data2 = reactive([
  {
    key: '所有类型',
    label: '所有类型',
    prefix: () =>
      h(NIcon, null, {
        default: () => h(Folder)
      }),
    children: [
      {
        key: '空的',
        label: '空的',
        disabled: true,
        prefix: () =>
          h(NIcon, null, {
            default: () => h(Folder)
          })
      },
      {
        key: '我的文件',
        label: '我的文件',
        prefix: () =>
          h(NIcon, null, {
            default: () => h(Folder)
          }),
        children: [
          {
            label: 'template.txt',
            key: 'template.txt',
            prefix: () =>
              h(NIcon, null, {
                default: () => h(FileTrayFullOutline)
              })
          }
        ]
      }
    ]
  }
]);
const updatePrefixWithExpaned = (
  _keys: Array<string | number>,
  _option: Array<TreeOption | null>,
  meta: {
    node: TreeOption | null;
    action: 'expand' | 'collapse' | 'filter';
  }
) => {
  if (!meta.node) return;
  switch (meta.action) {
    case 'expand':
      meta.node.prefix = () =>
        h(NIcon, null, {
          default: () => h(FolderOpenOutline)
        });
      break;
    case 'collapse':
      meta.node.prefix = () =>
        h(NIcon, null, {
          default: () => h(Folder)
        });
      break;
  }
};
const nodeProps = ({ option }: { option: TreeOption }) => {
  return {
    onClick() {
      if (!option.children && !option.disabled) {
        message.info('[Click] ' + option.label);
      }
    }
  };
};
</script>

<style scoped lang="scss"></style>
