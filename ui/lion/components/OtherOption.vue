<script lang="ts" setup>
import { useI18n } from "vue-i18n";
import CardContainer from "@/lion/components/CardContainer/index.vue";

const props = defineProps<{
  isRemoteApp: boolean;
  autoFit: boolean;
  fitPercentage: number;
}>();

const emit = defineEmits(["update:autoFit", "updateScale"]);

const { t } = useI18n();

const handleAutoFitUpdate = (value: boolean) => {
  emit("update:autoFit", value);
};

const handleCircleClick = (value: number) => {
  const newPercentage = props.fitPercentage + value;
  if (newPercentage < 10) {
    console.warn("Fit percentage cannot be less than 10%");
    return;
  }
  emit("update:autoFit", false);
  emit("updateScale", newPercentage);
};
</script>

<template>
  <CardContainer :title="t('Other')">
    <div class="flex items-center justify-between gap-3">
      <span class="text-sm">{{ t("AutoFit") }}</span>
      <div class="flex items-center gap-2">
        <USwitch :model-value="props.autoFit" @update:model-value="handleAutoFitUpdate" />
        <UButton
          icon="i-lucide-circle-minus"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="t('ZoomOut')"
          @click="handleCircleClick(-5)"
        />
        <span class="text-xs">{{ props.fitPercentage }}%</span>
        <UButton
          icon="i-lucide-circle-plus"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="t('ZoomIn')"
          @click="handleCircleClick(5)"
        />
      </div>
    </div>
  </CardContainer>
</template>
