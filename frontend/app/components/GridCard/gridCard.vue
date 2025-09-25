<script setup lang="ts">
import type { ContextMenuItem } from '@nuxt/ui';
import type { PermedAccount, PermedProtocol } from '~/types/index';
import { useUserInfoStore } from '~/store/modules/userInfo';

interface DetailRow {
  key: string;
  title: string;
  content: string;
  popover?: boolean;
  class?: string;
}

const props = withDefaults(
  defineProps<{
    zone: string;
    user: string;
    assetId: string;
    address: string;
    iconName: string;
    protocol: string;
    assetName: string;
    highlight: boolean;
    accounts?: PermedAccount[];
    protocols?: PermedProtocol[];
  }>(),
  {
    accounts: () => [],
    protocols: () => [],
  }
);

const emits = defineEmits<{
  (e: 'openEditModal'): void;
}>();

const { t, locale } = useI18n();
const userInfoStore = useUserInfoStore();
const {
  getConnectToken,
  dispatchConnectMethod,
  getUserId,
  generateConnectOptions,
} = useAssetConnect();

// prettier-ignore
const { currentConnectionInfoMap } = storeToRefs(userInfoStore);

const showEdit = ref(false);
const items = ref<ContextMenuItem[][]>([
  [
    {
      label: t('ContextMenu.QuickConnect'),
      icon: 'i-lucide-unplug',
    },
    {
      label: t('ContextMenu.Connect'),
      icon: 'i-lucide-plug',
      children: [
        {
          label: `${t('ContextMenu.Use')} SSH`,
        },
        {
          label: `${t('ContextMenu.Use')} SFTP`,
        },
      ],
    },
    {
      label: t('ContextMenu.Rename'),
      icon: 'i-lucide-pencil',
    },
  ],
]);

const openEditModal = () => {
  emits('openEditModal');
};

const handleMouseOver = () => {
  showEdit.value = true;
};

const handleMouseLeave = () => {
  showEdit.value = false;
};

const displayProtocol = computed(() => {
  const saved = currentConnectionInfoMap.value[props.assetId];
  return saved?.protocol ?? props.protocol;
});

const displayUser = computed(() => {
  const saved = currentConnectionInfoMap.value[props.assetId];
  return saved?.username ?? props.user;
});

const labelMinWidth = computed(() =>
  locale.value.startsWith('zh') ? '24px' : '72px'
);

const labelColumnTemplate = computed(
  () => `minmax(${labelMinWidth.value}, max-content) 1fr`
);

const detailRows = computed(() => {
  const list: Array<DetailRow> = [
    {
      key: 'address',
      title: t('AssetCard.Address'),
      content: props.address,
      popover: true,
      class: 'max-w-40 font-mono',
    },
    {
      key: 'user',
      title: t('AssetCard.User'),
      content: displayUser.value,
    },
    {
      key: 'protocol',
      title: t('AssetCard.Protocol'),
      content: displayProtocol.value,
    },
  ];

  return list;
});

const handleConnect = () => {
  getConnectToken({
    asset: props.assetId,
    protocol: displayProtocol.value,
    input_username: displayUser.value,
    input_secret: '',
    account: getUserId(props.accounts, props.assetId, props.user),
    connect_method: dispatchConnectMethod(displayProtocol.value),
    connect_options: generateConnectOptions(),
  });
};
</script>

<template>
  <UPageCard
    class="w-full"
    variant="subtle"
    highlight-color="primary"
    :highlight="highlight"
    :ui="{
      body: 'sm:p-2',
    }"
    @mouseover="handleMouseOver"
    @mouseleave="handleMouseLeave"
  >
    <UContextMenu
      size="sm"
      :items="items"
      :ui="{
        content: 'w-48',
      }"
    >
      <section class="flex gap-4 flex-nowrap items-center w-full">
        <div class="flex items-center w-full gap-1">
          <div class="flex flex-col flex-1 gap-1 text-xs-plus min-w-0">
            <div class="flex justify-between">
              <section class="flex">
                <div class="flex items-center gap-2">
                  <UChip>
                    <UAvatar
                      size="lg"
                      :icon="iconName"
                      :ui="{ root: 'rounded-md', icon: 'size-6' }"
                    />
                  </UChip>

                  <span class="text-sm font-bold line-clamp-1">
                    {{ assetName }}
                  </span>
                </div>
              </section>

              <section class="flex items-center gap-2">
                <UButton
                  icon="i-lucide-rocket"
                  size="xs"
                  color="primary"
                  variant="outline"
                  class="group !gap-0"
                  @click="handleConnect"
                >
                  <!-- prettier-ignore -->
                  <span
										class="inline-block overflow-hidden whitespace-nowrap max-w-0 opacity-0 ml-0
                           transition-all duration-400 ease-in-out group-hover:max-w-[12rem] group-hover:opacity-100 group-hover:ml-1
                           group-focus:max-w-[12rem] group-focus:opacity-100 group-focus:ml-1"
									>
										{{ t('ContextMenu.Connect') }}
									</span>
                </UButton>

                <UButton
                  icon="i-lucide-square-pen"
                  size="xs"
                  color="primary"
                  variant="outline"
                  @click="openEditModal"
                />
              </section>
            </div>

            <USeparator orientation="horizontal" size="md" class="h-2" />

            <div class="flex flex-col gap-1 text-xs-plus">
              <div
                v-for="row in detailRows"
                :key="row.key"
                class="grid items-center gap-x-3 gap-y-1"
                :style="{ gridTemplateColumns: labelColumnTemplate }"
              >
                <span
                  class="text-neutral-500 dark:text-neutral-400 whitespace-nowrap"
                >
                  {{ row.title }}
                </span>

                <div class="min-w-0">
                  <template v-if="row.popover">
                    <UTooltip arrow :text="row.content">
                      <span :class="row.class">
                        {{ row.content }}
                      </span>
                    </UTooltip>
                  </template>

                  <template v-else>
                    <span :class="row.class">
                      {{ row.content }}
                    </span>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </UContextMenu>
  </UPageCard>
</template>
