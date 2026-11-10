<script setup lang="ts">
import { ToastProvider, ToastViewport } from "reka-ui";

defineProps<{
  idleRemaining: number | null;
  expiryRemaining: number | null;
}>();

const { t } = useI18n();
</script>

<template>
  <ToastProvider
    v-if="idleRemaining !== null || expiryRemaining !== null"
    :duration="0"
    :label="t('Common.Login')"
    disable-swipe
  >
    <UToast
      v-if="idleRemaining !== null"
      :open="true"
      :duration="0"
      :close="false"
      :progress="false"
      type="background"
      icon="i-lucide-lock-keyhole"
      color="warning"
      :title="t('ScreenLock.IdleWarningTitle')"
      tabindex="-1"
      role="status"
      aria-live="polite"
      :aria-atomic="false"
    >
      <template #description>
        <p class="tabular-nums" role="timer" aria-live="off" data-reka-toast-announce-exclude>
          {{ t("ScreenLock.IdleWarningCountdown", { seconds: idleRemaining }) }}
        </p>
      </template>
    </UToast>
    <UToast
      v-if="expiryRemaining !== null"
      :open="true"
      :duration="0"
      :close="false"
      :progress="false"
      type="background"
      icon="i-lucide-clock-3"
      :color="expiryRemaining === 0 ? 'error' : 'warning'"
      :title="t(expiryRemaining === 0 ? 'ScreenLock.ExpiredTitle' : 'ScreenLock.ExpiryWarningTitle')"
      tabindex="-1"
      role="status"
      aria-live="polite"
      :aria-atomic="false"
    >
      <template #description>
        <p v-if="expiryRemaining === 0">{{ t("ScreenLock.ExpiredDescription") }}</p>
        <p v-else class="tabular-nums" role="timer" aria-live="off" data-reka-toast-announce-exclude>
          {{
            t("ScreenLock.ExpiryWarningCountdown", {
              minutes: Math.floor(expiryRemaining / 60),
              seconds: String(expiryRemaining % 60).padStart(2, "0")
            })
          }}
        </p>
      </template>
    </UToast>
    <ToastViewport
      :hotkey="[]"
      :label="t('Common.Login')"
      class="web-session-countdown-notices pointer-events-none fixed top-4 right-4 z-[750] flex w-[calc(100%-2rem)] flex-col gap-3 p-0 focus:outline-none sm:w-96"
    />
  </ToastProvider>
</template>
