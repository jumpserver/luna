<script lang="ts" setup>
import type { ConfigItem } from '~/types/index';

import item2 from '@/assets/images/item2.png';
import { useUserSettingStore } from '~/store/modules/userSetting';

const props = defineProps<{
  item: ConfigItem;
  protocol?: string;
  selected?: boolean;
}>();

const emit = defineEmits<{ (e: 'toggle', value: boolean): void }>();

const { t, locale } = useI18n();
const userSettingStore = useUserSettingStore();
const { language } = storeToRefs(userSettingStore);

const commentText = computed(() => {
  const lang = language.value || (locale?.value as string) || 'en';
  return props.item?.comment?.[lang as 'zh' | 'en'] || props.item?.comment?.en || '';
});

const onSwitch = (v: boolean) => {
  if (v) emit('toggle', true);
};
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <img :src="item2" alt="item2" class="w-10 h-10" />

          <div class="flex flex-col gap-1">
            <p class="text-sm font-medium">{{ props.item.display_name }}</p>

            <UBadge color="neutral" variant="soft" size="sm">
              {{ props.item.path || '-' }}
            </UBadge>
          </div>
        </div>

        <USwitch
          unchecked-icon="i-lucide-x"
          checked-icon="i-lucide-check"
          :model-value="props.selected ?? false"
          @update:model-value="onSwitch"
        />
      </div>
    </template>

    <template #default>
      <div class="flex w-full justify-between items-center">
        <div class="flex flex-col gap-4">
          <div class="flex items-center gap-2">
            <UBadge
              v-for="(p, idx) in props.item.protocol"
              :key="idx"
              color="info"
              variant="soft"
            >
              {{ p.toUpperCase() }}
            </UBadge>
          </div>

          <div class="text-xs text-gray-500">
            {{ commentText }}
          </div>
        </div>

        <div>
          <UButton
            v-if="props.item.download_url"
            size="sm"
            color="neutral"
            variant="soft"
            icon="i-lucide-arrow-down-to-line"
            @click="useTauriShellOpen(props.item.download_url)"
          >
            {{ t('Setting.DownloadApplication') }}
          </UButton>
        </div>
      </div>
    </template>
  </UCard>
</template>
