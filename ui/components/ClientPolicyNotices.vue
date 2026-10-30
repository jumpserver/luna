<script setup lang="ts">
import { useCssVar, useElementSize } from "@vueuse/core";
import { formatClientLoginTimestamp } from "~/utils/clientLoginPolicy";

export interface ClientPolicyNotice {
  id: string;
  kind: "absolute_timeout" | "policy_changed" | "idle_lock";
  at: string;
  remainingSeconds?: number;
}
defineProps<{ notices: ClientPolicyNotice[] }>();
defineEmits<{ dismiss: [id: string] }>();
const { t, locale } = useI18n();
const noticeArea = useTemplateRef<HTMLElement>("noticeArea");
const { height: noticeHeight } = useElementSize(noticeArea);
const nativeNoticeInset = useCssVar("--workspace-client-policy-notice-inset");
// ponytail: reserve a bottom strip because native views sit above HTML.
// Floating over page content would require a separate trusted native overlay.
watchEffect(() => {
  nativeNoticeInset.value = noticeHeight.value > 0 ? `${noticeHeight.value + 32}px` : "0px";
});
onBeforeUnmount(() => {
  nativeNoticeInset.value = "0px";
});
const messages = {
  absolute_timeout: "ClientLock.LifetimeSoon",
  policy_changed: "ClientLock.PolicyChangedSoon",
  idle_lock: "ClientLock.IdleSoon"
};
</script>

<template>
  <aside
    v-if="notices.length"
    ref="noticeArea"
    class="fixed bottom-4 right-4 z-[450] flex max-h-[calc(100vh-2rem)] w-96 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto"
    aria-live="polite"
  >
    <UCard v-for="notice in notices" :key="notice.id" :ui="{ body: 'p-4 sm:p-4' }">
      <div class="flex items-start gap-3">
        <UIcon name="i-lucide-clock-alert" class="mt-0.5 size-5 shrink-0 text-warning" />
        <p class="flex-1 text-sm">
          {{
            t(messages[notice.kind], {
              at: formatClientLoginTimestamp(notice.at, locale),
              seconds: notice.remainingSeconds
            })
          }}
        </p>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="t('Common.Close')"
          @click="$emit('dismiss', notice.id)"
        />
      </div>
    </UCard>
  </aside>
</template>
