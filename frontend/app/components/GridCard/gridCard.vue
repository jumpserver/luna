<script setup lang="ts">
import type { ContextMenuItem } from '@nuxt/ui';
import { useUserInfoStore } from '~/store/modules/userInfo';

interface BadgeItemList {
  key: string;
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

const cycleColors = ['primary', 'info', 'neutral', 'warning'] as const;

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

const badgeItems = computed(() => {
  const list: Array<BadgeItemList> = [];

  // prettier-ignore
  list.push({ key: "address", content: props.address, popover: true, class: "max-w-24" });
  // prettier-ignore
  // list.push({ key: "zone", content: props.zone, popover: true, class: "max-w-24" });
  list.push({ key: "user", content: displayUser.value });
  list.push({ key: 'protocol', content: displayProtocol.value });

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
        <UAvatar
          size="lg"
          :icon="iconName"
          :ui="{ root: 'rounded-md', icon: 'size-6' }"
        />

        <div class="flex flex-col flex-1 gap-2 text-xs-plus min-w-0">
          <div class="flex justify-between">
            <section class="flex items-center gap-2">
              <UPopover arrow mode="hover">
                <div class="w-2 h-2 bg-primary rounded-full" />

                <template #content>
                  <div class="text-xs-plus text-center p-2">
                    {{ t('AssetCard.Activated') }}
                  </div>
                </template>
              </UPopover>

              <span class="text-sm font-semibold line-clamp-1">
                {{ assetName }}
              </span>
            </section>
          </div>

          <USeparator orientation="horizontal" size="sm" class="h-1" />

          <div class="flex items-center gap-2">
            <template
              v-for="(badge, idx) in badgeItems"
              :key="`${badge.key}-${idx}`"
            >
              <UBadge
                :color="cycleColors[idx % cycleColors.length]"
                variant="soft"
                :class="badge.class"
              >
                <template v-if="badge.popover">
                  <UPopover arrow mode="hover" :open-delay="500">
                    <span class="text-overflow-ellipsis">
                      {{ badge.content }}
                    </span>
                    <template #content>
                      <p class="p-2 text-xs-plus">
                        {{ badge.content }}
                      </p>
                    </template>
                  </UPopover>
                </template>
                <template v-else>
                  {{ badge.content }}
                </template>
              </UBadge>
              <USeparator
                v-if="idx < badgeItems.length - 1"
                orientation="vertical"
                size="sm"
                class="h-4"
              />
            </template>
          </div>
        </div>

        <UButton
          v-if="showEdit"
          size="sm"
          variant="ghost"
          color="neutral"
          class="rounded-lg shrink-0"
          icon="i-lucide-square-pen"
          @click="openEditModal"
        />
      </section>
    </UContextMenu>
  </UCard>
</template>
