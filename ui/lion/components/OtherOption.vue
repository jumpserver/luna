<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import CardContainer from '@/lion/components/CardContainer/index.vue';

const { t } = useI18n();

const props = defineProps<{
  isRemoteApp: boolean;
  autoFit: boolean;
  fitPercentage: number;
}>();

const emit = defineEmits(['combine-keys', 'update:autoFit', 'updateScale']);

const percentage = ref<number>(props.fitPercentage);

onMounted(() => {
  percentage.value = props.fitPercentage;
});

const handleAutoFitUpdate = (value: boolean) => {
  emit('update:autoFit', value);
};

const handleCircleClick = (value: number) => {
  const newPercentage = percentage.value + value;
  if (newPercentage < 10) {
    console.warn('Fit percentage cannot be less than 10%');
    return;
  }
  percentage.value = newPercentage;
  emit('update:autoFit', false);
  emit('updateScale', newPercentage);
};
</script>

<template>
  <CardContainer :title="t('Other')">
    <div class="flex items-center justify-between gap-3">
      <span class="text-sm">{{ t('AutoFit') }}</span>
      <div class="flex items-center gap-2">
        <USwitch
          :model-value="props.autoFit"
          @update:model-value="handleAutoFitUpdate"
        />
        <button type="button" class="inline-flex items-center" @click="handleCircleClick(-5)">
          <UIcon name="i-lucide-circle-minus" class="size-4" />
        </button>
        <span class="text-xs">{{ props.fitPercentage }}%</span>
        <button type="button" class="inline-flex items-center" @click="handleCircleClick(5)">
          <UIcon name="i-lucide-circle-plus" class="size-4" />
        </button>
      </div>
    </div>
  </CardContainer>
</template>
