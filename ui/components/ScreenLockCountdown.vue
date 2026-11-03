<script setup lang="ts">
const props = withDefaults(defineProps<{ at: number; loading?: boolean; canReturn?: boolean }>(), { canReturn: true });
const emit = defineEmits<{ returnToLogin: [] }>();
const { t } = useI18n();
const now = useNow({ interval: 250 });
const seconds = computed(() => Math.max(1, Math.ceil((props.at - now.value.getTime()) / 1000)));
</script>
<template>
  <div class="screen-lock-countdown" role="status" aria-live="polite">
    <UButton
      v-if="canReturn"
      block
      class="screen-lock-unlock-button screen-lock-return-button"
      :loading="loading"
      @click="emit('returnToLogin')"
    >
      {{ t("ScreenLock.ReturnToLoginCountdown", { seconds }) }}
    </UButton>
    <p v-else>{{ t("ScreenLock.ReturningToLogin", { seconds }) }}</p>
  </div>
</template>
