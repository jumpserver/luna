<template>
  <n-popover placement="right" trigger="hover">
    <template #trigger>
      <svg-icon :name="name" :icon-style="iconStyle" @click="handleSetting" />
    </template>
    {{ t('Custom Setting') }}
  </n-popover>
</template>

<script setup lang="ts">
import { CSSProperties } from 'vue';
import { useI18n } from 'vue-i18n';
import SvgIcon from '@/components/SvgIcon/index.vue';

const { t } = useI18n();

const props = defineProps<{
  name: string;
  iconStyle: CSSProperties;
  onClick: () => void;
}>();

const handleSetting = () => {
  props.onClick();
};
</script>
