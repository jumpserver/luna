<script lang="ts" setup>
import { useWindowSize } from "@vueuse/core";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { useGuacamoleClient } from "@/lion/hooks/useGuacamoleClient";
import { createLionConnectTicket } from "@/lion/hooks/useLionConnectTicket";
import { useLionEndpoint } from "@/lion/hooks/useLionEndpoint";
import { withLionWsUrl } from "@/lion/utils/base";

const route = useRoute();
const { t } = useI18n();
const { width, height } = useWindowSize();
const displayRef = ref<HTMLElement | null>(null);
const endpointUrl = useLionEndpoint();
const sessionId = String(route.query.session || "");
const wsUrl = computed(() => withLionWsUrl("/ws/monitor/", endpointUrl.value));
const connectError = ref("");
let disposed = false;
const { connectToGuacamole, connectStatus, disconnectGuaclient, guaDisplay, loading, resizeGuaScale } =
  useGuacamoleClient(t, endpointUrl);

watch(
  [width, height],
  ([newWidth, newHeight]) => {
    if (guaDisplay.value) {
      resizeGuaScale(newWidth, newHeight);
    }
  },
  { immediate: true }
);

onMounted(async () => {
  try {
    const ticket = await createLionConnectTicket(endpointUrl.value);
    if (disposed) return;
    connectToGuacamole(
      wsUrl.value,
      {
        type: "monitor",
        SESSION_ID: sessionId,
        ...(ticket ? { ticket } : {})
      },
      window.innerWidth,
      window.innerHeight
    );
    const displayEl = displayRef.value;
    if (displayEl) displayEl.appendChild(guaDisplay.value.getElement());
  } catch (error) {
    if (disposed) return;
    loading.value = false;
    connectError.value = error instanceof Error ? error.message : String(error);
  }
});

onUnmounted(() => {
  disposed = true;
  disconnectGuaclient();
});
</script>

<template>
  <div class="relative flex h-full w-full flex-col justify-center">
    <div v-if="loading" class="absolute inset-0 z-10 flex items-center justify-center bg-default/80">
      <div class="flex flex-col items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
        <span>{{ t("Connecting") }}: {{ connectStatus }}</span>
      </div>
    </div>
    <div v-show="!loading" ref="displayRef" class="relative flex h-full w-full justify-center" />
    <p v-if="connectError" class="text-center text-error">{{ connectError }}</p>
  </div>
</template>
