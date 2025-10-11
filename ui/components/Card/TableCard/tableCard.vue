<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';
import type { AssetItem, PermedAccount } from '~/types';

import { h, resolveComponent } from 'vue';
import { useUserInfoStore } from '~/store/modules/userInfo';

const UButton = resolveComponent('UButton');
const UBadge = resolveComponent('UBadge');

const emits = defineEmits<{
  (e: 'openEditModal', asset: AssetItem): void;
}>();

const props = defineProps<{
  items: AssetItem[];
}>();

const userInfoStore = useUserInfoStore();

const { t } = useI18n();
const { currentConnectionInfoMap } = storeToRefs(userInfoStore);
const {
  getConnectToken,
  dispatchConnectMethod,
  getUserId,
  generateConnectOptions,
} = useAssetConnect();

const displayProtocol = (asset: AssetItem) => {
  const saved = currentConnectionInfoMap.value[asset.id];
  return saved?.protocol || asset.permed_protocols?.[0]?.name || '';
};

const displayUser = (asset: AssetItem) => {
  const saved = currentConnectionInfoMap.value[asset.id];
  return saved?.username || asset.permed_accounts?.[0]?.username || '';
};

const handleConnect = (asset: AssetItem) => {
  const protocol = displayProtocol(asset);
  const selected = displayUser(asset);
  const accounts = (asset.permed_accounts || []) as PermedAccount[];

  const saved = currentConnectionInfoMap.value[asset.id];
  let input_username = '';
  let input_secret = '';

  const mode = saved?.accountMode;

  if (mode === 'manual' || selected === '手动输入' || selected === 'Manual input') {
    input_username = saved?.manualUsername || '';
    input_secret = saved?.manualPassword || '';
  } else if (mode === 'dynamic' || selected?.includes('同名账号') || selected?.includes('Dynamic user')) {
    input_username = '';
    input_secret = saved?.dynamicPassword || '';
  }

  getConnectToken({
    asset: asset.id,
    protocol,
    input_username,
    input_secret,
    account: getUserId(accounts, asset.id, selected),
    connect_method: dispatchConnectMethod(protocol),
    connect_options: generateConnectOptions(),
  });
};

const columns: TableColumn<AssetItem>[] = [
  {
    accessorKey: 'assetName',
    header: () => t('AssetCard.AssetName'),
    cell: ({ row }) => row.original.assetName,
  },
  {
    accessorKey: 'address',
    header: () => t('AssetCard.Address'),
  },
  {
    id: 'user',
    header: () => t('AssetCard.User'),
    cell: ({ row }) => displayUser(row.original),
  },
  {
    id: 'protocol',
    header: () => t('AssetCard.Protocol'),
    cell: ({ row }) => displayProtocol(row.original),
  },
  {
    id: 'status',
    header: () => t('AssetCard.Status'),
    cell: ({ row }) =>
      h(
        UBadge,
        {
          variant: 'subtle',
          color: row.original.isActive ? 'success' : 'error',
        },
        () =>
          row.original.isActive ? t('Common.Active') : t('Common.Inactive')
      ),
  },
  {
    id: 'actions',
    header: () => t('AssetCard.Actions'),
    cell: ({ row }) =>
      h('div', { class: 'flex  gap-2' }, [
        h(UButton, {
          icon: 'heroicons:rocket-launch',
          size: 'xs',
          color: 'primary',
          variant: 'outline',
          onClick: () => handleConnect(row.original),
        }),
        h(UButton, {
          icon: 'solar:pen-new-square-linear',
          size: 'xs',
          color: 'primary',
          variant: 'outline',
          onClick: () => emits('openEditModal', row.original),
        }),
      ]),
  },
];
</script>

<template>
  <UCard variant="outline" class="w-full">
    <UTable
      sticky
      :data="props.items"
      :columns="columns"
      class="flex-1"
      :ui="{ tr: 'hover:bg-muted/50' }"
    />
  </UCard>
</template>
