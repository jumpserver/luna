<template>
  <div>
    <n-descriptions label-placement="top" class="tree-wrapper" :title="t('List of Assets')">
      <n-descriptions-item>
        <n-collapse arrow-placement="left" :default-expanded-names="['asset-tree']">
          <n-collapse-item title="资产树" name="asset-tree">
            <template #header-extra>
              <n-icon size="16px" :component="CheckboxOutline" />
            </template>
            <n-tree
              block-line
              block-node
              expand-on-click
              draggable
              check-on-click
              checkbox-placement="left"
              :show-line="true"
              :pattern="pattern"
              :data="testData"
              :node-props="nodeProps"
              :on-update:expanded-keys="updatePrefixWithExpaned"
            />
          </n-collapse-item>
          <n-collapse-item title="类型树" name="asset-type">
            <n-tree
              block-line
              :pattern="pattern"
              expand-on-click
              :data="data2"
              :node-props="nodeProps"
              :on-update:expanded-keys="updatePrefixWithExpaned"
            />
          </n-collapse-item>
        </n-collapse>
      </n-descriptions-item>
    </n-descriptions>

    <!-- 右键菜单	-->
    <n-dropdown
      trigger="manual"
      placement="bottom-start"
      :show="showDropdownRef"
      :options="optionsRef as any"
      :x="xRef"
      :y="yRef"
      @select="handleSelect"
      @clickoutside="handleClickoutside"
    />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useTreeStore } from '@/stores/modules/tree.ts';
import { reactive, ref, h, onUnmounted, onMounted } from 'vue';
import { getTreeSource, getTreeDetailById } from '@/API/modules/tree';
import ConnectionDialog from '@/components/ConnectionDialog/index.vue';
import { NIcon, TreeOption, DropdownOption, useDialog } from 'naive-ui';
import { Folder, FolderOpenOutline, FileTrayFullOutline, CheckboxOutline } from '@vicons/ionicons5';

import type { Tree } from '@/API/interface';

import mittBus from '@/utils/mittBus.ts';

const treeStore = useTreeStore();
const { t } = useI18n();
const { isAsync } = storeToRefs(treeStore);
const dialog = useDialog();

const pattern = ref('');
const showDialog = ref(false);

let testData = ref<TreeOption[]>([]);
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

const showDropdownRef = ref(false);
const optionsRef = ref<DropdownOption[]>([]);
const xRef = ref(0);
const yRef = ref(0);

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
    onClick: async () => {
      const { id } = option;

      // todo)) 只有资产才能点击
      try {
        if (id) {
          const res = await getTreeDetailById(id as string);

          console.log('res', res);

          dialog.success({
            showIcon: false,
            closeOnEsc: false,
            closable: true,
            autoFocus: true,
            title: `${t('Connect')} - ${res.name}`,
            content: () =>
              h(ConnectionDialog, {
                id: res.id,
                permedAccounts: res.permed_accounts,
                permedProtocols: res.permed_protocols
              }),
            style: {
              width: 'auto'
            }
          });
          showDialog.value = true;
        }
      } catch (e) {
        console.log(e);
      }
    },
    onContextmenu(e: MouseEvent): void {
      optionsRef.value = [option];
      showDropdownRef.value = true;
      xRef.value = e.clientX;
      yRef.value = e.clientY;
      console.log(e.clientX, e.clientY);
      e.preventDefault();
    }
  };
};

// todo)) 由于会出现同一个资产挂载到不同的父节点上的情况，此时点击会将两个资产一同点击，因此不能单纯的拿 id 作为 key，
// todo)) 对于异步加载需要额外处理添加 on-load
const loadTree = async (isAsync: Boolean) => {
  try {
    // 默认异步加载资产树
    const res: Tree[] = await getTreeSource(isAsync);
    const treeMap: { [key: string]: TreeOption } = {};

    res.forEach(node => {
      treeMap[node.id] = {
        key: node.id,
        label: node.name,
        prefix: () =>
          h(NIcon, null, {
            default: () => h(node.isParent ? Folder : FileTrayFullOutline)
          }),
        children: [],
        ...node
      };
    });

    res.forEach(node => {
      if (node.pId && treeMap[node.pId]) {
        treeMap[node.pId]?.children?.push(treeMap[node.id]);
      }
    });

    const data = Object.values(treeMap).filter(node => !node.pId);

    testData.value = data;
  } catch (e) {
    console.log(e);
  }
};

const handleSelect = () => {
  showDropdownRef.value = false;
};

const handleClickoutside = () => {
  showDropdownRef.value = false;
};

onMounted(async () => {
  await loadTree(isAsync.value);
});

mittBus.on('tree-load', () => {
  loadTree(isAsync.value);
});

onUnmounted(() => {
  mittBus.off('tree-load');
});
</script>

<style scoped lang="scss">
.tree-wrapper {
  overflow: hidden;
}
</style>
