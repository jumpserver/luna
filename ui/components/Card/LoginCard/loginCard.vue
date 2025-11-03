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
          <UButton
            icon="cuida:login-outline"
            size="sm"
            variant="ghost"
            aria-label="Login"
            class="size-11 rounded-full flex items-center justify-center ring-1 ring-primary-400/25 text-primary-400/90 transition-transform duration-200 hover:scale-[1.03] active:scale-95"
          />
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
