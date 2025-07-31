<script setup lang="ts">
import type { ActionItem } from '~/types';

const { t } = useI18n();

// 刷新、排序、切换布局
const actionItems = computed<ActionItem[]>(() => [
  {
    iconName: 'i-lucide-refresh-ccw',
    tooltipLabel: t('ToolTips.Refresh'),
  },
  {
    iconName: 'i-lucide-arrow-down-wide-narrow',
    tooltipLabel: t('ToolTips.Sort'),
  },
  {
    iconName: 'i-lucide-layout-grid',
    tooltipLabel: t('ToolTips.Layout'),
  },
]);
</script>

<template>
  <div class="flex w-full items-center justify-between py-1">
    <!-- 左侧区域：主要为 title  -->
    <section>
      <span class="text-xl font-bold"> 资产管理 </span>
    </section>

    <!-- 右侧区域：包括搜素、排序、刷新 -->
    <section class="flex item-center flex-nowrap gap-4">
      <UInput
        clearable
        icon="i-lucide-search"
        variant="outline"
        :placeholder="t('Operation.Search')"
        :style="{ with: '18rem', borderRadius: '8px' }"
      />

      <template v-for="action of actionItems" :key="action.iconName">
        <UPopover mode="hover" arrow>
          <UButton
            :icon="action.iconName"
            size="sm"
            color="neutral"
            variant="soft"
            class="rounded-lg"
          />

          <template #content>
            <span class="m-4 inline-flex text-sm">
              {{ action.tooltipLabel }}
            </span>
          </template>
        </UPopover>
      </template>
    </section>
  </div>
</template>
