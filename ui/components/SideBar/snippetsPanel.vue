<script setup lang="ts">
const { t } = useI18n();

const open = ref(false);
</script>

<template>
  <section
    class="flex min-h-8 shrink-0 flex-col overflow-hidden border-t border-gray-200 dark:border-white/10"
    :class="open ? 'h-[30%]' : 'h-8'"
  >
    <button
      type="button"
      class="flex h-8 shrink-0 items-center gap-1.5 px-2 text-left text-xs font-medium text-gray-700 dark:text-gray-200"
      :aria-expanded="open"
      @click="open = !open"
    >
      <UIcon
        name="i-lucide-chevron-right"
        class="size-3.5 shrink-0 transition-transform duration-150"
        :class="open ? 'rotate-90' : ''"
      />
      <UIcon name="i-lucide-braces" class="size-3.5 shrink-0 text-gray-500 dark:text-gray-400" />
      <span class="truncate">{{ t("Menu.Snippets") }}</span>
    </button>

    <div v-if="open" class="flex min-h-0 flex-1 items-center justify-center overflow-auto px-3 py-2">
      <div class="flex flex-col items-center gap-1 text-center text-xs text-gray-400 dark:text-gray-500">
        <UIcon name="i-lucide-braces" class="size-5" />
        <span>{{ t("Snippets.Empty") }}</span>
      </div>
    </div>
  </section>
</template>
