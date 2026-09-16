<script lang="ts" setup>
import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import { resolveWsUrl } from "@jumpserver/connectors-core";
import { useDebounceFn, useWindowSize } from "@vueuse/core";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import SessionShare from "@/lion/components/SessionShare/index.vue";
import { useGuacamoleClient } from "@/lion/hooks/useGuacamoleClient";
import { LUNA_MESSAGE_TYPE } from "@/lion/types/postmessage.type";
import { lunaCommunicator } from "@/lion/utils/lunaBus";

const props = defineProps<{ context: ConnectorSessionContext }>();
const { width, height } = useWindowSize();
const { addErrorToast } = useErrorToast();
const { t } = useI18n();
const endpointUrl = computed(() => props.context.endpointUrl);
const displayRef = ref<HTMLElement | null>(null);
const errMessage = ref<string>("");
const drawShow = ref<boolean>(false);

const {
  connectToGuacamole,
  connectStatusLabel,
  connectionError,
  currentUser,
  debouncedSendClipboardToRemote,
  disconnectGuaclient,
  guaDisplay,
  loading,
  onlineUsersMap,
  registerMouseAndKeyboardHandler,
  resizeGuaScale,
  sendInputActive
} = useGuacamoleClient(t, endpointUrl);

const debouncedResize = useDebounceFn(() => {
  resizeGuaScale(width.value, height.value);
}, 300);

watch([width, height], () => debouncedResize(), { immediate: true });

const onlineUsers = computed(() => Object.values(onlineUsersMap.value).filter(Boolean));
const writable = computed(() => currentUser.value.writable === true);
const displayError = computed(() => errMessage.value || connectionError.value);

watch(writable, (canWrite) => {
  if (canWrite) {
    registerMouseAndKeyboardHandler();
    window.addEventListener("focus", debouncedSendClipboardToRemote);
  } else {
    window.removeEventListener("focus", debouncedSendClipboardToRemote);
  }
});

const handleLunaOpen = () => {
  drawShow.value = !drawShow.value;
};

function connectShareSession() {
  try {
    const url = new URL(resolveWsUrl("lion", "share", props.context));
    connectToGuacamole(
      `${url.origin}${url.pathname}`,
      Object.fromEntries(url.searchParams),
      window.innerWidth,
      window.innerHeight
    );
    const displayEl = displayRef.value;
    if (displayEl) displayEl.appendChild(guaDisplay.value.getElement());
  } catch (error) {
    loading.value = false;
    const message = error instanceof Error ? error.message : t("ShareSessionError");
    errMessage.value = message || t("ShareSessionError");
    addErrorToast({ title: message || t("ShareSessionError") });
  }
}

onMounted(() => {
  lunaCommunicator.onLuna(LUNA_MESSAGE_TYPE.OPEN, handleLunaOpen);
  lunaCommunicator.onLuna(LUNA_MESSAGE_TYPE.INPUT_ACTIVE, sendInputActive);
  connectShareSession();
});

onUnmounted(() => {
  window.removeEventListener("focus", debouncedSendClipboardToRemote);
  lunaCommunicator.offLuna(LUNA_MESSAGE_TYPE.OPEN, handleLunaOpen);
  lunaCommunicator.offLuna(LUNA_MESSAGE_TYPE.INPUT_ACTIVE, sendInputActive);
  disconnectGuaclient();
});
</script>

<template>
  <div class="flex h-full w-full flex-col justify-center">
    <div v-if="loading" class="flex h-screen w-screen items-center justify-center">
      <div class="flex flex-col items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
        <span>{{ connectStatusLabel }}</span>
      </div>
    </div>

    <div
      v-show="!loading && !displayError"
      ref="displayRef"
      class="relative flex h-full w-full justify-center"
      @contextmenu.prevent
    />

    <p v-if="displayError" class="text-center text-error">
      {{ displayError }}
    </p>
  </div>

  <USlideover v-model:open="drawShow" :ui="{ content: 'w-full max-w-[502px]' }">
    <template #body>
      <SessionShare :users="onlineUsers" :endpoint-url="endpointUrl" :ticket="context.ticket" />
    </template>
  </USlideover>
</template>
