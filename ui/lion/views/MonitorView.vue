<script lang="ts" setup>
import { resolveWsUrl } from "@jumpserver/connectors-core";
import { useElementSize } from "@vueuse/core";
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { useGuacamoleClient } from "@/lion/hooks/useGuacamoleClient";
import { createLionConnectTicket } from "@/lion/hooks/useLionConnectTicket";
import { useLionEndpoint } from "@/lion/hooks/useLionEndpoint";

const props = defineProps<{ sessionId?: string; endpointUrl?: string; ticket?: string }>();
const route = useRoute();
const { t } = useI18n();
const containerRef = useTemplateRef<HTMLElement>("containerRef");
const { width, height } = useElementSize(containerRef);
const displayRef = ref<HTMLElement | null>(null);
const endpointUrl = useLionEndpoint(() => props.endpointUrl);
const sessionId = computed(() => props.sessionId || String(route.query.session || ""));
const connectError = ref("");
let disposed = false;
const { connectToGuacamole, connectStatusLabel, disconnectGuaclient, guaDisplay, loading, resizeGuaScale } =
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
    const ticket = props.ticket ?? (await createLionConnectTicket(endpointUrl.value));
    if (disposed) return;
    const wsUrl = new URL(
      resolveWsUrl("lion", "monitor", {
        component: "lion",
        tokenId: "",
        ticket,
        endpointUrl: endpointUrl.value,
        wsQuery: { type: "monitor", target_id: sessionId.value }
      })
    );
    connectToGuacamole(
      `${wsUrl.origin}${wsUrl.pathname}`,
      Object.fromEntries(wsUrl.searchParams),
      width.value || window.innerWidth,
      height.value || window.innerHeight
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
  <div ref="containerRef" class="relative flex h-full w-full flex-col justify-center">
    <div v-if="loading" class="absolute inset-0 z-10 flex items-center justify-center bg-default/80">
      <div class="flex flex-col items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
        <span>{{ connectStatusLabel }}</span>
      </div>
    </div>
    <div v-show="!loading" ref="displayRef" class="relative flex h-full w-full justify-center" />
    <p v-if="connectError" class="text-center text-error">{{ connectError }}</p>
  </div>
</template>
