<script setup lang="ts">
definePageMeta({
  layout: "default"
});

const { t } = useI18n();
const localePath = useLocalePath();

const tools = computed(() => [
  {
    title: t("Menu.Player"),
    icon: "lucide:clapperboard",
    to: localePath("videoplayer")
  },
  {
    title: t("Menu.Transcode"),
    icon: "lucide:repeat-2",
    to: localePath({ path: "/transcode" })
  }
]);
</script>

<template>
  <section class="h-full min-h-0 w-full overflow-auto px-6 py-5">
    <div class="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
      <NuxtLink
        v-for="tool in tools"
        :key="tool.to"
        :to="tool.to"
        class="flex min-h-24 items-center gap-3 rounded-lg border border-default bg-default px-4 py-3 text-left transition hover:bg-elevated"
      >
        <span class="grid size-9 shrink-0 place-items-center rounded-md bg-elevated text-primary">
          <UIcon :name="tool.icon" class="size-5" />
        </span>
        <span class="min-w-0 truncate text-sm font-medium text-highlighted">
          {{ tool.title }}
        </span>
      </NuxtLink>
    </div>
  </section>
</template>
