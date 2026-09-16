<script lang="ts" setup>
// 获取当前路由路径
const route = useRoute();
const { t } = useI18n();
const requestedPath = route.path;
</script>

<template>
  <div class="grid place-items-center py-12 md:py-24">
    <div class="flex flex-col items-center gap-y-4 md:gap-y-8">
      <p class="text-(--ui-success) font-semibold">404</p>
      <div class="text-center space-y-3">
        <h1 class="text-3xl font-bold tracking-tight" sm="text-5xl">{{ t("NotFound.Title") }}</h1>
        <p class="text-base text-(--ui-muted) leading-7">{{ t("NotFound.Description") }}</p>
        <p class="text-sm text-(--ui-muted-foreground) bg-(--ui-muted) px-3 py-2 rounded-md font-mono">
          {{ t("NotFound.RequestedPath") }}: {{ requestedPath }}
        </p>
      </div>
      <UButton to="/" variant="outline" size="lg" :ui="{ base: 'px-5' }">{{ t("NotFound.GoHome") }}</UButton>
    </div>
  </div>
</template>
