<script setup lang="ts">
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
const messages = {
  absolute_timeout: "ClientLock.LifetimeSoon",
  policy_changed: "ClientLock.PolicyChangedSoon",
  idle_lock: "ClientLock.IdleSoon"
};
</script>

<template>
  <aside
    v-if="notices.length"
    class="fixed bottom-4 right-4 z-[450] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-3"
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
