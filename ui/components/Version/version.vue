<script setup lang="ts">
const { t } = useI18n();
const version = ref<string>("");

onMounted(async () => {
  try {
    version.value = await useTauriAppGetVersion();
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <div class="flex flex-col items-center w-full h-full text-gray-500">
    <section class="flex items-center">
      <UIcon name="i-lucide-git-commit-vertical" class="size-4" />
      <span class="text-xs-plus">{{ t("Common.Version") }}: {{ version }}</span>
    </section>
  </div>
</template>
