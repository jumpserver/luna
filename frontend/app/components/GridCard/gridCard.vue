<script setup lang="ts">
import type { ContextMenuItem } from '@nuxt/ui';

defineProps<{
  os?: string;
  address: string;
  iconName: string;
  protocol: string;
  assetName: string;
  user: string | undefined;
}>();

const emits = defineEmits<{
  (e: 'openEditModal'): void;
}>();

const { t } = useI18n();

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
      <section class="flex gap-4 items-center w-full">
        <UAvatar
          size="lg"
          :icon="iconName"
          :ui="{ root: 'rounded-md', icon: 'size-6' }"
        />

        <div class="flex flex-col flex-1 gap-1 text-xs-plus">
          <div class="flex justify-between">
            <section class="flex items-center gap-2">
              <UPopover arrow mode="hover">
                <div class="w-2 h-2 bg-[#55B787] rounded-full" />

                <template #content>
                  <div class="text-xs-plus text-center p-2">
                    {{ t('AssetCard.Activated') }}
                  </div>
                </template>
              </UPopover>

              <span class="text-sm font-semibold"> {{ assetName }} </span>
            </section>
          </div>

          <div class="flex items-center gap-2">
            <UBadge color="primary" variant="soft" class="max-w-26">
              <UPopover arrow mode="hover" :open-delay="500">
                <span class="text-overflow-ellipsis">
                  {{ address }}
                </span>

                <template #content>
                  <p class="p-2 text-xs-plus">
                    {{ address }}
                  </p>
                </template>
              </UPopover>
            </UBadge>

            <USeparator orientation="vertical" size="sm" class="h-3" />

            <template v-if="os">
              <UBadge color="info" variant="soft">
                {{ os }}
              </UBadge>
              <USeparator orientation="vertical" size="sm" class="h-3" />
            </template>

            <template v-if="user">
              <UBadge color="neutral" variant="soft">
                {{ user }}
              </UBadge>
              <USeparator orientation="vertical" size="sm" class="h-3" />
            </template>

            <UBadge color="info" variant="soft">
              {{ protocol }}
            </UBadge>
          </div>
        </div>

        <UButton
          v-if="showEdit"
          size="sm"
          variant="ghost"
          color="neutral"
          class="rounded-lg"
          icon="i-lucide-square-pen"
          @click="openEditModal"
        />
      </section>
    </UContextMenu>
  </UCard>
</template>
