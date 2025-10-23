<script setup lang="ts">
const { t } = useI18n();

const handleLogin = () => {
  useEventBus().emit("login", undefined);
};
</script>

<template>
  <UPageCard
    spotlight
    variant="subtle"
    spotlight-color="primary"
    orientation="vertical"
    class="cursor-pointer"
    :ui="{
      container: 'lg:flex sm:p-2'
    }"
    @click="handleLogin"
  >
    <div class="px-16 py-3">
      <div class="flex flex-col items-center justify-between gap-4">
        <div class="flex items-center">
          <button
            type="button"
            aria-label="Login"
            class="grid size-11 rounded-full place-items-center bg-emerald-400/10 ring-1 ring-emerald-400/25 transition-transform duration-200 hover:scale-[1.03] active:scale-95"
          >
            <UIcon name="cuida:login-outline" class="size-6 text-emerald-400/90" />
          </button>
        </div>

        <p
          class="text-[15px] font-medium text-gray-500 dark:text-gray-100 leading-none whitespace-nowrap overflow-hidden text-ellipsis"
          :title="t('Common.LoginFirst')"
        >
          {{ t("Common.LoginFirst") }}
        </p>
      </div>
    </div>
  </UPageCard>
</template>
