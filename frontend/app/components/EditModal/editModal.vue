<script setup lang="ts">
// 后续根据 store 中的数据获取 Account 和 Protocol 等信息
defineProps<{
  open: boolean;
}>();

const emits = defineEmits<{
  (e: 'update:open', value: boolean): void;
}>();

const { t } = useI18n();

const updateOpen = () => {
  emits('update:open', false);
};
</script>

<template>
  <template>
    <UModal
      :open="open"
      :ui="{ footer: 'justify-end', description: 'text-xs-plus' }"
      :description="t('EditModal.Description')"
      title="Modal with description"
      @update:open="updateOpen"
    >
      <template #body>
        <div>123</div>
      </template>

      <template #footer="{ close }">
        <UButton
          :label="t('Common.Cancel')"
          color="neutral"
          variant="outline"
          @click="close"
        />
        <UButton :label="t('Common.Confirm')" color="neutral" />
      </template>
    </UModal>
  </template>
</template>
