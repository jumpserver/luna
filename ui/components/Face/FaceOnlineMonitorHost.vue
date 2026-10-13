<script setup lang="ts">
import type { FaceLiveHostMessage } from "~/types/face";
import FaceTokenCapture from "~/components/Face/FaceTokenCapture.vue";
import { useConnectionSetupDrag } from "~/components/Workspace/useConnectionSetupDrag";
import { collectActiveFaceMonitorTokens, localizeFaceLiveDetail } from "~/utils/faceLive";

const { t } = useI18n();
const toast = useToast();
const { tabs } = useWorkspaceTabs();
const minimized = ref(false);
const alarm = ref<"normal" | "warning" | "paused">("normal");
const entries = computed(() => collectActiveFaceMonitorTokens(tabs.value));
const active = computed(() => entries.value[0] || null);
const area = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const dragHandle = ref<HTMLElement | null>(null);
const drag = useConnectionSetupDrag(area, panel, dragHandle);
const monitorToastId = "face-monitor-state";

watch(
  () => active.value?.token,
  () => {
    minimized.value = false;
    alarm.value = "normal";
    toast.remove(monitorToastId);
  }
);

function handleFlowEvent(message: FaceLiveHostMessage) {
  const name = message.flow?.target_name || t("Face.TargetPerson");
  if (["monitor_started", "monitor_returned", "monitoring"].includes(message.event)) {
    if (alarm.value !== "normal") toast.remove(monitorToastId);
    alarm.value = "normal";
  } else if (message.event === "monitor_away_warning") {
    if (alarm.value === "warning") return;
    alarm.value = "warning";
    minimized.value = false;
    toast.add({
      id: monitorToastId,
      title: t("Face.Status.monitor_away_warning"),
      description: t("Face.Event.monitor_away_warning", { name }),
      color: "warning",
      icon: "i-lucide-triangle-alert",
      duration: 5000
    });
  } else if (["monitor_away_timeout", "monitor_init_failed", "client_error"].includes(message.event)) {
    if (alarm.value === "paused") return;
    alarm.value = "paused";
    minimized.value = false;
    toast.add({
      id: monitorToastId,
      title: t(
        message.event === "monitor_init_failed" ? "Face.Status.monitor_init_failed" : "Face.Status.monitor_paused"
      ),
      description:
        message.event === "client_error"
          ? t("Face.Remote.MonitorDisconnected")
          : message.event === "monitor_init_failed"
            ? localizeFaceLiveDetail(message.flow?.detail || "", t) || t("Face.Event.monitor_init_failed", { name })
            : t("Face.Event.monitor_away_timeout", { name }),
      color: "error",
      icon: "i-lucide-shield-alert",
      duration: 8000
    });
  }
}
</script>

<template>
  <div ref="area" class="pointer-events-none fixed inset-x-0 top-12 bottom-10 z-[260]">
    <Transition name="face-monitor">
      <aside
        v-if="active"
        ref="panel"
        class="pointer-events-auto absolute right-3 bottom-0 flex max-h-full w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg border bg-default shadow-xl"
        :style="drag.style.value"
        :class="{
          'border-warning': alarm === 'warning',
          'border-error': alarm === 'paused',
          'border-default': alarm === 'normal'
        }"
        aria-live="polite"
      >
        <header
          ref="dragHandle"
          tabindex="0"
          :aria-label="t('Face.Remote.MonitorTitle')"
          class="flex h-11 shrink-0 cursor-move touch-none items-center gap-2 border-b border-default px-3 select-none"
        >
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
        <div v-show="!minimized" class="h-[330px] min-h-0 overflow-y-auto">
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
  </div>
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
