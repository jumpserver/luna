<script setup lang="ts">
import type { ContextMenuItem } from '@nuxt/ui';
import { useUserInfoStore } from '~/store/modules/userInfo';

interface DetailRow {
  key: string;
  title: string;
  content: string;
  popover?: boolean;
  class?: string;
}

const props = defineProps<{
  assetId: string;
  zone: string;
  address: string;
  iconName: string;
  protocol: string;
  assetName: string;
  user: string;
}>();

const emits = defineEmits<{
  (e: 'openEditModal'): void;
}>();

// stacked details below the header

const { t } = useI18n();
const userInfoStore = useUserInfoStore();
const { connectionInfoMap } = storeToRefs(userInfoStore);

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
  const saved = connectionInfoMap.value[props.assetId];
  return saved?.protocol ?? props.protocol;
});

const displayUser = computed(() => {
  const saved = connectionInfoMap.value[props.assetId];
  return saved?.username ?? props.user;
});

const detailRows = computed(() => {
  const list: Array<DetailRow> = [];

  // prettier-ignore
  list.push({ key: 'address', title: t('AssetCard.Address'), content: props.address, popover: true, class: 'max-w-40 font-mono' });
  // prettier-ignore
  list.push({ key: 'user', title: t('AssetCard.User'), content: displayUser.value });
  list.push({
    key: 'protocol',
    title: t('AssetCard.Protocol'),
    content: displayProtocol.value,
  });

  return list;
});
</script>

<template>
  <UCard
    variant="outline"
    :ui="{
      header: 'p-2',
      body: 'sm:px-4 sm:py-4',
    }"
    class="hover:cursor-pointer w-full"
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
          <div class="flex flex-col flex-1 gap-2 text-xs-plus min-w-0">
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
                >
                  {{ t('ContextMenu.Connect') }}
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

            <USeparator orientation="horizontal" size="sm" class="h-1" />

            <div class="flex flex-col gap-1 text-xs-plus">
              <div
                v-for="row in detailRows"
                :key="row.key"
                class="grid grid-cols-[minmax(64px,max-content)_1fr] items-center gap-x-3 gap-y-1"
              >
                <span class="text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                  {{ row.title }}
                </span>

                <div class="min-w-0">
                  <template v-if="row.popover">
                    <UPopover arrow mode="hover" :open-delay="500">
                      <span class="truncate" :class="row.class">
                        {{ row.content }}
                      </span>
                      <template #content>
                        <p class="p-2 text-xs-plus font-mono">
                          {{ row.content }}
                        </p>
                      </template>
                    </UPopover>
                  </template>

                  <template v-else>
                    <span class="truncate" :class="row.class">
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
  </UCard>
</template>
