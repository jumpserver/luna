<script setup lang="ts">
const { t } = useI18n();
</script>

<template v-else>
  <UPageCard
    spotlight
    variant="subtle"
    spotlight-color="primary"
    orientation="horizontal"
    class="cursor-pointer"
    :ui="{
      container: 'lg:flex sm:p-2',
    }"
    @click="useEventBus().emit('login', undefined)"
  >
    <div class="px-6 py-4">
      <div class="flex items-center justify-between gap-6">
        <p
          class="text-[15px] font-medium text-gray-500 dark:text-gray-100 leading-none whitespace-nowrap overflow-hidden text-ellipsis"
          :title="t('Common.LoginFirst')"
        >
          {{ t('Common.LoginFirst') }}
        </p>

        <div class="flex items-center gap-4">
          <button
            type="button"
            aria-label="Login"
            class="grid size-11 place-items-center rounded-xl bg-emerald-400/10 ring-1 ring-emerald-400/25 transition-transform duration-200 hover:scale-[1.03] active:scale-95"
          >
            <UIcon
              name="cuida:login-outline"
              class="size-5 text-emerald-400/90"
            />
          </button>
        </div>
      </div>
    </div>
  </UPageCard>
</template>
