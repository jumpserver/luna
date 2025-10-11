<script setup lang="ts">
withDefaults(
  defineProps<{
    skeletonCount?: number;
  }>(),
  {
    skeletonCount: 12
  }
);

const { locale } = useI18n();

const labelMinWidth = computed(() => (locale.value.startsWith("zh") ? "24px" : "72px"));

const labelColumnTemplate = computed(() => `minmax(${labelMinWidth.value}, max-content) 1fr`);
</script>

<template>
  <UPageCard
    v-for="i in skeletonCount"
    :key="i"
    variant="subtle"
    :ui="{ body: 'sm:p-2' }"
    class="w-full"
  >
    <section class="flex gap-4 flex-nowrap items-center w-full">
      <div class="flex items-center w-full gap-1">
        <div class="flex flex-col flex-1 gap-1 text-xs-plus min-w-0">
          <div class="flex justify-between">
            <section class="flex">
              <div class="flex items-center gap-2">
                <USkeleton class="h-10 w-10 rounded-md" />
                <USkeleton class="h-5 w-2/3" />
              </div>
            </section>

            <section class="flex items-center gap-2">
              <USkeleton class="h-8 w-8 rounded-lg" />
              <USkeleton class="h-8 w-8 rounded-lg" />
            </section>
          </div>

          <div class="flex flex-col gap-1 text-xs-plus">
            <div
              class="grid items-center gap-x-3 gap-y-1"
              :style="{ gridTemplateColumns: labelColumnTemplate }"
            >
              <span class="text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                <USkeleton class="h-4 w-16" />
              </span>
              <div class="min-w-0">
                <USkeleton class="h-4 w-3/4" />
              </div>
            </div>

            <div
              class="grid items-center gap-x-3 gap-y-1"
              :style="{ gridTemplateColumns: labelColumnTemplate }"
            >
              <span class="text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                <USkeleton class="h-4 w-16" />
              </span>
              <div class="min-w-0">
                <USkeleton class="h-4 w-2/3" />
              </div>
            </div>

            <div
              class="grid items-center gap-x-3 gap-y-1"
              :style="{ gridTemplateColumns: labelColumnTemplate }"
            >
              <span class="text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                <USkeleton class="h-4 w-16" />
              </span>
              <div class="min-w-0">
                <USkeleton class="h-4 w-1/2" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </UPageCard>
</template>
