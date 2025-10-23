<script setup lang="ts">
withDefaults(
  defineProps<{
    skeletonCount?: number;
  }>(),
  {
    skeletonCount: 1
  }
);
</script>

<template>
  <UPageCard
    v-for="i in skeletonCount"
    :key="i"
    class="w-full page-card shadow-sm"
    :ui="{
      body: 'p-1 ',
      container: 'p-0 sm:p-0 '
    }"
  >
    <section class="w-full p-4">
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <!-- 图标骨架 -->
          <USkeleton class="h-8 w-8 rounded-md" />

          <!-- 文本信息骨架 -->
          <div class="flex-1 min-w-0 overflow-hidden w-[120px]">
            <div class="text-xs-plus font-bold">
              <USkeleton class="h-4 w-20" />
            </div>

            <div class="text-[13px] text-neutral-500 dark:text-neutral-400">
              <USkeleton class="h-3 w-24 mt-2" />
            </div>
          </div>
        </div>

        <!-- 按钮骨架 -->
        <div class="shrink-0 ml-2">
          <USkeleton class="h-6 w-16 rounded-md" />
        </div>
      </div>
    </section>
  </UPageCard>
</template>
