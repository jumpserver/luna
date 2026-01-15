<script setup lang="ts">
defineProps<{
  sites: string[]
  visible: boolean
}>();

const emit = defineEmits<{
  (e: "select", site: string): void
  (e: "remove", site: string): void
  (e: "clear"): void
}>();

const { t } = useI18n();
</script>

<template>
  <Transition name="recent-sites">
    <div v-if="visible" class="rounded-md border border-black/10 dark:border-white/10 p-1 mt-2">
      <div class="flex items-center justify-between px-1">
        <span class="text-[11px] text-gray-500 dark:text-gray-400">
          {{ t("Login.RecentSites") }}
        </span>
        <UButton
          color="neutral"
          variant="link"
          size="xs"
          :label="t('Login.ClearRecentSites')"
          @click="emit('clear')"
        />
      </div>
      <div class="mt-1 max-h-28 space-y-1 overflow-y-auto">
        <div v-for="site in sites" :key="site" class="flex items-center gap-1">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            class="flex-1 justify-start truncate"
            @click="emit('select', site)"
          >
            <span class="truncate">{{ site }}</span>
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-x"
            :aria-label="t('Login.RemoveRecentSite')"
            @click.stop="emit('remove', site)"
          />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.recent-sites-enter-active,
.recent-sites-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}

.recent-sites-enter-from,
.recent-sites-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.recent-sites-enter-to,
.recent-sites-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
