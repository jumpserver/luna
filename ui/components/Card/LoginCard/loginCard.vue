<script setup lang="ts">
const { t } = useI18n();

const handleLogin = () => {
  useEventBus().emit("login", undefined);
};
</script>

<template>
  <div class="flex w-full py-10 sm:py-16">
    <div
      class="mx-auto w-full max-w-md rounded-2xl border border-neutral-200/70 bg-white/80 p-6 text-center shadow-sm backdrop-blur-sm dark:border-neutral-700/60 dark:bg-neutral-900/60 cursor-pointer"
      @click="handleLogin"
    >
      <div
        class="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-primary-500/10 text-emerald-400 ring-1 ring-emerald-400/25"
      >
        <UIcon name="cuida:login-outline" class="size-6" />
      </div>

      <h3
        class="text-base font-semibold text-neutral-800 dark:text-neutral-100"
        :title="t('Common.LoginFirst')"
      >
        {{ t("Common.LoginFirst") }}
      </h3>
    </div>
  </div>
</template>
