<script setup lang="ts">
import { desktopClipboard, desktopOpener } from "~/shared/desktop/bridge";

const props = defineProps<{ url: string; busy?: boolean }>();
const emit = defineEmits<{ back: [] }>();
const { t } = useI18n();
const toast = useToast();
let active = true;
let copyToastId: string | number | undefined;

const dismissCopyToast = () => {
  if (copyToastId === undefined) return;
  toast.remove(copyToastId);
  copyToastId = undefined;
};
// Copy feedback must expire even when the browser login flow blurs the client window.
const { start: scheduleCopyToastDismiss } = useTimeoutFn(dismissCopyToast, 1000, { immediate: false });

async function copyUrl() {
  if (!props.url) return;
  await desktopClipboard.writeText(props.url);
  if (!active) return;
  dismissCopyToast();
  copyToastId = toast.add({
    title: t("Auth.CopySuccess"),
    color: "primary",
    icon: "i-lucide-check",
    progress: false,
    duration: 1000
  }).id;
  scheduleCopyToastDismiss();
}

function openManually() {
  if (props.url) void desktopOpener.openUrl(props.url);
}

onBeforeUnmount(() => {
  active = false;
  dismissCopyToast();
});
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-3 py-4 text-center">
      <BrandLogo class="mx-auto size-16" />
      <p class="text-base font-medium text-highlighted">{{ t("Auth.SignInTitle") }}</p>
      <p class="text-sm leading-6 text-muted">{{ t("Auth.BrowserHintPrefix") }}</p>
      <div class="flex flex-wrap items-center justify-center gap-2 text-sm">
        <UButton
          color="primary"
          variant="link"
          class="p-0 underline decoration-current underline-offset-2"
          @click="openManually"
        >
          {{ t("Auth.OpenManually") }}
        </UButton>
        <span class="text-muted">{{ t("Auth.Or") }}</span>
        <UButton
          color="primary"
          variant="link"
          class="p-0 underline decoration-current underline-offset-2"
          @click="copyUrl"
        >
          {{ t("Auth.CopyUrl") }}
        </UButton>
      </div>
    </div>
    <div class="flex justify-center pt-1">
      <UButton
        color="neutral"
        variant="link"
        class="p-0 text-muted hover:text-highlighted"
        :disabled="busy"
        :loading="busy"
        @click="emit('back')"
      >
        {{ t("Auth.Back") }}
      </UButton>
    </div>
  </div>
</template>
