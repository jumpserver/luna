<script setup lang="ts">
import { ToastProvider, ToastViewport } from "reka-ui";
import { computed, ref, watch } from "vue";
import { Translation as I18nT } from "vue-i18n";

const props = defineProps<{
  idleRemaining: number | null;
  expiryRemaining: number | null;
}>();

const { t } = useI18n();
const idleContent = ref<HTMLElement | null>(null);
const expiryContent = ref<HTMLElement | null>(null);
const displayedIdleRemaining = ref(props.idleRemaining ?? 0);
const displayedExpiryRemaining = ref(props.expiryRemaining ?? 0);
const idleDismissed = ref(false);
const dismissedExpiryPhases = ref(new Set<string>());
const expiryPhase = computed(() =>
  props.expiryRemaining === 0 ? "expired" : (props.expiryRemaining ?? Infinity) <= 60 ? "final" : "early"
);
const idleVisible = computed(() => props.idleRemaining !== null && !idleDismissed.value);
const expiryVisible = computed(
  () => props.expiryRemaining !== null && !dismissedExpiryPhases.value.has(expiryPhase.value)
);

function onIdleOpenChange(open: boolean) {
  if (!open) idleDismissed.value = true;
}

function onExpiryOpenChange(open: boolean) {
  if (!open) dismissedExpiryPhases.value.add(expiryPhase.value);
}

function hasSelectedText(content: HTMLElement | null) {
  const selection = content?.ownerDocument.getSelection();
  if (!content || !selection || selection.isCollapsed || !selection.toString()) return false;
  for (let index = 0; index < selection.rangeCount; index++) {
    if (selection.getRangeAt(index).intersectsNode(content)) return true;
  }
  return false;
}

// Keep copied text stable; the real countdown still controls hiding and expiry.
watch(
  () => props.idleRemaining,
  (remaining) => {
    if (remaining === null) idleDismissed.value = false;
    if (remaining === null || remaining === 0 || !hasSelectedText(idleContent.value)) {
      displayedIdleRemaining.value = remaining ?? 0;
    }
  }
);
watch(
  () => props.expiryRemaining,
  (remaining) => {
    if (remaining === null) dismissedExpiryPhases.value.clear();
    if (remaining === null || remaining === 0 || !hasSelectedText(expiryContent.value)) {
      displayedExpiryRemaining.value = remaining ?? 0;
    }
  }
);
</script>

<template>
  <ToastProvider
    v-if="idleRemaining !== null || expiryRemaining !== null"
    :duration="0"
    :label="t('Common.Login')"
    disable-swipe
  >
    <UToast
      v-if="idleVisible"
      :open="idleVisible"
      :duration="0"
      :progress="false"
      type="background"
      icon="i-lucide-lock-keyhole"
      color="warning"
      :title="t('ScreenLock.IdleWarningTitle')"
      class="pointer-events-auto select-text"
      tabindex="-1"
      role="status"
      aria-live="polite"
      :aria-atomic="false"
      @update:open="onIdleOpenChange"
    >
      <template #description>
        <div ref="idleContent">
          <I18nT
            keypath="ScreenLock.IdleWarningCountdown"
            tag="p"
            scope="global"
            class="tabular-nums"
            role="timer"
            aria-live="off"
            data-reka-toast-announce-exclude
          >
            <template #seconds>
              <span>{{ displayedIdleRemaining }}</span>
            </template>
          </I18nT>
        </div>
      </template>
    </UToast>
    <UToast
      v-if="expiryVisible"
      :open="expiryVisible"
      :duration="0"
      :progress="false"
      type="background"
      icon="i-lucide-clock-3"
      :color="expiryRemaining === 0 ? 'error' : 'warning'"
      :title="t(expiryRemaining === 0 ? 'ScreenLock.ExpiredTitle' : 'ScreenLock.ExpiryWarningTitle')"
      class="pointer-events-auto select-text"
      tabindex="-1"
      role="status"
      aria-live="polite"
      :aria-atomic="false"
      @update:open="onExpiryOpenChange"
    >
      <template #description>
        <div ref="expiryContent">
          <p v-if="expiryRemaining === 0">{{ t("ScreenLock.ExpiredDescription") }}</p>
          <template v-else>
            <I18nT
              :keypath="
                displayedExpiryRemaining < 60
                  ? 'ScreenLock.ExpiryWarningCountdownSeconds'
                  : 'ScreenLock.ExpiryWarningCountdown'
              "
              tag="p"
              scope="global"
              class="tabular-nums"
              role="timer"
              aria-live="off"
              data-reka-toast-announce-exclude
            >
              <template #minutes>
                <span>{{ Math.floor(displayedExpiryRemaining / 60) }}</span>
              </template>
              <template #seconds>
                <span>
                  {{
                    displayedExpiryRemaining < 60
                      ? displayedExpiryRemaining
                      : String(displayedExpiryRemaining % 60).padStart(2, "0")
                  }}
                </span>
              </template>
            </I18nT>
          </template>
        </div>
      </template>
    </UToast>
    <ToastViewport
      :hotkey="[]"
      :label="t('Common.Login')"
      class="web-session-countdown-notices pointer-events-none fixed top-4 right-4 z-[750] flex w-[calc(100%-2rem)] flex-col gap-3 p-0 focus:outline-none sm:w-96"
    />
  </ToastProvider>
</template>
