<script setup lang="ts">
import type { FaceLiveHostMessage } from "~/types/face";
import FaceTokenCapture from "~/components/Face/FaceTokenCapture.vue";
import { collectActiveFaceMonitorTokens } from "~/utils/faceLive";

const { t } = useI18n();
const toast = useToast();
const { tabs } = useWorkspaceTabs();
const minimized = ref(false);
const alarm = ref<"normal" | "warning" | "paused">("normal");
const entries = computed(() => collectActiveFaceMonitorTokens(tabs.value));
const active = computed(() => entries.value[0] || null);

watch(
  () => active.value?.token,
  () => {
    minimized.value = false;
    alarm.value = "normal";
  }
);

function handleFlowEvent(message: FaceLiveHostMessage) {
  const name = message.flow?.target_name || t("Face.TargetPerson");
  if (["monitor_started", "monitor_returned", "monitoring"].includes(message.event)) {
    alarm.value = "normal";
  } else if (message.event === "monitor_away_warning") {
    alarm.value = "warning";
    minimized.value = false;
    toast.add({
      title: t("Face.Status.monitor_away_warning"),
      description: t("Face.Event.monitor_away_warning", { name }),
      color: "warning",
      icon: "i-lucide-triangle-alert",
      duration: 5000
    });
  } else if (["monitor_away_timeout", "client_error"].includes(message.event)) {
    alarm.value = "paused";
    minimized.value = false;
    toast.add({
      title: t("Face.Status.monitor_paused"),
      description:
        message.event === "client_error"
          ? t("Face.Remote.MonitorDisconnected")
          : t("Face.Event.monitor_away_timeout", { name }),
      color: "error",
      icon: "i-lucide-shield-alert",
      duration: 8000
    });
  }
}
</script>

<template>
  <Transition name="face-monitor">
    <aside
      v-if="active"
      class="fixed right-3 bottom-3 z-[260] w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-lg border bg-default shadow-xl"
      :class="{
        'border-warning': alarm === 'warning',
        'border-error': alarm === 'paused',
        'border-default': alarm === 'normal'
      }"
      aria-live="polite"
    >
      <header class="flex h-11 items-center gap-2 border-b border-default px-3">
        <UIcon
          :name="alarm === 'normal' ? 'i-lucide-scan-face' : 'i-lucide-triangle-alert'"
          class="size-4 shrink-0"
          :class="alarm === 'paused' ? 'text-error' : alarm === 'warning' ? 'text-warning' : 'text-success'"
        />
        <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ t("Face.Remote.MonitorTitle") }}</span>
        <UBadge color="neutral" variant="soft" size="sm">
          {{ t("Face.Remote.SessionCount", { count: active.sessions }) }}
        </UBadge>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          :icon="minimized ? 'i-lucide-chevron-up' : 'i-lucide-minus'"
          :title="minimized ? t('Face.Remote.Expand') : t('ToolTips.Minimize')"
          :aria-label="minimized ? t('Face.Remote.Expand') : t('ToolTips.Minimize')"
          @click="minimized = !minimized"
        />
      </header>
      <div v-show="!minimized" class="h-[330px]">
        <FaceTokenCapture
          :key="active.token"
          :token="active.token"
          mode="monitor"
          compact
          @flow-event="handleFlowEvent"
        />
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.face-monitor-enter-active,
.face-monitor-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.face-monitor-enter-from,
.face-monitor-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
