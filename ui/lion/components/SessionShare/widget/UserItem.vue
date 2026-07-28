<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useColor } from '@/lion/hooks/useColor';

const props = defineProps<{
  username: string
  userId: string
  writable: boolean
  primary: boolean
  meta: object
}>();

const emit = defineEmits<{
  (e: 'removeUser', meta: object): void
}>();

const { t } = useI18n();
const { lighten } = useColor();
const isHovered = ref(false);
const confirmOpen = ref(false);

const options = [
  { label: t('Writable'), value: 'editor' },
  { label: t('ReadOnly'), value: 'readonly' },
  { label: t('Admin'), value: 'admin' }
];

const selectionValue = computed(() => {
  if (props.primary) return 'admin';
  if (props.writable) return 'editor';
  return 'readonly';
});

const handleRemoveUser = () => {
  confirmOpen.value = false;
  emit('removeUser', props.meta);
};
</script>

<template>
  <div
    class="flex w-full items-center justify-between rounded-md p-2 transition-colors"
    :style="{ backgroundColor: isHovered ? lighten(1) : 'transparent' }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <div class="flex items-center gap-2">
      <UIcon name="i-lucide-user-round" class="size-[18px]" />
      <div>
        <div class="flex items-center gap-2">
          <span class="text-xs-plus font-medium">{{ username }}</span>
          <UBadge :color="primary ? 'success' : 'info'" variant="subtle" size="sm">
            {{ primary ? t('PrimaryUser') : t('ShareUser') }}
          </UBadge>
        </div>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <USelect
        :model-value="selectionValue"
        :items="options"
        disabled
        class="w-28"
      />
      <UPopover v-model:open="confirmOpen">
        <UButton icon="i-lucide-trash-2" color="error" variant="soft" size="sm" :disabled="primary" />
        <template #content>
          <div class="flex flex-col gap-3 p-3">
            <span class="text-sm">{{ t('RemoveUser') }}</span>
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" size="sm" @click="() => { confirmOpen = false }">
                {{ t('Cancel') }}
              </UButton>
              <UButton color="error" size="sm" @click="() => handleRemoveUser()">
                {{ t('Confirm') }}
              </UButton>
            </div>
          </div>
        </template>
      </UPopover>
    </div>
  </div>
  <UDivider class="my-0" />
</template>
